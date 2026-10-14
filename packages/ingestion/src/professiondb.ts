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
  readonly recipeItemsLua?: string;
  readonly sourcesLua?: string;
  readonly hiddenRecipesLua?: string;
  readonly recipeNamesLua: string;
  readonly itemNamesLua: string;
  readonly itemCoreLua?: readonly string[];
  readonly profession: {
    readonly id: string;
    readonly name: string;
    readonly skillLineId: number;
  };
  readonly professionDbVersion: string;
  readonly itemDbVersion: string;
  readonly sourceUrl: string;
  readonly gameVersion?: "Forever" | "Vanilla";
  readonly canonicalItemNames?: ReadonlyMap<number, string>;
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
    readonly teachingItemRecipes: number;
    readonly sourceKindRecipes: number;
    readonly borrowedSourceRecipes: number;
    readonly hiddenRecipeRecords: number;
    readonly classifiedItems: number;
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
      } else if (/[A-Za-z_]/.test(this.peek())) {
        const identifierStart = this.position;
        const identifier = this.readWhile(/[A-Za-z0-9_]/);
        this.skipSpace();
        if (this.peek() === "=") {
          this.position += 1;
          key = identifier;
          value = this.parseValue();
        } else {
          this.position = identifierStart;
          key = nextArrayIndex;
          nextArrayIndex += 1;
          value = this.parseValue();
        }
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
      if (/[0-9]/.test(escaped)) {
        let digits = escaped;
        while (digits.length < 3 && /[0-9]/.test(this.peek())) {
          digits += this.source[this.position++]!;
        }
        value += String.fromCharCode(Number(digits));
        continue;
      }
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

function parseBorrowedValues(source: string, field: string): Set<number> {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`lib:LoadBorrowed\\("${escapedField}",\\s*"Vanilla",\\s*\\{([^}]*)\\}\\)`),
  );
  if (!match) return new Set();
  return new Set(
    match[1]!
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Number.isInteger),
  );
}

const SOURCE_KIND_BY_KEY = {
  t: "trainer",
  v: "vendor",
  q: "quest",
  c: "container",
  d: "drop",
} as const;

type RecipeSourceKind = (typeof SOURCE_KIND_BY_KEY)[keyof typeof SOURCE_KIND_BY_KEY];

interface ItemClassification {
  readonly itemClassId: number;
  readonly itemSubClassId: number;
  readonly inventoryType: string;
}

function parseItemClassifications(sources: readonly string[]): Map<number, ItemClassification> {
  const classifications = new Map<number, ItemClassification>();
  for (const source of sources) {
    const classMatch = source.match(/lib:LoadCore\(\s*(\d+)\s*,/);
    if (!classMatch) continue;
    const itemClassId = Number(classMatch[1]);
    const records = parseCallTable(source, "lib:LoadCore(");
    for (const [itemKey, packedValue] of records) {
      const gameItemId = requireNumber(itemKey, "Item classification ID");
      if (typeof packedValue !== "string") continue;
      const fields = packedValue.split(String.fromCharCode(31));
      const itemSubClassId = Number(fields[1]);
      const inventoryType = fields[2];
      if (!Number.isInteger(itemSubClassId) || !inventoryType) continue;
      classifications.set(gameItemId, { itemClassId, itemSubClassId, inventoryType });
    }
  }
  return classifications;
}

function parseRecipeSourceKinds(source: string | undefined): Map<number, readonly RecipeSourceKind[]> {
  if (!source) return new Map();
  const records = parseCallTable(source, "lib:LoadSources(");
  const result = new Map<number, readonly RecipeSourceKind[]>();
  for (const [spellKey, rawSources] of records) {
    const spellId = requireNumber(spellKey, "Recipe source spell ID");
    const sourceTable = requireTable(rawSources, `Recipe ${spellId} sources`);
    const kinds = Object.entries(SOURCE_KIND_BY_KEY).flatMap(([key, kind]) =>
      sourceTable.get(key) instanceof Map ? [kind] : [],
    );
    if (kinds.length > 0) result.set(spellId, kinds);
  }
  return result;
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
  canonicalItemNames?: ReadonlyMap<number, string>,
): string {
  const canonicalName = canonicalItemNames?.get(gameItemId);
  if (canonicalName !== undefined) return canonicalName;
  const value = names.get(gameItemId);
  if (typeof value === "string" && value.length > 0) return value;
  missingItemNameIds.add(gameItemId);
  return `Unknown item #${gameItemId}`;
}

function itemRecord(
  names: LuaTable,
  gameItemId: number,
  missingItemNameIds: Set<number>,
  classifications: ReadonlyMap<number, ItemClassification>,
  canonicalItemNames?: ReadonlyMap<number, string>,
) {
  const classification = classifications.get(gameItemId);
  return {
    id: `item-${gameItemId}`,
    gameId: gameItemId,
    name: itemName(names, gameItemId, missingItemNameIds, canonicalItemNames),
    ...(classification === undefined ? {} : classification),
  };
}

export function convertProfessionDbSnapshot(
  input: ProfessionDbSnapshotInput,
): ProfessionDbConversionResult {
  const gameVersion = input.gameVersion ?? "Forever";
  const sourceVersion = gameVersion === "Vanilla" ? "classic-era" : "forever";
  const sourceLabel = gameVersion === "Vanilla" ? "Classic Era" : "Forever";
  const sourceId = `professiondb-${input.professionDbVersion}-${sourceVersion}`;
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
  const recipeItems = input.recipeItemsLua
    ? parseCallTable(input.recipeItemsLua, "lib:LoadRecipeItems(")
    : new Map<LuaKey, LuaValue>();
  const recipeSourceKinds = parseRecipeSourceKinds(input.sourcesLua);
  const hiddenRecipes = input.hiddenRecipesLua
    ? parseCallTable(input.hiddenRecipesLua, "lib:LoadHiddenRecipes(")
    : new Map<LuaKey, LuaValue>();
  const borrowedRequiredSkills = parseBorrowedValues(input.coreLua, "requiredSkill");
  const borrowedSources = parseBorrowedValues(input.sourcesLua ?? "", "sources");
  const borrowedHiddenRecipes = parseBorrowedValues(input.hiddenRecipesLua ?? "", "hidden");
  const itemClassifications = parseItemClassifications(input.itemCoreLua ?? []);
  const registeredItemIds = new Set<number>();
  const missingItemNameIds = new Set<number>();
  let knownLearnSkillRecipes = 0;
  let automaticRecipes = 0;
  let teachingItemRecipes = 0;
  let sourceKindRecipes = 0;
  let borrowedSourceRecipes = 0;
  let hiddenRecipeRecords = 0;
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
    const borrowedLearnSkill = borrowedRequiredSkills.has(spellId) && rawRequiredSkill !== undefined
      ? requireNumber(rawRequiredSkill, `Recipe ${spellId} borrowed required skill`)
      : null;
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
    const rawTeachingItemId = recipeItems.get(spellId);
    const teachingItemId = rawTeachingItemId === undefined
      ? null
      : requireNumber(rawTeachingItemId, `Recipe ${spellId} teaching item`);
    if (teachingItemId !== null) teachingItemRecipes += 1;
    const sourceKinds = recipeSourceKinds.get(spellId) ?? [];
    if (sourceKinds.length > 0) sourceKindRecipes += 1;
    const sourceDataOrigin = sourceKinds.length === 0
      ? ("unknown" as const)
      : gameVersion === "Vanilla"
        ? ("classic" as const)
        : borrowedSources.has(spellId)
        ? ("classic-borrowed" as const)
        : ("forever" as const);
    if (sourceDataOrigin === "classic-borrowed") borrowedSourceRecipes += 1;
    const hiddenRecord = hiddenRecipes.get(spellId) === true;
    if (hiddenRecord) hiddenRecipeRecords += 1;
    const hiddenDataOrigin = hiddenRecord
      ? gameVersion === "Vanilla"
        ? ("classic" as const)
        : borrowedHiddenRecipes.has(spellId)
        ? ("classic-borrowed" as const)
        : ("forever" as const)
      : ("unknown" as const);
    const sourceDataIsNative = sourceDataOrigin === "forever" || sourceDataOrigin === "classic";
    const acquisitionFromSource =
      sourceDataIsNative && sourceKinds.length === 1
        ? sourceKinds[0] === "container"
          ? "unknown"
          : sourceKinds[0]
        : "unknown";
    const acquisition = acquisitionMethod === 1
      ? ("automatic" as const)
      : acquisitionFromSource;
    if (acquisition === "automatic") automaticRecipes += 1;

    const thresholds = {
      orange: requireNumber(difficulty.get(1), `Recipe ${spellId} orange threshold`),
      yellow: requireNumber(difficulty.get(2), `Recipe ${spellId} yellow threshold`),
      green: requireNumber(difficulty.get(3), `Recipe ${spellId} green threshold`),
      gray: requireNumber(difficulty.get(4), `Recipe ${spellId} gray threshold`),
    };
    const orangeSkillKnown = !(learnSkill === null && thresholds.orange === 1);
    const reagents = [...reagentTable.entries()].map(([itemKey, quantityValue]) => {
      const gameId = requireNumber(itemKey, `Recipe ${spellId} reagent item ID`);
      const quantity = requireNumber(
        quantityValue,
        `Recipe ${spellId} reagent ${gameId} quantity`,
      );
      registeredItemIds.add(gameId);
      return {
        item: itemRecord(
          itemNames,
          gameId,
          missingItemNameIds,
          itemClassifications,
          input.canonicalItemNames,
        ),
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
        borrowedLearnSkill,
        acquisition,
        teachingItemId,
        sourceKinds,
        sourceDataOrigin,
        hiddenStatus: hiddenRecord ? true : null,
        hiddenDataOrigin,
        orangeSkillKnown,
        faction: "unknown" as const,
        specializationSpellId,
        cooldownSeconds: null,
        availability:
          hiddenRecord && (hiddenDataOrigin === "forever" || hiddenDataOrigin === "classic")
            ? ("unavailable" as const)
            : acquisition === "automatic" || sourceDataIsNative
              ? ("available" as const)
              : ("unknown" as const),
      },
      thresholds,
      reagents,
      outputs: [
        {
          item: itemRecord(
            itemNames,
            craftedItemId,
            missingItemNameIds,
            itemClassifications,
            input.canonicalItemNames,
          ),
          minimumQuantity: 1,
          maximumQuantity: 1,
        },
      ],
      sourceId: `${sourceId}-${buildId}`,
      verification: {
        status: "unverified" as const,
        notes:
          "Client-derived recipe structure. Output quantity is provisionally one because the published ProfessionDB snapshot does not encode stack size.",
      },
      provenanceNotes: [
        `Thresholds, reagents, and crafted item are ${sourceLabel} client data.`,
        borrowedRequiredSkills.has(spellId)
          ? `The required skill ${borrowedLearnSkill ?? "value"} is borrowed from Vanilla and retained only as an unconfirmed fallback.`
          : undefined,
        sourceDataOrigin === "classic-borrowed"
          ? "Recipe source kinds are borrowed from Vanilla and are not confirmed for Forever."
          : undefined,
        hiddenDataOrigin === "classic-borrowed"
          ? "The hidden-recipe flag is borrowed from Vanilla and is not treated as Forever availability evidence."
          : undefined,
        orangeSkillKnown
          ? undefined
          : "The client orange value of 1 is an unanchored placeholder, not a verified skill threshold.",
        `Item names and classifications come from the matching LibItemDB ${sourceLabel} snapshot.`,
        "Output quantity remains unverified.",
      ].filter((value): value is string => value !== undefined).join(" "),
    };
  });

  const dataset = importedBuildDatasetSchema.parse({
    build: { id: buildId, version: buildId.split(".").slice(0, 3).join(".") },
    sources: [
      {
        id: `${sourceId}-${buildId}`,
        kind: gameVersion === "Vanilla" ? "classic-fallback" : "client-data",
        label: `LibProfessionDB ${input.professionDbVersion} + LibItemDB ${input.itemDbVersion} (${sourceLabel})`,
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
      teachingItemRecipes,
      sourceKindRecipes,
      borrowedSourceRecipes,
      hiddenRecipeRecords,
      classifiedItems: [...registeredItemIds].filter((id) => itemClassifications.has(id)).length,
      specializationRecipes,
      provisionalOutputQuantityRecipes: recipes.length,
    },
  };
}
