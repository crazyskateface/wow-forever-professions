import {
  professionFixtureSchema,
  professionSummarySchema,
  recipeSchema,
  type ProfessionFixture,
  type ProfessionSummary,
  type Recipe,
} from "@forever-professions/contracts";
import type { SqlExecutor } from "./writer.js";

export interface RecipeCatalogReader {
  listProfessions(): Promise<readonly ProfessionSummary[]>;
  getProfession(professionId: string): Promise<ProfessionFixture | undefined>;
  getRecipe(recipeId: string): Promise<Recipe | undefined>;
}

function requiredString(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Catalog row is missing string column ${key}.`);
  }
  return value;
}

function requiredNumber(row: Readonly<Record<string, unknown>>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isInteger(value)) throw new Error(`Catalog row is missing integer column ${key}.`);
  return value;
}

function optionalNumber(
  row: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  if (row[key] === null || row[key] === undefined) return undefined;
  return requiredNumber(row, key);
}

function optionalString(
  row: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") throw new Error(`Catalog column ${key} must be a string.`);
  return value;
}

function optionalItemClassification(row: Readonly<Record<string, unknown>>) {
  const id = optionalNumber(row, "classification_id");
  if (id === undefined) return undefined;
  return {
    id,
    label: requiredString(row, "classification_label"),
    color: requiredNumber(row, "classification_color"),
    source: {
      product: requiredString(row, "classification_source_product"),
      build: requiredString(row, "classification_source_build_id"),
      locale: requiredString(row, "classification_source_locale"),
    },
  };
}

export class SqlRecipeCatalogReader implements RecipeCatalogReader {
  constructor(private readonly database: SqlExecutor) {}

  private async latestBuildId(): Promise<string | undefined> {
    const result = await this.database.query(
      "SELECT build_id FROM wow_build ORDER BY imported_at DESC LIMIT 1",
    );
    const row = result.rows[0];
    return row ? requiredString(row, "build_id") : undefined;
  }

  async listProfessions(): Promise<readonly ProfessionSummary[]> {
    const buildId = await this.latestBuildId();
    if (!buildId) return [];
    const result = await this.database.query(
      "SELECT DISTINCT p.profession_id, p.name FROM profession p JOIN recipe r ON r.profession_id = p.profession_id JOIN recipe_version rv ON rv.recipe_id = r.recipe_id JOIN provenance pr ON pr.recipe_version_id = rv.recipe_version_id JOIN verification v ON v.verification_id = pr.verification_id WHERE rv.build_id = $1 AND v.status <> 'rejected' ORDER BY p.name",
      [buildId],
    );
    return result.rows.map((row) =>
      professionSummarySchema.parse({
        id: requiredString(row, "profession_id"),
        name: requiredString(row, "name"),
      }),
    );
  }

  async getProfession(professionId: string): Promise<ProfessionFixture | undefined> {
    const buildId = await this.latestBuildId();
    if (!buildId) return undefined;
    const professionResult = await this.database.query(
      "SELECT profession_id, name FROM profession WHERE profession_id = $1",
      [professionId],
    );
    const profession = professionResult.rows[0];
    if (!profession) return undefined;

    const [recipeResult, reagentResult, outputResult] = await Promise.all([
      this.database.query(
        "SELECT r.recipe_id, rv.recipe_version_id, rv.name, rm.spell_id, rm.learn_skill, rm.acquisition, rm.faction, rm.specialization_spell_id, rm.cooldown_seconds, rm.availability, t.orange, t.yellow, t.green, t.gray, s.source_kind, s.label AS source_label, v.status AS verification_status, v.verified_at, v.verified_by, v.notes AS verification_notes, p.notes AS provenance_notes FROM recipe r JOIN recipe_version rv ON rv.recipe_id = r.recipe_id JOIN recipe_metadata rm ON rm.recipe_version_id = rv.recipe_version_id JOIN recipe_threshold t ON t.recipe_version_id = rv.recipe_version_id JOIN provenance p ON p.recipe_version_id = rv.recipe_version_id JOIN data_source s ON s.source_id = p.source_id JOIN verification v ON v.verification_id = p.verification_id WHERE r.profession_id = $1 AND rv.build_id = $2 AND v.status <> 'rejected' ORDER BY rv.name, r.recipe_id",
        [professionId, buildId],
      ),
      this.database.query(
        "SELECT rr.recipe_version_id, i.item_id, i.game_id, i.name, rr.quantity, ic.classification_id, ic.classification_label, ic.color AS classification_color, ic.source_product AS classification_source_product, ic.source_build_id AS classification_source_build_id, ic.source_locale AS classification_source_locale FROM recipe_reagent rr JOIN item i ON i.item_id = rr.item_id JOIN recipe_version rv ON rv.recipe_version_id = rr.recipe_version_id JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN item_classification ic ON ic.item_id = i.item_id AND ic.recipe_build_id = rv.build_id WHERE r.profession_id = $1 AND rv.build_id = $2 ORDER BY rr.recipe_version_id, i.item_id",
        [professionId, buildId],
      ),
      this.database.query(
        "SELECT ro.recipe_version_id, i.item_id, i.game_id, i.name, ro.minimum_quantity, ro.maximum_quantity, ic.classification_id, ic.classification_label, ic.color AS classification_color, ic.source_product AS classification_source_product, ic.source_build_id AS classification_source_build_id, ic.source_locale AS classification_source_locale FROM recipe_output ro JOIN item i ON i.item_id = ro.item_id JOIN recipe_version rv ON rv.recipe_version_id = ro.recipe_version_id JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN item_classification ic ON ic.item_id = i.item_id AND ic.recipe_build_id = rv.build_id WHERE r.profession_id = $1 AND rv.build_id = $2 ORDER BY ro.recipe_version_id, i.item_id",
        [professionId, buildId],
      ),
    ]);

    const reagentsByVersion = new Map<string, unknown[]>();
    for (const row of reagentResult.rows) {
      const versionId = requiredString(row, "recipe_version_id");
      const gameItemId = row.game_id === null ? undefined : requiredNumber(row, "game_id");
      const classification = optionalItemClassification(row);
      const reagents = reagentsByVersion.get(versionId) ?? [];
      reagents.push({
        itemId: requiredString(row, "item_id"),
        ...(gameItemId === undefined ? {} : { gameItemId }),
        name: requiredString(row, "name"),
        ...(classification === undefined ? {} : { classification }),
        quantity: requiredNumber(row, "quantity"),
      });
      reagentsByVersion.set(versionId, reagents);
    }

    const outputsByVersion = new Map<string, unknown[]>();
    for (const row of outputResult.rows) {
      const versionId = requiredString(row, "recipe_version_id");
      const minimum = requiredNumber(row, "minimum_quantity");
      const maximum = requiredNumber(row, "maximum_quantity");
      if (minimum !== maximum) {
        throw new Error(
          `Recipe version ${versionId} has a ranged output that the product contract cannot represent.`,
        );
      }
      const gameItemId = row.game_id === null ? undefined : requiredNumber(row, "game_id");
      const classification = optionalItemClassification(row);
      const outputs = outputsByVersion.get(versionId) ?? [];
      outputs.push({
        itemId: requiredString(row, "item_id"),
        ...(gameItemId === undefined ? {} : { gameItemId }),
        name: requiredString(row, "name"),
        ...(classification === undefined ? {} : { classification }),
        quantity: minimum,
      });
      outputsByVersion.set(versionId, outputs);
    }

    const recipes = recipeResult.rows.map((row) => {
      const versionId = requiredString(row, "recipe_version_id");
      const verifiedAt = optionalString(row, "verified_at");
      const verifiedBy = optionalString(row, "verified_by");
      const verificationNotes = optionalString(row, "verification_notes");
      const provenanceNotes = optionalString(row, "provenance_notes");
      const learnSkill = optionalNumber(row, "learn_skill");
      const specializationSpellId = optionalNumber(row, "specialization_spell_id");
      const cooldownSeconds = optionalNumber(row, "cooldown_seconds");
      return recipeSchema.parse({
        id: requiredString(row, "recipe_id"),
        spellId: requiredNumber(row, "spell_id"),
        name: requiredString(row, "name"),
        professionId,
        buildId,
        learnSkill: learnSkill ?? null,
        acquisition: requiredString(row, "acquisition"),
        faction: requiredString(row, "faction"),
        specializationSpellId: specializationSpellId ?? null,
        cooldownSeconds: cooldownSeconds ?? null,
        availability: requiredString(row, "availability"),
        thresholds: {
          orange: requiredNumber(row, "orange"),
          yellow: requiredNumber(row, "yellow"),
          green: requiredNumber(row, "green"),
          gray: requiredNumber(row, "gray"),
        },
        reagents: reagentsByVersion.get(versionId) ?? [],
        outputs: outputsByVersion.get(versionId) ?? [],
        provenance: {
          source: requiredString(row, "source_kind"),
          sourceLabel: requiredString(row, "source_label"),
          verification: {
            status: requiredString(row, "verification_status"),
            ...(verifiedAt === undefined ? {} : { verifiedAt }),
            ...(verifiedBy === undefined ? {} : { verifiedBy }),
            ...(verificationNotes === undefined ? {} : { notes: verificationNotes }),
          },
          ...(provenanceNotes === undefined ? {} : { notes: provenanceNotes }),
        },
      });
    });

    return professionFixtureSchema.parse({
      build: buildId,
      id: requiredString(profession, "profession_id"),
      name: requiredString(profession, "name"),
      recipes,
    });
  }

  async getRecipe(recipeId: string): Promise<Recipe | undefined> {
    const result = await this.database.query(
      "SELECT profession_id FROM recipe WHERE recipe_id = $1",
      [recipeId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const profession = await this.getProfession(requiredString(row, "profession_id"));
    return profession?.recipes.find(({ id }) => id === recipeId);
  }
}
