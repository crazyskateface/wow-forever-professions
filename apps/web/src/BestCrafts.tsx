import { useMemo } from "react";
import type { Recipe } from "@forever-professions/contracts";
import { CRAFT_CLASSES, CRAFT_LEVEL_TARGETS, getCraftProfile, recommendCrafts, type CraftLevelTarget, type CraftPick } from "@forever-professions/domain";
import { ItemIcon } from "./ItemIcon.js";
import { ItemTooltipButton } from "./ItemTooltip.js";
import { getItemRarityNameClass, type ItemTooltipData } from "./item-tooltip.js";
import type { CatalogState } from "./request-policy.js";

export interface CraftSelection {
  readonly classId: string;
  readonly roleId: string;
  readonly level: CraftLevelTarget;
}

export function BestCrafts({ recipes, professionName, currentSkill, faction, catalogState, selection, onSelectionChange, onOpenRecipe, getTooltip }: {
  readonly recipes: readonly Recipe[];
  readonly professionName: string;
  readonly currentSkill: number;
  readonly faction: string;
  readonly catalogState: CatalogState;
  readonly selection: CraftSelection;
  readonly onSelectionChange: (selection: CraftSelection) => void;
  readonly onOpenRecipe: (recipe: Recipe) => void;
  readonly getTooltip: (recipe: Recipe, professionName: string, output: Recipe["outputs"][number]) => ItemTooltipData;
}) {
  const { character, role } = getCraftProfile(selection.classId, selection.roleId);
  const recommendations = useMemo(() => recommendCrafts(recipes, { ...selection, faction }), [recipes, selection, faction]);

  function renderPick({ recipe, output }: CraftPick<Recipe>, alternative = false) {
    const data = output.clientData!;
    const usefulStats = (data.stats ?? []).filter(({ statId }) => (role.weights[statId] ?? 0) > 0);
    return (
      <div className={`craft-pick${alternative ? " craft-pick-alternative" : ""}`} key={`${recipe.id}:${output.itemId}`}>
        <ItemTooltipButton className="craft-item" item={getTooltip(recipe, professionName, output)} onClick={() => onOpenRecipe(recipe)} type="button">
          <ItemIcon className="craft-item-icon" gameItemId={output.gameItemId} name={output.name} />
          <span><strong className={getItemRarityNameClass(data.qualityId)}>{data.displayName ?? output.name}</strong><small>Requires character level {data.requiredLevel}</small></span>
        </ItemTooltipButton>
        <div className="craft-stats">
          {role.armorWeight !== undefined && data.armor !== undefined ? <span>{data.armor} Armor</span> : null}
          {usefulStats.map((stat, index) => <span key={`${stat.statId}:${index}`}>{stat.displayText}</span>)}
        </div>
        <div className="craft-requirements">
          <span className={recipe.learnSkill !== null && recipe.learnSkill > currentSkill ? "craft-future-skill" : ""}>
            {recipe.learnSkill === null ? "Learning skill unknown" : `${professionName} ${recipe.learnSkill}`}
          </span>
          <span>{recipe.acquisition === "unknown" ? "Pattern source unknown" : `Source: ${recipe.acquisition}`}{recipe.availability === "unknown" ? " · availability unconfirmed" : ""}</span>
          {recipe.specializationSpellId !== null ? <span>Specialization required</span> : null}
          {recipe.faction === "unknown" ? <span>Faction restriction unknown</span> : null}
        </div>
        <button aria-label={`View recipe for ${output.name}`} className="craft-recipe-link" onClick={() => onOpenRecipe(recipe)} type="button">View recipe <span aria-hidden="true">↗</span></button>
      </div>
    );
  }

  return (
    <section aria-labelledby="best-crafts-title" className="best-crafts">
      <header className="best-crafts-intro">
        <h1 id="best-crafts-title">Best crafts for your character</h1>
      </header>
      <div className="craft-character-controls">
        <label><span>Class</span><select value={character.id} onChange={(event) => {
          const next = getCraftProfile(event.target.value, "");
          onSelectionChange({ ...selection, classId: next.character.id, roleId: next.role.id });
        }}>{CRAFT_CLASSES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label><span>Role</span><select value={role.id} onChange={(event) => onSelectionChange({ ...selection, roleId: event.target.value })}>
          {character.roles.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <p><span>Stat priorities</span>{role.priorities}</p>
      </div>
      <div aria-label="Character level target" className="craft-milestones" role="group">
        {CRAFT_LEVEL_TARGETS.map((level) => <button aria-pressed={selection.level === level} className={selection.level === level ? "active" : ""} key={level} onClick={() => onSelectionChange({ ...selection, level })} type="button"><span>By level</span><strong>{level}</strong></button>)}
      </div>
      {catalogState === "loading" ? <p className="craft-empty" role="status">Loading the profession's equipment…</p> : (
        <>
          <div className="craft-results-heading">
            <div><span className="section-kicker">{character.label} · {role.label}</span><h2>Aim to craft by level {selection.level}</h2></div>
          </div>
          {recommendations.slots.length === 0 ? (
            <div className="craft-empty"><h3>No supported matches at this milestone</h3><p>{catalogState === "fixture" || catalogState === "fallback" ? "The full Forever catalog is unavailable. Sample recipes cannot provide equipment recommendations." : `This ${professionName.toLowerCase()} catalog has no equipment with suitable known stats for this class and role by level ${selection.level}. Try another milestone or browse All recipes.`}</p></div>
          ) : (
            <div className="craft-slot-list">
              {recommendations.slots.map(({ slot, best, alternatives }) => (
                <section aria-label={`${slot} crafts`} className="craft-slot" key={slot}>
                  <h3>{slot}</h3>
                  <div>
                    {renderPick(best)}
                    {alternatives.length > 0 ? <details className="craft-alternatives"><summary>Compare {alternatives.length} alternatives</summary>{alternatives.map((pick) => renderPick(pick, true))}</details> : null}
                  </div>
                </section>
              ))}
            </div>
          )}
          <details className="craft-method">
            <summary>How these crafts are chosen</summary>
            <p>These are suggested crafts within {professionName.toLowerCase()}, ranked using the role's stat priorities and known Forever client stats. They are not an all-source best-in-slot list or a combat simulation. Set bonuses, procs, unique effects and your current gear are not scored. Pattern availability and specialization still need to be checked before crafting.</p>
            <p>Targets are fixed at 20, 30, 40, 50, 55 and 60 to cover the catalog's main equipment unlocks. Your selected faction is {faction}. Unknown faction restrictions stay labeled.</p>
            {recommendations.missingDataCount > 0 ? <p>{recommendations.missingDataCount} equipment outputs lack supported level, classification or stat data and are not ranked.</p> : null}
            {recommendations.excludedEvidenceCount > 0 ? <p>{recommendations.excludedEvidenceCount} equipment outputs are unavailable, rejected, Classic fallbacks or illustrative samples and are not ranked.</p> : null}
            <p>Item data: {[...new Set(recommendations.slots.map(({ best }) => `${best.output.clientData!.source.product} ${best.output.clientData!.source.build} (${best.output.clientData!.source.locale})`))].join(", ") || "No supported items"}.</p>
          </details>
        </>
      )}
    </section>
  );
}
