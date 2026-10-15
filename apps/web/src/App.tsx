import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  auctionMarketsResponseSchema,
  auctionPricesResponseSchema,
  professionFixtureSchema,
  recipeChangesResponseSchema,
  recipeChangesSummaryResponseSchema,
  routeOptimizationResponseSchema,
  shoppingListResponseSchema,
  type AuctionMarket,
  type AuctionPriceObservation,
  type ProfessionFixture,
  type Recipe,
  type RecipeChange,
  type RecipeChangeCounts,
  type RecipeChangeType,
  type RouteObjective,
  type RouteOptimizationResponse,
  type ShoppingListResponse,
  type ShoppingStrategy,
} from "@forever-professions/contracts";
import {
  assessDataQuality,
  getExpectedCraftsForSkillUp,
  getExpectedReagentQuantity,
  getRecipeDifficulty,
  getSkillUpProbability,
} from "@forever-professions/domain";
import { leatherworkingFixture } from "@forever-professions/fixtures";
import { ForeverChanges, RecipeChangeBadge } from "./ForeverChanges.js";
import { ItemIcon } from "./ItemIcon.js";
import {
  DEFAULT_PERSONALIZATION,
  clearPersonalization,
  readPersonalization,
  writePersonalization,
  type ForeverChangeFilters,
  type PlayerFaction,
} from "./personalization.js";
import { createRequestGuard } from "./request-guard.js";

type WorkspaceView = "calculator" | "planner";
type RecipeListView = "guide" | "recipes" | "changes";
type CatalogState = "loading" | "ready" | "fixture" | "fallback";

const MIN_PROFESSION_SKILL = 0;
const MAX_PROFESSION_SKILL = 300;
const RECIPE_ROW_HEIGHT = 78;
const KNOWN_RECIPE_ROW_HEIGHT = 48;
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

  const firstIndex = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN,
  );
  const lastIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + VIRTUAL_OVERSCAN,
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
  return new URL(window.location.href).searchParams.get("recipe") ?? undefined;
}

function writeRecipeUrl(recipeId: string, mode: "push" | "replace"): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("recipe", recipeId);
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

function unitPrice(observation: AuctionPriceObservation | undefined): number | undefined {
  if (observation?.status !== "available") return undefined;
  return observation.minimumBuyoutUnitPriceCopper ?? observation.medianUnitPriceCopper;
}

function acquisitionLabel(recipe: Recipe): string {
  if (recipe.acquisition === "unknown") return "Source unknown";
  if (recipe.acquisition === "automatic") return "Learned automatically";
  return recipe.acquisition[0]!.toUpperCase() + recipe.acquisition.slice(1);
}

interface RouteRequestOptions {
  readonly faction: PlayerFaction;
  readonly marketId: string;
  readonly professionId: string;
  readonly startSkill: number;
  readonly targetSkill: number;
  readonly objective: RouteObjective;
  readonly knownRecipeIds: readonly string[];
  readonly trainerOnly: boolean;
  readonly signal?: AbortSignal;
}

async function requestOptimizedRoute({
  faction,
  marketId,
  professionId,
  startSkill,
  targetSkill,
  objective,
  knownRecipeIds,
  trainerOnly,
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
      objective,
      constraints: { faction, knownRecipeIds, trainerOnly },
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
      </div>
    </section>
  );
}

function SkillChart({ recipe, skill }: { recipe: Recipe; skill: number }) {
  const points = useMemo(() => {
    const { orange, gray } = recipe.thresholds;
    const width = Math.max(1, gray - orange);
    return Array.from({ length: width + 1 }, (_, index) => {
      const level = orange + index;
      const x = 28 + (index / width) * 384;
      const y = 172 - getSkillUpProbability(level, recipe.thresholds) * 136;
      return `${x},${y}`;
    }).join(" ");
  }, [recipe]);

  const range = Math.max(1, recipe.thresholds.gray - recipe.thresholds.orange);
  const chartSkill = Math.min(
    recipe.thresholds.gray,
    Math.max(recipe.thresholds.orange, skill),
  );
  const markerX = 28 + ((chartSkill - recipe.thresholds.orange) / range) * 384;
  const markerY = 172 - getSkillUpProbability(skill, recipe.thresholds) * 136;

  return (
    <div className="chart-wrap">
      <div className="chart-heading">
        <strong>Success rate by skill</strong>
        <span className="chart-live">Current · {skill}</span>
      </div>
      <svg
        aria-label={`Skill-up chance curve for ${recipe.name}`}
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
        {Object.entries(recipe.thresholds).map(([label, value]) => {
          const x = 28 + ((value - recipe.thresholds.orange) / range) * 384;
          return (
            <text className={`chart-threshold ${label}`} key={label} x={x} y="197">
              {value}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function App() {
  const [initialPreferences] = useState(readPersonalization);
  const [profession, setProfession] = useState<ProfessionFixture>(leatherworkingFixture);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [recipeId, setRecipeId] = useState(leatherworkingFixture.recipes[0]!.id);
  const recipe =
    profession.recipes.find(({ id }) => id === recipeId) ?? profession.recipes[0]!;
  const recipeQuality = assessDataQuality(
    recipe.provenance.source,
    recipe.provenance.verification.status,
  );
  const nonAuthoritativeRecipeCount = profession.recipes.filter(
    (candidate) =>
      !assessDataQuality(
        candidate.provenance.source,
        candidate.provenance.verification.status,
      ).authoritative,
  ).length;
  const [skill, setSkill] = useState(initialPreferences.currentSkill);
  const [prices, setPrices] = useState<readonly AuctionPriceObservation[]>([]);
  const [priceError, setPriceError] = useState<string>();
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("calculator");
  const [recipeListView, setRecipeListView] = useState<RecipeListView>("guide");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const guideListRef = useRef<HTMLElement>(null);
  const [recipeChanges, setRecipeChanges] = useState<readonly RecipeChange[]>([]);
  const [changeSummary, setChangeSummary] = useState<RecipeChangeCounts>();
  const [changesLoading, setChangesLoading] = useState(true);
  const [changesError, setChangesError] = useState<string>();
  const [changesReload, setChangesReload] = useState(0);
  const [changeFilters, setChangeFilters] = useState<ForeverChangeFilters>(
    initialPreferences.changeFilters,
  );
  const [knownRecipeSearch, setKnownRecipeSearch] = useState("");
  const [routeStartSkill, setRouteStartSkill] = useState(
    initialPreferences.routeStartSkill,
  );
  const [routeTargetSkill, setRouteTargetSkill] = useState(
    initialPreferences.targetSkill,
  );
  const [routeObjective, setRouteObjective] = useState<RouteObjective>(
    initialPreferences.routeObjective,
  );
  const [knownRecipeIds, setKnownRecipeIds] = useState<readonly string[]>(
    leatherworkingFixture.recipes.map(({ id }) => id),
  );
  const [trainerOnly, setTrainerOnly] = useState(initialPreferences.trainerOnly);
  const [routeResponse, setRouteResponse] = useState<RouteOptimizationResponse>();
  const [routeError, setRouteError] = useState<string>();
  const [routeLoading, setRouteLoading] = useState(false);
  const [shoppingStrategy, setShoppingStrategy] = useState<ShoppingStrategy>(
    initialPreferences.shoppingStrategy,
  );
  const [shoppingResponse, setShoppingResponse] = useState<ShoppingListResponse>();
  const [shoppingError, setShoppingError] = useState<string>();
  const [shoppingLoading, setShoppingLoading] = useState(false);
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
  const shoppingAbortControllerRef = useRef<AbortController | null>(null);
  const shoppingRequestGuardRef = useRef(createRequestGuard());

  useEffect(() => {
    setPreferencesStorageAvailable(writePersonalization({
      version: 1,
      currentSkill: skill,
      routeStartSkill,
      targetSkill: routeTargetSkill,
      routeObjective,
      shoppingStrategy,
      trainerOnly,
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
    routeObjective,
    routeStartSkill,
    routeTargetSkill,
    shoppingStrategy,
    skill,
    trainerOnly,
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
    const controller = new AbortController();
    setCatalogState("loading");
    fetch(`/api/professions/${leatherworkingFixture.id}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return professionFixtureSchema.parse(await response.json());
      })
      .then((loadedProfession) => {
        if (loadedProfession.recipes.length === 0) {
          throw new Error("The profession catalog contains no usable recipes.");
        }
        const requestedRecipeId = recipeIdFromUrl();
        const selectedRecipe = loadedProfession.recipes.find(
          ({ id }) => id === requestedRecipeId,
        ) ?? loadedProfession.recipes[0]!;
        const usesFixtureCatalog = loadedProfession.recipes.every(
          ({ provenance }) => provenance.source === "fixture",
        );
        setProfession(loadedProfession);
        setRecipeId(selectedRecipe.id);
        setKnownRecipeIds(loadedProfession.recipes.map(({ id }) => id));
        setCatalogState(usesFixtureCatalog ? "fixture" : "ready");
        writeRecipeUrl(selectedRecipe.id, "replace");
        if (requestedRecipeId === selectedRecipe.id) scrollToWorkspaceOnMobile();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const fallbackRecipe = leatherworkingFixture.recipes.find(
          ({ id }) => id === recipeIdFromUrl(),
        ) ?? leatherworkingFixture.recipes[0]!;
        setProfession(leatherworkingFixture);
        setRecipeId(fallbackRecipe.id);
        setKnownRecipeIds(leatherworkingFixture.recipes.map(({ id }) => id));
        setCatalogState("fallback");
        writeRecipeUrl(fallbackRecipe.id, "replace");
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
    requestOptimizedRoute({
      faction,
      marketId,
      professionId: profession.id,
      startSkill: routeStartSkill,
      targetSkill: routeTargetSkill,
      objective: routeObjective,
      knownRecipeIds: profession.recipes.map(({ id }) => id),
      trainerOnly,
      signal: controller.signal,
    })
      .then((response) => {
        if (
          !controller.signal.aborted &&
          routeRequestGuardRef.current.isCurrent(requestId)
        ) {
          setRouteResponse(response);
        }
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          !routeRequestGuardRef.current.isCurrent(requestId)
        ) return;
        setRouteResponse(undefined);
        setRouteError(
          "The leveling guide could not be generated. Check the API connection and try again.",
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
  }, [catalogState, marketsLoading, profession]);

  useEffect(() => () => {
    routeRequestGuardRef.current.invalidate();
    routeAbortControllerRef.current?.abort();
    shoppingRequestGuardRef.current.invalidate();
    shoppingAbortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ comparison: "classic-forever" });
    const unchangedQuery = new URLSearchParams({
      comparison: "classic-forever",
      changeType: "unchanged",
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
  }, [changesReload]);

  useEffect(() => {
    function selectRecipeFromHistory(): void {
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
      : `${recipe.name} · Forever Professions`;
  }, [recipe.name, recipeListView]);

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
    const gameItemIds = recipe.reagents.flatMap(({ gameItemId }) =>
      gameItemId === undefined ? [] : [gameItemId],
    );
    const controller = new AbortController();
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
  }, [marketId, recipe]);

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

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = profession.recipes.filter((candidate) =>
      query.length === 0 ||
      candidate.name.toLowerCase().includes(query) ||
      candidate.id.toLowerCase().includes(query) ||
      candidate.reagents.some(({ name }) => name.toLowerCase().includes(query)) ||
      candidate.outputs.some(({ name }) => name.toLowerCase().includes(query)),
    );
    return [...matches].sort((left, right) => left.name.localeCompare(right.name));
  }, [profession.recipes, search]);
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
  function getRecipeChangeType(candidate: Recipe): RecipeChangeType | undefined {
    return candidate.spellId === null
      ? undefined
      : recipeChangeTypes.get(`${profession.id}:${candidate.spellId}`);
  }
  const selectedRecipeIndex = filteredRecipes.findIndex(({ id }) => id === recipe.id);
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
  const guideStartSkill = routeResponse?.result.startSkill ?? routeStartSkill;
  const guideTargetSkill = routeResponse?.result.targetSkill ?? routeTargetSkill;
  const currentGuideSkill = Math.min(
    guideTargetSkill,
    Math.max(guideStartSkill, skill),
  );
  const recipeRequiredSkill = recipe.learnSkill ?? recipe.thresholds.orange;
  const recipeIsAboveCurrentSkill = skill < recipeRequiredSkill;

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

  const knownRecipeSet = useMemo(() => new Set(knownRecipeIds), [knownRecipeIds]);
  const filteredKnownRecipes = useMemo(() => {
    const query = knownRecipeSearch.trim().toLowerCase();
    return profession.recipes.filter(
      ({ id, name }) =>
        query.length === 0 ||
        name.toLowerCase().includes(query) ||
        id.toLowerCase().includes(query),
    );
  }, [knownRecipeSearch, profession.recipes]);
  const selectedKnownResults = filteredKnownRecipes.filter(({ id }) =>
    knownRecipeSet.has(id),
  ).length;
  const availableRegions = useMemo(
    () => [
      ...new Set([region, ...markets.map((market) => market.region.toLowerCase())]),
    ].sort(),
    [markets, region],
  );
  const regionMarkets = useMemo(
    () => markets.filter((market) => market.region.toLowerCase() === region),
    [markets, region],
  );
  const selectedMarket = markets.find(({ id }) => id === marketId);
  const marketLabel = selectedMarket?.label ?? marketId;

  function invalidateShoppingResults(): void {
    shoppingRequestGuardRef.current.invalidate();
    shoppingAbortControllerRef.current?.abort();
    shoppingAbortControllerRef.current = null;
    setShoppingResponse(undefined);
    setShoppingError(undefined);
    setShoppingLoading(false);
  }

  function invalidatePlanningResults(): void {
    routeRequestGuardRef.current.invalidate();
    routeAbortControllerRef.current?.abort();
    routeAbortControllerRef.current = null;
    setRouteResponse(undefined);
    setRouteError(undefined);
    setRouteLoading(false);
    invalidateShoppingResults();
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

  function selectMarket(nextMarketId: string): void {
    invalidatePlanningResults();
    setMarketId(nextMarketId);
    const nextMarket = markets.find(({ id }) => id === nextMarketId);
    if (nextMarket === undefined) return;
    setRegion(nextMarket.region.toLowerCase());
  }

  function resetPersonalization(): void {
    invalidatePlanningResults();
    clearPersonalization();
    setSkill(DEFAULT_PERSONALIZATION.currentSkill);
    setRouteStartSkill(DEFAULT_PERSONALIZATION.routeStartSkill);
    setRouteTargetSkill(DEFAULT_PERSONALIZATION.targetSkill);
    setRouteObjective(DEFAULT_PERSONALIZATION.routeObjective);
    setShoppingStrategy(DEFAULT_PERSONALIZATION.shoppingStrategy);
    setTrainerOnly(DEFAULT_PERSONALIZATION.trainerOnly);
    setRegion(DEFAULT_PERSONALIZATION.region);
    setMarketId(DEFAULT_PERSONALIZATION.marketId);
    setFaction(DEFAULT_PERSONALIZATION.faction);
    setLegacyProfessionSkillBonus(
      DEFAULT_PERSONALIZATION.legacyProfessionSkillBonus,
    );
    setChangeFilters(DEFAULT_PERSONALIZATION.changeFilters);
  }

  function selectRecipe(nextRecipe: Recipe, historyMode: "push" | "replace" = "push"): void {
    setRecipeId(nextRecipe.id);
    setWorkspaceView("calculator");
    writeRecipeUrl(nextRecipe.id, historyMode);
    scrollToWorkspaceOnMobile();
  }

  function nudgeSkill(amount: number): void {
    setSkill((current) =>
      Math.min(MAX_PROFESSION_SKILL, Math.max(MIN_PROFESSION_SKILL, current + amount)),
    );
  }

  function toggleKnownRecipe(nextRecipeId: string): void {
    setKnownRecipeIds((current) => {
      const next = new Set(current);
      if (next.has(nextRecipeId)) next.delete(nextRecipeId);
      else next.add(nextRecipeId);
      return [...next];
    });
  }

  function setKnownResults(selected: boolean): void {
    setKnownRecipeIds((current) => {
      const next = new Set(current);
      for (const candidate of filteredKnownRecipes) {
        if (selected) next.add(candidate.id);
        else next.delete(candidate.id);
      }
      return [...next];
    });
  }

  async function submitRoute(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    invalidateShoppingResults();
    routeAbortControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = routeRequestGuardRef.current.begin();
    routeAbortControllerRef.current = controller;
    setRouteLoading(true);
    setRouteError(undefined);
    try {
      const response = await requestOptimizedRoute({
        faction,
        marketId,
        professionId: profession.id,
        startSkill: routeStartSkill,
        targetSkill: routeTargetSkill,
        objective: routeObjective,
        knownRecipeIds,
        trainerOnly,
        signal: controller.signal,
      });
      if (!routeRequestGuardRef.current.isCurrent(requestId)) return;
      setRouteResponse(response);
      setRecipeListView("guide");
    } catch {
      if (!routeRequestGuardRef.current.isCurrent(requestId)) return;
      setRouteResponse(undefined);
      setRouteError("A route could not be calculated right now. Check the API connection and try again.");
    } finally {
      if (routeRequestGuardRef.current.isCurrent(requestId)) {
        routeAbortControllerRef.current = null;
        setRouteLoading(false);
      }
    }
  }

  async function buildShoppingList(): Promise<void> {
    if (routeResponse === undefined || routeResponse.result.segments.length === 0) return;
    shoppingAbortControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = shoppingRequestGuardRef.current.begin();
    shoppingAbortControllerRef.current = controller;
    setShoppingLoading(true);
    setShoppingError(undefined);
    setShoppingResponse(undefined);
    try {
      const response = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          professionId: profession.id,
          marketId,
          route: routeResponse.result.segments.map(
            ({ recipeId: id, expectedCrafts }) => ({ recipeId: id, expectedCrafts }),
          ),
          strategy: shoppingStrategy,
          knownRecipeIds,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = shoppingListResponseSchema.parse(await response.json());
      if (!shoppingRequestGuardRef.current.isCurrent(requestId)) return;
      setShoppingResponse(parsed);
    } catch {
      if (!shoppingRequestGuardRef.current.isCurrent(requestId)) return;
      setShoppingResponse(undefined);
      setShoppingError("A shopping list could not be built right now.");
    } finally {
      if (shoppingRequestGuardRef.current.isCurrent(requestId)) {
        shoppingAbortControllerRef.current = null;
        setShoppingLoading(false);
      }
    }
  }

  function openRouteRecipe(nextRecipeId: string): void {
    const nextRecipe = profession.recipes.find(({ id }) => id === nextRecipeId);
    if (nextRecipe === undefined) return;
    setRecipeId(nextRecipe.id);
    setWorkspaceView("calculator");
    writeRecipeUrl(nextRecipe.id, "push");
    scrollToWorkspaceOnMobile();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Forever Professions home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>forever<span>.professions</span></span>
        </a>
        <label className="global-search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input aria-label="Search recipes" onChange={(event) => setSearch(event.target.value)} placeholder={recipeListView === "changes" ? "Search changed recipes, fields, or spell IDs…" : `Search ${profession.recipes.length} recipes…`} ref={searchRef} type="search" value={search} />
          <kbd>shift + f</kbd>
        </label>
        <details className="personalization-menu">
          <summary
            aria-label={`Planning preferences for ${marketLabel}`}
            className="market-picker"
          >
            <span
              className={`status-orb${marketsError === undefined ? "" : " status-orb-warning"}`}
              aria-hidden="true"
            />
            <span><small>Your profile</small>{marketLabel}</span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="personalization-popover">
            <div className="personalization-heading">
              <div>
                <span className="section-kicker">Saved in this browser</span>
                <strong>Planning preferences</strong>
              </div>
              <span aria-hidden="true">◎</span>
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
              <span>Auction market</span>
              <select
                disabled={marketsLoading || regionMarkets.length === 0}
                onChange={(event) => selectMarket(event.target.value)}
                value={regionMarkets.some(({ id }) => id === marketId) ? marketId : ""}
              >
                {regionMarkets.length === 0 ? (
                  <option value="">{marketsLoading ? "Loading markets…" : "No market available"}</option>
                ) : null}
                {regionMarkets.map((market) => (
                  <option key={market.id} value={market.id}>{market.label}</option>
                ))}
              </select>
            </label>
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
              <span>Skill, route, shopping, and change filters are saved automatically.</span>
              <button onClick={resetPersonalization} type="button">Reset preferences</button>
            </div>
          </div>
        </details>
      </header>

      <div className={recipeListView === "changes" ? "workspace workspace-changes" : "workspace"} id="top">
        <aside className="profession-rail" aria-label="Profession and recipe selection">
          <div className="profession-select">
            <span className="profession-icon" aria-hidden="true">LW</span>
            <strong>{profession.name}</strong>
          </div>

          {recipeListView === "guide" || recipeListView === "changes" ? (
            <div className="guide-skill-control">
              <div className="rail-label-row">
                <span>Current skill</span>
                <span>
                  {recipeListView === "guide" ? currentGuideSkill : skill} / {recipeListView === "guide" ? guideTargetSkill : MAX_PROFESSION_SKILL}
                </span>
              </div>
              <input
                aria-label={recipeListView === "guide" ? "Current leveling skill" : "Current skill for changed recipes"}
                max={recipeListView === "guide" ? guideTargetSkill : MAX_PROFESSION_SKILL}
                min={recipeListView === "guide" ? guideStartSkill : MIN_PROFESSION_SKILL}
                onChange={(event) => setSkill(Number(event.target.value))}
                step={1}
                type="range"
                value={recipeListView === "guide" ? currentGuideSkill : skill}
              />
            </div>
          ) : recipeListView === "recipes" ? (
            <div className="rail-skill">
              <div className="rail-label-row"><span>Calculator skill</span><span>{skill} / {MAX_PROFESSION_SKILL}</span></div>
              <input
                aria-label="Current profession skill"
                max={MAX_PROFESSION_SKILL}
                min={MIN_PROFESSION_SKILL}
                onChange={(event) => setSkill(Number(event.target.value))}
                step={1}
                type="range"
                value={skill}
              />
              <div className="skill-stepper">
                <button aria-label="Decrease skill" onClick={() => nudgeSkill(-1)} type="button">−</button>
                <strong>{skill}</strong>
                <button aria-label="Increase skill" onClick={() => nudgeSkill(1)} type="button">+</button>
              </div>
            </div>
          ) : null}

          <div className="rail-tabs" role="tablist" aria-label="Recipe views">
            <button aria-selected={recipeListView === "guide"} className={recipeListView === "guide" ? "active" : ""} onClick={() => setRecipeListView("guide")} role="tab" type="button">Leveling guide</button>
            <button aria-selected={recipeListView === "recipes"} className={recipeListView === "recipes" ? "active" : ""} onClick={() => setRecipeListView("recipes")} role="tab" type="button">All recipes</button>
            <button aria-selected={recipeListView === "changes"} className={recipeListView === "changes" ? "active" : ""} onClick={() => setRecipeListView("changes")} role="tab" type="button">Forever Changes</button>
          </div>

          <div className="recipe-list-summary">
            <span>
              {recipeListView === "guide"
                ? routeLoading && routeResponse === undefined
                  ? "Optimizing route…"
                  : `${guideRows.length} ${guideRows.length === 1 ? "guide step" : "guide steps"}`
                : recipeListView === "recipes"
                  ? `${filteredRecipes.length} ${filteredRecipes.length === 1 ? "recipe" : "recipes"}`
                  : changesLoading
                    ? "Loading comparison…"
                    : `${recipeChanges.filter(({ changeType }) => changeType !== "UNCHANGED").length} changed recipes`}
            </span>
            {search ? <button onClick={() => setSearch("")} type="button">Clear search</button> : null}
          </div>

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
                  <button onClick={() => setWorkspaceView("planner")} type="button">Open planner</button>
                </div>
              ) : null}
              {!routeLoading && routeError === undefined && guideRows.length === 0 ? (
                <div className="guide-message">
                  <strong>{search ? "No guide steps match" : "No route steps yet"}</strong>
                  <small>{search ? `Clear “${search}” to see the complete route.` : "Open the planner to generate a leveling route."}</small>
                </div>
              ) : null}
              {routeResponse?.result.status === "blocked" && search.length === 0 ? (
                <div className="guide-blocked">
                  Route stops at skill {routeResponse.result.blockedAtSkill}. Open the planner to review the missing coverage.
                </div>
              ) : null}
              {guideRows.map(({ alternatives, recipe: guideRecipe, segment }, index) => {
                const active =
                  guideRecipe.id === recipe.id &&
                  skill >= segment.startSkill &&
                  skill < segment.endSkill;
                return (
                  <div
                    className="guide-entry"
                    data-guide-index={index}
                    key={`${segment.recipeId}-${segment.startSkill}`}
                  >
                    <div className="guide-range-divider">
                      <span>{segment.startSkill} – {segment.endSkill}</span>
                    </div>
                    <button
                      aria-current={active ? "step" : undefined}
                      className={active ? "guide-step active" : "guide-step"}
                      onClick={() => openRouteRecipe(segment.recipeId)}
                      type="button"
                    >
                      <span className="guide-step-number">{index + 1}</span>
                      <span className="guide-step-title">
                        <ItemIcon className="guide-item-icon" gameItemId={guideRecipe.outputs[0]?.gameItemId} name={guideRecipe.name} />
                        <span>
                          <strong>{guideRecipe.name}</strong>
                          <small className={`guide-source source-${guideRecipe.acquisition}`}>
                            {acquisitionLabel(guideRecipe)}
                          </small>
                          {getRecipeChangeType(guideRecipe) ? (
                            <RecipeChangeBadge changeType={getRecipeChangeType(guideRecipe)!} />
                          ) : null}
                        </span>
                      </span>
                    </button>
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
                                <span>{alternativeRecipe.name}</span>
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
              empty={<p className="empty-recipes">No recipes match “{search}”.</p>}
              getKey={({ id }) => id}
              items={filteredRecipes}
              renderItem={(candidate, index) => (
                <div className="recipe-group">
                  <button aria-current={candidate.id === recipe.id ? "true" : undefined} className={candidate.id === recipe.id ? "recipe active" : "recipe"} onClick={() => selectRecipe(candidate)} type="button">
                    <span className={`recipe-stripe stripe-${index}`} aria-hidden="true" />
                    <ItemIcon className={`item-icon item-${index}`} gameItemId={candidate.outputs[0]?.gameItemId} name={candidate.name} />
                    <span className="recipe-copy"><strong>{candidate.name}</strong><small>{candidate.reagents.length} reagents · skill {candidate.thresholds.orange}–{candidate.thresholds.gray}</small>{getRecipeChangeType(candidate) ? <RecipeChangeBadge changeType={getRecipeChangeType(candidate)!} /> : null}</span>
                    <span className={`recipe-level ${getRecipeDifficulty(skill, candidate.thresholds)}`}>
                      {candidate.thresholds.orange}
                    </span>
                  </button>
                </div>
              )}
              resetKey={search}
              rowHeight={RECIPE_ROW_HEIGHT}
              selectedIndex={selectedRecipeIndex}
            />
          ) : null}

          {recipeListView !== "changes" ? (
            <div className="rail-footer">
              {recipeListView === "guide" && routeResponse ? (
                <><span>~{Math.ceil(routeResponse.result.totals.expectedCrafts).toLocaleString()} crafts</span><strong>{routeResponse.result.segments.length} steps</strong></>
              ) : (
                <><span>Forever build</span><strong>{profession.build}</strong></>
              )}
            </div>
          ) : null}
        </aside>

        <main className="main-workspace">
          {recipeListView === "changes" ? null : (
            <nav className="workspace-nav" aria-label="Workspace views">
              <button className={workspaceView === "calculator" ? "active" : ""} onClick={() => setWorkspaceView("calculator")} type="button">Recipe calculator</button>
              <button className={workspaceView === "planner" ? "active" : ""} onClick={() => setWorkspaceView("planner")} type="button">Leveling route</button>
            </nav>
          )}

          {recipeListView === "changes" ? (
            <ForeverChanges
              changes={recipeChanges}
              currentSkill={skill}
              error={changesError}
              filters={changeFilters}
              loading={changesLoading}
              onFiltersChange={setChangeFilters}
              onRetry={() => setChangesReload((value) => value + 1)}
              search={search}
              summary={changeSummary}
            />
          ) : workspaceView === "calculator" ? (
            <>
              <section className="recipe-hero" aria-labelledby="recipe-title">
                <div className="hero-title-row">
                  <ItemIcon className="hero-item-icon" eager gameItemId={recipe.outputs[0]?.gameItemId} name={recipe.name} />
                  <div><div className="breadcrumb">{profession.name}</div><h1 id="recipe-title">{recipe.name}</h1></div>
                </div>
                <div className="hero-actions">
                  <span
                    className={`quality-chip quality-${recipeQuality.level}`}
                    title={recipeQuality.explanation}
                  >
                    {recipeQuality.label} data
                  </span>
                  <span className={`difficulty ${calculation.difficulty}`}><i aria-hidden="true" />{calculation.difficulty}</span>
                  <button onClick={() => setWorkspaceView("planner")} type="button">Use in route</button>
                </div>
              </section>

              {recipeIsAboveCurrentSkill ? (
                <div className="skill-requirement-warning" role="status">
                  <span aria-hidden="true">!</span>
                  <div>
                    <strong>Not available at your current skill</strong>
                    <p>
                      {recipe.name} requires {profession.name} {recipeRequiredSkill}. Your
                      current skill is {skill}.
                    </p>
                  </div>
                </div>
              ) : null}

              <section className="calculator-card" aria-labelledby="calculator-title">
                <div className="section-title-row">
                  <h2 id="calculator-title">Expected skill-up</h2>
                  <div className="range-control"><span>Skill</span><button aria-label="Decrease skill" onClick={() => nudgeSkill(-1)} type="button">−</button><strong>{skill}</strong><button aria-label="Increase skill" onClick={() => nudgeSkill(1)} type="button">+</button></div>
                </div>
                <div className="calculator-grid">
                  <SkillChart recipe={recipe} skill={skill} />
                  <div className="outcome-panel">
                    <div className="outcome-feature"><span>Skill-up chance</span><strong>{Math.round(calculation.probability * 100)}<small>%</small></strong><p>per craft at skill {skill}</p></div>
                    <div className="outcome-row"><span>Expected attempts</span><strong>{formatNumber(calculation.expectedCrafts)}</strong></div>
                    <div className="outcome-row"><span>Difficulty</span><strong className={calculation.difficulty}>{calculation.difficulty}</strong></div>
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
                  <div><h2 id="materials-title">Materials required</h2><small className="section-subtitle">For {formatNumber(calculation.expectedCrafts)} attempts</small></div>
                  <span className="price-mode">Market prices</span>
                </div>
                <div className="materials-table" role="table" aria-label="Required materials">
                  <div className="materials-header" role="row"><span>Name</span><span>Amount</span><span>Source</span><span>Estimated cost</span></div>
                  {recipe.reagents.map((reagent, index) => {
                    const observation = reagent.gameItemId === undefined ? undefined : pricing.byItem.get(reagent.gameItemId);
                    const price = unitPrice(observation);
                    const expectedQuantity = getExpectedReagentQuantity(reagent.quantity, calculation.probability);
                    return (
                      <div className="material-row" key={reagent.itemId} role="row">
                        <span className="material-name"><ItemIcon className={`item-icon reagent-${index}`} gameItemId={reagent.gameItemId} name={reagent.name} /><span><strong>{reagent.name}</strong><small>Item {reagent.gameItemId ?? "—"}</small></span></span>
                        <strong>{formatNumber(expectedQuantity)}</strong>
                        <span className="source-pill"><i aria-hidden="true" /> Auction house</span>
                        <strong className="material-cost">{price === undefined ? "Unavailable" : formatCopper(price * expectedQuantity)}</strong>
                      </div>
                    );
                  })}
                </div>
                {priceError ? <p className="price-status">{priceError}</p> : null}
                {pricing.attribution ? <a className="attribution" href={pricing.attribution.url} rel="noreferrer" target="_blank">{pricing.attribution.text}</a> : null}
              </section>

              <DataQualityNotice build={profession.build} recipe={recipe} />
            </>
          ) : (
            <section className="route-planner" aria-labelledby="route-title">
              <div className="route-intro">
                <div><span className="section-kicker">Leveling planner</span><h1 id="route-title">Build the best route</h1><p>Compare every known recipe at each skill and optimize for cost, craft count, or material use.</p></div>
                <span className="planner-badge">{knownRecipeIds.length} known recipes</span>
              </div>
              {nonAuthoritativeRecipeCount > 0 ? (
                <section className="planner-quality-note" aria-label="Route data quality warning">
                  <span className="quality-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>Route inputs are not yet authoritative</strong>
                    <p>{nonAuthoritativeRecipeCount} of {profession.recipes.length} available recipes use unverified or fallback data. Route math is deterministic, but its result is only as reliable as those inputs.</p>
                  </div>
                </section>
              ) : null}
              <form className="route-form" onSubmit={submitRoute}>
                <div className="route-field-grid">
                  <label><span>Starting skill</span><input min="0" onChange={(event) => setRouteStartSkill(Number(event.target.value))} type="number" value={routeStartSkill} /></label>
                  <label><span>Target skill</span><input min={routeStartSkill} onChange={(event) => setRouteTargetSkill(Number(event.target.value))} type="number" value={routeTargetSkill} /></label>
                  <label><span>Optimize for</span><select onChange={(event) => setRouteObjective(event.target.value as RouteObjective)} value={routeObjective}><option value="cost">Expected cost</option><option value="crafts">Expected crafts</option><option value="materials">Material units</option></select></label>
                </div>
                <fieldset className="known-recipes">
                  <legend>Recipes you know</legend>
                  <div className="known-recipes-toolbar">
                    <label className="known-recipes-search">
                      <span className="search-icon" aria-hidden="true">⌕</span>
                      <input
                        aria-label="Filter known recipes"
                        onChange={(event) => setKnownRecipeSearch(event.target.value)}
                        placeholder="Filter by recipe name or spell ID…"
                        type="search"
                        value={knownRecipeSearch}
                      />
                    </label>
                    <div className="known-recipes-count" aria-live="polite">
                      <strong>{knownRecipeIds.length}</strong>
                      <span>of {profession.recipes.length} selected</span>
                    </div>
                  </div>
                  <div className="known-recipes-actions">
                    <span>{filteredKnownRecipes.length} matching recipes</span>
                    <button
                      disabled={selectedKnownResults === filteredKnownRecipes.length}
                      onClick={() => setKnownResults(true)}
                      type="button"
                    >
                      Select results
                    </button>
                    <button
                      disabled={selectedKnownResults === 0}
                      onClick={() => setKnownResults(false)}
                      type="button"
                    >
                      Clear results
                    </button>
                  </div>
                  <VirtualList
                    ariaLabel="Known recipe selection"
                    className="known-recipes-list"
                    empty={<p className="empty-recipes">No recipes match “{knownRecipeSearch}”.</p>}
                    getKey={({ id }) => id}
                    items={filteredKnownRecipes}
                    renderItem={(candidate) => (
                      <label className="known-recipe-row">
                        <input
                          checked={knownRecipeSet.has(candidate.id)}
                          onChange={() => toggleKnownRecipe(candidate.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{candidate.name}</strong>
                          <small>{candidate.id} · skill {candidate.thresholds.orange}–{candidate.thresholds.gray}</small>
                        </span>
                      </label>
                    )}
                    resetKey={knownRecipeSearch}
                    rowHeight={KNOWN_RECIPE_ROW_HEIGHT}
                  />
                  <label className="trainer-option"><input checked={trainerOnly} onChange={(event) => setTrainerOnly(event.target.checked)} type="checkbox" /><span>Trainer recipes only</span></label>
                  <small className="known-recipes-note">Acquisition sources are not yet verified for Forever.</small>
                </fieldset>
                <button className="primary-action" disabled={routeLoading} type="submit">{routeLoading ? "Calculating…" : "Build my route"}</button>
              </form>

              {routeError ? <p className="route-error">{routeError}</p> : null}
              {routeResponse ? (
                <div className="route-result" aria-live="polite">
                  <div className="route-summary"><article><span>Expected crafts</span><strong>{formatNumber(routeResponse.result.totals.expectedCrafts)}</strong></article><article><span>Material units</span><strong>{formatNumber(routeResponse.result.totals.expectedMaterials)}</strong></article><article><span>Expected cost</span><strong>{routeResponse.result.totals.expectedCostCopper === undefined ? "—" : formatCopper(routeResponse.result.totals.expectedCostCopper)}</strong></article></div>
                  {routeResponse.result.status === "blocked" ? <p className="route-warning">Route blocked at skill {routeResponse.result.blockedAtSkill}: {routeResponse.result.reason === "missing-price-data" ? "one or more required prices are unavailable." : "no eligible recipe covers this skill."}</p> : null}
                  <ol className="route-segments">{routeResponse.result.segments.map((segment) => <li key={`${segment.recipeId}-${segment.startSkill}`}><span className="route-range">{segment.startSkill} → {segment.endSkill}</span><div><strong>{segment.recipeName}</strong><small>{formatNumber(segment.expectedCrafts)} crafts · {formatNumber(segment.expectedMaterials)} materials</small></div><button onClick={() => openRouteRecipe(segment.recipeId)} type="button">Open recipe</button></li>)}</ol>
                  {routeResponse.attribution ? <a className="attribution" href={routeResponse.attribution.url} rel="noreferrer" target="_blank">{routeResponse.attribution.text}</a> : null}

                  <section className="shopping-list" aria-labelledby="shopping-title">
                    <div className="shopping-heading"><div><span className="section-kicker">Route supplies</span><h2 id="shopping-title">Shopping list</h2><p>Aggregate the route and compare buying reagents with crafting known intermediates.</p></div><label><span>Strategy</span><select onChange={(event) => { setShoppingStrategy(event.target.value as ShoppingStrategy); setShoppingResponse(undefined); }} value={shoppingStrategy}><option value="cheapest">Cheapest</option><option value="buy-only">Buy only</option><option value="craft-first">Craft first</option></select></label></div>
                    <button className="secondary-action" disabled={shoppingLoading || routeResponse.result.segments.length === 0} onClick={buildShoppingList} type="button">{shoppingLoading ? "Building…" : "Build shopping list"}</button>
                    {shoppingError ? <p className="route-error">{shoppingError}</p> : null}
                    {shoppingResponse ? (
                      <div className="shopping-result" aria-live="polite">
                        <div className="shopping-total"><span>{shoppingResponse.plan.status === "complete" ? "Expected total" : "Known subtotal"}</span><strong>{formatCopper(shoppingResponse.plan.expectedCostCopper ?? shoppingResponse.plan.knownSubtotalCopper)}</strong></div>
                        <div className="shopping-columns">
                          <div><h3>Buy</h3>{shoppingResponse.plan.purchases.length === 0 ? <p className="empty-list">Nothing to buy.</p> : <ul>{shoppingResponse.plan.purchases.map((purchase) => <li key={purchase.itemId}><span>{purchase.itemName}<small>{formatCopper(purchase.unitPriceCopper)} each</small></span><strong>{formatNumber(purchase.quantity)} · {formatCopper(purchase.expectedCostCopper)}</strong></li>)}</ul>}</div>
                          <div><h3>Craft intermediates</h3>{shoppingResponse.plan.crafts.length === 0 ? <p className="empty-list">No intermediate crafts chosen.</p> : <ul>{shoppingResponse.plan.crafts.map((craft) => <li key={`${craft.recipeId}-${craft.outputItemId}`}><span>{craft.recipeName}<small>{craft.outputItemName}</small></span><strong>{formatNumber(craft.expectedCrafts)} crafts</strong></li>)}</ul>}</div>
                        </div>
                        {shoppingResponse.plan.unresolved.length > 0 ? <div className="shopping-warning"><strong>Needs attention</strong><ul>{shoppingResponse.plan.unresolved.map((item) => <li key={`${item.itemId}-${item.reason}`}>{item.itemName}: {formatNumber(item.quantity)} ({item.reason.replaceAll("-", " ")})</li>)}</ul></div> : null}
                        {shoppingResponse.plan.cycles.length > 0 ? <p className="shopping-warning">Recursive crafting cycle blocked: {shoppingResponse.plan.cycles.map((cycle) => cycle.join(" → ")).join("; ")}</p> : null}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : (
                <div className="planner-empty"><span aria-hidden="true">⌁</span><h2>Your route will appear here</h2><p>Choose your range and goal, then build a route to compare the best recipes skill by skill.</p></div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
