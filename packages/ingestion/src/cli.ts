import type { RecipeComparisonType } from "./recipe-changes.js";

export function normalizeScriptArguments(
  arguments_: readonly string[],
): readonly string[] {
  return arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
}

export interface BuildImportScriptArguments {
  readonly inputPath: string;
  readonly compareAgainst?: {
    readonly path: string;
    readonly comparisonType: RecipeComparisonType;
  };
}

export function parseBuildImportScriptArguments(
  arguments_: readonly string[],
): BuildImportScriptArguments {
  const [inputPath, ...options] = normalizeScriptArguments(arguments_);
  if (!inputPath) throw new Error("Pass the path to an imported build JSON file.");
  let compareAgainstPath: string | undefined;
  let comparisonType: RecipeComparisonType = "CLASSIC_TO_FOREVER";

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = options[index + 1];
    if (option === "--compare-against") {
      if (!value || value.startsWith("--")) {
        throw new Error("--compare-against requires a baseline build JSON path.");
      }
      compareAgainstPath = value;
      index += 1;
      continue;
    }
    if (option === "--comparison-type") {
      if (value === "classic-forever") comparisonType = "CLASSIC_TO_FOREVER";
      else if (value === "forever-build") comparisonType = "FOREVER_BUILD_TO_BUILD";
      else {
        throw new Error("--comparison-type must be classic-forever or forever-build.");
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown build import option ${option ?? ""}.`);
  }

  return {
    inputPath,
    ...(compareAgainstPath === undefined
      ? {}
      : { compareAgainst: { path: compareAgainstPath, comparisonType } }),
  };
}
