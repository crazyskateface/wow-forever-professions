import { useState } from "react";
import type {
  Recipe,
  RouteOptimizationResult,
  ShoppingListResponse,
} from "@forever-professions/contracts";
import { getItemRarityNameClass } from "./item-tooltip.js";
import {
  remainingShoppingQuantity,
  type ShoppingProgressState,
} from "./shopping-progress.js";

interface ShoppingChecklistProps {
  readonly itemQualityById: ReadonlyMap<string, number>;
  readonly onOwnedQuantityChange: (itemId: string, quantity: number) => void;
  readonly onToggleItem: (itemKey: string, checked: boolean) => void;
  readonly progress: ShoppingProgressState;
  readonly recipes: readonly Recipe[];
  readonly response: ShoppingListResponse;
  readonly route: RouteOptimizationResult;
  readonly storageAvailable: boolean;
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

function formatObservedAt(value: string | undefined): string {
  if (value === undefined) return "Timestamp unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ownedQuantity(progress: ShoppingProgressState, itemId: string): number {
  return progress.ownedQuantities[itemId] ?? 0;
}

function summaryText(
  response: ShoppingListResponse,
  progress: ShoppingProgressState,
): string {
  const lines = [
    `Forever Professions shopping list — ${response.marketId}`,
    response.plan.status === "complete"
      ? `Expected total: ${formatCopper(response.plan.expectedCostCopper ?? 0)}`
      : `Known subtotal: ${formatCopper(response.plan.knownSubtotalCopper)} (partial)`,
    `Oldest price observation: ${formatObservedAt(response.oldestPriceObservedAt)}`,
    "",
    "Route materials",
    ...response.plan.routeReagents.map((item) => {
      const owned = ownedQuantity(progress, item.itemId);
      const remaining = remainingShoppingQuantity(item.quantity, owned);
      return `- ${item.itemName}: expected ${formatNumber(item.quantity)}, owned ${formatNumber(owned)}, remaining ${formatNumber(remaining)}`;
    }),
    "",
    "Planned purchases",
    ...(response.plan.purchases.length === 0
      ? ["- None"]
      : response.plan.purchases.map((item) =>
          `- ${item.itemName}: ${formatNumber(item.quantity)} at ${formatCopper(item.unitPriceCopper)} each (${formatCopper(item.expectedCostCopper)})`,
        )),
    "",
    "Craft intermediates",
    ...(response.plan.crafts.length === 0
      ? ["- None"]
      : response.plan.crafts.map((craft) =>
          `- ${craft.recipeName}: ${formatNumber(craft.expectedCrafts)} crafts`,
        )),
    ...(response.plan.unresolved.length === 0
      ? []
      : [
          "",
          "Needs attention",
          ...response.plan.unresolved.map((item) =>
            `- ${item.itemName}: ${formatNumber(item.quantity)} (${item.reason.replaceAll("-", " ")})`,
          ),
        ]),
    ...(response.plan.cycles.length === 0
      ? []
      : [
          "",
          "Blocked crafting cycles",
          ...response.plan.cycles.map((cycle) => `- ${cycle.join(" → ")}`),
        ]),
  ];
  return lines.join("\n");
}

export function ShoppingChecklist({
  itemQualityById,
  onOwnedQuantityChange,
  onToggleItem,
  progress,
  recipes,
  response,
  route,
  storageAvailable,
}: ShoppingChecklistProps) {
  const [copyStatus, setCopyStatus] = useState<string>();
  const checked = new Set(progress.checkedItemIds);
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe] as const));
  const totalLabel = response.plan.status === "complete"
    ? "Expected total"
    : "Known subtotal";
  const total = response.plan.expectedCostCopper ?? response.plan.knownSubtotalCopper;

  async function copySummary(): Promise<void> {
    try {
      await navigator.clipboard.writeText(summaryText(response, progress));
      setCopyStatus("Shopping summary copied.");
    } catch {
      setCopyStatus("Copy is unavailable in this browser.");
    }
  }

  return (
    <section className="shopping-checklist" aria-labelledby="shopping-title">
      <div className="shopping-heading">
        <div>
          <span className="section-kicker">Route supplies</span>
          <h2 id="shopping-title">Shopping checklist</h2>
          <p>
            Owned quantities calculate what remains without changing the route's
            expected quantities or canonical plan total.
          </p>
        </div>
        <div className={`shopping-total${response.plan.status === "partial" ? " partial" : ""}`}>
          <span>{totalLabel}</span>
          <strong>{formatCopper(total)}</strong>
          <small>{response.plan.status === "partial" ? "Missing prices excluded" : "All planned purchases priced"}</small>
        </div>
      </div>

      <div className="shopping-context">
        <div><span>Market</span><strong>{response.marketId}</strong></div>
        <div><span>Oldest price used</span><strong>{formatObservedAt(response.oldestPriceObservedAt)}</strong></div>
        <div>
          <span>Price source</span>
          {response.attribution === undefined ? (
            <strong>Attribution unavailable</strong>
          ) : (
            <a href={response.attribution.url} rel="noreferrer" target="_blank">
              {response.attribution.text}
            </a>
          )}
        </div>
      </div>

      <div className="shopping-tools">
        <button onClick={copySummary} type="button">Copy summary</button>
        <button onClick={() => window.print()} type="button">Print checklist</button>
        {copyStatus === undefined ? null : <span role="status">{copyStatus}</span>}
      </div>
      {!storageAvailable ? (
        <p className="shopping-warning">Browser storage is unavailable, so owned quantities and checks will last only for this tab.</p>
      ) : null}

      <section className="shopping-section" aria-labelledby="route-materials-title">
        <div className="shopping-section-heading">
          <div><span className="section-kicker">Aggregate demand</span><h3 id="route-materials-title">Route materials</h3></div>
          <span>{response.plan.routeReagents.length} material types</span>
        </div>
        <ul className="shopping-material-list">
          {response.plan.routeReagents.map((item) => {
            const key = `route:${item.itemId}`;
            const owned = ownedQuantity(progress, item.itemId);
            const remaining = remainingShoppingQuantity(item.quantity, owned);
            return (
              <li className={checked.has(key) ? "checked" : ""} key={item.itemId}>
                <label className="shopping-check">
                  <input checked={checked.has(key)} onChange={(event) => onToggleItem(key, event.target.checked)} type="checkbox" />
                  <span className={getItemRarityNameClass(itemQualityById.get(item.itemId))}>{item.itemName}</span>
                </label>
                <dl>
                  <div><dt>Expected</dt><dd>{formatNumber(item.quantity)}</dd></div>
                  <div><dt>Owned</dt><dd><input aria-label={`Owned ${item.itemName}`} inputMode="decimal" min="0" onChange={(event) => onOwnedQuantityChange(item.itemId, Number(event.target.value))} step="0.01" type="number" value={owned} /></dd></div>
                  <div><dt>Remaining</dt><dd>{formatNumber(remaining)}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <details className="shopping-step-breakdown">
        <summary>Materials by route step</summary>
        <ol>
          {route.segments.map((segment) => {
            const recipe = recipeById.get(segment.recipeId);
            return (
              <li key={`${segment.startSkill}:${segment.recipeId}`}>
                <div><span>{segment.startSkill} → {segment.endSkill}</span><strong>{segment.recipeName}</strong></div>
                {recipe === undefined ? (
                  <small>Material details unavailable.</small>
                ) : (
                  <ul>
                    {recipe.reagents.map((reagent) => (
                      <li key={reagent.itemId}>
                        <span>{reagent.name}</span>
                        <strong>× {formatNumber(reagent.quantity * segment.expectedCrafts)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <div className="shopping-paths">
        <section className="shopping-section" aria-labelledby="shopping-buy-title">
          <div className="shopping-section-heading">
            <div><span className="section-kicker">Market path</span><h3 id="shopping-buy-title">Buy</h3></div>
            <span>{response.plan.purchases.length} priced items</span>
          </div>
          {response.plan.purchases.length === 0 ? (
            <p className="empty-list">No market purchases selected.</p>
          ) : (
            <ul className="shopping-purchase-list">
              {response.plan.purchases.map((purchase) => {
                const key = `buy:${purchase.itemId}`;
                const owned = ownedQuantity(progress, purchase.itemId);
                const remaining = remainingShoppingQuantity(purchase.quantity, owned);
                return (
                  <li className={checked.has(key) ? "checked" : ""} key={purchase.itemId}>
                    <label className="shopping-check">
                      <input checked={checked.has(key)} onChange={(event) => onToggleItem(key, event.target.checked)} type="checkbox" />
                      <span className={getItemRarityNameClass(itemQualityById.get(purchase.itemId))}>{purchase.itemName}</span>
                    </label>
                    <dl>
                      <div><dt>Planned purchase</dt><dd>{formatNumber(purchase.quantity)}</dd></div>
                      <div><dt>Remaining after owned</dt><dd>{formatNumber(remaining)}</dd></div>
                      <div><dt>Unit price</dt><dd>{formatCopper(purchase.unitPriceCopper)}</dd></div>
                      <div><dt>Plan cost</dt><dd>{formatCopper(purchase.expectedCostCopper)}</dd></div>
                    </dl>
                    <small>Observed {formatObservedAt(purchase.priceObservedAt)}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="shopping-section" aria-labelledby="shopping-craft-title">
          <div className="shopping-section-heading">
            <div><span className="section-kicker">Craft path</span><h3 id="shopping-craft-title">Craft intermediates</h3></div>
            <span>{response.plan.crafts.length} craft choices</span>
          </div>
          {response.plan.crafts.length === 0 ? (
            <p className="empty-list">No intermediate crafts selected.</p>
          ) : (
            <ul className="shopping-craft-list">
              {response.plan.crafts.map((craft) => {
                const key = `craft:${craft.recipeId}:${craft.outputItemId}`;
                return (
                  <li className={checked.has(key) ? "checked" : ""} key={key}>
                    <label className="shopping-check">
                      <input checked={checked.has(key)} onChange={(event) => onToggleItem(key, event.target.checked)} type="checkbox" />
                      <span>{craft.recipeName}</span>
                    </label>
                    <strong>{formatNumber(craft.expectedCrafts)} expected crafts</strong>
                    <small>{formatNumber(craft.expectedOutputQuantity)} {craft.outputItemName}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {response.plan.unresolved.length > 0 ? (
        <section className="shopping-warning" aria-labelledby="shopping-unresolved-title">
          <strong id="shopping-unresolved-title">Needs attention</strong>
          <ul>
            {response.plan.unresolved.map((item) => (
              <li key={`${item.itemId}-${item.reason}`}>
                <span className={getItemRarityNameClass(itemQualityById.get(item.itemId))}>{item.itemName}</span>: {formatNumber(item.quantity)} ({item.reason.replaceAll("-", " ")})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {response.plan.cycles.length > 0 ? (
        <p className="shopping-warning">
          Recursive crafting cycle blocked: {response.plan.cycles.map((cycle) => cycle.join(" → ")).join("; ")}
        </p>
      ) : null}
    </section>
  );
}
