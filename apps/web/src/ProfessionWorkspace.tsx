import { useEffect, useState } from "react";
import { getProfessionDefinition, professionFixtureSchema, type ProfessionFixture } from "@forever-professions/contracts";
import { App } from "./App.js";
import { ProfessionMasthead, ProfessionSwitcher } from "./ProfessionNavigation.js";
import { SiteFooter } from "./SiteFooter.js";
import { ProfessionIcon } from "./ProfessionIcon.js";

export function ProfessionWorkspace({ professionId }: { readonly professionId: string }) {
  return getProfessionDefinition(professionId)?.sourceName === null
    ? <GatheringProfessionWorkspace professionId={professionId} />
    : <RecipeProfessionWorkspace professionId={professionId} />;
}

function GatheringProfessionWorkspace({ professionId }: { readonly professionId: string }) {
  const definition = getProfessionDefinition(professionId)!;
  useEffect(() => { document.title = `${definition.name} · Forever Professions`; }, [definition.name]);
  return <div className="app-shell landing-shell">
    <a className="skip-link" href="#gathering-workspace">Skip to profession</a>
    <ProfessionMasthead />
    <div className="topbar profession-status-bar"><ProfessionSwitcher professionId={professionId} /></div>
    <main className="profession-landing" id="gathering-workspace">
      <div className="profession-overview-heading"><ProfessionIcon className="profession-art profession-overview-icon" professionId={professionId} eager /><h1>{definition.name}</h1></div>
      <section className="profession-group" aria-labelledby="gathering-data-title">
        <div className="profession-group-heading"><h2 id="gathering-data-title">Gathering data</h2></div>
        <p>Gathering progression data is not available for {definition.name} yet.</p>
        <p>Gathering sources, locations, and skill requirements have not been imported. A leveling guide cannot be generated from the available data.</p>
        <p><a href="/">Choose another profession</a></p>
      </section>
    </main><SiteFooter />
  </div>;
}

function RecipeProfessionWorkspace({ professionId }: { readonly professionId: string }) {
  const [catalog, setCatalog] = useState<ProfessionFixture>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const definition = getProfessionDefinition(professionId)!;
  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    document.title = `${definition.name} · Forever Professions`;
    fetch(`/api/professions/${encodeURIComponent(professionId)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = professionFixtureSchema.parse(await response.json());
      if (value.id !== professionId) throw new Error("The returned catalog belongs to a different profession.");
      return value;
    }).then((value) => { if (!controller.signal.aborted) setCatalog(value); })
      .catch(() => { if (!controller.signal.aborted) setError(`The ${definition.name} catalog is unavailable. Try again, or choose another profession.`); });
    return () => controller.abort();
  }, [attempt, definition.name, professionId]);
  if (catalog !== undefined && catalog.recipes.length > 0) return <App key={professionId} initialProfession={catalog} initialCatalogState={catalog.recipes.every(({ provenance }) => provenance.source === "fixture") ? "fixture" : "ready"} />;
  return <div className="app-shell"><ProfessionMasthead /><div className="topbar profession-status-bar"><ProfessionSwitcher professionId={professionId} /></div>
    <main className="profession-landing"><h1>{definition.name}</h1>
      {error ? <><p role="alert">{error}</p><button className="catalog-clear" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button></> : <p role="status">{catalog === undefined ? "Loading profession catalog…" : "This build has no recipe records for this profession. No leveling route can be generated from the available data."}</p>}
      <p><a href="/">Choose another profession</a></p>
    </main><SiteFooter /></div>;
}
