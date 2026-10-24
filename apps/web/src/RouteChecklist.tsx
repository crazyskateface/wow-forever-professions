import type {
  Recipe,
  RecipeChangeType,
  RouteOptimizationResult,
  RouteRecipeEvidence,
  RouteSegment,
} from "@forever-professions/contracts";
import { RecipeChangeBadge } from "./ForeverChanges.js";
import { ItemIcon } from "./ItemIcon.js";
import { getItemRarityNameClass } from "./item-tooltip.js";
import { recipeKnowledgeHref } from "./leatherworking-knowledge.js";
import {
  activeRouteSegmentKey,
  routeSegmentKey,
} from "./route-progress.js";

interface RouteChecklistProps {
  readonly completedSegmentKeys: ReadonlySet<string>;
  readonly currentSkill: number;
  readonly getRecipeChangeType: (recipe: Recipe) => RecipeChangeType | undefined;
  readonly onMarkThroughSkill: () => void;
  readonly onOpenRecipe: (recipeId: string) => void;
  readonly onResume: (segmentKey: string | undefined) => void;
  readonly onToggleSegment: (segmentKey: string, complete: boolean) => void;
  readonly recipes: readonly Recipe[];
  readonly result: RouteOptimizationResult;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}

function formatCopper(value: number): string {
  const rounded = Math.round(value);
  const gold = Math.floor(rounded / 10_000);
  const silver = Math.floor((rounded % 10_000) / 100);
  const copper = rounded % 100;
  return `${gold}g ${silver}s ${copper}c`;
}

function acquisitionLabel(acquisition: RouteRecipeEvidence["acquisition"]): string {
  if (acquisition === "unknown") return "Source unknown";
  if (acquisition === "automatic") return "Learned automatically";
  return acquisition[0]!.toUpperCase() + acquisition.slice(1);
}

function confidenceLabel(level: RouteRecipeEvidence["level"]): string {
  if (level === "verified") return "Verified";
  if (level === "fallback") return "Classic fallback";
  if (level === "unknown") return "Evidence gap";
  if (level === "rejected") return "Rejected evidence";
  return "Unverified";
}

function reasonLabel(reason: RouteRecipeEvidence["reasons"][number]): string {
  if (reason === "unknown-acquisition") return "Acquisition unknown";
  if (reason === "unknown-availability") return "Availability unknown";
  if (reason === "classic-fallback") return "Classic fallback";
  if (reason === "rejected-recipe") return "Rejected evidence";
  return "Not Forever-verified";
}

function presetLabel(result: RouteOptimizationResult): string {
  if (result.preset === "trainer-friendly") return "Trainer friendly";
  if (result.preset === "fewest-crafts") return "Fewest crafts";
  if (result.preset === "fewest-materials") return "Fewest materials";
  return result.preset[0]!.toUpperCase() + result.preset.slice(1);
}

function primaryMaterials(recipe: Recipe | undefined, segment: RouteSegment) {
  if (recipe === undefined) return [];
  return recipe.reagents
    .map((reagent) => ({
      itemId: reagent.itemId,
      name: reagent.name,
      quantity: reagent.quantity * segment.expectedCrafts,
    }))
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 3);
}

export function RouteChecklist({
  completedSegmentKeys,
  currentSkill,
  getRecipeChangeType,
  onMarkThroughSkill,
  onOpenRecipe,
  onResume,
  onToggleSegment,
  recipes,
  result,
}: RouteChecklistProps) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe] as const));
  const activeKey = activeRouteSegmentKey(
    result.segments,
    completedSegmentKeys,
    currentSkill,
  );
  const completedCount = result.segments.filter((segment) =>
    completedSegmentKeys.has(routeSegmentKey(segment)),
  ).length;
  const allComplete = result.segments.length > 0 && completedCount === result.segments.length;

  return (
    <section className="route-checklist" aria-labelledby="route-checklist-title">
      <div className="route-checklist-heading">
        <div>
          <span className="section-kicker">Your field guide</span>
          <h2 id="route-checklist-title">Work the route</h2>
          <p>
            Check off completed ranges. Progress is saved only for this exact build,
            route, market, and recipe selection.
          </p>
          <span className={`route-preset-badge preset-${result.preset}`}>
            {presetLabel(result)} preset
          </span>
        </div>
        <div className="route-progress-copy" aria-live="polite">
          <strong>{completedCount} / {result.segments.length}</strong>
          <span>steps complete</span>
        </div>
      </div>

      <progress
        aria-label={`${completedCount} of ${result.segments.length} route steps complete`}
        className="route-progress"
        max={Math.max(1, result.segments.length)}
        value={completedCount}
      />

      <div className="route-progress-actions">
        <button onClick={onMarkThroughSkill} type="button">
          Mark through skill {currentSkill} complete
        </button>
        <button disabled={activeKey === undefined} onClick={() => onResume(activeKey)} type="button">
          Resume at current skill
        </button>
      </div>

      {allComplete ? (
        <p className="route-complete-message" role="status">
          Route complete. Your checked steps remain saved for this route.
        </p>
      ) : null}
      {result.status === "blocked" ? (
        <p className="route-warning">{result.explanation}</p>
      ) : null}

      <ol className="route-segments">
        {result.segments.map((segment, index) => {
          const key = routeSegmentKey(segment);
          const complete = completedSegmentKeys.has(key);
          const active = key === activeKey;
          const recipe = recipeById.get(segment.recipeId);
          const changeType = recipe === undefined
            ? undefined
            : getRecipeChangeType(recipe);
          const materials = primaryMaterials(recipe, segment);
          const sourceGuideHref = recipeKnowledgeHref(
            segment.evidence.acquisition,
            segment.recipeId,
          );
          return (
            <li
              aria-current={active ? "step" : undefined}
              className={`route-segment-card${active ? " active" : ""}${complete ? " complete" : ""}`}
              data-route-segment-key={key}
              key={key}
              tabIndex={-1}
            >
              <label className="route-step-check">
                <input
                  checked={complete}
                  onChange={(event) => onToggleSegment(key, event.target.checked)}
                  type="checkbox"
                />
                <span className="route-step-checkmark" aria-hidden="true" />
                <span className="route-step-order">Step {index + 1}</span>
                <span className="sr-only">
                  Mark {segment.recipeName}, skill {segment.startSkill} through {segment.endSkill}, complete
                </span>
              </label>

              <div className="route-step-main">
                <div className="route-step-title-row">
                  <ItemIcon
                    className="route-step-icon"
                    gameItemId={recipe?.outputs[0]?.gameItemId}
                    name={segment.recipeName}
                  />
                  <div>
                    <span className="route-range">{segment.startSkill} → {segment.endSkill}</span>
                    <h3 className={getItemRarityNameClass(recipe?.outputs[0]?.clientData?.qualityId)}>
                      {segment.recipeName}
                    </h3>
                  </div>
                </div>

                <div className="route-step-badges" aria-label="Route step status">
                  <span>{acquisitionLabel(segment.evidence.acquisition)}</span>
                  <span className={`confidence-${segment.evidence.level}`}>
                    {confidenceLabel(segment.evidence.level)}
                  </span>
                  {changeType === undefined ? null : (
                    <RecipeChangeBadge changeType={changeType} />
                  )}
                  {sourceGuideHref === undefined ? null : (
                    <a className="route-source-guide" href={sourceGuideHref}>
                      Acquisition guide
                    </a>
                  )}
                </div>

                <dl className="route-step-metrics">
                  <div><dt>Expected crafts</dt><dd>{formatNumber(segment.expectedCrafts)}</dd></div>
                  <div><dt>Total materials</dt><dd>{formatNumber(segment.expectedMaterials)}</dd></div>
                  <div>
                    <dt>Market estimate</dt>
                    <dd>{segment.expectedCostCopper === undefined ? "Price unavailable" : formatCopper(segment.expectedCostCopper)}</dd>
                  </div>
                </dl>

                <div className="route-recommendation">
                  <strong>Why this recipe</strong>
                  <p>{segment.recommendation.summary}</p>
                </div>

                <div className="route-materials">
                  <strong>Primary materials</strong>
                  {materials.length === 0 ? (
                    <span>Material details unavailable</span>
                  ) : (
                    <ul>
                      {materials.map((material) => (
                        <li key={material.itemId}>
                          <span>{material.name}</span>
                          <strong>× {formatNumber(material.quantity)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <details className="route-confidence-details">
                  <summary>Data confidence</summary>
                  <dl>
                    <div><dt>Availability</dt><dd>{segment.evidence.availability}</dd></div>
                    <div><dt>Source</dt><dd>{segment.evidence.provenanceSource}</dd></div>
                    <div><dt>Verification</dt><dd>{segment.evidence.verificationStatus}</dd></div>
                  </dl>
                  {segment.evidence.reasons.length > 0 ? (
                    <ul>
                      {segment.evidence.reasons.map((reason) => (
                        <li key={reason}>{reasonLabel(reason)}</li>
                      ))}
                    </ul>
                  ) : null}
                </details>

                {segment.alternatives.length > 0 ? (
                  <details className="route-alternative-details">
                    <summary>
                      Compare {segment.alternatives.length} {segment.alternatives.length === 1 ? "alternative" : "alternatives"}
                    </summary>
                    <ul>
                      {segment.alternatives.map((alternative) => (
                        <li key={`${alternative.recipeId}:${alternative.startSkill}:${alternative.endSkill}`}>
                          <div>
                            <strong>{alternative.recipeName}</strong>
                            <span>{alternative.startSkill} → {alternative.endSkill}</span>
                          </div>
                          <p>{alternative.lossSummary}</p>
                          <dl>
                            <div><dt>Crafts</dt><dd>{formatNumber(alternative.expectedCrafts)}</dd></div>
                            <div><dt>Materials</dt><dd>{formatNumber(alternative.expectedMaterials)}</dd></div>
                            <div><dt>Cost</dt><dd>{alternative.expectedCostCopper === undefined ? "Unavailable" : formatCopper(alternative.expectedCostCopper)}</dd></div>
                          </dl>
                          <button onClick={() => onOpenRecipe(alternative.recipeId)} type="button">
                            Open alternative
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>

              <button
                className="route-open-recipe"
                onClick={() => onOpenRecipe(segment.recipeId)}
                type="button"
              >
                Open recipe
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
