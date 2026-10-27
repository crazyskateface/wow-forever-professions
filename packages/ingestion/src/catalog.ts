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

function optionalItemClientData(
  row: Readonly<Record<string, unknown>>,
  stats: readonly unknown[] | undefined,
) {
  const displayName = optionalString(row, "client_display_name");
  if (displayName === undefined) return undefined;
  const equipmentSlot = optionalString(row, "client_equipment_slot");
  const armor = optionalNumber(row, "client_armor");
  const qualityId = optionalNumber(row, "client_quality_id");
  return {
    displayName,
    ...(qualityId === undefined ? {} : { qualityId }),
    ...(equipmentSlot === undefined ? {} : { equipmentSlot }),
    ...(armor === undefined ? {} : { armor }),
    ...(stats === undefined || stats.length === 0 ? {} : { stats }),
    requiredLevel: requiredNumber(row, "client_required_level"),
    sellPriceCopper: requiredNumber(row, "client_sell_price_copper"),
    source: {
      product: requiredString(row, "client_source_product"),
      build: requiredString(row, "client_source_build_id"),
      locale: requiredString(row, "client_source_locale"),
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

    const [recipeResult, reagentResult, outputResult, itemStatResult, sourceKindResult] = await Promise.all([
      this.database.query(
        "SELECT r.recipe_id, rv.recipe_version_id, rv.name, rm.spell_id, rm.learn_skill, rm.acquisition, rad.recipe_version_id AS acquisition_detail_recipe_version_id, rad.teaching_item_id, rad.source_data_origin, rm.faction, rm.specialization_spell_id, rm.cooldown_seconds, rm.availability, t.orange, t.yellow, t.green, t.gray, s.source_kind, s.label AS source_label, v.status AS verification_status, v.verified_at, v.verified_by, v.notes AS verification_notes, p.notes AS provenance_notes FROM recipe r JOIN recipe_version rv ON rv.recipe_id = r.recipe_id JOIN recipe_metadata rm ON rm.recipe_version_id = rv.recipe_version_id LEFT JOIN recipe_acquisition_detail rad ON rad.recipe_version_id = rv.recipe_version_id JOIN recipe_threshold t ON t.recipe_version_id = rv.recipe_version_id JOIN provenance p ON p.recipe_version_id = rv.recipe_version_id JOIN data_source s ON s.source_id = p.source_id JOIN verification v ON v.verification_id = p.verification_id WHERE r.profession_id = $1 AND rv.build_id = $2 AND v.status <> 'rejected' ORDER BY rv.name, r.recipe_id",
        [professionId, buildId],
      ),
      this.database.query(
        "SELECT rr.recipe_version_id, i.item_id, i.game_id, COALESCE(icd.display_name, i.name) AS name, rr.quantity, icd.display_name AS client_display_name, iq.quality_id AS client_quality_id, icd.item_class_id, icd.item_subclass_id, icd.inventory_type, icd.equipment_slot AS client_equipment_slot, icd.armor AS client_armor, icd.required_level AS client_required_level, icd.sell_price_copper AS client_sell_price_copper, icd.source_product AS client_source_product, icd.source_build_id AS client_source_build_id, icd.source_locale AS client_source_locale, ic.classification_id, ic.classification_label, ic.color AS classification_color, ic.source_product AS classification_source_product, ic.source_build_id AS classification_source_build_id, ic.source_locale AS classification_source_locale FROM recipe_reagent rr JOIN item i ON i.item_id = rr.item_id JOIN recipe_version rv ON rv.recipe_version_id = rr.recipe_version_id JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN item_client_data icd ON icd.item_id = i.item_id AND icd.recipe_build_id = rv.build_id LEFT JOIN item_quality iq ON iq.item_id = i.item_id AND iq.recipe_build_id = rv.build_id LEFT JOIN item_classification ic ON ic.item_id = i.item_id AND ic.recipe_build_id = rv.build_id WHERE r.profession_id = $1 AND rv.build_id = $2 ORDER BY rr.recipe_version_id, i.item_id",
        [professionId, buildId],
      ),
      this.database.query(
        "SELECT ro.recipe_version_id, i.item_id, i.game_id, COALESCE(icd.display_name, i.name) AS name, ro.minimum_quantity, ro.maximum_quantity, icd.display_name AS client_display_name, iq.quality_id AS client_quality_id, icd.item_class_id, icd.item_subclass_id, icd.inventory_type, icd.equipment_slot AS client_equipment_slot, icd.armor AS client_armor, icd.required_level AS client_required_level, icd.sell_price_copper AS client_sell_price_copper, icd.source_product AS client_source_product, icd.source_build_id AS client_source_build_id, icd.source_locale AS client_source_locale, ic.classification_id, ic.classification_label, ic.color AS classification_color, ic.source_product AS classification_source_product, ic.source_build_id AS classification_source_build_id, ic.source_locale AS classification_source_locale FROM recipe_output ro JOIN item i ON i.item_id = ro.item_id JOIN recipe_version rv ON rv.recipe_version_id = ro.recipe_version_id JOIN recipe r ON r.recipe_id = rv.recipe_id LEFT JOIN item_client_data icd ON icd.item_id = i.item_id AND icd.recipe_build_id = rv.build_id LEFT JOIN item_quality iq ON iq.item_id = i.item_id AND iq.recipe_build_id = rv.build_id LEFT JOIN item_classification ic ON ic.item_id = i.item_id AND ic.recipe_build_id = rv.build_id WHERE r.profession_id = $1 AND rv.build_id = $2 ORDER BY ro.recipe_version_id, i.item_id",
        [professionId, buildId],
      ),
      this.database.query(
        "SELECT item_id, stat_index, stat_id, stat_value, display_text, display_tone FROM item_stat WHERE recipe_build_id = $1 ORDER BY item_id, stat_index",
        [buildId],
      ),
      this.database.query(
        "SELECT rsk.recipe_version_id, rsk.source_kind FROM recipe_source_kind rsk JOIN recipe_version rv ON rv.recipe_version_id = rsk.recipe_version_id JOIN recipe r ON r.recipe_id = rv.recipe_id WHERE r.profession_id = $1 AND rv.build_id = $2 ORDER BY rsk.recipe_version_id, rsk.source_kind",
        [professionId, buildId],
      ),
    ]);

    const sourceKindsByVersion = new Map<string, string[]>();
    for (const row of sourceKindResult.rows) {
      const versionId = requiredString(row, "recipe_version_id");
      const sourceKinds = sourceKindsByVersion.get(versionId) ?? [];
      sourceKinds.push(requiredString(row, "source_kind"));
      sourceKindsByVersion.set(versionId, sourceKinds);
    }

    const statsByItemId = new Map<string, unknown[]>();
    for (const row of itemStatResult.rows) {
      const itemId = requiredString(row, "item_id");
      const stats = statsByItemId.get(itemId) ?? [];
      stats.push({
        statId: requiredNumber(row, "stat_id"),
        value: requiredNumber(row, "stat_value"),
        displayText: requiredString(row, "display_text"),
        displayTone: requiredString(row, "display_tone"),
      });
      statsByItemId.set(itemId, stats);
    }

    const reagentsByVersion = new Map<string, unknown[]>();
    for (const row of reagentResult.rows) {
      const versionId = requiredString(row, "recipe_version_id");
      const gameItemId = row.game_id === null ? undefined : requiredNumber(row, "game_id");
      const classification = optionalItemClassification(row);
      const itemId = requiredString(row, "item_id");
      const clientData = optionalItemClientData(row, statsByItemId.get(itemId));
      const itemClassId = optionalNumber(row, "item_class_id");
      const itemSubClassId = optionalNumber(row, "item_subclass_id");
      const inventoryType = optionalString(row, "inventory_type");
      const reagents = reagentsByVersion.get(versionId) ?? [];
      reagents.push({
        itemId,
        ...(gameItemId === undefined ? {} : { gameItemId }),
        name: requiredString(row, "name"),
        ...(itemClassId === undefined ? {} : { itemClassId }),
        ...(itemSubClassId === undefined ? {} : { itemSubClassId }),
        ...(inventoryType === undefined ? {} : { inventoryType }),
        ...(classification === undefined ? {} : { classification }),
        ...(clientData === undefined ? {} : { clientData }),
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
      const itemId = requiredString(row, "item_id");
      const clientData = optionalItemClientData(row, statsByItemId.get(itemId));
      const itemClassId = optionalNumber(row, "item_class_id");
      const itemSubClassId = optionalNumber(row, "item_subclass_id");
      const inventoryType = optionalString(row, "inventory_type");
      const outputs = outputsByVersion.get(versionId) ?? [];
      outputs.push({
        itemId,
        ...(gameItemId === undefined ? {} : { gameItemId }),
        name: requiredString(row, "name"),
        ...(itemClassId === undefined ? {} : { itemClassId }),
        ...(itemSubClassId === undefined ? {} : { itemSubClassId }),
        ...(inventoryType === undefined ? {} : { inventoryType }),
        ...(classification === undefined ? {} : { classification }),
        ...(clientData === undefined ? {} : { clientData }),
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
      const acquisitionDetailVersionId = optionalString(
        row,
        "acquisition_detail_recipe_version_id",
      );
      const teachingItemId = optionalNumber(row, "teaching_item_id");
      const sourceDataOrigin = optionalString(row, "source_data_origin");
      const sourceKinds = sourceKindsByVersion.get(versionId);
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
        ...(acquisitionDetailVersionId === undefined
          ? sourceKinds === undefined ? {} : { sourceKinds }
          : {
              teachingItemId: teachingItemId ?? null,
              sourceKinds: sourceKinds ?? [],
              ...(sourceDataOrigin === undefined ? {} : { sourceDataOrigin }),
            }),
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
