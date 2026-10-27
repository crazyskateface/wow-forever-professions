import { useEffect, useState } from "react";
import { PROFESSIONS, professionsResponseSchema } from "@forever-professions/contracts";
import { ProfessionMasthead } from "./ProfessionNavigation.js";
import { ProfessionIcon } from "./ProfessionIcon.js";
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
      <div className="profession-introduction">
        <h1 className="sr-only">Choose a profession</h1><p>Choose your profession</p>
      </div>
      {error ? <p role="status">Catalog availability could not be checked. Select a profession to try loading its catalog.</p> : null}
      {["Crafting", "Secondary", "Gathering"].map((group) => <section className="profession-group" key={group} aria-label={`${group} professions`}>
        <div className="profession-group-heading"><h2>{group}</h2>{group === "Crafting" ? null : <p>{group === "Secondary" ? "Cooking, First Aid, and Fishing in one place." : "Herbalism, Mining, and Skinning."}</p>}</div>
        <div className="profession-directory">
          {PROFESSIONS.filter((profession) => profession.group === group).map(({ id, name, description, sourceName }) => <a className="profession-entry" href={professionHref(id)} key={id}>
            <ProfessionIcon className="profession-art profession-directory-icon" professionId={id} /><span><strong>{name}</strong><small>{description}</small>
              {sourceName === null ? <small className="profession-unavailable">Gathering data unavailable</small> : available !== undefined && !available.has(id) ? <small className="profession-unavailable">Catalog unavailable</small> : null}
            </span><span className="profession-entry-arrow" aria-hidden="true">↗</span>
          </a>)}
        </div>
      </section>)}
    </main><SiteFooter />
  </div>;
}
