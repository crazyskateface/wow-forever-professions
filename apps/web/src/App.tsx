import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  auctionPricesResponseSchema,
  professionFixtureSchema,
  routeOptimizationResponseSchema,
  shoppingListResponseSchema,
  type AuctionPriceObservation,
  type ProfessionFixture,
  type Recipe,
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

type WorkspaceView = "calculator" | "planner";
type RecipeListView = "guide" | "recipes";
type CatalogState = "loading" | "ready" | "fixture" | "fallback";

const MIN_PROFESSION_SKILL = 0;
const MAX_PROFESSION_SKILL = 300;
const RECIPE_ROW_HEIGHT = 78;
const GUIDE_ROW_HEIGHT = 114;
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

function catalogHeadline(state: CatalogState, recipeCount: number): string {
  switch (state) {
    case "loading":
      return "Loading recipe catalog…";
    case "fixture":
      return "Illustrative fixture catalog";
    case "fallback":
      return "Using fallback catalog";
    case "ready":
      return `${recipeCount} recipes ready`;
  }
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

function initials(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
        <div>
          <span className="section-kicker">Data quality</span>
          <h2 id="data-quality-title">{assessment.label}</h2>
        </div>
      </div>
      <dl>
        <div><dt>Source</dt><dd>{recipe.provenance.sourceLabel}</dd></div>
        <div><dt>Verification</dt><dd>{recipe.provenance.verification.status}</dd></div>
        <div><dt>Build</dt><dd>{build}</dd></div>
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
        <div>
          <span>Skill-up curve</span>
          <strong>Success rate by skill</strong>
        </div>
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
  const [profession, setProfession] = useState<ProfessionFixture>(leatherworkingFixture);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogReload, setCatalogReload] = useState(0);
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
  const [skill, setSkill] = useState(MIN_PROFESSION_SKILL);
  const [prices, setPrices] = useState<readonly AuctionPriceObservation[]>([]);
  const [priceError, setPriceError] = useState<string>();
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("calculator");
  const [recipeListView, setRecipeListView] = useState<RecipeListView>("guide");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [knownRecipeSearch, setKnownRecipeSearch] = useState("");
  const [routeStartSkill, setRouteStartSkill] = useState(150);
  const [routeTargetSkill, setRouteTargetSkill] = useState(180);
  const [routeObjective, setRouteObjective] = useState<RouteObjective>("cost");
  const [knownRecipeIds, setKnownRecipeIds] = useState<readonly string[]>(
    leatherworkingFixture.recipes.map(({ id }) => id),
  );
  const [trainerOnly, setTrainerOnly] = useState(false);
  const [routeResponse, setRouteResponse] = useState<RouteOptimizationResponse>();
  const [routeError, setRouteError] = useState<string>();
  const [routeLoading, setRouteLoading] = useState(false);
  const [shoppingStrategy, setShoppingStrategy] = useState<ShoppingStrategy>("cheapest");
  const [shoppingResponse, setShoppingResponse] = useState<ShoppingListResponse>();
  const [shoppingError, setShoppingError] = useState<string>();
  const [shoppingLoading, setShoppingLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogState("loading");
    setCatalogError(undefined);
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
        setCatalogError(
          usesFixtureCatalog
            ? "The API is serving the illustrative development fixture."
            : undefined,
        );
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
        setCatalogError("The API catalog is unavailable, so the illustrative fixture is shown.");
        writeRecipeUrl(fallbackRecipe.id, "replace");
      });
    return () => controller.abort();
  }, [catalogReload]);

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
    document.title = `${recipe.name} · Forever Professions`;
  }, [recipe.name]);

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
    fetch(
      `/api/auction/prices?marketId=forever.pvp.horde.us&itemIds=${gameItemIds.join(",")}`,
      { signal: controller.signal },
    )
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
  }, [recipe]);

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
    return [...matches].sort((left, right) =>
      recipeListView === "guide"
        ? left.thresholds.orange - right.thresholds.orange ||
          left.name.localeCompare(right.name)
        : left.name.localeCompare(right.name),
    );
  }, [profession.recipes, recipeListView, search]);
  const selectedRecipeIndex = filteredRecipes.findIndex(({ id }) => id === recipe.id);
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
    setRouteLoading(true);
    setRouteError(undefined);
    setShoppingResponse(undefined);
    setShoppingError(undefined);
    try {
      const response = await fetch("/api/routes/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          professionId: profession.id,
          marketId: "forever.pvp.horde.us",
          startSkill: routeStartSkill,
          targetSkill: routeTargetSkill,
          objective: routeObjective,
          constraints: { knownRecipeIds, trainerOnly },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRouteResponse(routeOptimizationResponseSchema.parse(await response.json()));
    } catch {
      setRouteResponse(undefined);
      setRouteError("A route could not be calculated right now. Check the API connection and try again.");
    } finally {
      setRouteLoading(false);
    }
  }

  async function buildShoppingList(): Promise<void> {
    if (routeResponse === undefined || routeResponse.result.segments.length === 0) return;
    setShoppingLoading(true);
    setShoppingError(undefined);
    try {
      const response = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          professionId: profession.id,
          marketId: "forever.pvp.horde.us",
          route: routeResponse.result.segments.map(
            ({ recipeId: id, expectedCrafts }) => ({ recipeId: id, expectedCrafts }),
          ),
          strategy: shoppingStrategy,
          knownRecipeIds,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setShoppingResponse(shoppingListResponseSchema.parse(await response.json()));
    } catch {
      setShoppingResponse(undefined);
      setShoppingError("A shopping list could not be built right now.");
    } finally {
      setShoppingLoading(false);
    }
  }

  function openRouteRecipe(nextRecipeId: string, routeSkill: number): void {
    const nextRecipe = profession.recipes.find(({ id }) => id === nextRecipeId);
    if (nextRecipe === undefined) return;
    setRecipeId(nextRecipe.id);
    setSkill(Math.min(MAX_PROFESSION_SKILL, Math.max(MIN_PROFESSION_SKILL, routeSkill)));
    setWorkspaceView("calculator");
    writeRecipeUrl(nextRecipe.id, "push");
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
          <input aria-label="Search recipes" onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${profession.recipes.length} recipes…`} ref={searchRef} type="search" value={search} />
          <kbd>shift + f</kbd>
        </label>
        <button className="market-picker" type="button">
          <span className="status-orb" aria-hidden="true" />
          <span><small>Market</small>Forever · PvP Horde US</span>
          <span aria-hidden="true">⌄</span>
        </button>
      </header>

      <div className="workspace" id="top">
        <aside className="profession-rail" aria-label="Profession and recipe selection">
          <div className="profession-select">
            <span className="profession-icon" aria-hidden="true">LW</span>
            <span><small>Profession</small>{profession.name}</span>
            <span aria-hidden="true">⌄</span>
          </div>

          <div
            aria-live="polite"
            className={`catalog-state catalog-${catalogState}`}
          >
            <span className="catalog-state-dot" aria-hidden="true" />
            <span>
              <strong>{catalogHeadline(catalogState, profession.recipes.length)}</strong>
              <small>
                {catalogState === "fallback" || catalogState === "fixture"
                  ? catalogError
                  : `Forever build ${profession.build}`}
              </small>
            </span>
            {catalogState === "fallback" ? (
              <button onClick={() => setCatalogReload((value) => value + 1)} type="button">
                Retry
              </button>
            ) : null}
          </div>

          <div className="rail-skill">
            <div className="rail-label-row"><span>Current skill</span><span>{skill} / {MAX_PROFESSION_SKILL}</span></div>
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

          <div className="rail-tabs" role="tablist" aria-label="Recipe views">
            <button aria-selected={recipeListView === "guide"} className={recipeListView === "guide" ? "active" : ""} onClick={() => setRecipeListView("guide")} role="tab" type="button">Leveling guide</button>
            <button aria-selected={recipeListView === "recipes"} className={recipeListView === "recipes" ? "active" : ""} onClick={() => setRecipeListView("recipes")} role="tab" type="button">All recipes</button>
          </div>

          <div className="recipe-list-summary">
            <span>{filteredRecipes.length} {filteredRecipes.length === 1 ? "result" : "results"}</span>
            {search ? <button onClick={() => setSearch("")} type="button">Clear search</button> : null}
          </div>

          <VirtualList
            ariaLabel="Recipes"
            className="recipe-list"
            empty={<p className="empty-recipes">No recipes match “{search}”.</p>}
            getKey={({ id }) => id}
            items={filteredRecipes}
            renderItem={(candidate, index) => (
              <div className="recipe-group">
                {recipeListView === "guide" ? <div className="level-band"><span>Skill {candidate.thresholds.orange}</span><span aria-hidden="true">→</span><span>{candidate.thresholds.gray}</span></div> : null}
                <button aria-current={candidate.id === recipe.id ? "true" : undefined} className={candidate.id === recipe.id ? "recipe active" : "recipe"} onClick={() => selectRecipe(candidate)} type="button">
                  <span className={`recipe-stripe stripe-${index}`} aria-hidden="true" />
                  <span className={`item-icon item-${index}`} aria-hidden="true">{initials(candidate.name)}</span>
                  <span className="recipe-copy"><strong>{candidate.name}</strong><small>{recipeListView === "guide" ? `${Math.max(1, candidate.thresholds.gray - candidate.thresholds.orange)} skill range` : `${candidate.reagents.length} reagents`}</small></span>
                  <span className={`recipe-level ${getRecipeDifficulty(skill, candidate.thresholds)}`}>
                    {candidate.thresholds.orange}
                  </span>
                </button>
              </div>
            )}
            resetKey={`${recipeListView}:${search}`}
            rowHeight={recipeListView === "guide" ? GUIDE_ROW_HEIGHT : RECIPE_ROW_HEIGHT}
            selectedIndex={selectedRecipeIndex}
          />

          <div className="rail-footer"><span>Forever build</span><strong>{profession.build}</strong></div>
        </aside>

        <main className="main-workspace">
          <nav className="workspace-nav" aria-label="Workspace views">
            <button className={workspaceView === "calculator" ? "active" : ""} onClick={() => setWorkspaceView("calculator")} type="button">Recipe calculator</button>
            <button className={workspaceView === "planner" ? "active" : ""} onClick={() => setWorkspaceView("planner")} type="button">Leveling route</button>
          </nav>

          {workspaceView === "calculator" ? (
            <>
              <section className="recipe-hero" aria-labelledby="recipe-title">
                <div className="hero-title-row">
                  <span className="hero-item-icon" aria-hidden="true">{initials(recipe.name)}</span>
                  <div><div className="breadcrumb">{profession.name} <span>/</span> Recipe</div><h1 id="recipe-title">{recipe.name}</h1></div>
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

              <section className="calculator-card" aria-labelledby="calculator-title">
                <div className="section-title-row">
                  <div><span className="section-kicker">Interactive calculator</span><h2 id="calculator-title">Expected skill-up</h2></div>
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
                  <div><span className="section-kicker">For {formatNumber(calculation.expectedCrafts)} attempts</span><h2 id="materials-title">Materials required</h2></div>
                  <span className="price-mode">Latest prices</span>
                </div>
                <div className="materials-table" role="table" aria-label="Required materials">
                  <div className="materials-header" role="row"><span>Name</span><span>Amount</span><span>Source</span><span>Estimated cost</span></div>
                  {recipe.reagents.map((reagent, index) => {
                    const observation = reagent.gameItemId === undefined ? undefined : pricing.byItem.get(reagent.gameItemId);
                    const price = unitPrice(observation);
                    const expectedQuantity = getExpectedReagentQuantity(reagent.quantity, calculation.probability);
                    return (
                      <div className="material-row" key={reagent.itemId} role="row">
                        <span className="material-name"><span className={`item-icon reagent-${index}`} aria-hidden="true">{initials(reagent.name)}</span><span><strong>{reagent.name}</strong><small>Item {reagent.gameItemId ?? "—"}</small></span></span>
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
                  <ol className="route-segments">{routeResponse.result.segments.map((segment) => <li key={`${segment.recipeId}-${segment.startSkill}`}><span className="route-range">{segment.startSkill} → {segment.endSkill}</span><div><strong>{segment.recipeName}</strong><small>{formatNumber(segment.expectedCrafts)} crafts · {formatNumber(segment.expectedMaterials)} materials</small></div><button onClick={() => openRouteRecipe(segment.recipeId, segment.startSkill)} type="button">Open recipe</button></li>)}</ol>
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
