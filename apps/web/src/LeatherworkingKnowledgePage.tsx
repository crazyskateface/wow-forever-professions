import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  professionFixtureSchema,
  recipeChangesSummaryResponseSchema,
  type ProfessionFixture,
  type Recipe,
  type RecipeAcquisition,
  type RecipeChangeCounts,
  type RecipeComparisonDescriptor,
  type RecipeSourceKind,
} from "@forever-professions/contracts";
import { SiteFooter } from "./SiteFooter.js";
import { ProfessionIcon } from "./ProfessionIcon.js";
import {
  LEATHERWORKING_KNOWLEDGE_PAGES,
  isIllustrativeKnowledgeCatalog,
  plannerRecipeHref,
  primaryRecipesForAcquisition,
  supplementalRecipesForSourceKind,
  summarizeKnowledgeCatalog,
  type LeatherworkingKnowledgePageId,
} from "./leatherworking-knowledge.js";

const GUIDE_PAGE_IDS = [
  "overview",
  "changes",
  "trainers",
  "merchants-favor",
  "camping",
  "specializations",
] as const satisfies readonly LeatherworkingKnowledgePageId[];

const SOURCE_PAGE_IDS = [
  "source-vendor",
  "source-quest",
  "source-reputation",
  "source-drop",
] as const satisfies readonly LeatherworkingKnowledgePageId[];

interface SourcePageConfig {
  readonly acquisition: RecipeAcquisition;
  readonly noun: string;
  readonly sourceKind?: RecipeSourceKind;
}

const SOURCE_PAGE_CONFIG: Partial<Record<LeatherworkingKnowledgePageId, SourcePageConfig>> = {
  "source-vendor": { acquisition: "vendor", noun: "vendor", sourceKind: "vendor" },
  "source-quest": { acquisition: "quest", noun: "quest", sourceKind: "quest" },
  "source-reputation": { acquisition: "reputation", noun: "reputation" },
  "source-drop": { acquisition: "drop", noun: "drop", sourceKind: "drop" },
};

function sourceOriginLabel(origin: Recipe["sourceDataOrigin"]): string {
  if (origin === undefined) return "Not recorded";
  if (origin === "classic-borrowed") return "Classic fallback";
  return origin[0]!.toUpperCase() + origin.slice(1);
}

function acquisitionLabel(acquisition: RecipeAcquisition): string {
  if (acquisition === "automatic") return "Automatic";
  if (acquisition === "unknown") return "Unknown";
  return acquisition[0]!.toUpperCase() + acquisition.slice(1);
}

function KnowledgeSection({
  children,
  id,
  title,
}: {
  readonly children: ReactNode;
  readonly id?: string;
  readonly title: string;
}) {
  return (
    <section className="knowledge-section" id={id}>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function EvidenceStatus({ profession }: { readonly profession: ProfessionFixture }) {
  const summary = summarizeKnowledgeCatalog(profession);
  return (
    <aside className="knowledge-build-status" aria-label="Knowledge page data scope">
      <div>
        <span>Current catalog scope</span>
        <strong>Forever build {profession.build}</strong>
      </div>
      <dl>
        <div><dt>Recipes</dt><dd>{summary.totalRecipes}</dd></div>
        <div><dt>Unverified</dt><dd>{summary.unverifiedRecipes}</dd></div>
        <div><dt>Known acquisition</dt><dd>{summary.knownAcquisitionRecipes}</dd></div>
      </dl>
    </aside>
  );
}

function RecipeEvidenceList({
  empty,
  recipes,
}: {
  readonly empty: string;
  readonly recipes: readonly Recipe[];
}) {
  if (recipes.length === 0) return <p className="knowledge-empty">{empty}</p>;
  return (
    <ol className="knowledge-recipe-list">
      {recipes.map((recipe) => (
        <li id={recipe.id} key={recipe.id}>
          <div className="knowledge-recipe-heading">
            <a href={plannerRecipeHref(recipe.id)}>{recipe.name}</a>
            <span>{recipe.id}</span>
          </div>
          <dl>
            <div><dt>Learn at</dt><dd>{recipe.learnSkill ?? "Unknown"}</dd></div>
            <div><dt>Acquisition</dt><dd>{acquisitionLabel(recipe.acquisition)}</dd></div>
            <div><dt>Availability</dt><dd>{recipe.availability}</dd></div>
            <div><dt>Evidence origin</dt><dd>{sourceOriginLabel(recipe.sourceDataOrigin)}</dd></div>
            <div><dt>Teaching item</dt><dd>{recipe.teachingItemId == null ? "Not established" : `Item #${recipe.teachingItemId}`}</dd></div>
            <div><dt>Verification</dt><dd>{recipe.provenance.verification.status}</dd></div>
          </dl>
          <p>
            Thresholds: orange {recipe.thresholds.orange}, yellow {recipe.thresholds.yellow},
            green {recipe.thresholds.green}, grey {recipe.thresholds.gray}.
          </p>
        </li>
      ))}
    </ol>
  );
}

function EvidenceGap({
  feature,
}: {
  readonly feature: "Camping" | "Merchant's Favor";
}) {
  return (
    <>
      <div className="knowledge-gap" role="note">
        <strong>Not established for the current Forever build</strong>
        <p>
          The imported catalog has no structured {feature} rule, unlock, modifier, or
          location record. The planner therefore applies no {feature} effect and does
          not present Classic behavior as a Forever fact.
        </p>
      </div>
      <KnowledgeSection title="What evidence is still needed">
        <ul>
          <li>the exact Forever build where the interaction was observed;</li>
          <li>an in-game identifier, tooltip, quest, NPC, or system message;</li>
          <li>the affected Leatherworking recipes or skill ranges; and</li>
          <li>repeatable steps or a supported published source.</li>
        </ul>
        <p>
          Submit a correction through the <a href="/contact">project contact page</a>.
          Until that evidence is reviewed, this page remains an explicit gap instead
          of a copied Classic guide.
        </p>
      </KnowledgeSection>
    </>
  );
}

function ChangeSummary({
  comparison,
  error,
  loading,
  summary,
}: {
  readonly comparison: RecipeComparisonDescriptor | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly summary: RecipeChangeCounts | undefined;
}) {
  if (loading) return <p className="knowledge-loading" role="status">Loading stored comparison…</p>;
  if (error || summary === undefined || comparison === undefined) {
    return <p className="knowledge-empty">{error ?? "The stored comparison is unavailable."}</p>;
  }
  return (
    <>
      <p className="knowledge-comparison-builds">
        {comparison.baseBuildId} → {comparison.targetBuildId}
      </p>
      <dl className="knowledge-change-grid">
        <div><dt>New</dt><dd>{summary.new}</dd></div>
        <div><dt>Updated</dt><dd>{summary.updated}</dd></div>
        <div><dt>Removed</dt><dd>{summary.removed}</dd></div>
        <div><dt>Unchanged</dt><dd>{summary.unchanged}</dd></div>
      </dl>
    </>
  );
}

export function LeatherworkingKnowledgePage({
  page,
}: {
  readonly page: LeatherworkingKnowledgePageId;
}) {
  const definition = LEATHERWORKING_KNOWLEDGE_PAGES[page];
  const [profession, setProfession] = useState<ProfessionFixture>();
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [comparison, setComparison] = useState<RecipeComparisonDescriptor>();
  const [changeSummary, setChangeSummary] = useState<RecipeChangeCounts>();
  const [comparisonError, setComparisonError] = useState<string>();
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.title = `${definition.title} · Forever Professions`;
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      definition.description,
    );
  }, [definition.description, definition.title]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError(undefined);
    fetch("/api/professions/leatherworking", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const loadedProfession = professionFixtureSchema.parse(await response.json());
        if (isIllustrativeKnowledgeCatalog(loadedProfession)) {
          throw new Error("Illustrative fixture catalog");
        }
        return loadedProfession;
      })
      .then(setProfession)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProfession(undefined);
        setCatalogError(
          "The full Leatherworking catalog is unavailable. This page will not substitute illustrative fixture data for build-scoped facts.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (page !== "overview" && page !== "changes") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ comparison: "classic-forever" });
    setComparisonLoading(true);
    setComparisonError(undefined);
    fetch(`/api/recipe-changes/summary?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return recipeChangesSummaryResponseSchema.parse(await response.json());
      })
      .then((response) => {
        setComparison(response.comparison);
        setChangeSummary(response.summary);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setComparison(undefined);
        setChangeSummary(undefined);
        setComparisonError("The stored Classic Era to Forever comparison is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setComparisonLoading(false);
      });
    return () => controller.abort();
  }, [page, reload]);

  useEffect(() => {
    if (profession === undefined || window.location.hash.length <= 1) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, profession]);

  const catalogSummary = useMemo(
    () => profession === undefined ? undefined : summarizeKnowledgeCatalog(profession),
    [profession],
  );
  const trainerRecipes = useMemo(
    () => profession === undefined ? [] : primaryRecipesForAcquisition(profession, "trainer"),
    [profession],
  );
  const specializationGroups = useMemo(() => {
    const groups = new Map<number, Recipe[]>();
    for (const recipe of profession?.recipes ?? []) {
      if (recipe.specializationSpellId === null) continue;
      const recipes = groups.get(recipe.specializationSpellId) ?? [];
      recipes.push(recipe);
      groups.set(recipe.specializationSpellId, recipes);
    }
    return [...groups.entries()].sort(([left], [right]) => left - right);
  }, [profession]);
  const sourceConfig = SOURCE_PAGE_CONFIG[page];
  const sourceRecipes = useMemo(
    () => profession === undefined || sourceConfig === undefined
      ? []
      : primaryRecipesForAcquisition(profession, sourceConfig.acquisition),
    [profession, sourceConfig],
  );
  const supplementalSourceRecipes = useMemo(
    () => profession === undefined || sourceConfig?.sourceKind === undefined
      ? []
      : supplementalRecipesForSourceKind(
          profession,
          sourceConfig.sourceKind,
          sourceConfig.acquisition,
        ),
    [profession, sourceConfig],
  );

  let content: ReactNode = null;
  if (catalogLoading) {
    content = <p className="knowledge-loading" role="status">Loading the build-scoped catalog…</p>;
  } else if (catalogError || profession === undefined || catalogSummary === undefined) {
    content = (
      <div className="knowledge-gap" role="alert">
        <strong>Catalog unavailable</strong>
        <p>{catalogError ?? "The Leatherworking catalog could not be loaded."}</p>
        <button onClick={() => setReload((value) => value + 1)} type="button">Try again</button>
      </div>
    );
  } else if (page === "overview") {
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <KnowledgeSection title="What this guide can prove">
          <div className="knowledge-stat-grid">
            <article><strong>{catalogSummary.knownLearningRankRecipes}</strong><span>known learning ranks</span></article>
            <article><strong>{catalogSummary.knownAcquisitionRecipes}</strong><span>known acquisition methods</span></article>
            <article><strong>{catalogSummary.sourceEvidenceRecipes}</strong><span>source-kind records</span></article>
            <article><strong>{catalogSummary.teachingItemRecipes}</strong><span>teaching-item records</span></article>
          </div>
          <p>
            Client presence is not treated as proof that a recipe is obtainable. Only
            {` ${catalogSummary.knownAvailabilityRecipes}`} recipes currently have a
            supported availability state, and all {catalogSummary.unverifiedRecipes}
            catalog recipes remain unverified at the complete-record level.
          </p>
        </KnowledgeSection>
        <KnowledgeSection title="What changed in Forever">
          <ChangeSummary
            comparison={comparison}
            error={comparisonError}
            loading={comparisonLoading}
            summary={changeSummary}
          />
          <p>
            The comparison uses stored `(professionId, spellId)` identity and retains
            Unchanged rows so the totals can be reconstructed exactly.
          </p>
          <a className="knowledge-action" href="/?view=changes">Explore Forever Changes</a>
        </KnowledgeSection>
        <KnowledgeSection title="Plan from evidence, not assumptions">
          <p>
            The planner keeps unknown learning ranks, acquisition methods, faction
            rules, locations, and availability visible. Start with the current route,
            then open the recipe evidence panel whenever a step depends on a gap.
          </p>
          <a className="knowledge-action" href="/">Open the leveling planner</a>
        </KnowledgeSection>
      </>
    );
  } else if (page === "changes") {
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <KnowledgeSection title="Stored Classic Era → Forever comparison">
          <ChangeSummary
            comparison={comparison}
            error={comparisonError}
            loading={comparisonLoading}
            summary={changeSummary}
          />
          <p>
            New and Updated describe stored recipe-field differences. Item icons,
            rarity enrichment, and classification metadata do not create gameplay
            recipe changes.
          </p>
          <a className="knowledge-action" href="/?view=changes">Open the comparison browser</a>
        </KnowledgeSection>
        <KnowledgeSection title="Evidence boundary">
          <p>
            A changed client record does not by itself prove in-game availability.
            Use each recipe's provenance and availability fields before treating the
            comparison as a leveling recommendation.
          </p>
        </KnowledgeSection>
      </>
    );
  } else if (page === "trainers") {
    const ranks = [...new Set(trainerRecipes.flatMap(({ learnSkill }) =>
      learnSkill === null ? [] : [learnSkill],
    ))].sort((left, right) => left - right);
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <KnowledgeSection title="Cataloged trainer records">
          <p>
            The catalog currently records {trainerRecipes.length} trainer-taught
            recipes across {ranks.length} recorded learning ranks. These are recipe
            learning requirements, not inferred NPC trainer tiers. Each recipe below
            states whether its source evidence is Forever or a Classic fallback.
          </p>
          <p className="knowledge-rank-line">
            <strong>Recorded ranks:</strong> {ranks.length === 0 ? "None established" : ranks.join(", ")}
          </p>
        </KnowledgeSection>
        <KnowledgeSection title="Trainer locations">
          <div className="knowledge-gap compact" role="note">
            <strong>NPC names and coordinates are not supported yet</strong>
            <p>
              The current catalog records acquisition type but has no build-scoped
              trainer-location table. No Classic location is substituted here.
            </p>
          </div>
        </KnowledgeSection>
        <KnowledgeSection title="Trainer-taught recipes">
          <RecipeEvidenceList
            empty="No trainer-taught recipe acquisition entries are recorded for this build."
            recipes={trainerRecipes}
          />
        </KnowledgeSection>
      </>
    );
  } else if (page === "merchants-favor") {
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <EvidenceGap feature="Merchant's Favor" />
      </>
    );
  } else if (page === "camping") {
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <EvidenceGap feature="Camping" />
      </>
    );
  } else if (page === "specializations") {
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <KnowledgeSection title="Supported specialization gates">
          <p>
            {catalogSummary.specializationRecipes} recipes carry a specialization
            spell requirement across {specializationGroups.length} distinct spell IDs.
            The snapshot does not provide supported display names or unlock locations,
            so this guide keeps the spell IDs explicit.
          </p>
          <div className="knowledge-specialization-list">
            {specializationGroups.map(([spellId, recipes]) => (
              <details key={spellId}>
                <summary><span>Spell #{spellId}</span><strong>{recipes.length} recipes</strong></summary>
                <RecipeEvidenceList empty="No recipes recorded." recipes={recipes} />
              </details>
            ))}
          </div>
        </KnowledgeSection>
        <KnowledgeSection title="What remains unknown">
          <p>
            Specialization names, trainers, respec rules, and quest requirements are
            not inferred from spell IDs. A recipe may be present in client data while
            its actual Forever unlock path remains unverified.
          </p>
        </KnowledgeSection>
      </>
    );
  } else if (sourceConfig !== undefined) {
    content = (
      <>
        <EvidenceStatus profession={profession} />
        <KnowledgeSection title={`Cataloged ${sourceConfig.noun} acquisition`}>
          <p>
            {sourceRecipes.length} recipes currently use {sourceConfig.noun} as their
            primary acquisition method in the catalog. Each record exposes its
            evidence origin; a Classic fallback is not presented as Forever-verified.
            Source locations, NPC names, quest steps, reputation thresholds, and drop
            rates remain unknown unless a recipe record states otherwise.
          </p>
          <RecipeEvidenceList
            empty={`No ${sourceConfig.noun}-acquired recipe entries are recorded for this build.`}
            recipes={sourceRecipes}
          />
        </KnowledgeSection>
        {sourceConfig.sourceKind === undefined ? null : (
          <KnowledgeSection title="Supplemental source-kind evidence">
            <p>
              {supplementalSourceRecipes.length} additional recipes carry a
              {` ${sourceConfig.noun}`} source-kind record without the same supported
              primary acquisition value. Those records stay supplemental and do not
              become route-eligible acquisition facts.
            </p>
            <details className="knowledge-supplemental">
              <summary>Review supplemental records</summary>
              <RecipeEvidenceList
                empty="No supplemental records are present."
                recipes={supplementalSourceRecipes}
              />
            </details>
          </KnowledgeSection>
        )}
      </>
    );
  }

  return (
    <div className="static-shell knowledge-shell">
      <a className="skip-link" href="#knowledge-main">Skip to guide</a>
      <header className="static-topbar">
        <a className="brand" href="/" aria-label="Forever Professions home">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>Forever <span>Professions</span></span>
        </a>
        <a className="back-to-planner" href="/">Back to planner</a>
      </header>
      <main className="knowledge-main" id="knowledge-main" tabIndex={-1}>
        <header className="legal-hero knowledge-hero">
          <ProfessionIcon className="profession-art profession-knowledge-icon" professionId="leatherworking" eager />
          <span className="section-kicker">{definition.eyebrow}</span>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </header>
        <div className="knowledge-layout">
          <nav className="knowledge-nav" aria-label="Leatherworking guide">
            <strong>Field guide</strong>
            {GUIDE_PAGE_IDS.map((id) => {
              const link = LEATHERWORKING_KNOWLEDGE_PAGES[id];
              return <a aria-current={page === id ? "page" : undefined} href={link.href} key={id}>{link.label}</a>;
            })}
            <strong>Recipe sources</strong>
            {SOURCE_PAGE_IDS.map((id) => {
              const link = LEATHERWORKING_KNOWLEDGE_PAGES[id];
              return <a aria-current={page === id ? "page" : undefined} href={link.href} key={id}>{link.label}</a>;
            })}
          </nav>
          <article className="knowledge-copy">{content}</article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
