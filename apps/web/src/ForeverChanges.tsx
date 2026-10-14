import { useMemo, useState } from "react";
import type {
  RecipeChange,
  RecipeChangeCounts,
  RecipeChangeType,
  RecipeComparisonSnapshot,
} from "@forever-professions/contracts";
import { ItemIcon } from "./ItemIcon.js";

type ChangeFilter = "CHANGED" | RecipeChangeType;
type RecipeItemType = "ALL" | "GEAR" | "ARMOR_KIT" | "CONTAINER" | "MATERIAL" | "OTHER";
type SkillAvailabilityKind = "AVAILABLE" | "ABOVE_SKILL" | "UNKNOWN" | "UNAVAILABLE";

interface SkillAvailability {
  readonly kind: SkillAvailabilityKind;
  readonly label?: string;
}

interface ForeverChangesProps {
  readonly changes: readonly RecipeChange[];
  readonly currentSkill: number;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly onRetry: () => void;
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

const GEAR_NAME_PATTERN = /\b(apron|armor|belt|boots?|bracers?|breastplate|chestguard|cloak|crown|gauntlets?|gloves?|harness|hat|headband|helm|helmet|hood|jerkin|leggings?|mask|pants|pauldrons?|robe|sabatons?|sandals?|shoes?|shoulder|slippers?|spaulders?|tunic|vest|waistcord|wristguards?)\b/i;
const CONTAINER_NAME_PATTERN = /\b(bag|pack|pouch|quiver|satchel)\b/i;
const MATERIAL_NAME_PATTERN = /\b(cured\s+\w+\s+hide|deeprock salt|hide|leather|scale)\b/i;

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  reagents: "Reagents",
  outputs: "Outputs",
  orangeSkill: "Orange skill",
  yellowSkill: "Yellow skill",
  greenSkill: "Green skill",
  graySkill: "Gray skill",
  learnSkill: "Learned at",
  acquisition: "Acquisition",
  faction: "Faction",
  specializationSpellId: "Specialization",
  cooldownSeconds: "Cooldown",
  availability: "Availability",
};

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

function formatFieldValue(
  field: string,
  value: unknown,
  snapshot: RecipeComparisonSnapshot | undefined,
): string {
  if (field === "orangeSkill" && snapshot?.orangeSkillKnown === false) {
    return "Unknown (source value is unanchored)";
  }
  if (field === "learnSkill" && (value === null || value === undefined)) {
    return snapshot?.borrowedLearnSkill === null || snapshot?.borrowedLearnSkill === undefined
      ? "Unknown"
      : `Unknown (Classic fallback: ${snapshot.borrowedLearnSkill})`;
  }
  if (field === "acquisition" && value === "unknown" && snapshot?.sourceKinds?.length) {
    const kinds = snapshot.sourceKinds.map((kind) =>
      kind === "container" ? "Container" : `${kind[0]!.toUpperCase()}${kind.slice(1)}`,
    );
    const suffix = snapshot.sourceDataOrigin === "classic-borrowed"
      ? " (Classic fallback)"
      : "";
    return `${kinds.join(" / ")}${suffix}`;
  }
  if (value === null || value === undefined) return "None";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return String(entry);
        const item = entry as Record<string, unknown>;
        const name = typeof item.name === "string" ? item.name : "Item";
        if (typeof item.quantity === "number") return `${item.quantity}× ${name}`;
        if (
          typeof item.minimumQuantity === "number" &&
          typeof item.maximumQuantity === "number"
        ) {
          const quantity = item.minimumQuantity === item.maximumQuantity
            ? item.minimumQuantity
            : `${item.minimumQuantity}–${item.maximumQuantity}`;
          return `${quantity}× ${name}`;
        }
        return name;
      })
      .join(", ");
  }
  return JSON.stringify(value);
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

function ChangeCard({
  change,
  currentSkill,
}: {
  readonly change: RecipeChange;
  readonly currentSkill: number;
}) {
  const changedFields = Object.entries(change.changedFields);
  const snapshot = change.target ?? change.base;
  const skillAvailability = skillAvailabilityFor(change, currentSkill);

  return (
    <details className={`change-card change-card-${change.changeType.toLowerCase()}`}>
      <summary>
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
          <strong>{change.name}</strong>
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
        <span className="change-card-expand" aria-hidden="true">⌄</span>
      </summary>

      <div className="change-card-details">
        {change.changeType === "UPDATED" && changedFields.length > 0 ? (
          <div className="field-comparison" role="table" aria-label={`${change.name} field changes`}>
            <div className="field-comparison-head" role="row">
              <span role="columnheader">Field</span>
              <span role="columnheader">Classic / previous</span>
              <span role="columnheader">Forever / current</span>
            </div>
            {changedFields.map(([field, values]) => values === undefined ? null : (
              <div className="field-comparison-row" key={field} role="row">
                <strong role="cell">{FIELD_LABELS[field] ?? field}</strong>
                <span role="cell">{formatFieldValue(field, values.before, change.base)}</span>
                <span role="cell">{formatFieldValue(field, values.after, change.target)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="snapshot-grid">
            <div>
              <span>Learned at</span>
              <strong>{formatFieldValue("learnSkill", snapshot?.learnSkill, snapshot)}</strong>
            </div>
            <div>
              <span>Orange from</span>
              <strong>{formatFieldValue("orangeSkill", snapshot?.orangeSkill, snapshot)}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{formatFieldValue("acquisition", snapshot?.acquisition, snapshot)}</strong>
            </div>
            <div>
              <span>Availability</span>
              <strong>{snapshot?.availability ?? "Unknown"}</strong>
            </div>
          </div>
        )}

        <div className="change-provenance">
          {change.base ? <span>Before: {change.base.provenance.sourceLabel}</span> : null}
          {change.target ? <span>After: {change.target.provenance.sourceLabel}</span> : null}
        </div>
      </div>
    </details>
  );
}

export function ForeverChanges({
  changes,
  currentSkill,
  error,
  loading,
  onRetry,
  search,
  summary,
}: ForeverChangesProps) {
  const [professionId, setProfessionId] = useState("");
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("CHANGED");
  const [itemType, setItemType] = useState<RecipeItemType>("ALL");
  const [showAboveSkill, setShowAboveSkill] = useState(true);
  const [showUnknownSkill, setShowUnknownSkill] = useState(true);
  const professions = useMemo(() => {
    const values = new Map<string, string>();
    for (const change of changes) {
      values.set(change.identity.professionId, change.professionName);
    }
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [changes]);
  const professionChanges = useMemo(
    () => changes.filter((change) => professionId.length === 0 || change.identity.professionId === professionId),
    [changes, professionId],
  );
  const counts = professionId.length === 0 && summary !== undefined
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
    return professionChanges.filter((change) => {
      const skillAvailability = skillAvailabilityFor(change, currentSkill);
      const matchesSkill = skillAvailability.kind === "AVAILABLE" ||
        (skillAvailability.kind === "UNKNOWN" ? showUnknownSkill : showAboveSkill);
      return (
        (changeFilter === "CHANGED"
          ? change.changeType !== "UNCHANGED"
          : change.changeType === changeFilter) &&
        (itemType === "ALL" || itemTypeFor(change) === itemType) &&
        matchesSkill &&
        changeMatchesSearch(change, query)
      );
    });
  }, [changeFilter, currentSkill, itemType, professionChanges, search, showAboveSkill, showUnknownSkill]);
  const activeFilterCount = Number(itemType !== "ALL") + Number(!showAboveSkill) + Number(!showUnknownSkill);
  const resultDescription = [
    changeFilter === "CHANGED"
      ? "Unchanged recipes are hidden by default"
      : `${CHANGE_LABELS[changeFilter as RecipeChangeType]} recipes`,
    itemType === "ALL" ? undefined : ITEM_TYPE_LABELS[itemType],
    showAboveSkill ? undefined : `At or below skill ${currentSkill}`,
    showUnknownSkill ? undefined : "Known requirements only",
  ].filter((value): value is string => value !== undefined).join(" · ");

  return (
    <section className="forever-changes" aria-labelledby="changes-title">
      <div className="changes-hero">
        <div>
          <h1 id="changes-title">Forever Changes</h1>
          <p>See exactly what changed from Classic Era to Forever, with field-level evidence from the imported recipe builds.</p>
        </div>
      </div>

      <div className="change-summary" aria-label="Change totals">
        {([
          ["NEW", "New", counts.new],
          ["UPDATED", "Updated", counts.updated],
          ["REMOVED", "Removed", counts.removed],
          ["UNCHANGED", "Unchanged", counts.unchanged],
        ] as const).map(([type, label, value]) => (
          <button
            className={`summary-${type.toLowerCase()}${changeFilter === type ? " active" : ""}`}
            key={type}
            onClick={() => setChangeFilter(type)}
            type="button"
          >
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </button>
        ))}
      </div>

      <div className="changes-toolbar">
        <div className="changes-toolbar-actions">
          <div className="change-filters" aria-label="Change type filter" role="group">
            {([
              ["CHANGED", "All changes"],
              ["NEW", "New"],
              ["UPDATED", "Updated"],
              ["REMOVED", "Removed"],
              ["UNCHANGED", "Unchanged"],
            ] as const).map(([type, label]) => (
              <button
                aria-pressed={changeFilter === type}
                className={changeFilter === type ? "active" : ""}
                key={type}
                onClick={() => setChangeFilter(type)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <details className="changes-filter-menu">
            <summary className={activeFilterCount > 0 ? "active" : ""}>
              <span aria-hidden="true">≡</span>
              Filters
              {activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}
            </summary>
            <div className="changes-filter-popover">
              <label className="changes-filter-field">
                <span>Item type</span>
                <select
                  onChange={(event) => setItemType(event.target.value as RecipeItemType)}
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
                  checked={showAboveSkill}
                  onChange={(event) => setShowAboveSkill(event.target.checked)}
                  type="checkbox"
                />
              </label>
              <label className="changes-availability-toggle">
                <span>
                  <strong>Include unknown skill requirements</strong>
                  <small>These cannot be verified against the skill slider yet.</small>
                </span>
                <input
                  checked={showUnknownSkill}
                  onChange={(event) => setShowUnknownSkill(event.target.checked)}
                  type="checkbox"
                />
              </label>
              {activeFilterCount > 0 ? (
                <button
                  className="changes-filter-reset"
                  onClick={() => {
                    setItemType("ALL");
                    setShowAboveSkill(true);
                    setShowUnknownSkill(true);
                  }}
                  type="button"
                >
                  Reset filters
                </button>
              ) : null}
            </div>
          </details>
        </div>
        <label className="profession-filter">
          <span>Profession</span>
          <select onChange={(event) => setProfessionId(event.target.value)} value={professionId}>
            <option value="">All professions</option>
            {professions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
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
              key={`${change.identity.professionId}-${change.identity.spellId}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
