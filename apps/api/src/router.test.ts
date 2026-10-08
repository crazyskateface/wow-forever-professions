import { describe, expect, it } from "vitest";
import { healthResponseSchema, recipesResponseSchema } from "@forever-professions/contracts";
import { routeRequest } from "./router.js";

describe("fixture API router", () => {
  it("returns a contract-valid health response", () => {
    const response = routeRequest("GET", "/health");
    expect(response.statusCode).toBe(200);
    expect(() => healthResponseSchema.parse(JSON.parse(response.body))).not.toThrow();
  });

  it("returns fixture recipes for a known profession", () => {
    const response = routeRequest("GET", "/professions/leatherworking/recipes");
    expect(response.statusCode).toBe(200);
    expect(recipesResponseSchema.parse(JSON.parse(response.body))).toHaveLength(2);
  });

  it("returns 404 for an unknown recipe", () => {
    expect(routeRequest("GET", "/recipes/not-real").statusCode).toBe(404);
  });
});
