import { useEffect, useMemo } from "react";
import type {
  RecipeChange,
  RecipeChangeCounts,
  RecipeChangeType,
  Recipe,
} from "@forever-professions/contracts";
import { ItemIcon } from "./ItemIcon.js";
import { ItemTooltipButton } from "./ItemTooltip.js";
import { GearSlotIcon } from "./GearSlotIcon.js";
import { GEAR_SLOTS, changeMatchesGearSlots, toggleGearSlot } from "./gear-slots.js";
import { nextChangeSort, sortRecipeChanges } from "./change-sort.js";
import { getItemRarityNameClass, type ItemTooltipData } from "./item-tooltip.js";
import {
  DEFAULT_CHANGE_FILTERS,
  type ChangeFilter,
  type ForeverChangeFilters,
  type RecipeItemType,
} from "./personalization.js";

type SkillAvailabilityKind = "AVAILABLE" | "ABOVE_SKILL" | "UNKNOWN" | "UNAVAILABLE";

interface SkillAvailability {
  readonly kind: SkillAvailabilityKind;
  readonly label?: string;
}

interface ForeverChangesProps {
  readonly changes: readonly RecipeChange[];
  readonly currentSkill: number;
  readonly error: string | undefined;
  readonly filters: ForeverChangeFilters;
  readonly itemQualityById: ReadonlyMap<string, number>;
  readonly loading: boolean;
  readonly onFiltersChange: (filters: ForeverChangeFilters) => void;
  readonly onRetry: () => void;
  readonly onSelectRecipe: (recipe: Recipe) => void;
  readonly recipes: readonly Recipe[];
  readonly recipeTooltipBySpellId: ReadonlyMap<number, ItemTooltipData>;
  readonly search: string;
  readonly summary: RecipeChangeCounts | undefined;
}

const EMPTY_COUNTS: RecipeChangeCounts = {
  new: 0,
  updated: 0,
  removed: 0,
  unchanged: 0,
  total: 0,
};

const CHANGE_LABELS: Record<RecipeChangeType, string> = {
  NEW: "New",
  UPDATED: "Updated",
  REMOVED: "Removed",
  UNCHANGED: "Unchanged",
};

const ITEM_TYPE_LABELS: Record<RecipeItemType, string> = {
  ALL: "All item types",
  GEAR: "Gear",
  ARMOR_KIT: "Armor kits",
  CONTAINER: "Bags & storage",
  MATERIAL: "Materials",
  OTHER: "Other",
};

const ITEM_TYPE_ORDER = [
  "GEAR",
  "ARMOR_KIT",
  "CONTAINER",
  "MATERIAL",
  "OTHER",
] as const satisfies readonly Exclude<RecipeItemType, "ALL">[];

export function normalizeProfessionId(
  professionId: string,
  professions: readonly (readonly [string, string])[],
): string {
  return professionId.length === 0 || professions.some(([id]) => id === professionId)
    ? professionId
    : "";
}

const GEAR_NAME_PATTERN = /\b(apron|armor|belt|boots?|bracers?|breastplate|chestguard|cloak|crown|gauntlets?|gloves?|harness|hat|headband|helm|helmet|hood|jerkin|leggings?|mask|pants|pauldrons?|robe|sabatons?|sandals?|shoes?|shoulder|slippers?|spaulders?|tunic|vest|waistcord|wristguards?)\b/i;
const CONTAINER_NAME_PATTERN = /\b(bag|pack|pouch|quiver|satchel)\b/i;
const MATERIAL_NAME_PATTERN = /\b(cured\s+\w+\s+hide|deeprock salt|hide|leather|scale)\b/i;

function countChanges(changes: readonly RecipeChange[]): RecipeChangeCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const change of changes) {
    counts.total += 1;
    if (change.changeType === "NEW") counts.new += 1;
    else if (change.changeType === "UPDATED") counts.updated += 1;
    else if (change.changeType === "REMOVED") counts.removed += 1;
    else counts.unchanged += 1;
  }
  return counts;
}

function itemTypeFor(change: RecipeChange): Exclude<RecipeItemType, "ALL"> {
  const snapshot = change.target ?? change.base;
  const output = snapshot?.outputs[0];
  const outputName = output?.name ?? change.name;
  if (/\barmor kit\b/i.test(outputName)) return "ARMOR_KIT";
  if (output?.itemClassId === 1 || output?.itemClassId === 11) return "CONTAINER";
  if (output?.itemClassId === 2 || output?.itemClassId === 4) return "GEAR";
  if (output?.itemClassId === 5 || output?.itemClassId === 7) return "MATERIAL";
  if (CONTAINER_NAME_PATTERN.test(outputName)) return "CONTAINER";
  if (GEAR_NAME_PATTERN.test(outputName)) return "GEAR";
  if (MATERIAL_NAME_PATTERN.test(outputName)) return "MATERIAL";
  return "OTHER";
}

function skillAvailabilityFor(
  change: RecipeChange,
  currentSkill: number,
): SkillAvailability {
  const snapshot = change.target ?? change.base;
  if (change.changeType === "REMOVED" || snapshot?.availability === "unavailable") {
    return { kind: "UNAVAILABLE", label: "Unavailable in Forever" };
  }
  if (snapshot?.learnSkill === null || snapshot?.learnSkill === undefined) {
    const fallback = snapshot?.borrowedLearnSkill;
    return {
      kind: "UNKNOWN",
      label: fallback === null || fallback === undefined
        ? "Skill requirement unknown"
        : `Skill unknown · Classic was ${fallback}`,
    };
  }
  if (snapshot.learnSkill > currentSkill) {
    return { kind: "ABOVE_SKILL", label: `Requires skill ${snapshot.learnSkill}` };
  }
  return { kind: "AVAILABLE" };
}

function changeMatchesSearch(change: RecipeChange, query: string): boolean {
  if (query.length === 0) return true;
  const snapshots = [change.base, change.target].flatMap((snapshot) =>
    snapshot === undefined
      ? []
      : [
          snapshot.name,
          snapshot.acquisition,
          snapshot.faction,
          snapshot.provenance.sourceLabel,
          ...snapshot.reagents.map(({ name }) => name),
          ...snapshot.outputs.map(({ name }) => name),
        ],
  );
  return [
    change.name,
    change.professionName,
    String(change.identity.spellId),
    ...Object.keys(change.changedFields),
    ...snapshots,
  ].some((value) => value.toLowerCase().includes(query));
}

export function RecipeChangeBadge({ changeType }: { readonly changeType: RecipeChangeType }) {
  if (changeType === "UNCHANGED") return null;
  return (
    <span className={`change-badge change-${changeType.toLowerCase()}`}>
      {CHANGE_LABELS[changeType]}
    </span>
  );
}

export function changeTooltipItem(
  change: RecipeChange,
  recipeTooltipBySpellId: ReadonlyMap<number, ItemTooltipData>,
  itemQualityById: ReadonlyMap<string, number>,
): ItemTooltipData {
  const catalogItem = recipeTooltipBySpellId.get(change.identity.spellId);
  if (catalogItem !== undefined) return catalogItem;

  const snapshot = change.target ?? change.base;
  const output = snapshot?.outputs[0];
  const qualityId = output === undefined ? undefined : itemQualityById.get(output.itemId);
  return {
    name: output?.name ?? change.name,
    ...(qualityId === undefined ? {} : { qualityId }),
    ...(output?.gameItemId === undefined ? {} : { gameItemId: output.gameItemId }),
    ...(output?.itemClassId === undefined ? {} : { itemClassId: output.itemClassId }),
    ...(output?.itemSubClassId === undefined ? {} : { itemSubClassId: output.itemSubClassId }),
    ...(output?.inventoryType === undefined ? {} : { inventoryType: output.inventoryType }),
    details: [
      { text: `${change.professionName} recipe` },
      snapshot?.learnSkill === null || snapshot?.learnSkill === undefined
        ? { text: "Recipe learning skill unknown", tone: "warning" }
        : { text: `Recipe learned at skill ${snapshot.learnSkill}`, tone: "muted" },
    ],
  };
}

function ChangeCard({
  change,
  currentSkill,
  itemQualityById,
  recipeTooltipBySpellId,
  recipe,
  onSelectRecipe,
}: {
  readonly change: RecipeChange;
  readonly currentSkill: number;
  readonly itemQualityById: ReadonlyMap<string, number>;
  readonly recipeTooltipBySpellId: ReadonlyMap<number, ItemTooltipData>;
  readonly recipe: Recipe | undefined;
  readonly onSelectRecipe: (recipe: Recipe) => void;
}) {
  const changedFields = Object.entries(change.changedFields);
  const snapshot = change.target ?? change.base;
  const skillAvailability = skillAvailabilityFor(change, currentSkill);
  const tooltipItem = changeTooltipItem(
    change,
    recipeTooltipBySpellId,
    itemQualityById,
  );

  return (
    <article className={`change-card change-card-${change.changeType.toLowerCase()}`}>
      <ItemTooltipButton
        aria-label={recipe ? `Open ${change.name} in recipe calculator` : `${change.name}: calculator unavailable in current catalog`}
        disabled={recipe === undefined}
        item={tooltipItem}
        onClick={() => { if (recipe) onSelectRecipe(recipe); }}
        title={recipe ? "Open recipe calculator" : "This recipe has no current catalog record"}
        type="button"
      >
        <ItemIcon
          className="change-card-icon"
          gameItemId={snapshot?.outputs[0]?.gameItemId}
          name={snapshot?.outputs[0]?.name ?? change.name}
        />
        <span className="change-card-copy">
          <span className="change-card-meta">
            <RecipeChangeBadge changeType={change.changeType} />
            <span>{change.professionName}</span>
            <span>Spell #{change.identity.spellId}</span>
            {skillAvailability.label ? (
              <span className={`skill-availability-tag skill-${skillAvailability.kind.toLowerCase()}`}>
                {skillAvailability.label}
              </span>
            ) : null}
          </span>
          <strong className={getItemRarityNameClass(tooltipItem.qualityId)}>{change.name}</strong>
          <small>
            {change.changeType === "NEW"
              ? "New in Forever"
              : change.changeType === "REMOVED"
                ? "No longer present in the target build"
                : change.changeType === "UNCHANGED"
                  ? "No tracked recipe fields changed"
                  : `${changedFields.length} ${changedFields.length === 1 ? "field" : "fields"} changed`}
          </small>
        </span>
        {recipe ? <span aria-hidden="true">→</span> : null}
      </ItemTooltipButton>

    </article>
  );
}

export function ForeverChanges({
  changes,
  currentSkill,
  error,
  filters,
  itemQualityById,
  loading,
  onFiltersChange,
  onRetry,
  onSelectRecipe,
  recipes,
  recipeTooltipBySpellId,
  search,
  summary,
}: ForeverChangesProps) {
  const {
    changeFilter,
    itemType,
    gearSlots = DEFAULT_CHANGE_FILTERS.gearSlots,
    sortBy = DEFAULT_CHANGE_FILTERS.sortBy,
    sortDirection = DEFAULT_CHANGE_FILTERS.sortDirection,
    professionId,
    showAboveSkill,
    showUnknownSkill,
  } = filters;
  const professions = useMemo(() => {
    const values = new Map<string, string>();
    for (const change of changes) {
      values.set(change.identity.professionId, change.professionName);
    }
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [changes]);
  const normalizedProfessionId = normalizeProfessionId(professionId, professions);
  useEffect(() => {
    if (loading || error !== undefined || normalizedProfessionId === professionId) return;
    onFiltersChange({ ...filters, professionId: normalizedProfessionId });
  }, [error, filters, loading, normalizedProfessionId, onFiltersChange, professionId]);
  const professionChanges = useMemo(
    () => changes.filter((change) => normalizedProfessionId.length === 0 || change.identity.professionId === normalizedProfessionId),
    [changes, normalizedProfessionId],
  );
  const counts = normalizedProfessionId.length === 0 && summary !== undefined
    ? summary
    : countChanges(professionChanges);
  const itemTypeCounts = useMemo(() => {
    const values = new Map<Exclude<RecipeItemType, "ALL">, number>();
    for (const change of professionChanges) {
      const type = itemTypeFor(change);
      values.set(type, (values.get(type) ?? 0) + 1);
    }
    return values;
  }, [professionChanges]);
  const visibleChanges = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortRecipeChanges(professionChanges.filter((change) => {
      const skillAvailability = skillAvailabilityFor(change, currentSkill);
      const matchesSkill = skillAvailability.kind === "AVAILABLE" ||
        (skillAvailability.kind === "UNKNOWN" ? showUnknownSkill : showAboveSkill);
      return (
        (changeFilter === "CHANGED"
          ? change.changeType !== "UNCHANGED"
          : change.changeType === changeFilter) &&
        (itemType === "ALL" || itemTypeFor(change) === itemType) &&
        changeMatchesGearSlots(change, gearSlots) &&
        matchesSkill &&
        changeMatchesSearch(change, query)
      );
    }), { sortBy, sortDirection });
  }, [changeFilter, currentSkill, itemType, gearSlots, professionChanges, search, showAboveSkill, showUnknownSkill, sortBy, sortDirection]);
  const activeFilterCount = Number(normalizedProfessionId.length > 0) + Number(itemType !== "ALL") + Number(!showAboveSkill) + Number(!showUnknownSkill) + gearSlots.length;
  const resultDescription = [
    changeFilter === "CHANGED"
      ? "Unchanged recipes are hidden by default"
      : `${CHANGE_LABELS[changeFilter as RecipeChangeType]} recipes`,
    itemType === "ALL" ? undefined : ITEM_TYPE_LABELS[itemType],
    gearSlots.length === 0 ? undefined : GEAR_SLOTS.filter(slot => gearSlots.includes(slot.id)).map(slot => slot.label).join(", "),
    showAboveSkill ? undefined : `At or below skill ${currentSkill}`,
    showUnknownSkill ? undefined : "Known requirements only",
  ].filter((value): value is string => value !== undefined).join(" · ");

  return (
    <section className="forever-changes" aria-labelledby="changes-title">
      <div className="changes-hero">
        <div>
          <span className="section-kicker">Build comparison · Classic Era → Forever</span>
          <h1 id="changes-title">Forever Changes</h1>
          <p>Browse Classic Era → Forever recipe changes and open current recipes in the calculator.</p>
        </div>
      </div>

      <div className="change-summary" aria-label="Change status filter" role="group">
        {([
          ["CHANGED", "All changes", counts.new + counts.updated + counts.removed],
          ["NEW", "New", counts.new],
          ["UPDATED", "Updated", counts.updated],
          ["REMOVED", "Removed", counts.removed],
          ["UNCHANGED", "Unchanged", counts.unchanged],
        ] as const).map(([type, label, value]) => (
          <button
            aria-pressed={changeFilter === type}
            className={`summary-${type.toLowerCase()}${changeFilter === type ? " active" : ""}`}
            key={type}
            onClick={() => onFiltersChange({ ...filters, changeFilter: type })}
            type="button"
          >
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </button>
        ))}
      </div>

      <div className="changes-toolbar">
        <details className="changes-filter-menu" name="changes-controls">
          <summary className={activeFilterCount > 0 ? "active" : ""}>
            <span aria-hidden="true">≡</span>
            Filters
            {activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}
          </summary>
          <div className="changes-filter-popover">
            <label className="changes-filter-field">
              <span>Item type</span>
              <select
                aria-label="Filter changed recipes by item type"
                onChange={(event) => onFiltersChange({
                  ...filters,
                  itemType: event.target.value as RecipeItemType,
                })}
                value={itemType}
              >
                <option value="ALL">All item types ({professionChanges.length})</option>
                {ITEM_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {ITEM_TYPE_LABELS[type]} ({itemTypeCounts.get(type) ?? 0})
                  </option>
                ))}
              </select>
            </label>
            <label className="changes-availability-toggle">
              <span>
                <strong>Show recipes above current skill</strong>
                <small>Includes known requirements above skill {currentSkill}.</small>
              </span>
              <input
                aria-label="Show recipes above current skill"
                checked={showAboveSkill}
                onChange={(event) => onFiltersChange({
                  ...filters,
                  showAboveSkill: event.target.checked,
                })}
                type="checkbox"
              />
            </label>
            <label className="changes-availability-toggle">
              <span>
                <strong>Include unknown skill requirements</strong>
                <small>These cannot be verified against the skill slider yet.</small>
              </span>
              <input
                aria-label="Include unknown skill requirements"
                checked={showUnknownSkill}
                onChange={(event) => onFiltersChange({
                  ...filters,
                  showUnknownSkill: event.target.checked,
                })}
                type="checkbox"
              />
            </label>
            {activeFilterCount > 0 ? (
              <button
                className="changes-filter-reset"
                aria-label="Reset Forever Changes filters"
                onClick={() => onFiltersChange({
                  ...filters,
                  professionId: DEFAULT_CHANGE_FILTERS.professionId,
                  itemType: DEFAULT_CHANGE_FILTERS.itemType,
                  gearSlots: DEFAULT_CHANGE_FILTERS.gearSlots,
                  showAboveSkill: DEFAULT_CHANGE_FILTERS.showAboveSkill,
                  showUnknownSkill: DEFAULT_CHANGE_FILTERS.showUnknownSkill,
                })}
                type="button"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        </details>
        <details className="changes-filter-menu" name="changes-controls" onKeyDown={event => {
          if (event.key !== "Escape") return;
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }}>
          <summary aria-label="Sort recipes" title={`${sortBy === "name" ? "Alphabetical" : "Skill level"}, ${sortDirection === "asc" ? "ascending" : "descending"}`}>Sort</summary>
          <div className="changes-filter-popover changes-sort-options" role="group" aria-label="Sort recipes by">
            {([["name", "Alphabetical"], ["skill", "Skill level"]] as const).map(([key, label]) => {
              const selected = sortBy === key;
              const ascending = !selected || sortDirection === "asc";
              return <button
                aria-label={label}
                aria-pressed={selected}
                className="changes-availability-toggle changes-filter-reset"
                key={key}
                onClick={() => onFiltersChange({ ...filters, ...nextChangeSort({ sortBy, sortDirection }, key) })}
                title={selected ? `Click again for ${ascending ? "descending" : "ascending"} order` : "Sort ascending"}
                type="button"
              ><span><strong>{label} {selected ? ascending ? "↑" : "↓" : ""}</strong><small>{key === "name" ? ascending ? "A to Z" : "Z to A" : ascending ? "Lowest skill first" : "Highest skill first"}</small></span>{selected ? <span aria-hidden="true">✓</span> : null}</button>;
            })}
          </div>
        </details>
        <div className="changes-gear-slots" role="group" aria-label="Filter changed recipes by gear slot">
          {GEAR_SLOTS.map(slot => <button
            aria-label={slot.label}
            aria-pressed={gearSlots.includes(slot.id)}
            className="changes-gear-slot"
            key={slot.id}
            onClick={() => onFiltersChange({ ...filters, gearSlots: toggleGearSlot(gearSlots, slot.id) })}
            title={slot.label}
            type="button"
          ><GearSlotIcon slot={slot.id} /></button>)}
        </div>
        {professions.length > 1 ? (
          <label className="profession-filter">
            <span>Profession</span>
            <select
              onChange={(event) => onFiltersChange({
                ...filters,
                professionId: event.target.value,
              })}
              value={normalizedProfessionId}
            >
              <option value="">All professions</option>
              {professions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div className="changes-result-heading" aria-live="polite">
        <strong>{visibleChanges.length.toLocaleString()} {visibleChanges.length === 1 ? "recipe" : "recipes"}</strong>
        <span>{resultDescription}</span>
      </div>

      {loading ? (
        <div className="changes-state" role="status"><span className="changes-spinner" aria-hidden="true" /><strong>Comparing recipe builds</strong><p>Loading deterministic recipe changes and provenance…</p></div>
      ) : error ? (
        <div className="changes-state changes-state-error" role="alert"><span aria-hidden="true">!</span><strong>Comparison data is not available yet</strong><p>{error}</p><button onClick={onRetry} type="button">Try again</button></div>
      ) : visibleChanges.length === 0 ? (
        <div className="changes-state"><span aria-hidden="true">◇</span><strong>No matching recipe changes</strong><p>Try another status, profession, comparison, or search term.</p></div>
      ) : (
        <div className="change-card-list">
          {visibleChanges.map((change) => (
            <ChangeCard
              change={change}
              currentSkill={currentSkill}
              itemQualityById={itemQualityById}
              key={`${change.identity.professionId}-${change.identity.spellId}`}
              recipeTooltipBySpellId={recipeTooltipBySpellId}
              recipe={recipes.find(recipe => recipe.professionId === change.identity.professionId && recipe.spellId === change.identity.spellId)}
              onSelectRecipe={onSelectRecipe}
            />
          ))}
        </div>
      )}
    </section>
  );
}
