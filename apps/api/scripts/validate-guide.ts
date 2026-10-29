import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  guideReferenceSchema,
  professionFixtureSchema,
  routeOptimizationResponseSchema,
} from "@forever-professions/contracts";
import {
  createGuideValidation,
  renderGuideValidationMarkdown,
  type ValidationRecipe,
} from "@forever-professions/optimizer";

const DEFAULT_REFERENCE =
  "data/guide-references/endgame-tools-2026-10-14-leatherworking.json";
const DEFAULT_OUTPUT_DIRECTORY = "data/guide-validation";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";

async function fetchJson(url: URL, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}: ${body}`);
  }
  return JSON.parse(body) as unknown;
}

function validationRecipe(
  recipe: ReturnType<typeof professionFixtureSchema.parse>["recipes"][number],
): ValidationRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    learnSkill: recipe.learnSkill,
    acquisition: recipe.acquisition,
    availability: recipe.availability,
    verificationStatus: recipe.provenance.verification.status,
    reagents: recipe.reagents.map((reagent) => ({
      itemId: reagent.itemId,
      name: reagent.name,
      quantity: reagent.quantity,
      ...(reagent.classification === undefined
        ? {}
        : { classificationLabel: reagent.classification.label }),
    })),
  };
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-|-$/g, "");
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const referencePath = resolve(repositoryRoot, process.argv[2] ?? DEFAULT_REFERENCE);
const outputDirectory = resolve(
  repositoryRoot,
  process.argv[3] ?? DEFAULT_OUTPUT_DIRECTORY,
);
const baseUrl = process.argv[4] ?? process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;
const generatedAt =
  process.env.GUIDE_VALIDATION_GENERATED_AT ?? new Date().toISOString();

const reference = guideReferenceSchema.parse(
  JSON.parse(await readFile(referencePath, "utf8")) as unknown,
);
const profession = professionFixtureSchema.parse(
  await fetchJson(
    new URL(`/api/professions/${encodeURIComponent(reference.professionId)}`, baseUrl),
  ),
);
const optimization = routeOptimizationResponseSchema.parse(
  await fetchJson(new URL("/api/routes/optimize", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      professionId: reference.professionId,
      startSkill: reference.startSkill,
      targetSkill: reference.targetSkill,
      preset: "practical",
    }),
  }),
);

if (optimization.result.status !== "complete") {
  throw new Error(
    `Cannot validate a blocked route: ${optimization.result.reason} at skill ${optimization.result.blockedAtSkill}.`,
  );
}

const validation = createGuideValidation({
  generatedAt,
  professionId: profession.id,
  professionName: profession.name,
  recipeBuildId: profession.build,
  route: optimization.result,
  recipes: profession.recipes.map(validationRecipe),
  reference,
});

const baseName = [
  safeFilePart(profession.build),
  safeFilePart(profession.id),
  optimization.result.objective,
].join("-");
const baselinePath = resolve(outputDirectory, `${baseName}.baseline.json`);
const reportPath = resolve(
  outputDirectory,
  `${baseName}-vs-${safeFilePart(reference.id)}.md`,
);

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(baselinePath, `${JSON.stringify(validation.baseline, null, 2)}\n`, "utf8"),
  writeFile(reportPath, renderGuideValidationMarkdown(validation), "utf8"),
]);

process.stdout.write(
  `${JSON.stringify(
    {
      baselinePath,
      reportPath,
      recipeBuildId: profession.build,
      referenceId: reference.id,
      ...validation.summary,
    },
    null,
    2,
  )}\n`,
);
