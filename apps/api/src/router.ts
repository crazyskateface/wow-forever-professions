import {
  healthResponseSchema,
  professionsResponseSchema,
  recipeSchema,
  recipesResponseSchema,
} from "@forever-professions/contracts";
import { professionFixtures } from "@forever-professions/fixtures";

export interface ApiResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const headers = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
} as const;

function json(statusCode: number, value: unknown): ApiResponse {
  return { statusCode, headers, body: JSON.stringify(value) };
}

export function routeRequest(method: string, path: string): ApiResponse {
  if (method !== "GET") return json(405, { error: "Method not allowed." });

  if (path === "/health") {
    return json(
      200,
      healthResponseSchema.parse({
        service: "forever-professions-api",
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    );
  }

  if (path === "/professions") {
    return json(
      200,
      professionsResponseSchema.parse(
        professionFixtures.map(({ id, name }) => ({ id, name })),
      ),
    );
  }

  const professionRecipesMatch = path.match(/^\/professions\/([^/]+)\/recipes$/);
  if (professionRecipesMatch) {
    const profession = professionFixtures.find(
      ({ id }) => id === decodeURIComponent(professionRecipesMatch[1]!),
    );
    if (!profession) return json(404, { error: "Profession not found." });
    return json(200, recipesResponseSchema.parse(profession.recipes));
  }

  const recipeMatch = path.match(/^\/recipes\/([^/]+)$/);
  if (recipeMatch) {
    const requestedId = decodeURIComponent(recipeMatch[1]!);
    const recipe = professionFixtures
      .flatMap(({ recipes }) => recipes)
      .find(({ id }) => id === requestedId);
    if (!recipe) return json(404, { error: "Recipe not found." });
    return json(200, recipeSchema.parse(recipe));
  }

  return json(404, { error: "Route not found." });
}
