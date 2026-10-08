import { useMemo, useState } from "react";
import type { Recipe } from "@forever-professions/contracts";
import {
  getExpectedCraftsForSkillUp,
  getExpectedReagentQuantity,
  getRecipeDifficulty,
  getSkillUpProbability,
} from "@forever-professions/domain";
import { leatherworkingFixture } from "@forever-professions/fixtures";

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

export function App() {
  const [recipeId, setRecipeId] = useState(leatherworkingFixture.recipes[0]!.id);
  const recipe = leatherworkingFixture.recipes.find(({ id }) => id === recipeId)!;
  const [skill, setSkill] = useState(recipe.thresholds.orange);

  const calculation = useMemo(() => {
    const probability = getSkillUpProbability(skill, recipe.thresholds);
    return {
      difficulty: getRecipeDifficulty(skill, recipe.thresholds),
      probability,
      expectedCrafts: getExpectedCraftsForSkillUp(probability),
    };
  }, [recipe, skill]);

  function selectRecipe(nextRecipe: Recipe): void {
    setRecipeId(nextRecipe.id);
    setSkill(nextRecipe.thresholds.orange);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">World of Warcraft: Forever</span>
          <h1>Profession workshop</h1>
        </div>
        <span className="build-pill">Fixture build · {leatherworkingFixture.build}</span>
      </header>

      <main className="workspace">
        <aside className="recipe-panel" aria-label="Recipe selection">
          <div className="panel-heading">
            <span className="eyebrow">Profession</span>
            <h2>{leatherworkingFixture.name}</h2>
          </div>
          <nav className="recipe-list">
            {leatherworkingFixture.recipes.map((candidate) => (
              <button
                className={candidate.id === recipe.id ? "recipe active" : "recipe"}
                key={candidate.id}
                onClick={() => selectRecipe(candidate)}
                type="button"
              >
                <span>{candidate.name}</span>
                <small>{candidate.thresholds.orange} skill</small>
              </button>
            ))}
          </nav>
        </aside>

        <section className="calculator" aria-labelledby="recipe-title">
          <div className="calculator-header">
            <div>
              <span className={`difficulty ${calculation.difficulty}`}>
                {calculation.difficulty}
              </span>
              <h2 id="recipe-title">{recipe.name}</h2>
              <p>{recipe.provenance.notes}</p>
            </div>
            <div className="skill-value" aria-live="polite">
              <span>Current skill</span>
              <strong>{skill}</strong>
            </div>
          </div>

          <div className="slider-wrap">
            <input
              aria-label="Current profession skill"
              max={recipe.thresholds.gray}
              min={recipe.thresholds.orange}
              onChange={(event) => setSkill(Number(event.target.value))}
              type="range"
              value={skill}
            />
            <div className="thresholds">
              {Object.entries(recipe.thresholds).map(([label, value]) => (
                <span className={label} key={label}>
                  {label} {value}
                </span>
              ))}
            </div>
          </div>

          <div className="metrics">
            <article>
              <span>Skill-up chance</span>
              <strong>{Math.round(calculation.probability * 100)}%</strong>
            </article>
            <article>
              <span>Expected crafts</span>
              <strong>{formatNumber(calculation.expectedCrafts)}</strong>
            </article>
          </div>

          <section className="materials" aria-labelledby="materials-title">
            <div>
              <span className="eyebrow">Expected for one skill point</span>
              <h3 id="materials-title">Materials</h3>
            </div>
            <ul>
              {recipe.reagents.map((reagent) => (
                <li key={reagent.itemId}>
                  <span>{reagent.name}</span>
                  <strong>
                    {formatNumber(
                      getExpectedReagentQuantity(
                        reagent.quantity,
                        calculation.probability,
                      ),
                    )}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        </section>
      </main>
    </div>
  );
}
