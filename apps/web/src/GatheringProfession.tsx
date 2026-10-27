import { useEffect, useState } from "react";
import { gatheringCatalogSchema, gatheringLocationsResponseSchema, getProfessionDefinition, type GatheringCatalog, type GatheringLocationsResponse } from "@forever-professions/contracts";
import { ProfessionMasthead, ProfessionSwitcher } from "./ProfessionNavigation.js";
import { ProfessionIcon } from "./ProfessionIcon.js";
import { SiteFooter } from "./SiteFooter.js";
import { ItemIcon } from "./ItemIcon.js";
import { SearchIcon } from "./UiIcons.js";
import { readProfessionSkill, writeProfessionSkill } from "./profession-navigation.js";
import { FOREVER_BUILD_CONFIG } from "@forever-professions/domain";

function Locations({ catalog, sourceId, mapId }: { readonly catalog: GatheringCatalog; readonly sourceId: string; readonly mapId: string }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<GatheringLocationsResponse>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false); setPage(undefined);
    const params = new URLSearchParams({ datasetId: catalog.datasetId, sourceId, offset: String(offset), limit: "25", ...(mapId ? { mapId } : {}) });
    fetch(`/api/professions/${catalog.professionId}/gathering/locations?${params}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Locations unavailable"); return gatheringLocationsResponseSchema.parse(await response.json()); })
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [catalog.datasetId, catalog.professionId, sourceId, mapId, offset, attempt]);
  if (error) return <p role="alert">Locations could not be loaded. <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></p>;
  if (!page) return <p role="status">Loading reported locations…</p>;
  return <div className="gathering-locations">
    <ul>{page.locations.map(location => <li key={location.id}><span>{location.mapName ?? `Map ${location.mapId}`}</span><strong>{(location.x * 100).toFixed(1)}, {(location.y * 100).toFixed(1)}</strong><small>{location.coordinateKind === "observer" ? "Observer position" : "Reported node"}</small></li>)}</ul>
    {page.total === 0 ? <p>No locations match this zone.</p> : <div className="gathering-pagination"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button><span>{offset + 1}–{Math.min(offset + 25, page.total)} of {page.total}</span><button type="button" disabled={offset + 25 >= page.total} onClick={() => setOffset(offset + 25)}>Next</button></div>}
  </div>;
}

export function GatheringContent({ catalog, sourcesOnly = false }: { readonly catalog: GatheringCatalog; readonly sourcesOnly?: boolean }) {
  const [search, setSearch] = useState("");
  const [mapId, setMapId] = useState("");
  const [open, setOpen] = useState<string>();
  const query = search.trim().toLowerCase();
  const sources = catalog.sources.filter(source => source.name.toLowerCase().includes(query));
  return <div className="gathering-content">
    <p className="gathering-build">Client {catalog.client.build} · Unverified client and community evidence</p>
    {sourcesOnly ? null : <section className="profession-group" aria-labelledby="gathering-abilities-title">
      <div className="profession-group-heading"><h2 id="gathering-abilities-title">Profession abilities</h2></div>
      <p>Client records preserve available spells and crafting materials. Harvest requirements and obtainability remain unknown.</p>
      <div className="gathering-abilities">{catalog.abilities.map(ability => <details key={ability.id}>
        <summary>{ability.name}<small>Spell {ability.spellId} · Skill required: {ability.minimumSkill ?? "Unknown"}</small></summary>
        {ability.description ? <p>{ability.description}</p> : null}
        <p>Availability: unknown. Client skill ranks: {ability.clientRanks.minimum} / {ability.clientRanks.trivialLow} / {ability.clientRanks.trivialHigh}; these are not harvest requirements.</p>
        <h3>Materials for one craft</h3>
        {ability.reagents.length ? <ul>{ability.reagents.map((item, i) => <li key={`${item.itemId}-${i}`}><ItemIcon className="gathering-item-icon" gameItemId={item.itemId} name={item.name ?? `Item ${item.itemId}`} /><span>{item.name ?? `Item ${item.itemId}`}</span><strong>Quantity {item.quantity}</strong></li>)}</ul> : <p>No reagent record in this snapshot.</p>}
        <h3>Created items</h3>
        {ability.outputs.length ? <ul>{ability.outputs.map((item, i) => <li key={`${item.itemId}-${i}`}><ItemIcon className="gathering-item-icon" gameItemId={item.itemId} name={item.name ?? `Item ${item.itemId}`} /><span>{item.name ?? `Item ${item.itemId}`}</span><strong>Quantity {item.quantity ?? "Unknown"}</strong></li>)}</ul> : <p>No create-item effect recorded. This does not describe gathering loot.</p>}
      </details>)}</div>
    </section>}
    <section className="profession-group" aria-labelledby="gathering-sources-title">
      <div className="profession-group-heading"><h2 id="gathering-sources-title">Sources & locations</h2></div>
      <p>Community locations are reported coordinates, with no guarantee of a current spawn. Verified skill requirements and gathering yields remain unknown unless evidence is shown.</p>
      <div className="gathering-filters"><label>Find a source<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search nodes or creatures" type="search" /></label><label>Locations in zone<select value={mapId} onChange={event => { setMapId(event.target.value); setOpen(undefined); }}><option value="">All zones</option>{catalog.maps.map(map => <option key={map.mapId} value={map.mapId}>{map.mapName ?? `Map ${map.mapId}`}</option>)}</select></label></div>
      {sources.length === 0 ? <p>{catalog.sources.length ? "No sources match your search." : "No supported gathering sources have been imported for this profession. Creature sources, yields, and locations remain unknown."}</p> : <ul className="gathering-source-list">{sources.map(source => <li key={source.id}>
        <div className="gathering-source-heading"><div><h3>{source.name}</h3><small>{source.kind === "node" ? "Object" : "Creature"} {source.gameId} · Skill required: {source.minimumSkill ?? "Unknown"}</small>{source.reportedMinimumSkill !== null ? <p>Community-reported minimum: {source.reportedMinimumSkill} · Unverified</p> : null}</div><button type="button" aria-expanded={open === source.id} onClick={() => setOpen(open === source.id ? undefined : source.id)}>{open === source.id ? "Hide locations" : `Locations (${source.locationCount})`}</button></div>
        {catalog.yields.filter(item => item.sourceId === source.id).length ? <ul>{catalog.yields.filter(item => item.sourceId === source.id).map(item => <li key={item.id}>{item.itemName ?? `Item ${item.itemId}`} · Quantity {item.minimumQuantity ?? "Unknown"}–{item.maximumQuantity ?? "Unknown"} · Observations {item.observations ?? "Unknown"}</li>)}</ul> : <p className="gathering-yield-note">Gathering yields: unknown</p>}
        {open === source.id ? <Locations key={`${source.id}-${mapId}`} catalog={catalog} sourceId={source.id} mapId={mapId} /> : null}
      </li>)}</ul>}
    </section>
    <section className="profession-group" aria-labelledby="gathering-evidence-title"><div className="profession-group-heading"><h2 id="gathering-evidence-title">Source evidence</h2></div>
      {catalog.evidence.map(evidence => <details key={evidence.id}><summary>{evidence.kind === "client-data" ? "Forever client" : evidence.kind === "observed-in-game" ? "Gameplay observations" : "GatherLite community dataset"} · {evidence.verification}</summary><p>{evidence.notes}</p><p>Product {evidence.product} · Build {evidence.build ?? "Unknown"} · {evidence.locale}</p><p>License/attribution: {evidence.license ?? "Unknown"}</p>{evidence.sourceUrl ? <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">View pinned source</a> : null}<p className="gathering-hash">Revision: {evidence.revision ?? "Client snapshot"}<br />SHA-256: {evidence.sha256}</p></details>)}
    </section>
  </div>;
}

export function GatheringProfession({ professionId }: { readonly professionId: string }) {
  const definition = getProfessionDefinition(professionId)!;
  const [catalog, setCatalog] = useState<GatheringCatalog>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    document.title = `${definition.name} · Forever Professions`;
    const controller = new AbortController();
    setError(undefined); setCatalog(undefined);
    fetch(`/api/professions/${professionId}/gathering`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "No gathering dataset has been imported yet." : "Gathering data could not be loaded.");
      const value = gatheringCatalogSchema.parse(await response.json());
      if (value.professionId !== professionId) throw new Error("Gathering response belongs to another profession.");
      return value;
    }).then(value => { if (!controller.signal.aborted) setCatalog(value); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [definition.name, professionId, attempt]);
  return <GatheringWorkspace professionId={professionId} catalog={catalog} error={error} onRetry={() => setAttempt(value => value + 1)} />;
}

export function GatheringWorkspace({ professionId, catalog, error, onRetry }: { readonly professionId: string; readonly catalog?: GatheringCatalog | undefined; readonly error?: string | undefined; readonly onRetry: () => void }) {
  const definition = getProfessionDefinition(professionId)!;
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState(() => readProfessionSkill(professionId, 1));
  const [listView, setListView] = useState("recipes");
  const [view, setView] = useState(() => {
    const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
    return params.get("view") === "gathering" && !params.has("recipe") ? "gathering" : "calculator";
  });
  const [selectedId, setSelectedId] = useState(() => typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("recipe") ?? undefined);
  useEffect(() => {
    const update = () => { setSelectedId(new URLSearchParams(window.location.search).get("recipe") ?? undefined); setView("calculator"); };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const abilities = [...(catalog?.abilities ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.spellId - b.spellId);
  const selected = abilities.find(a => a.id === selectedId) ?? abilities.find(a => a.reagents.length > 0) ?? abilities[0];
  const filtered = abilities.filter(a => `${a.name} ${a.spellId}`.toLowerCase().includes(search.trim().toLowerCase()));
  const updateSkill = (value: number) => { setSkill(value); writeProfessionSkill(professionId, value); };
  function selectAbility(id: string) {
    setSelectedId(id); setView("calculator");
    const url = new URL(window.location.href); url.searchParams.set("recipe", id); window.history.pushState({}, "", url);
  }
  return <div className="app-shell gathering-workspace"><a className="skip-link" href="#main-workspace">Skip to workspace</a><ProfessionMasthead />
    <header className="topbar"><ProfessionSwitcher professionId={professionId} /><label className="global-search"><SearchIcon className="search-icon" /><input aria-label="Search recipes" type="search" placeholder={`Search ${abilities.length} recipes and abilities…`} value={search} onChange={event => { setSearch(event.target.value); setListView("recipes"); }} /></label><span className="price-mode">Unverified client data</span></header>
    <div className="workspace" id="top"><aside className="profession-rail" aria-label="Profession and recipe selection">
      <div className="profession-select"><ProfessionIcon className="profession-icon profession-art" professionId={professionId} eager /><strong>{definition.name}</strong></div>
      <div className="rail-skill"><div className="rail-label-row"><span>Calculator skill</span><span>{skill} / {FOREVER_BUILD_CONFIG.maxBaseSkill}</span></div><input aria-label="Current profession skill" type="range" min={1} max={FOREVER_BUILD_CONFIG.maxBaseSkill} value={skill} onChange={event => updateSkill(Number(event.target.value))} /><div className="skill-stepper"><button type="button" aria-label="Decrease skill" disabled={skill <= 1} onClick={() => updateSkill(skill - 1)}>−</button><strong>{skill}</strong><button type="button" aria-label="Increase skill" disabled={skill >= 300} onClick={() => updateSkill(skill + 1)}>+</button></div></div>
      <div className="rail-tabs" role="group" aria-label="Recipe views">{[["guide", "Leveling guide"], ["recipes", "All recipes"], ["changes", "Forever Changes"]].map(([key, label]) => <button type="button" key={key} aria-pressed={listView === key} className={listView === key ? "active" : ""} onClick={() => setListView(key!)}>{label}</button>)}</div>
      <div className="recipe-list-summary">{listView === "recipes" ? `${filtered.length} recipes and abilities` : "Evidence coverage"}</div>
      <div className="recipe-list" aria-label="All recipes">{listView === "recipes" ? filtered.length ? filtered.map(ability => <button className={selected?.id === ability.id ? "recipe active" : "recipe"} type="button" key={ability.id} aria-current={selected?.id === ability.id ? "true" : undefined} onClick={() => selectAbility(ability.id)}>
        <ItemIcon className="item-icon" gameItemId={ability.outputs[0]?.itemId} name={ability.name} /><span className="recipe-copy"><strong>{ability.name}</strong><small>Spell {ability.spellId} · Source unknown</small><small>Skill thresholds unknown</small></span><span className="recipe-row-status"><small>Learn unknown</small></span>
      </button>) : <p className="route-status">No records match your search.</p> : <p className="route-status">{listView === "guide" ? "A leveling guide cannot be generated until gathering requirements and skill-up thresholds are supported." : "No Classic-to-Forever comparison has been imported for these gathering abilities."}</p>}</div>
      <div className="rail-footer"><span>Forever build</span><strong>{catalog?.client.build ?? "Unknown"}</strong></div>
    </aside><main className="main-workspace" id="main-workspace" tabIndex={-1}>
      {listView === "changes" ? null : <nav className="workspace-nav" aria-label="Workspace views">{[["calculator", "Recipe calculator"], ["crafts", "Best crafts"], ["gathering", "Gathering"]].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} className={view === key ? "active" : ""} onClick={() => setView(key!)}>{label}</button>)}</nav>}
      {error ? <p role="alert">{error} <button type="button" onClick={onRetry}>Try again</button></p> : !catalog ? <p role="status">Loading gathering data…</p> : listView === "changes" ? <section className="changes-hero"><h1>Forever Changes</h1><p>No Classic-to-Forever comparison has been imported for these gathering abilities.</p></section> : view === "gathering" ? <GatheringContent catalog={catalog} sourcesOnly /> : view === "crafts" ? <section className="route-intro"><h1>Best crafts</h1><p>No supported equipment-stat records are available for ranking these gathering crafts.</p></section> : selected ? <>
        <section className="recipe-hero" aria-labelledby="recipe-title"><div className="hero-title-row"><ItemIcon className="hero-item-icon" eager gameItemId={selected.outputs[0]?.itemId} name={selected.name} /><div><div className="breadcrumb">{definition.name}</div><div className="recipe-name-row"><h1 id="recipe-title">{selected.name}</h1></div></div></div></section>
        <div className="skill-requirement-warning" role="status"><span aria-hidden="true">!</span><div><strong>Skill requirements unknown</strong><p>Learning skill, skill-up thresholds, and in-game availability have not been verified.</p></div></div>
        <section className="calculator-grid" aria-label="Skill-up calculator"><div className="chart-wrap"><div className="chart-heading"><strong>Success rate by skill</strong><span className="chart-live">Current: {skill}</span></div><p className="gathering-curve-empty">Skill-up curve unavailable.<br />The client ranks do not establish gathering thresholds.</p></div><div className="outcome-panel"><div className="outcome-feature"><span className="section-kicker">Skill-up chance</span><strong className="outcome-value">Unknown</strong><p>at skill {skill}</p></div><div className="outcome-note"><span>Expected attempts</span><strong>Unknown</strong></div></div></section>
        <section className="cost-strip" aria-label="Cost summary">{["Crafts per skill-up", "Cost per attempt", "Expected cost per skill"].map(label => <article key={label}><div><span>{label}</span><strong>Unknown</strong></div></article>)}</section>
        <section className="materials-card" aria-labelledby="materials-title"><div className="section-title-row materials-heading"><div><h2 id="materials-title">Materials required</h2><small className="section-subtitle">For 1 craft</small></div></div><div className="materials-table" role="table" aria-label="Required materials"><div className="materials-header" role="row"><span role="columnheader">Name</span><span role="columnheader">Quantity</span><span role="columnheader">Source</span><span role="columnheader">Estimated cost</span></div>{selected.reagents.map(item => <div className="material-row" role="row" key={item.itemId}><span className="material-name" role="cell"><ItemIcon className="item-icon" gameItemId={item.itemId} name={item.name ?? `Item ${item.itemId}`} /><span><strong>{item.name ?? `Item ${item.itemId}`}</strong><small>Item {item.itemId}</small></span></span><strong role="cell">{item.quantity}</strong><span role="cell">Unknown</span><strong className="material-cost" role="cell">Unavailable</strong></div>)}</div>{selected.reagents.length === 0 ? <p className="price-status">No reagent record in this client snapshot.</p> : null}</section>
        <section className="data-quality"><h2>Recipe data</h2><dl><div><dt>Build</dt><dd>{catalog.client.build}</dd></div><div><dt>Spell</dt><dd>{selected.spellId}</dd></div><div><dt>Verification</dt><dd>Unverified</dd></div><div><dt>Learning skill</dt><dd>Unknown</dd></div></dl><div><p>{selected.description}</p><p>Created items: {selected.outputs.length ? selected.outputs.map(item => `${item.name ?? `Item ${item.itemId}`} (quantity ${item.quantity ?? "unknown"})`).join(", ") : "No create-item effect recorded"}.</p><p>Client ranks: {selected.clientRanks.minimum} / {selected.clientRanks.trivialLow} / {selected.clientRanks.trivialHigh}. Gathering requirements remain unknown.</p></div></section>
      </> : <p>No client abilities have been imported.</p>}
    </main></div><SiteFooter /></div>;
}
