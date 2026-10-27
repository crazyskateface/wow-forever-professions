import { useEffect, useState } from "react";
import { PROFESSIONS, professionsResponseSchema } from "@forever-professions/contracts";
import { ProfessionMasthead } from "./ProfessionNavigation.js";
import { professionHref } from "./profession-navigation.js";
import { SiteFooter } from "./SiteFooter.js";

export function ProfessionLanding() {
  const [available, setAvailable] = useState<ReadonlySet<string>>();
  const [error, setError] = useState(false);
  useEffect(() => {
    document.title = "Choose your profession · Forever Professions";
    const controller = new AbortController();
    fetch("/api/professions", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return professionsResponseSchema.parse(await response.json());
    }).then((professions) => setAvailable(new Set(professions.map(({ id }) => id))))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  return <div className="app-shell landing-shell">
    <a className="skip-link" href="#profession-directory">Skip to professions</a>
    <ProfessionMasthead />
    <main className="profession-landing" id="profession-directory">
      <div className="profession-introduction"><p className="section-kicker">World of Warcraft: Forever</p>
        <h1>Every craft starts here.</h1><p>Choose your profession to explore its recipes, plan your leveling, and see what changed in Forever.</p>
      </div>
      {error ? <p role="status">Catalog availability could not be checked. Select a profession to try loading its catalog.</p> : null}
      {["Crafting", "Secondary", "Gathering"].map((group) => <section className="profession-group" key={group} aria-label={`${group} professions`}>
        <div className="profession-group-heading"><h2>{group} professions</h2><p>{group === "Crafting" ? "Build your next profession route." : group === "Secondary" ? "Cooking, First Aid, and Fishing in one place." : "Explore smelting and material processing."}</p></div>
        <div className="profession-directory">
          {PROFESSIONS.filter((profession) => profession.group === group).map(({ id, name, initials, description }) => <a className="profession-entry" href={professionHref(id)} key={id}>
            <span className="profession-monogram" aria-hidden="true">{initials}</span><span><strong>{name}</strong><small>{description}</small>
              {available !== undefined && !available.has(id) ? <small className="profession-unavailable">Catalog unavailable</small> : null}
            </span><span className="profession-entry-arrow" aria-hidden="true">↗</span>
          </a>)}
        </div>
      </section>)}
      <p className="profession-evidence-note">Build-stamped source data, with unknown requirements and unverified recipes kept visible. Fishing records cover imported recipes and training; a complete fishing activity guide is not available.</p>
    </main><SiteFooter />
  </div>;
}
