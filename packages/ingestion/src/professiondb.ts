import {
  importedBuildDatasetSchema,
  type ImportedBuildDataset,
} from "@forever-professions/contracts";

type LuaKey = number | string;
type LuaValue = boolean | number | string | LuaTable | null;
type LuaTable = Map<LuaKey, LuaValue>;

export interface ProfessionDbSnapshotInput {
  readonly coreLua: string;
  readonly acquireMethodsLua?: string;
  readonly recipeNamesLua: string;
  readonly itemNamesLua: string;
  readonly profession: {
    readonly id: string;
    readonly name: string;
    readonly skillLineId: number;
  };
  readonly professionDbVersion: string;
  readonly itemDbVersion: string;
  readonly sourceUrl: string;
}

export interface ProfessionDbConversionResult {
  readonly dataset: ImportedBuildDataset;
  readonly report: {
    readonly buildId: string;
    readonly recipes: number;
    readonly items: number;
    readonly missingItemNames: number;
    readonly knownLearnSkillRecipes: number;
    readonly borrowedRequiredSkillRecipes: number;
    readonly automaticRecipes: number;
    readonly specializationRecipes: number;
    readonly provisionalOutputQuantityRecipes: number;
  };
}

class LuaLiteralParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parseTableAt(position: number): LuaTable {
    this.position = position;
    this.skipSpace();
    return this.parseTable();
  }

  private parseTable(): LuaTable {
    this.expect("{");
    const result: LuaTable = new Map();
    let nextArrayIndex = 1;

    while (true) {
      this.skipSpace();
      if (this.peek() === "}") {
        this.position += 1;
        return result;
      }

      let key: LuaKey;
      let value: LuaValue;
      if (this.peek() === "[") {
        this.position += 1;
        const parsedKey = this.parseValue();
        if (typeof parsedKey !== "number" && typeof parsedKey !== "string") {
          throw this.error("Lua table keys must be strings or numbers.");
        }
        key = parsedKey;
        this.skipSpace();
        this.expect("]");
        this.skipSpace();
        this.expect("=");
        value = this.parseValue();
      } else {
        key = nextArrayIndex;
        nextArrayIndex += 1;
        value = this.parseValue();
      }
      result.set(key, value);

      this.skipSpace();
      if (this.peek() === "," || this.peek() === ";") this.position += 1;
    }
  }

  private parseValue(): LuaValue {
    this.skipSpace();
    const current = this.peek();
    if (current === "{") return this.parseTable();
    if (current === '"' || current === "'") return this.parseString();
    if (current === "-" || /[0-9]/.test(current)) return this.parseNumber();

    const identifier = this.readWhile(/[A-Za-z_]/);
    if (identifier === "true") return true;
    if (identifier === "false") return false;
    if (identifier === "nil") return null;
    throw this.error(`Unsupported Lua value ${identifier || current}.`);
  }

  private parseNumber(): number {
    const token = this.readWhile(/[0-9eE+.-]/);
    const value = Number(token);
    if (!Number.isFinite(value)) throw this.error(`Invalid Lua number ${token}.`);
    return value;
  }

  private parseString(): string {
    const quote = this.peek();
    this.position += 1;
    let value = "";
    while (this.position < this.source.length) {
      const current = this.source[this.position++]!;
      if (current === quote) return value;
      if (current !== "\\") {
        value += current;
        continue;
      }
      const escaped = this.source[this.position++]!;
      const escapes: Readonly<Record<string, string>> = {
        n: "\n",
        r: "\r",
        t: "\t",
        "\\": "\\",
        '"': '"',
        "'": "'",
      };
      value += escapes[escaped] ?? escaped;
    }
    throw this.error("Unterminated Lua string.");
  }

  private skipSpace(): void {
    while (this.position < this.source.length) {
      if (/\s/.test(this.peek())) {
        this.position += 1;
        continue;
      }
      if (this.source.startsWith("--", this.position)) {
        const lineEnd = this.source.indexOf("\n", this.position + 2);
        this.position = lineEnd === -1 ? this.source.length : lineEnd + 1;
        continue;
      }
      return;
    }
  }

  private readWhile(pattern: RegExp): string {
    const start = this.position;
    while (this.position < this.source.length && pattern.test(this.peek())) {
      this.position += 1;
    }
    return this.source.slice(start, this.position);
  }

  private expect(value: string): void {
    if (this.peek() !== value) throw this.error(`Expected ${value}.`);
    this.position += 1;
  }

  private peek(): string {
    return this.source[this.position] ?? "";
  }

  private error(message: string): Error {
    return new Error(`${message} At character ${this.position}.`);
  }
}

function parseCallTable(source: string, call: string): LuaTable {
  const callStart = source.indexOf(call);
  if (callStart === -1) throw new Error(`Could not find ${call} in Lua source.`);
  const tableStart = source.indexOf("{", callStart + call.length);
  if (tableStart === -1) throw new Error(`Could not find table passed to ${call}.`);
  return new LuaLiteralParser(source).parseTableAt(tableStart);
}

function requireTable(value: LuaValue | undefined, context: string): LuaTable {
  if (!(value instanceof Map)) throw new Error(`${context} must be a Lua table.`);
  return value;
}

function requireNumber(value: LuaValue | undefined, context: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${context} must be an integer.`);
  }
  return value;
}

function requireString(value: LuaValue | undefined, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return value;
}

function parseBorrowedRequiredSkills(coreLua: string): Set<number> {
  const match = coreLua.match(
    /lib:LoadBorrowed\("requiredSkill",\s*"Vanilla",\s*\{([^}]*)\}\)/,
  );
  if (!match) return new Set();
  return new Set(
    match[1]!
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Number.isInteger),
  );
}

function buildIdFromHeader(coreLua: string): string {
  const match = coreLua.match(/^-- build ([0-9.]+)\b/m);
  if (!match) throw new Error("ProfessionDB core file is missing its build stamp.");
  return match[1]!;
}

function itemName(
  names: LuaTable,
  gameItemId: number,
  missingItemNameIds: Set<number>,
): string {
  const value = names.get(gameItemId);
  if (typeof value === "string" && value.length > 0) return value;
  missingItemNameIds.add(gameItemId);
  return `Unknown item #${gameItemId}`;
}

export function convertProfessionDbSnapshot(
  input: ProfessionDbSnapshotInput,
): ProfessionDbConversionResult {
  const buildId = buildIdFromHeader(input.coreLua);
  const core = parseCallTable(input.coreLua, `lib:LoadCore(${input.profession.skillLineId},`);
  const recipeNames = parseCallTable(
    input.recipeNamesLua,
    `lib:LoadNames(${input.profession.skillLineId},`,
  );
  const itemNames = parseCallTable(input.itemNamesLua, "lib:LoadNames(");
  const acquireMethods = input.acquireMethodsLua
    ? parseCallTable(input.acquireMethodsLua, "lib:LoadAcquireMethods(")
    : new Map<LuaKey, LuaValue>();
  const borrowedRequiredSkills = parseBorrowedRequiredSkills(input.coreLua);
  const registeredItemIds = new Set<number>();
  const missingItemNameIds = new Set<number>();
  let knownLearnSkillRecipes = 0;
  let automaticRecipes = 0;
  let specializationRecipes = 0;
  const recipes = [...core.entries()].map(([recipeKey, rawRecipe]) => {
    const spellId = requireNumber(recipeKey, "Recipe spell ID");
    const recipe = requireTable(rawRecipe, `Recipe ${spellId}`);
    const nameRecord = requireTable(recipeNames.get(spellId), `Recipe ${spellId} name record`);
    const name = requireString(nameRecord.get("name"), `Recipe ${spellId} name`);
    const difficulty = requireTable(recipe.get("difficulty"), `Recipe ${spellId} difficulty`);
    const reagentTable = requireTable(recipe.get("reagents"), `Recipe ${spellId} reagents`);
    const craftedItemId = requireNumber(
      recipe.get("craftedItemId"),
      `Recipe ${spellId} crafted item ID`,
    );
    const rawRequiredSkill = recipe.get("requiredSkill");
    const learnSkill = borrowedRequiredSkills.has(spellId)
      ? null
      : rawRequiredSkill === undefined
        ? null
        : requireNumber(rawRequiredSkill, `Recipe ${spellId} required skill`);
    if (learnSkill !== null) knownLearnSkillRecipes += 1;
    const rawRequiredSpec = recipe.get("requiredSpec");
    const specializationSpellId =
      rawRequiredSpec === undefined
        ? null
        : requireNumber(rawRequiredSpec, `Recipe ${spellId} required specialization`);
    if (specializationSpellId !== null) specializationRecipes += 1;
    const acquisitionMethod = acquireMethods.get(spellId);
    const acquisition = acquisitionMethod === 1 ? ("automatic" as const) : ("unknown" as const);
    if (acquisition === "automatic") automaticRecipes += 1;

    const thresholds = {
      orange: requireNumber(difficulty.get(1), `Recipe ${spellId} orange threshold`),
      yellow: requireNumber(difficulty.get(2), `Recipe ${spellId} yellow threshold`),
      green: requireNumber(difficulty.get(3), `Recipe ${spellId} green threshold`),
      gray: requireNumber(difficulty.get(4), `Recipe ${spellId} gray threshold`),
    };
    const reagents = [...reagentTable.entries()].map(([itemKey, quantityValue]) => {
      const gameId = requireNumber(itemKey, `Recipe ${spellId} reagent item ID`);
      const quantity = requireNumber(
        quantityValue,
        `Recipe ${spellId} reagent ${gameId} quantity`,
      );
      registeredItemIds.add(gameId);
      return {
        item: {
          id: `item-${gameId}`,
          gameId,
          name: itemName(itemNames, gameId, missingItemNameIds),
        },
        quantity,
      };
    });
    registeredItemIds.add(craftedItemId);

    return {
      id: `spell-${spellId}`,
      name,
      metadata: {
        spellId,
        learnSkill,
        acquisition,
        faction: "unknown" as const,
        specializationSpellId,
        cooldownSeconds: null,
        availability: acquisition === "automatic" ? ("available" as const) : ("unknown" as const),
      },
      thresholds,
      reagents,
      outputs: [
        {
          item: {
            id: `item-${craftedItemId}`,
            gameId: craftedItemId,
            name: itemName(itemNames, craftedItemId, missingItemNameIds),
          },
          minimumQuantity: 1,
          maximumQuantity: 1,
        },
      ],
      sourceId: `professiondb-${input.professionDbVersion}-forever-${buildId}`,
      verification: {
        status: "unverified" as const,
        notes:
          "Client-derived recipe structure. Output quantity is provisionally one because the published ProfessionDB snapshot does not encode stack size.",
      },
      provenanceNotes: borrowedRequiredSkills.has(spellId)
        ? "Thresholds, reagents, and crafted item are Forever client data. The published Vanilla-borrowed required skill was deliberately not imported. Item names come from the matching LibItemDB Forever snapshot."
        : "Thresholds, reagents, and crafted item are Forever client data. Item names come from the matching LibItemDB Forever snapshot. Output quantity remains unverified.",
    };
  });

  const dataset = importedBuildDatasetSchema.parse({
    build: { id: buildId, version: buildId.split(".").slice(0, 3).join(".") },
    sources: [
      {
        id: `professiondb-${input.professionDbVersion}-forever-${buildId}`,
        kind: "client-data",
        label: `LibProfessionDB ${input.professionDbVersion} + LibItemDB ${input.itemDbVersion}`,
        url: input.sourceUrl,
      },
    ],
    professions: [
      {
        id: input.profession.id,
        slug: input.profession.id,
        name: input.profession.name,
        recipes,
      },
    ],
  });

  return {
    dataset,
    report: {
      buildId,
      recipes: recipes.length,
      items: registeredItemIds.size,
      missingItemNames: missingItemNameIds.size,
      knownLearnSkillRecipes,
      borrowedRequiredSkillRecipes: borrowedRequiredSkills.size,
      automaticRecipes,
      specializationRecipes,
      provisionalOutputQuantityRecipes: recipes.length,
    },
  };
}
