import { PROFESSIONS } from "@forever-professions/contracts";
import { professionHref } from "./profession-navigation.js";
import { ProfessionIcon } from "./ProfessionIcon.js";

export function ProfessionSwitcher({ professionId }: { readonly professionId: string }) {
  return <div className="profession-navigation">
    <a className="profession-home" href="/" aria-label="Choose a profession">←</a>
    <label className="profession-switcher">
      <ProfessionIcon className="profession-art profession-switcher-icon" professionId={professionId} eager />
      <span className="profession-switcher-label">Profession</span>
      <select aria-label="Switch profession" value={professionId} onChange={(event) => { window.location.assign(professionHref(event.target.value)); }}>
        {["Crafting", "Secondary", "Gathering"].map((group) => <optgroup key={group} label={group}>
          {PROFESSIONS.filter((profession) => profession.group === group).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </optgroup>)}
      </select>
    </label>
  </div>;
}

export function ProfessionMasthead() {
  return <header className="brand-masthead" aria-labelledby="site-title"><div className="masthead-content">
    <p className="masthead-title" id="site-title"><a href="/">Forever Professions</a></p>
    <p className="masthead-tagline">A fan-made crafting planner for WoW Forever players</p>
  </div></header>;
}
