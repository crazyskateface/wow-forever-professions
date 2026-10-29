import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  auctionMarketsResponseSchema,
  auctionPricesResponseSchema,
  recipeChangesResponseSchema,
  recipeChangesSummaryResponseSchema,
  routeOptimizationResponseSchema,
  type AuctionMarket,
  type AuctionPriceObservation,
  type ProfessionFixture,
  type Recipe,
  type RecipeChange,
  type RecipeChangeCounts,
  type RecipeChangeType,
  type RouteOptimizationResponse,
  type RoutePreset,
} from "@forever-professions/contracts";
import {
  FOREVER_BUILD_CONFIG,
  assessDataQuality,
  getExpectedCraftsForSkillUp,
  getExpectedReagentQuantity,
  getRecipeDifficulty,
  getRecipeSkillCapStatus,
  getSkillUpProbability,
} from "@forever-professions/domain";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import { ForeverChanges, RecipeChangeBadge } from "./ForeverChanges.js";
import { ItemIcon } from "./ItemIcon.js";
import { ItemTooltip, ItemTooltipButton } from "./ItemTooltip.js";
import { BestCrafts, type CraftSelection } from "./BestCrafts.js";
import { bestCraftDefaults } from "./best-crafts-professions.js";
import { createInitialRecipeSelection } from "./initial-recipe-selection.js";
import { SiteFooter } from "./SiteFooter.js";
import { ChevronDownIcon, SearchIcon } from "./UiIcons.js";
import {
  getItemRarityNameClass,
  hasProvisionalOutputQuantity,
  type ItemTooltipData,
} from "./item-tooltip.js";
import {
  DEFAULT_PERSONALIZATION,
  clearPersonalization,
  readPersonalization,
  writePersonalization,
  type ForeverChangeFilters,
  type PlayerFaction,
} from "./personalization.js";
import { createRequestGuard } from "./request-guard.js";
import {
  recipeListViewFromUrlValue,
  shouldLoadRecipeChanges,
  shouldLoadRecipePrices,
  urlWithRecipeListView,
  type CatalogState,
  type RecipeListView,
} from "./request-policy.js";
import { buildSkillChartData } from "./skill-chart.js";
import { GUIDE_START_SKILL, getFullGuideRange } from "./guide-range.js";
import {
  createRouteProgressFingerprint,
  readRouteProgress,
  routeSegmentKey,
  writeRouteProgress,
  type RouteProgressState,
} from "./route-progress.js";
import {
  DEFAULT_CATALOG_FILTERS,
  countActiveCatalogFilters,
  filterAndSortRecipes,
  getCatalogItemTypes,
  getRecipeExpectedCost,
  getRecipeItemType,
  getVirtualRange,
  recipeIdFromUrlValue,
  urlWithRecipeId,
  type CatalogFilters,
  type CatalogSort,
} from "./catalog-discovery.js";
import { recipeKnowledgeHref } from "./leatherworking-knowledge.js";
import { ProfessionMasthead, ProfessionSwitcher } from "./ProfessionNavigation.js";
import { ProfessionIcon } from "./ProfessionIcon.js";
import { readProfessionSkill, writeProfessionSkill } from "./profession-navigation.js";
import { recordProductEvent } from "./product-analytics.js";

type WorkspaceView = "calculator" | "crafts";

const MIN_PROFESSION_SKILL = 0;
const MIN_CURRENT_SKILL = GUIDE_START_SKILL;
const RECIPE_ROW_HEIGHT = 116;
const VIRTUAL_OVERSCAN = 5;

interface VirtualListProps<Item> {
  readonly ariaLabel: string;
  readonly className: string;
  readonly empty: ReactNode;
  readonly getKey: (item: Item) => string;
  readonly items: readonly Item[];
  readonly renderItem: (item: Item, index: number) => ReactNode;
  readonly resetKey: string;
  readonly rowHeight: number;
  readonly selectedIndex?: number;
}

function VirtualList<Item>({
  ariaLabel,
  className,
  empty,
  getKey,
  items,
  renderItem,
  resetKey,
  rowHeight,
  selectedIndex,
}: VirtualListProps<Item>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateHeight = () => setViewportHeight(viewport.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || selectedIndex === undefined || selectedIndex < 0) return;
    const itemTop = selectedIndex * rowHeight;
    const itemBottom = itemTop + rowHeight;
    if (itemTop < viewport.scrollTop) viewport.scrollTop = itemTop;
    else if (itemBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = itemBottom - viewport.clientHeight;
    }
  }, [items.length, rowHeight, selectedIndex]);

  const { firstIndex, lastIndex } = getVirtualRange(
    items.length,
    rowHeight,
    scrollTop,
    viewportHeight,
    VIRTUAL_OVERSCAN,
  );
  const visibleItems = items.slice(firstIndex, lastIndex);

  return (
    <div
      aria-label={ariaLabel}
      className={className}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={viewportRef}
      role="list"
    >
      {items.length === 0 ? empty : (
        <div className="virtual-list-space" style={{ height: items.length * rowHeight }}>
          {visibleItems.map((item, visibleIndex) => {
            const index = firstIndex + visibleIndex;
            return (
              <div
                aria-posinset={index + 1}
                aria-setsize={items.length}
                className="virtual-list-row"
                key={getKey(item)}
                role="listitem"
                style={{ height: rowHeight, top: index * rowHeight }}
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function recipeIdFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return recipeIdFromUrlValue(window.location.href);
}

function writeRecipeUrl(recipeId: string, mode: "push" | "replace"): void {
  if (typeof window === "undefined") return;
  const url = urlWithRecipeId(window.location.href, recipeId);
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

function writeRecipeListViewUrl(
  view: RecipeListView,
  mode: "push" | "replace",
): void {
  if (typeof window === "undefined") return;
  const url = urlWithRecipeListView(window.location.href, view);
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

function scrollToWorkspaceOnMobile(): void {
  if (typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches) {
    return;
  }
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  window.requestAnimationFrame(() =>
    document.querySelector(".main-workspace")?.scrollIntoView({ behavior, block: "start" }),
  );
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function formatCopper(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const gold = Math.floor(rounded / 10_000);
  const silver = Math.floor((rounded % 10_000) / 100);
  const copper = rounded % 100;
  return `${gold}g ${silver}s ${copper}c`;
}

function optionalSkillFilter(value: string, maximum: number): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(maximum, Math.max(MIN_PROFESSION_SKILL, Math.round(parsed)));
}

function unitPrice(observation: AuctionPriceObservation | undefined): number | undefined {
  if (observation?.status !== "available") return undefined;
  return observation.minimumBuyoutUnitPriceCopper ?? observation.medianUnitPriceCopper;
}

function acquisitionLabel(recipe: Recipe): string {
  if (recipe.acquisition === "unknown") return "Source unknown";
  if (recipe.acquisition === "automatic") return "Learned automatically";
  return recipe.acquisition[0]!.toUpperCase() + recipe.acquisition.slice(1);
}

function sourceKindLabel(sourceKind: string): string {
  return sourceKind === "container"
    ? "Container"
    : sourceKind[0]!.toUpperCase() + sourceKind.slice(1);
}

function sourceDataOriginLabel(sourceDataOrigin: string | undefined): string {
  if (sourceDataOrigin === undefined) return "Not included";
  if (sourceDataOrigin === "classic-borrowed") return "Classic fallback";
  return sourceDataOrigin[0]!.toUpperCase() + sourceDataOrigin.slice(1);
}

type TooltipRecipeItem = Recipe["outputs"][number] | Recipe["reagents"][number];

function recipeOutputQualityId(recipe: Recipe | undefined): number | undefined {
  return recipe?.outputs[0]?.clientData?.qualityId;
}

function tooltipItemData(item: TooltipRecipeItem): Omit<ItemTooltipData, "details"> {
  const clientData = item.clientData;
  return {
    name: clientData?.displayName ?? item.name,
    ...(item.gameItemId === undefined ? {} : { gameItemId: item.gameItemId }),
    ...(clientData?.qualityId === undefined ? {} : { qualityId: clientData.qualityId }),
    ...(item.itemClassId === undefined ? {} : { itemClassId: item.itemClassId }),
    ...(item.itemSubClassId === undefined ? {} : { itemSubClassId: item.itemSubClassId }),
    ...(item.inventoryType === undefined ? {} : { inventoryType: item.inventoryType }),
    ...(clientData?.equipmentSlot === undefined
      ? {}
      : { equipmentSlot: clientData.equipmentSlot }),
    ...(clientData?.armor === undefined ? {} : { armor: clientData.armor }),
    ...(clientData?.stats === undefined ? {} : { stats: clientData.stats }),
    ...(clientData?.requiredLevel === undefined
      ? {}
      : { requiredLevel: clientData.requiredLevel }),
    ...(clientData?.sellPriceCopper === undefined
      ? {}
      : { sellPriceCopper: clientData.sellPriceCopper }),
    ...(item.classification === undefined ? {} : { classification: item.classification }),
  };
}

function outputQuantityIsProvisional(recipe: Recipe): boolean {
  return hasProvisionalOutputQuantity([
    recipe.provenance.verification.notes,
    recipe.provenance.notes,
  ]);
}

function outputTooltipItem(recipe: Recipe, professionName: string, output = recipe.outputs[0]): ItemTooltipData {
  if (output === undefined) return { name: recipe.name, details: [{ text: "No crafted item output recorded", tone: "muted" }] };
  const provisionalQuantity = outputQuantityIsProvisional(recipe);
  return {
    ...tooltipItemData(output),
    details: [
      { text: `Crafted by ${professionName}` },
      provisionalQuantity
        ? { text: `Creates ${output.quantity} per craft (provisional)`, tone: "warning" }
        : { text: `Creates ${output.quantity} per craft` },
      recipe.learnSkill === null
        ? { text: "Recipe learning skill unknown", tone: "warning" }
        : { text: `Recipe learned at skill ${recipe.learnSkill}`, tone: "muted" },
    ],
  };
}

function reagentTooltipItem(
  reagent: Recipe["reagents"][number],
  price: number | undefined,
): ItemTooltipData {
  return {
    ...tooltipItemData(reagent),
    details: [
      { text: `Required per craft: ${reagent.quantity}` },
      price === undefined
        ? { text: "Market price unavailable", tone: "muted" }
        : { text: `Market unit price: ${formatCopper(price)}`, tone: "accent" },
    ],
  };
}

interface RouteRequestOptions {
  readonly faction: PlayerFaction;
  readonly marketId: string;
  readonly professionId: string;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly preset: RoutePreset;
  readonly knownRecipeIds: readonly string[];
  readonly signal?: AbortSignal;
}

async function requestOptimizedRoute({
  faction,
  marketId,
  professionId,
  startSkill,
  targetSkill,
  preset,
  knownRecipeIds,
  signal,
}: RouteRequestOptions): Promise<RouteOptimizationResponse> {
  const response = await fetch("/api/routes/optimize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      professionId,
      marketId,
      startSkill,
      targetSkill,
      preset,
      constraints: { faction, knownRecipeIds },
    }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return routeOptimizationResponseSchema.parse(await response.json());
}

function DataQualityNotice({ build, recipe }: { build: string; recipe: Recipe }) {
  const assessment = assessDataQuality(
    recipe.provenance.source,
    recipe.provenance.verification.status,
  );
  const acquisitionGuideHref = recipe.professionId === "leatherworking" ? recipeKnowledgeHref(recipe.acquisition, recipe.id) : undefined;

  return (
    <section
      className={`data-quality quality-${assessment.level}`}
      aria-labelledby="data-quality-title"
    >
      <div className="data-quality-summary">
        <span className="quality-icon" aria-hidden="true">!</span>
        <h2 id="data-quality-title">Recipe data</h2>
      </div>
      <dl>
        <div><dt>Source</dt><dd>{recipe.provenance.sourceLabel}</dd></div>
        <div><dt>Verification</dt><dd>{recipe.provenance.verification.status}</dd></div>
        <div><dt>Build</dt><dd>{build}</dd></div>
        <div><dt>Spell</dt><dd>{recipe.spellId === null ? "Unknown" : `#${recipe.spellId}`}</dd></div>
        <div><dt>Learn at</dt><dd>{recipe.learnSkill ?? "Unknown"}</dd></div>
        <div><dt>Acquisition</dt><dd>{recipe.acquisition}</dd></div>
        <div>
          <dt>Teaching item</dt>
          <dd>
            {recipe.teachingItemId === undefined
              ? "Not included"
              : recipe.teachingItemId === null
                ? "None recorded"
                : `Item #${recipe.teachingItemId}`}
          </dd>
        </div>
        <div>
          <dt>Source types</dt>
          <dd>
            {recipe.sourceKinds === undefined
              ? "Not included"
              : recipe.sourceKinds.length === 0
                ? "None recorded"
                : recipe.sourceKinds.map(sourceKindLabel).join(", ")}
          </dd>
        </div>
        <div><dt>Source evidence</dt><dd>{sourceDataOriginLabel(recipe.sourceDataOrigin)}</dd></div>
        <div><dt>Source location</dt><dd>Unknown — no supported location record</dd></div>
        <div><dt>Availability</dt><dd>{recipe.availability}</dd></div>
        <div><dt>Faction</dt><dd>{recipe.faction}</dd></div>
        <div><dt>Specialization</dt><dd>{recipe.specializationSpellId === null ? "None recorded" : `Spell #${recipe.specializationSpellId}`}</dd></div>
      </dl>
      <div className="data-quality-copy">
        <p>{assessment.explanation}</p>
        {recipe.provenance.verification.notes ? (
          <p>{recipe.provenance.verification.notes}</p>
        ) : null}
        {recipe.provenance.notes ? <p>{recipe.provenance.notes}</p> : null}
        <div className="data-quality-links">
          {acquisitionGuideHref === undefined ? null : (
            <a href={acquisitionGuideHref}>Open acquisition guide</a>
          )}
          {recipe.professionId !== "leatherworking" || recipe.specializationSpellId === null ? null : (
            <a href={`/leatherworking/specializations#${recipe.id}`}>Review specialization gate</a>
          )}
          {recipe.professionId === "leatherworking" ? <a href="/leatherworking">Leatherworking evidence overview</a> : null}
        </div>
      </div>
    </section>
  );
}

function SkillChart({
  maxBaseSkill,
  recipe,
  skill,
}: {
  maxBaseSkill: number;
  recipe: Recipe;
  skill: number;
}) {
  const chart = useMemo(
    () => buildSkillChartData(recipe.thresholds, maxBaseSkill),
    [maxBaseSkill, recipe.thresholds],
  );
  const range = Math.max(1, chart.endSkill - chart.startSkill);
  const xForSkill = (value: number) =>
    28 + ((value - chart.startSkill) / range) * 384;
  const points = chart.points
    .map(({ probability, skill: pointSkill }) =>
      `${xForSkill(pointSkill)},${172 - probability * 136}`,
    )
    .join(" ");
  const chartSkill = Math.min(
    chart.endSkill,
    Math.max(chart.startSkill, skill),
  );
  const markerX = xForSkill(chartSkill);
  const markerY = 172 - getSkillUpProbability(skill, recipe.thresholds) * 136;
  const capStatus = getRecipeSkillCapStatus(
    recipe.thresholds,
    recipe.learnSkill,
    maxBaseSkill,
  );

  return (
    <div className="chart-wrap">
      <div className="chart-heading">
        <strong>Success rate by skill</strong>
        <span className="chart-live">Current: {skill}</span>
      </div>
      <svg
        aria-label={`Skill-up chance curve for ${recipe.name}, ending at skill ${chart.endSkill}`}
        className="skill-chart"
        role="img"
        viewBox="0 0 440 205"
      >
        <defs>
          <linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c8f000" stopOpacity=".26" />
            <stop offset="100%" stopColor="#c8f000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[36, 70, 104, 138, 172].map((y, index) => (
          <g key={y}>
            <line className="chart-grid" x1="28" x2="412" y1={y} y2={y} />
            <text className="chart-label" x="0" y={y + 4}>
              {100 - index * 25}%
            </text>
          </g>
        ))}
        <polygon fill="url(#chartArea)" points={`28,172 ${points} 412,172`} />
        <polyline className="chart-line" points={points} />
        <line className="chart-marker-line" x1={markerX} x2={markerX} y1="28" y2="172" />
        <circle className="chart-marker" cx={markerX} cy={markerY} r="6" />
        {chart.ticks.map(({ kind, label, skill: tickSkill }) => {
          const x = xForSkill(tickSkill);
          return (
            <text className={`chart-threshold ${kind}`} key={`${kind}-${tickSkill}`} x={x} y="197">
              {label}
            </text>
          );
        })}
      </svg>
      {capStatus.hasThresholdAboveCap ? (
        <div className="skill-cap-note" role="note">
          <span aria-hidden="true">i</span>
          <div>
            <p>
              Client data contains skill thresholds above the current Forever
              profession cap of {maxBaseSkill}.
            </p>
            <details>
              <summary>View imported thresholds</summary>
              <dl>
                <div><dt>Orange</dt><dd>{recipe.thresholds.orange}</dd></div>
                <div><dt>Yellow</dt><dd>{recipe.thresholds.yellow}</dd></div>
                <div><dt>Green</dt><dd>{recipe.thresholds.green}</dd></div>
                <div><dt>Gray</dt><dd>{recipe.thresholds.gray}</dd></div>
              </dl>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function App({ initialProfession = leatherworkingFixture, initialCatalogState = "loading" }: { readonly initialProfession?: ProfessionFixture; readonly initialCatalogState?: CatalogState }) {
  const maxBaseSkill = FOREVER_BUILD_CONFIG.maxBaseSkill;
  const fullGuideRange = getFullGuideRange(maxBaseSkill);
  const [initialPreferences] = useState(() => {
    const profile = readPersonalization();
    return { ...profile, currentSkill: readProfessionSkill(initialProfession.id, profile.currentSkill) };
  });
  const profession = initialProfession;
  const craftDefaults = bestCraftDefaults(profession.id);
  const catalogState = initialCatalogState;
  const [initialRecipeSelection] = useState(() => createInitialRecipeSelection(
    profession.recipes,
    recipeIdFromUrl(),
    typeof window === "undefined" ? "guide" : recipeListViewFromUrlValue(window.location.href),
  ));
  const [recipeId, setRecipeId] = useState(initialRecipeSelection.recipeId);
  const recipe =
    profession.recipes.find(({ id }) => id === recipeId) ?? profession.recipes[0]!;
  const maxCatalogLearningSkill = useMemo(
    () => Math.max(
      maxBaseSkill,
      ...profession.recipes.flatMap(({ learnSkill }) =>
        learnSkill === null ? [] : [learnSkill],
      ),
    ),
    [maxBaseSkill, profession.recipes],
  );
  const [skill, setSkill] = useState(initialPreferences.currentSkill);
  const [prices, setPrices] = useState<readonly AuctionPriceObservation[]>([]);
  const [priceError, setPriceError] = useState<string>();
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("calculator");
  const [craftSelection, setCraftSelection] = useState<CraftSelection>(() => craftDefaults ?? { classId: "rogue", roleId: "melee", level: 20 });
  const [recipeListView, setRecipeListView] = useState<RecipeListView>(() =>
    typeof window === "undefined"
      ? "guide"
      : recipeListViewFromUrlValue(window.location.href),
  );
  const [search, setSearch] = useState("");
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilters>(
    DEFAULT_CATALOG_FILTERS,
  );
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("name");
  const [catalogPrices, setCatalogPrices] = useState<readonly AuctionPriceObservation[]>([]);
  const [catalogPricesLoading, setCatalogPricesLoading] = useState(false);
  const [catalogPriceError, setCatalogPriceError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const guideListRef = useRef<HTMLElement>(null);
  const [recipeChanges, setRecipeChanges] = useState<readonly RecipeChange[]>([]);
  const [changeSummary, setChangeSummary] = useState<RecipeChangeCounts>();
  const [changesLoading, setChangesLoading] = useState(true);
  const [changesError, setChangesError] = useState<string>();
  const [changesReload, setChangesReload] = useState(0);
  const changesLoadedRef = useRef(false);
  const [changeFilters, setChangeFilters] = useState<ForeverChangeFilters>(
    initialPreferences.changeFilters,
  );
  const [routeResponse, setRouteResponse] = useState<RouteOptimizationResponse>();
  const [routeProgress, setRouteProgress] = useState<RouteProgressState>();
  const [routeProgressStorageAvailable, setRouteProgressStorageAvailable] =
    useState(true);
  const [routeError, setRouteError] = useState<string>();
  const [routeLoading, setRouteLoading] = useState(false);
  const [markets, setMarkets] = useState<readonly AuctionMarket[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketsError, setMarketsError] = useState<string>();
  const [region, setRegion] = useState(initialPreferences.region);
  const [marketId, setMarketId] = useState(initialPreferences.marketId);
  const [faction, setFaction] = useState<PlayerFaction>(initialPreferences.faction);
  const [legacyProfessionSkillBonus, setLegacyProfessionSkillBonus] = useState(
    initialPreferences.legacyProfessionSkillBonus,
  );
  const [preferencesStorageAvailable, setPreferencesStorageAvailable] = useState(true);
  const routeAbortControllerRef = useRef<AbortController | null>(null);
  const routeRequestGuardRef = useRef(createRequestGuard());
  const firstStepEngagementRecordedRef = useRef(false);
  const missingDataEventsRecordedRef = useRef(new Set<string>());

  useEffect(() => {
    if (initialRecipeSelection.pendingGuide) return;
    const explicitlySelected = recipeIdFromUrl() === recipeId;
    writeRecipeUrl(recipeId, "replace");
    if (explicitlySelected) scrollToWorkspaceOnMobile();
  }, []);

  useEffect(() => {
    writeProfessionSkill(profession.id, skill);
    setPreferencesStorageAvailable(writePersonalization({
      version: 3,
      currentSkill: profession.id === "leatherworking" ? skill : readPersonalization().currentSkill,
      region,
      marketId,
      faction,
      legacyProfessionSkillBonus,
      changeFilters,
    }));
  }, [
    changeFilters,
    faction,
    legacyProfessionSkillBonus,
    marketId,
    region,
    skill,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    setMarketsLoading(true);
    setMarketsError(undefined);
    fetch("/api/auction/markets", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return auctionMarketsResponseSchema.parse(await response.json()).markets;
      })
      .then((loadedMarkets) => {
        setMarkets(loadedMarkets);
        if (loadedMarkets.length === 0) return;
        const selected = loadedMarkets.find(({ id }) => id === marketId) ??
          loadedMarkets.find((market) =>
            market.region.toLowerCase() === region.toLowerCase() &&
            market.faction.toLowerCase() === faction
          ) ?? loadedMarkets[0]!;
        setMarketId(selected.id);
        setRegion(selected.region.toLowerCase());
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarkets([]);
        setMarketsError("Market choices are unavailable. Your saved market is still selected.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketsLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (catalogState === "loading" || marketsLoading) return;
    const controller = new AbortController();
    const requestId = routeRequestGuardRef.current.begin();
    routeAbortControllerRef.current?.abort();
    routeAbortControllerRef.current = controller;
    setRouteLoading(true);
    setRouteError(undefined);
    const request = {
      faction,
      marketId,
      professionId: profession.id,
      startSkill: fullGuideRange.startSkill,
      targetSkill: fullGuideRange.targetSkill,
      preset: "practical",
      knownRecipeIds: profession.recipes.map(({ id }) => id),
      signal: controller.signal,
    } satisfies RouteRequestOptions;
    requestOptimizedRoute(request)
      .then((response) => {
        if (
          !controller.signal.aborted &&
          routeRequestGuardRef.current.isCurrent(requestId)
        ) {
          activateRouteResponse(response, request);
        }
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          !routeRequestGuardRef.current.isCurrent(requestId)
        ) return;
        setRouteResponse(undefined);
        setRouteError(
          "The leveling guide could not be generated. Refresh the page to try again.",
        );
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          routeRequestGuardRef.current.isCurrent(requestId)
        ) {
          routeAbortControllerRef.current = null;
          setRouteLoading(false);
        }
      });
    return () => {
      controller.abort();
      if (routeAbortControllerRef.current === controller) {
        routeAbortControllerRef.current = null;
      }
    };
  }, [catalogState, faction, marketId, marketsLoading, profession]);

  useEffect(() => () => {
    routeRequestGuardRef.current.invalidate();
    routeAbortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!shouldLoadRecipeChanges(recipeListView, changesLoadedRef.current)) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ comparison: "classic-forever", profession: profession.id });
    const unchangedQuery = new URLSearchParams({
      comparison: "classic-forever",
      changeType: "unchanged",
      profession: profession.id,
    });
    setChangesLoading(true);
    setChangesError(undefined);

    Promise.all([
      fetch(`/api/recipe-changes?${query}`, { signal: controller.signal }),
      fetch(`/api/recipe-changes?${unchangedQuery}`, { signal: controller.signal }),
      fetch(`/api/recipe-changes/summary?${query}`, { signal: controller.signal }),
    ])
      .then(async ([changedResponse, unchangedResponse, summaryResponse]) => {
        if (!changedResponse.ok || !unchangedResponse.ok || !summaryResponse.ok) {
          const status = [changedResponse, unchangedResponse, summaryResponse]
            .find((response) => !response.ok)?.status;
          throw new Error(`HTTP ${status ?? "error"}`);
        }
        const [changed, unchanged, summary] = await Promise.all([
          changedResponse.json().then((value) => recipeChangesResponseSchema.parse(value)),
          unchangedResponse.json().then((value) => recipeChangesResponseSchema.parse(value)),
          summaryResponse.json().then((value) =>
            recipeChangesSummaryResponseSchema.parse(value),
          ),
        ]);
        const changesByIdentity = new Map<string, RecipeChange>();
        for (const change of [...changed.changes, ...unchanged.changes]) {
          changesByIdentity.set(
            `${change.identity.professionId}:${change.identity.spellId}`,
            change,
          );
        }
        setRecipeChanges([...changesByIdentity.values()]);
        setChangeSummary(summary.summary);
        changesLoadedRef.current = true;
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRecipeChanges([]);
        setChangeSummary(undefined);
        setChangesError(
          "Import a baseline and target build comparison to populate this view. The rest of the profession tools remain available.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setChangesLoading(false);
      });

    return () => controller.abort();
  }, [changesReload, recipeListView, profession.id]);

  useEffect(() => {
    function selectRecipeFromHistory(): void {
      initialRecipeSelection.cancelGuide();
      setRecipeListView(recipeListViewFromUrlValue(window.location.href));
      const requestedRecipeId = recipeIdFromUrl();
      const requestedRecipe = profession.recipes.find(
        ({ id }) => id === requestedRecipeId,
      );
      if (!requestedRecipe) return;
      setRecipeId(requestedRecipe.id);
      setWorkspaceView("calculator");
      scrollToWorkspaceOnMobile();
    }
    window.addEventListener("popstate", selectRecipeFromHistory);
    return () => window.removeEventListener("popstate", selectRecipeFromHistory);
  }, [profession]);

  useEffect(() => {
    document.title = recipeListView === "changes"
      ? "Forever Changes · Forever Professions"
      : workspaceView === "crafts"
        ? `${profession.name} best crafts · Forever Professions`
      : `${recipe.name} · Forever Professions`;
  }, [profession.name, recipe.name, recipeListView, workspaceView]);

  useEffect(() => {
    if (catalogState === "loading") return;
    const kinds = [
      ...(recipe.acquisition === "unknown" ? ["acquisition" as const] : []),
      ...(recipe.availability === "unknown" ? ["availability" as const] : []),
      ...(recipe.provenance.verification.status !== "verified"
        ? ["verification" as const]
        : []),
    ];
    for (const kind of kinds) {
      const key = `${recipe.id}:${kind}`;
      if (missingDataEventsRecordedRef.current.has(key)) continue;
      missingDataEventsRecordedRef.current.add(key);
      void recordProductEvent({
        name: "missing-data-encountered",
        buildId: profession.build,
        kind,
      });
    }
  }, [catalogState, profession.build, recipe]);

  useEffect(() => {
    if (priceError === undefined) return;
    const key = `${recipe.id}:price`;
    if (missingDataEventsRecordedRef.current.has(key)) return;
    missingDataEventsRecordedRef.current.add(key);
    void recordProductEvent({
      name: "missing-data-encountered",
      buildId: profession.build,
      kind: "price",
    });
  }, [priceError, profession.build, recipe.id]);

  useEffect(() => {
    if (changesError === undefined) return;
    const key = `${profession.build}:comparison`;
    if (missingDataEventsRecordedRef.current.has(key)) return;
    missingDataEventsRecordedRef.current.add(key);
    void recordProductEvent({
      name: "missing-data-encountered",
      buildId: profession.build,
      kind: "comparison",
    });
  }, [changesError, profession.build]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent): void {
      if (event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!shouldLoadRecipePrices(catalogState, marketsLoading)) return;
    const gameItemIds = recipe.reagents.flatMap(({ gameItemId }) =>
      gameItemId === undefined ? [] : [gameItemId],
    );
    const controller = new AbortController();
    setPrices([]);
    setPriceError(undefined);
    const query = new URLSearchParams({
      marketId,
      itemIds: gameItemIds.join(","),
    });
    fetch(`/api/auction/prices?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return auctionPricesResponseSchema.parse(await response.json()).observations;
      })
      .then(setPrices)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPrices([]);
        setPriceError("Live auction prices are unavailable. Quantities are still accurate.");
      });
    return () => controller.abort();
  }, [catalogState, marketId, marketsLoading, recipe]);

  useEffect(() => {
    if (
      recipeListView !== "recipes" ||
      !shouldLoadRecipePrices(catalogState, marketsLoading)
    ) return;

    const gameItemIds = [...new Set(
      profession.recipes.flatMap(({ reagents }) =>
        reagents.flatMap(({ gameItemId }) =>
          gameItemId === undefined ? [] : [gameItemId],
        ),
      ),
    )];
    if (gameItemIds.length === 0) {
      setCatalogPrices([]);
      setCatalogPricesLoading(false);
      setCatalogPriceError(undefined);
      return;
    }

    const controller = new AbortController();
    const batches = Array.from(
      { length: Math.ceil(gameItemIds.length / 100) },
      (_, index) => gameItemIds.slice(index * 100, index * 100 + 100),
    );
    setCatalogPricesLoading(true);
    setCatalogPriceError(undefined);

    Promise.all(batches.map(async (batch) => {
      const query = new URLSearchParams({
        marketId,
        itemIds: batch.join(","),
      });
      const response = await fetch(`/api/auction/prices?${query}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return auctionPricesResponseSchema.parse(await response.json()).observations;
    }))
      .then((observations) => setCatalogPrices(observations.flat()))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogPrices([]);
        setCatalogPriceError(
          "Catalog prices are unavailable. Price sorting keeps every recipe visible and places unknown costs last.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogPricesLoading(false);
      });

    return () => controller.abort();
  }, [catalogState, marketId, marketsLoading, profession.recipes, recipeListView]);

  const calculation = useMemo(() => {
    const probability = getSkillUpProbability(skill, recipe.thresholds);
    return {
      difficulty: getRecipeDifficulty(skill, recipe.thresholds),
      probability,
      expectedCrafts: getExpectedCraftsForSkillUp(probability),
    };
  }, [recipe, skill]);

  const pricing = useMemo(() => {
    const byItem = new Map(prices.map((price) => [price.gameItemId, price]));
    const pricedReagents = recipe.reagents.map((reagent) => ({
      reagent,
      observation:
        reagent.gameItemId === undefined ? undefined : byItem.get(reagent.gameItemId),
    }));
    const allAvailable = pricedReagents.every(
      ({ observation }) => unitPrice(observation) !== undefined,
    );
    const expectedCost = allAvailable && calculation.probability > 0
      ? pricedReagents.reduce(
          (total, { reagent, observation }) =>
            total +
            getExpectedReagentQuantity(reagent.quantity, calculation.probability) *
              unitPrice(observation)!,
          0,
        )
      : undefined;
    return {
      byItem,
      expectedCost,
      attribution: prices.find(({ attribution }) => attribution)?.attribution,
    };
  }, [calculation.probability, prices, recipe.reagents]);

  const recipeTooltipBySpellId = useMemo(() => {
    const tooltips = new Map<number, ItemTooltipData>();
    for (const candidate of profession.recipes) {
      if (candidate.spellId !== null) {
        tooltips.set(candidate.spellId, outputTooltipItem(candidate, profession.name));
      }
    }
    return tooltips;
  }, [profession.name, profession.recipes]);
  const itemQualityById = useMemo(() => {
    const qualities = new Map<string, number>();
    for (const candidate of profession.recipes) {
      for (const item of [...candidate.reagents, ...candidate.outputs]) {
        const qualityId = item.clientData?.qualityId;
        if (qualityId !== undefined) qualities.set(item.itemId, qualityId);
      }
    }
    return qualities;
  }, [profession.recipes]);
  const recipeChangeTypes = useMemo(() => {
    const changes = new Map<string, RecipeChangeType>();
    for (const change of recipeChanges) {
      changes.set(
        `${change.identity.professionId}:${change.identity.spellId}`,
        change.changeType,
      );
    }
    return changes;
  }, [recipeChanges]);
  const changeTypesByRecipeId = useMemo(() => {
    const changes = new Map<string, RecipeChangeType>();
    for (const candidate of profession.recipes) {
      if (candidate.spellId === null) continue;
      const changeType = recipeChangeTypes.get(
        `${profession.id}:${candidate.spellId}`,
      );
      if (changeType !== undefined) changes.set(candidate.id, changeType);
    }
    return changes;
  }, [profession.id, profession.recipes, recipeChangeTypes]);
  const catalogPricesByItemId = useMemo(
    () => new Map(catalogPrices.map((price) => [price.gameItemId, price])),
    [catalogPrices],
  );
  const catalogItemTypes = useMemo(
    () => getCatalogItemTypes(profession.recipes),
    [profession.recipes],
  );
  const filteredRecipes = useMemo(
    () => filterAndSortRecipes(profession.recipes, {
      changeTypesByRecipeId,
      currentSkill: skill,
      filters: catalogFilters,
      pricesByItemId: catalogPricesByItemId,
      search,
      sort: catalogSort,
    }),
    [
      catalogFilters,
      catalogPricesByItemId,
      catalogSort,
      changeTypesByRecipeId,
      profession.recipes,
      search,
      skill,
    ],
  );
  const activeCatalogFilterCount = countActiveCatalogFilters(catalogFilters);
  const catalogResetKey = JSON.stringify([
    search,
    catalogFilters,
    catalogSort,
    catalogSort === "current-skill" || catalogSort === "expected-cost" ? skill : null,
    catalogSort === "expected-cost" ? catalogPrices.length : null,
  ]);
  function getRecipeChangeType(candidate: Recipe): RecipeChangeType | undefined {
    return candidate.spellId === null
      ? undefined
      : recipeChangeTypes.get(`${profession.id}:${candidate.spellId}`);
  }
  const selectedRecipeIndex = filteredRecipes.findIndex(({ id }) => id === recipe.id);
  const completedRouteSegmentKeys = useMemo(
    () => new Set(routeProgress?.completedSegmentKeys ?? []),
    [routeProgress],
  );
  const guideRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (routeResponse?.result.segments ?? []).flatMap((segment) => {
      const guideRecipe = profession.recipes.find(({ id }) => id === segment.recipeId);
      if (guideRecipe === undefined) return [];
      const alternatives = segment.alternatives.flatMap((alternative) => {
        const alternativeRecipe = profession.recipes.find(
          ({ id }) => id === alternative.recipeId,
        );
        return alternativeRecipe === undefined
          ? []
          : [{ alternative, recipe: alternativeRecipe }];
      });
      const matches =
        query.length === 0 ||
        guideRecipe.name.toLowerCase().includes(query) ||
        guideRecipe.id.toLowerCase().includes(query) ||
        guideRecipe.reagents.some(({ name }) => name.toLowerCase().includes(query)) ||
        alternatives.some(
          ({ recipe: alternativeRecipe }) =>
            alternativeRecipe.name.toLowerCase().includes(query) ||
            alternativeRecipe.id.toLowerCase().includes(query) ||
            alternativeRecipe.reagents.some(({ name }) =>
              name.toLowerCase().includes(query),
            ),
        );
      return matches ? [{ alternatives, segment, recipe: guideRecipe }] : [];
    });
  }, [profession.recipes, routeResponse, search]);
  const recipeRequiredSkill = recipe.learnSkill ?? recipe.thresholds.orange;
  const recipeIsAboveCurrentSkill = skill < recipeRequiredSkill;
  const recipeCapStatus = getRecipeSkillCapStatus(
    recipe.thresholds,
    recipe.learnSkill,
    maxBaseSkill,
  );

  useEffect(() => {
    if (
      recipeListView !== "guide" ||
      guideRows.length === 0 ||
      search.trim().length > 0
    ) {
      return;
    }

    const containingIndex = guideRows.findIndex(
      ({ segment }) =>
        skill >= segment.startSkill && skill < segment.endSkill,
    );
    const nextIndex = guideRows.findIndex(
      ({ segment }) => segment.startSkill > skill,
    );
    const selectedIndex =
      containingIndex >= 0
        ? containingIndex
        : nextIndex >= 0
          ? nextIndex
          : guideRows.length - 1;
    const list = guideListRef.current;
    const entry = list?.querySelector<HTMLElement>(
      `[data-guide-index="${selectedIndex}"]`,
    );
    if (list === null || entry === null || entry === undefined) return;

    const listTop = list.getBoundingClientRect().top;
    const entryTop = entry.getBoundingClientRect().top;
    list.scrollTo({
      top: Math.max(0, list.scrollTop + entryTop - listTop),
      behavior: "auto",
    });
  }, [guideRows, recipeListView, search, skill]);

  const availableRegions = useMemo(
    () => [
      ...new Set([region, ...markets.map((market) => market.region.toLowerCase())]),
    ].sort(),
    [markets, region],
  );
  const profileLabel = `${region.toUpperCase()} - ${faction === "horde" ? "Horde" : "Alliance"}`;
  function activateRouteResponse(
    response: RouteOptimizationResponse,
    request: RouteRequestOptions,
  ): void {
    const fingerprint = createRouteProgressFingerprint({
      build: profession.build,
      professionId: response.professionId,
      startSkill: response.result.startSkill,
      targetSkill: response.result.targetSkill,
      preset: response.result.preset,
      objective: response.result.objective,
      confidencePolicy: response.result.confidencePolicy,
      marketId: response.marketId ?? request.marketId,
      faction: request.faction,
      knownRecipeIds: request.knownRecipeIds,
      segments: response.result.segments,
    });
    setRouteResponse(response);
    const firstGuideRecipeId = initialRecipeSelection.resolveGuide(response.result.segments[0]?.recipeId);
    if (firstGuideRecipeId !== undefined) {
      setRecipeId(firstGuideRecipeId);
      writeRecipeUrl(firstGuideRecipeId, "replace");
    }
    setRouteProgress(readRouteProgress(fingerprint));
    firstStepEngagementRecordedRef.current = false;
    void recordProductEvent({
      name: "route-generated",
      buildId: profession.build,
      preset: response.result.preset,
      status: response.result.status,
      segmentCount: response.result.segments.length,
    });
    if (response.result.status === "blocked") {
      void recordProductEvent({
        name: "route-blocked",
        buildId: profession.build,
        preset: response.result.preset,
        reason: response.result.reason,
      });
    }
  }

  function persistRouteProgress(completedSegmentKeys: readonly string[]): void {
    if (routeProgress === undefined) return;
    const next = { ...routeProgress, completedSegmentKeys };
    setRouteProgress(next);
    setRouteProgressStorageAvailable(writeRouteProgress(next));
    if (routeResponse !== undefined) {
      void recordProductEvent({
        name: "checklist-progress",
        buildId: profession.build,
        preset: routeResponse.result.preset,
        completedSegments: completedSegmentKeys.length,
        totalSegments: routeResponse.result.segments.length,
      });
    }
  }

  function recordFirstStepEngagement(): void {
    if (firstStepEngagementRecordedRef.current || routeResponse === undefined) return;
    firstStepEngagementRecordedRef.current = true;
    void recordProductEvent({
      name: "first-step-engaged",
      buildId: profession.build,
      preset: routeResponse.result.preset,
    });
  }

  function toggleRouteSegment(segmentKey: string, complete: boolean): void {
    if (complete) recordFirstStepEngagement();
    const next = new Set(routeProgress?.completedSegmentKeys ?? []);
    if (complete) next.add(segmentKey);
    else next.delete(segmentKey);
    persistRouteProgress([...next]);
  }

  function invalidatePlanningResults(): void {
    routeRequestGuardRef.current.invalidate();
    routeAbortControllerRef.current?.abort();
    routeAbortControllerRef.current = null;
    setRouteResponse(undefined);
    setRouteProgress(undefined);
    setRouteError(undefined);
    setRouteLoading(false);
  }

  function selectRegion(nextRegion: string): void {
    invalidatePlanningResults();
    setRegion(nextRegion);
    const nextMarket = markets.find((market) =>
      market.region.toLowerCase() === nextRegion &&
      market.faction.toLowerCase() === faction
    ) ?? markets.find((market) => market.region.toLowerCase() === nextRegion);
    if (nextMarket !== undefined) setMarketId(nextMarket.id);
  }

  function selectFaction(nextFaction: PlayerFaction): void {
    invalidatePlanningResults();
    setFaction(nextFaction);
    const nextMarket = markets.find((market) =>
      market.region.toLowerCase() === region &&
      market.faction.toLowerCase() === nextFaction
    );
    if (nextMarket !== undefined) setMarketId(nextMarket.id);
  }

  function resetPersonalization(): void {
    invalidatePlanningResults();
    clearPersonalization();
    setSkill(DEFAULT_PERSONALIZATION.currentSkill);
    setRegion(DEFAULT_PERSONALIZATION.region);
    setMarketId(DEFAULT_PERSONALIZATION.marketId);
    setFaction(DEFAULT_PERSONALIZATION.faction);
    setLegacyProfessionSkillBonus(
      DEFAULT_PERSONALIZATION.legacyProfessionSkillBonus,
    );
    setChangeFilters(DEFAULT_PERSONALIZATION.changeFilters);
    setRouteProgressStorageAvailable(true);
  }

  function selectRecipe(nextRecipe: Recipe, historyMode: "push" | "replace" = "push"): void {
    initialRecipeSelection.cancelGuide();
    setRecipeId(nextRecipe.id);
    setWorkspaceView("calculator");
    writeRecipeUrl(nextRecipe.id, historyMode);
    if (workspaceView === "crafts") {
      window.requestAnimationFrame(() => {
        const workspace = document.getElementById("main-workspace");
        workspace?.scrollIntoView({ block: "start" });
        workspace?.focus({ preventScroll: true });
      });
    } else {
      scrollToWorkspaceOnMobile();
    }
  }

  function selectRecipeListView(
    nextView: RecipeListView,
    historyMode: "push" | "replace" = "push",
  ): void {
    setRecipeListView(nextView);
    initialRecipeSelection.cancelGuide();
    writeRecipeListViewUrl(nextView, historyMode);
  }

  function openChangedRecipe(nextRecipe: Recipe): void {
    initialRecipeSelection.cancelGuide();
    setRecipeId(nextRecipe.id);
    setRecipeListView("recipes");
    setWorkspaceView("calculator");
    setSearch("");
    const url = urlWithRecipeListView(urlWithRecipeId(window.location.href, nextRecipe.id), "recipes");
    window.history.pushState({}, "", url);
    window.requestAnimationFrame(() => {
      const workspace = document.getElementById("main-workspace");
      workspace?.scrollIntoView({ block: "start" });
      workspace?.focus({ preventScroll: true });
    });
  }

  function updateCurrentSkill(value: number): void {
    const nextSkill = Math.min(
      maxBaseSkill,
      Math.max(MIN_CURRENT_SKILL, Math.round(value)),
    );
    setSkill(nextSkill);
  }

  function nudgeSkill(amount: number): void {
    updateCurrentSkill(skill + amount);
  }

  function openRouteRecipe(nextRecipeId: string): void {
    const nextRecipe = profession.recipes.find(({ id }) => id === nextRecipeId);
    if (nextRecipe === undefined) return;
    initialRecipeSelection.cancelGuide();
    recordFirstStepEngagement();
    setRecipeId(nextRecipe.id);
    setWorkspaceView("calculator");
    writeRecipeUrl(nextRecipe.id, "push");
    scrollToWorkspaceOnMobile();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-workspace">Skip to workspace</a>
      <ProfessionMasthead />
      <header className="topbar">
        <ProfessionSwitcher professionId={profession.id} />
        <label className="global-search">
          <SearchIcon className="search-icon" />
          <input aria-label="Search recipes" onChange={(event) => setSearch(event.target.value)} placeholder={recipeListView === "changes" ? "Search changed recipes, fields, or spell IDs…" : `Search ${profession.recipes.length} recipes…`} ref={searchRef} type="search" value={search} />
          <kbd>shift + f</kbd>
        </label>
        <details className="personalization-menu">
          <summary
            aria-label={`Planning preferences for ${profileLabel}`}
            className="market-picker"
          >
            <span
              className={`status-orb${marketsError === undefined ? "" : " status-orb-warning"}`}
              aria-hidden="true"
            />
            <span className="profile-label"><small>Your profile</small>{profileLabel}</span>
            <ChevronDownIcon className="disclosure-icon" />
          </summary>
          <div className="personalization-popover">
            <div className="personalization-heading">
              <div>
                <span className="section-kicker">Saved in this browser</span>
                <strong>Planning preferences</strong>
              </div>
            </div>
            <div className="personalization-grid">
              <label>
                <span>Region</span>
                <select
                  onChange={(event) => selectRegion(event.target.value)}
                  value={region}
                >
                  {availableRegions.map((value) => (
                    <option key={value} value={value}>{value.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Faction</span>
                <select
                  onChange={(event) => selectFaction(event.target.value as PlayerFaction)}
                  value={faction}
                >
                  <option value="horde">Horde</option>
                  <option value="alliance">Alliance</option>
                </select>
              </label>
            </div>
            <label className="personalization-field">
              <span>Legacy profession bonus</span>
              <input
                max="100"
                min="0"
                onChange={(event) => setLegacyProfessionSkillBonus(
                  Math.min(100, Math.max(0, Math.round(Number(event.target.value)))),
                )}
                type="number"
                value={legacyProfessionSkillBonus}
              />
              <small>
                Saved for future modeling. It is not applied until Forever's modifier behavior is verified.
              </small>
            </label>
            {marketsError ? <p className="personalization-warning">{marketsError}</p> : null}
            {!preferencesStorageAvailable ? (
              <p className="personalization-warning">Browser storage is unavailable, so changes will last only for this tab.</p>
            ) : null}
            <div className="personalization-footer">
              <span>Skill, profile preferences, and change filters are saved automatically.</span>
              <button onClick={resetPersonalization} type="button">Reset preferences</button>
            </div>
          </div>
        </details>
      </header>

      {profession.id === "fishing" ? <p className="profession-activity-note">Fishing shows imported recipes and training records. These records do not describe catch rates or a complete activity-based leveling guide.</p> : null}
      <div className={recipeListView === "changes" ? "workspace workspace-changes" : "workspace"} id="top">
        <aside className="profession-rail" aria-label="Profession and recipe selection">
          <div className="profession-select">
            <ProfessionIcon className="profession-icon profession-art" professionId={profession.id} eager />
            <strong>{profession.name}</strong>
          </div>

          {recipeListView === "guide" || recipeListView === "changes" ? (
            <div className="guide-skill-control">
              <div className="rail-label-row">
                <span>Current skill</span>
                <span>{skill} / {maxBaseSkill}</span>
              </div>
              <input
                aria-label={recipeListView === "guide" ? "Current leveling skill" : "Current skill for changed recipes"}
                draggable={false}
                max={maxBaseSkill}
                min={MIN_CURRENT_SKILL}
                onChange={(event) => updateCurrentSkill(Number(event.target.value))}
                onDragStart={(event) => event.preventDefault()}
                step={1}
                type="range"
                value={skill}
              />
              <div className="skill-stepper">
                <button
                  aria-label="Decrease skill"
                  disabled={skill <= MIN_CURRENT_SKILL}
                  onClick={() => nudgeSkill(-1)}
                  type="button"
                >
                  −
                </button>
                <strong>{skill}</strong>
                <button
                  aria-label="Increase skill"
                  disabled={skill >= maxBaseSkill}
                  onClick={() => nudgeSkill(1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          ) : recipeListView === "recipes" ? (
            <div className="rail-skill">
              <div className="rail-label-row"><span>Calculator skill</span><span>{skill} / {maxBaseSkill}</span></div>
              <input
                aria-label="Current profession skill"
                draggable={false}
                max={maxBaseSkill}
                min={MIN_CURRENT_SKILL}
                onChange={(event) => updateCurrentSkill(Number(event.target.value))}
                onDragStart={(event) => event.preventDefault()}
                step={1}
                type="range"
                value={skill}
              />
              <div className="skill-stepper">
                <button aria-label="Decrease skill" disabled={skill <= MIN_CURRENT_SKILL} onClick={() => nudgeSkill(-1)} type="button">−</button>
                <strong>{skill}</strong>
                <button aria-label="Increase skill" disabled={skill >= maxBaseSkill} onClick={() => nudgeSkill(1)} type="button">+</button>
              </div>
            </div>
          ) : null}

          <div className="rail-tabs" role="group" aria-label="Recipe views">
            <button aria-pressed={recipeListView === "guide"} className={recipeListView === "guide" ? "active" : ""} onClick={() => selectRecipeListView("guide")} type="button">Leveling guide</button>
            <button aria-pressed={recipeListView === "recipes"} className={recipeListView === "recipes" ? "active" : ""} onClick={() => selectRecipeListView("recipes")} type="button">All recipes</button>
            <button aria-pressed={recipeListView === "changes"} className={recipeListView === "changes" ? "active" : ""} onClick={() => selectRecipeListView("changes")} type="button">Forever Changes</button>
          </div>

          {recipeListView === "recipes" ? (
            <details className="catalog-tools">
              <summary>
                <span>Filter & sort</span>
                <span>{activeCatalogFilterCount === 0 ? "All recipes" : `${activeCatalogFilterCount} active`}</span>
              </summary>
              <div className="catalog-tools-panel">
                <label className="catalog-field catalog-field-wide">
                  <span>Sort by</span>
                  <select
                    onChange={(event) => setCatalogSort(event.target.value as CatalogSort)}
                    value={catalogSort}
                  >
                    <option value="name">Name</option>
                    <option value="learn-skill">Learning skill</option>
                    <option value="current-skill">Useful at current skill</option>
                    <option value="expected-cost">Expected cost at current skill</option>
                    <option value="orange">Orange threshold</option>
                    <option value="yellow">Yellow threshold</option>
                    <option value="green">Green threshold</option>
                    <option value="gray">Grey threshold</option>
                  </select>
                </label>
                <label className="catalog-field">
                  <span>Acquisition</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      acquisition: event.target.value as CatalogFilters["acquisition"],
                    }))}
                    value={catalogFilters.acquisition}
                  >
                    <option value="all">All sources</option>
                    <option value="automatic">Automatic</option>
                    <option value="trainer">Trainer</option>
                    <option value="vendor">Vendor</option>
                    <option value="quest">Quest</option>
                    <option value="drop">Drop</option>
                    <option value="reputation">Reputation</option>
                    <option value="unknown">Unknown source</option>
                  </select>
                </label>
                <label className="catalog-field">
                  <span>Item type</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      itemType: event.target.value,
                    }))}
                    value={catalogFilters.itemType}
                  >
                    <option value="all">All item types</option>
                    {catalogItemTypes.map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="catalog-skill-range catalog-field-wide">
                  <legend>Learning skill range</legend>
                  <label>
                    <span>From</span>
                    <input
                      aria-label="Minimum learning skill"
                      inputMode="numeric"
                      max={maxCatalogLearningSkill}
                      min={MIN_PROFESSION_SKILL}
                      onChange={(event) => setCatalogFilters((current) => ({
                        ...current,
                        minimumLearnSkill: optionalSkillFilter(
                          event.target.value,
                          maxCatalogLearningSkill,
                        ),
                      }))}
                      type="number"
                      value={catalogFilters.minimumLearnSkill ?? ""}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      aria-label="Maximum learning skill"
                      inputMode="numeric"
                      max={maxCatalogLearningSkill}
                      min={MIN_PROFESSION_SKILL}
                      onChange={(event) => setCatalogFilters((current) => ({
                        ...current,
                        maximumLearnSkill: optionalSkillFilter(
                          event.target.value,
                          maxCatalogLearningSkill,
                        ),
                      }))}
                      type="number"
                      value={catalogFilters.maximumLearnSkill ?? ""}
                    />
                  </label>
                </fieldset>
                <label className="catalog-field">
                  <span>Specialization</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      specialization: event.target.value as CatalogFilters["specialization"],
                    }))}
                    value={catalogFilters.specialization}
                  >
                    <option value="all">All recipes</option>
                    <option value="required">Required</option>
                    <option value="none">None recorded</option>
                  </select>
                </label>
                <label className="catalog-field">
                  <span>Faction</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      faction: event.target.value as CatalogFilters["faction"],
                    }))}
                    value={catalogFilters.faction}
                  >
                    <option value="all">All factions</option>
                    <option value="alliance">Alliance compatible</option>
                    <option value="horde">Horde compatible</option>
                    <option value="both">Both only</option>
                    <option value="unknown">Unknown faction</option>
                  </select>
                </label>
                <label className="catalog-field">
                  <span>Availability</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      availability: event.target.value as CatalogFilters["availability"],
                    }))}
                    value={catalogFilters.availability}
                  >
                    <option value="all">All states</option>
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="catalog-field">
                  <span>Verification</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      verification: event.target.value as CatalogFilters["verification"],
                    }))}
                    value={catalogFilters.verification}
                  >
                    <option value="all">All states</option>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                  </select>
                </label>
                <label className="catalog-field">
                  <span>Forever change</span>
                  <select
                    onChange={(event) => setCatalogFilters((current) => ({
                      ...current,
                      change: event.target.value as CatalogFilters["change"],
                    }))}
                    value={catalogFilters.change}
                  >
                    <option value="all">All comparison states</option>
                    <option value="new">New</option>
                    <option value="updated">Updated</option>
                    <option value="unchanged">Unchanged</option>
                    <option value="unknown">Not in comparison</option>
                  </select>
                </label>
                <p className="catalog-filter-note catalog-field-wide">
                  Learning-skill ranges exclude recipes whose learning rank is unknown.
                  Other unknown values remain available through their explicit filter option.
                </p>
                {catalogSort === "expected-cost" ? (
                  <p className="catalog-filter-note catalog-field-wide" role="status">
                    {catalogPricesLoading
                      ? "Loading stored prices for cost sorting…"
                      : catalogPriceError ?? "Recipes without complete price coverage appear last."}
                  </p>
                ) : null}
                {changesError && catalogFilters.change !== "all" ? (
                  <p className="catalog-filter-note catalog-filter-warning catalog-field-wide">
                    Comparison data is unavailable, so recipes are treated as not in comparison.
                  </p>
                ) : null}
                <button
                  className="catalog-clear"
                  disabled={activeCatalogFilterCount === 0 && catalogSort === "name"}
                  onClick={() => {
                    setCatalogFilters(DEFAULT_CATALOG_FILTERS);
                    setCatalogSort("name");
                  }}
                  type="button"
                >
                  Clear filters and sort
                </button>
              </div>
            </details>
          ) : null}

          {recipeListView !== "guide" ? (
            <div className="recipe-list-summary">
              <span>
                {recipeListView === "recipes"
                  ? `${filteredRecipes.length} ${filteredRecipes.length === 1 ? "recipe" : "recipes"}`
                  : changesLoading
                    ? "Loading comparison…"
                    : `${recipeChanges.filter(({ changeType }) => changeType !== "UNCHANGED").length} changed recipes`}
              </span>
              {search ? <button onClick={() => setSearch("")} type="button">Clear search</button> : null}
            </div>
          ) : null}

          {recipeListView === "guide" && routeResponse ? (
            <div className="guide-completion-count">
              <span aria-live="polite">{completedRouteSegmentKeys.size} / {routeResponse.result.segments.length} complete</span>
              {!routeProgressStorageAvailable ? <small>Progress lasts only for this tab; browser storage is unavailable.</small> : null}
            </div>
          ) : null}

          {recipeListView === "guide" ? (
            <nav
              aria-label="Optimized leveling guide"
              className="guide-list"
              ref={guideListRef}
            >
              {routeLoading && routeResponse === undefined ? (
                <div className="guide-loading" role="status">
                  <span aria-hidden="true" />
                  <strong>Building your guide</strong>
                  <small>Evaluating every usable recipe at every skill…</small>
                </div>
              ) : null}
              {routeError ? (
                <div className="guide-message guide-message-error">
                  <strong>Guide unavailable</strong>
                  <small>{routeError}</small>
                </div>
              ) : null}
              {!routeLoading && routeError === undefined && guideRows.length === 0 ? (
                <div className="guide-message">
                  <strong>{search ? "No guide steps match" : routeResponse?.result.status === "blocked" ? "No supported route steps" : "No route steps yet"}</strong>
                  <small>{search ? `Clear “${search}” to see the route.` : routeResponse?.result.status === "blocked" ? "The imported evidence cannot support a route from the starting skill. Browse All recipes to inspect the available records." : "The guide appears automatically when recipe data is ready."}</small>
                </div>
              ) : null}
              {routeResponse?.result.status === "blocked" && search.length === 0 ? (
                <div className="guide-blocked">
                  {routeResponse.result.explanation}
                </div>
              ) : null}
              {guideRows.map(({ alternatives, recipe: guideRecipe, segment }, index) => {
                const segmentProgressKey = routeSegmentKey(segment);
                const complete = completedRouteSegmentKeys.has(segmentProgressKey);
                const active =
                  !complete &&
                  skill >= segment.startSkill &&
                  skill < segment.endSkill;
                return (
                  <div
                    className="guide-entry"
                    data-guide-index={index}
                    data-route-segment-key={segmentProgressKey}
                    tabIndex={-1}
                    key={`${segment.recipeId}-${segment.startSkill}`}
                  >
                    <div className="guide-range-divider">
                      <label className="guide-step-checkbox"><input aria-label={"Complete " + guideRecipe.name + ", skill " + segment.startSkill + "–" + segment.endSkill} checked={complete} onChange={(event) => toggleRouteSegment(segmentProgressKey, event.target.checked)} type="checkbox" /><span>{segment.startSkill} – {segment.endSkill}</span></label>
                    </div>
                    <ItemTooltipButton
                      aria-current={active ? "step" : undefined}
                      className={`guide-step${active ? " active" : ""}${complete ? " complete" : ""}`}
                      item={outputTooltipItem(guideRecipe, profession.name)}
                      onClick={() => openRouteRecipe(segment.recipeId)}
                      type="button"
                    >
                      <span className="guide-step-number" aria-hidden="true">
                        {complete ? "✓" : index + 1}
                      </span>
                      <span className="guide-step-title">
                        <ItemIcon className="guide-item-icon" gameItemId={guideRecipe.outputs[0]?.gameItemId} name={guideRecipe.name} />
                        <span>
                          <strong className={getItemRarityNameClass(recipeOutputQualityId(guideRecipe))}>{guideRecipe.name}</strong>
                          <small className={`guide-source source-${guideRecipe.acquisition}`}>
                            {acquisitionLabel(guideRecipe)}
                          </small>
                          {getRecipeChangeType(guideRecipe) ? (
                            <RecipeChangeBadge changeType={getRecipeChangeType(guideRecipe)!} />
                          ) : null}
                        </span>
                      </span>
                    </ItemTooltipButton>
                    {alternatives.length > 0 ? (
                      <details className="guide-alternatives">
                        <summary>{alternatives.length} {alternatives.length === 1 ? "alternative" : "alternatives"}</summary>
                        <div className="guide-alternative-list">
                          {alternatives.map(({ alternative, recipe: alternativeRecipe }) => {
                            const alternativeActive =
                              alternativeRecipe.id === recipe.id &&
                              skill >= alternative.startSkill &&
                              skill < alternative.endSkill;
                            return (
                              <button
                                aria-current={alternativeActive ? "step" : undefined}
                                className={alternativeActive ? "guide-alternative active" : "guide-alternative"}
                                key={`${alternative.recipeId}-${alternative.startSkill}`}
                                onClick={() => openRouteRecipe(alternative.recipeId)}
                                type="button"
                              >
                                <span className={getItemRarityNameClass(recipeOutputQualityId(alternativeRecipe))}>{alternativeRecipe.name}</span>
                                <small>{alternative.startSkill} – {alternative.endSkill}</small>
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          ) : recipeListView === "recipes" ? (
            <VirtualList
              ariaLabel="All recipes"
              className="recipe-list"
              empty={(
                <p className="empty-recipes">
                  {search
                    ? `No recipes match “${search}” and the active filters.`
                    : "No recipes match the active filters."}
                </p>
              )}
              getKey={({ id }) => id}
              items={filteredRecipes}
              renderItem={(candidate, index) => (
                <div className="recipe-group">
                  <ItemTooltipButton aria-current={candidate.id === recipe.id ? "true" : undefined} className={candidate.id === recipe.id ? "recipe active" : "recipe"} item={outputTooltipItem(candidate, profession.name)} onClick={() => selectRecipe(candidate)} type="button">
                    <span className={`recipe-stripe stripe-${index}`} aria-hidden="true" />
                    <ItemIcon className={`item-icon item-${index}`} gameItemId={candidate.outputs[0]?.gameItemId} name={candidate.name} />
                    <span className="recipe-copy">
                      <strong className={getItemRarityNameClass(recipeOutputQualityId(candidate))}>{candidate.name}</strong>
                      <small>
                        {getRecipeItemType(candidate).label} · {acquisitionLabel(candidate)}
                      </small>
                      <span
                        aria-label={`Thresholds: orange ${candidate.thresholds.orange}, yellow ${candidate.thresholds.yellow}, green ${candidate.thresholds.green}, grey ${candidate.thresholds.gray}`}
                        className="recipe-thresholds"
                        role="group"
                      >
                        <span className="orange"><b>O</b>{candidate.thresholds.orange}</span>
                        <span className="yellow"><b>Y</b>{candidate.thresholds.yellow}</span>
                        <span className="green"><b>G</b>{candidate.thresholds.green}</span>
                        <span className="gray"><b>Gr</b>{candidate.thresholds.gray}</span>
                      </span>
                      {getRecipeChangeType(candidate) ? <RecipeChangeBadge changeType={getRecipeChangeType(candidate)!} /> : null}
                    </span>
                    <span className="recipe-row-status">
                      <span className={`recipe-level ${getRecipeDifficulty(skill, candidate.thresholds)}`}>
                        {getRecipeDifficulty(skill, candidate.thresholds)}
                      </span>
                      {catalogSort === "expected-cost" ? (
                        <small>
                          {getRecipeExpectedCost(candidate, skill, catalogPricesByItemId) === undefined
                            ? "Cost unknown"
                            : formatCopper(getRecipeExpectedCost(candidate, skill, catalogPricesByItemId)!)}
                        </small>
                      ) : (
                        <small>Learn {candidate.learnSkill ?? "unknown"}</small>
                      )}
                    </span>
                  </ItemTooltipButton>
                </div>
              )}
              resetKey={catalogResetKey}
              rowHeight={RECIPE_ROW_HEIGHT}
              selectedIndex={selectedRecipeIndex}
            />
          ) : null}

          {recipeListView !== "changes" ? (
            <div className="rail-footer">
              {recipeListView === "guide" && routeResponse ? (
                <span>~{Math.ceil(routeResponse.result.totals.expectedCrafts).toLocaleString()} expected crafts</span>
              ) : (
                <><span>Forever build</span><strong>{profession.build}</strong></>
              )}
            </div>
          ) : null}
        </aside>

        <main className="main-workspace" id="main-workspace" tabIndex={-1}>
          {recipeListView === "changes" ? null : (
            <nav className="workspace-nav" aria-label="Workspace views">
              <button aria-pressed={workspaceView === "calculator"} className={workspaceView === "calculator" ? "active" : ""} onClick={() => setWorkspaceView("calculator")} type="button">Recipe calculator</button>
              {craftDefaults ? <button aria-pressed={workspaceView === "crafts"} className={workspaceView === "crafts" ? "active" : ""} onClick={() => setWorkspaceView("crafts")} type="button">Best crafts</button> : null}
            </nav>
          )}

          {recipeListView === "changes" ? (
            <ForeverChanges
              changes={recipeChanges}
              currentSkill={skill}
              error={changesError}
              filters={changeFilters}
              itemQualityById={itemQualityById}
              loading={changesLoading}
              onFiltersChange={setChangeFilters}
              onRetry={() => setChangesReload((value) => value + 1)}
              onSelectRecipe={openChangedRecipe}
              recipes={profession.recipes}
              recipeTooltipBySpellId={recipeTooltipBySpellId}
              search={search}
              summary={changeSummary}
            />
          ) : workspaceView === "calculator" || !craftDefaults ? (
            <>
              <section className="recipe-hero" aria-labelledby="recipe-title">
                <div className="hero-title-row">
                  <ItemTooltip item={outputTooltipItem(recipe, profession.name)} pinnable>
                    <ItemIcon className="hero-item-icon" eager gameItemId={recipe.outputs[0]?.gameItemId} name={recipe.name} />
                  </ItemTooltip>
                  <div>
                    <div className="breadcrumb">{profession.name}</div>
                    <div className="recipe-name-row">
                      <h1 className={getItemRarityNameClass(recipeOutputQualityId(recipe))} id="recipe-title">{recipe.name}</h1>
                      <span
                        aria-label={`${calculation.difficulty} difficulty`}
                        className={`difficulty-dot ${calculation.difficulty}`}
                        role="img"
                        title={`${calculation.difficulty} difficulty`}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {recipeIsAboveCurrentSkill ? (
                <div className="skill-requirement-warning" role="status">
                  <span aria-hidden="true">!</span>
                  <div>
                    <strong>
                      {recipeCapStatus.requiredSkillAboveCap
                        ? "Requirement exceeds the current base cap"
                        : "Not available at your current skill"}
                    </strong>
                    <p>
                      <span className={getItemRarityNameClass(recipeOutputQualityId(recipe))}>{recipe.name}</span> requires {profession.name} {recipeRequiredSkill}. {recipeCapStatus.requiredSkillAboveCap
                        ? `This exceeds the current base profession cap of ${maxBaseSkill} and may depend on special mechanics or incomplete Forever data.`
                        : `Your current skill is ${skill}.`}
                    </p>
                  </div>
                </div>
              ) : null}

              <section className="calculator-card" aria-label="Skill-up calculator">
                <div className="calculator-grid">
                  <SkillChart maxBaseSkill={maxBaseSkill} recipe={recipe} skill={skill} />
                  <div className="outcome-panel">
                    <div className="outcome-feature"><span>Skill-up chance</span><strong>{Math.round(calculation.probability * 100)}<small>%</small></strong><p>per craft at skill {skill}</p></div>
                    <div className="outcome-row"><span>Expected attempts</span><strong>{formatNumber(calculation.expectedCrafts)}</strong></div>
                  </div>
                </div>
              </section>

              <section className="cost-strip" aria-label="Cost summary">
                <article><span className="metric-icon" aria-hidden="true">×</span><div><span>Crafts per skill-up</span><strong>{formatNumber(calculation.expectedCrafts)}</strong></div></article>
                <article><span className="metric-icon" aria-hidden="true">◈</span><div><span>Cost per attempt</span><strong>{pricing.expectedCost === undefined ? "—" : formatCopper(pricing.expectedCost / calculation.expectedCrafts)}</strong></div></article>
                <article><span className="metric-icon" aria-hidden="true">◆</span><div><span>Expected cost per skill</span><strong>{pricing.expectedCost === undefined ? "—" : formatCopper(pricing.expectedCost)}</strong></div></article>
              </section>

              <section className="materials-card" aria-labelledby="materials-title">
                <div className="section-title-row materials-heading">
                  <div><h2 id="materials-title">Materials required</h2><small className="section-subtitle">For 1 craft</small></div>
                  <span className="price-mode">Market prices</span>
                </div>
                <div className="materials-table" role="table" aria-label="Required materials">
                  <div className="materials-header" role="row"><span role="columnheader">Name</span><span role="columnheader">Quantity</span><span role="columnheader">Source</span><span role="columnheader">Estimated cost</span></div>
                  {recipe.reagents.map((reagent, index) => {
                    const observation = reagent.gameItemId === undefined ? undefined : pricing.byItem.get(reagent.gameItemId);
                    const price = unitPrice(observation);
                    return (
                      <div className="material-row" key={reagent.itemId} role="row">
                        <span className="material-name" role="cell">
                          <ItemTooltip item={reagentTooltipItem(reagent, price)} pinnable>
                            <ItemIcon className={`item-icon reagent-${index}`} gameItemId={reagent.gameItemId} name={reagent.name} />
                          </ItemTooltip>
                          <span><strong className={getItemRarityNameClass(reagent.clientData?.qualityId)}>{reagent.name}</strong><small>Item {reagent.gameItemId ?? "—"}</small></span>
                        </span>
                        <strong role="cell">{reagent.quantity}</strong>
                        <span className="source-pill" role="cell"><i aria-hidden="true" /> Auction house</span>
                        <strong className="material-cost" role="cell">{price === undefined ? "Unavailable" : formatCopper(price * reagent.quantity)}</strong>
                      </div>
                    );
                  })}
                </div>
                {priceError ? <p className="price-status">{priceError}</p> : null}
                {pricing.attribution ? <a className="attribution" href={pricing.attribution.url} rel="noreferrer" target="_blank">{pricing.attribution.text}</a> : null}
              </section>

              {recipe.outputs.length === 0 ? <p className="price-status">No crafted item output is recorded for this spell. Teaching items are not treated as crafted outputs.</p> : null}
              <DataQualityNotice build={profession.build} recipe={recipe} />
            </>
          ) : (
            <BestCrafts
              catalogState={catalogState}
              currentSkill={skill}
              faction={faction}
              getTooltip={outputTooltipItem}
              onOpenRecipe={selectRecipe}
              onSelectionChange={setCraftSelection}
              professionName={profession.name}
              recipes={profession.recipes}
              selection={craftSelection}
            />
          )}
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
