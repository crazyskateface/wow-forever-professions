import { describe, expect, it } from "vitest";
import { gatheringCatalogSchema } from "@forever-professions/contracts";
import { routeRequest } from "./router.js";

describe("gathering API boundaries", () => {
  it("reports missing dependencies and datasets explicitly", async () => {
    expect((await routeRequest("GET", "/api/professions/herbalism/gathering")).statusCode).toBe(503);
    expect((await routeRequest("GET", "/api/professions/alchemy/gathering")).statusCode).toBe(404);
    const gathering = { async getGathering() { return undefined; }, async getLocations() { return undefined; } };
    expect((await routeRequest("GET", "/api/professions/skinning/gathering", {}, { gathering })).statusCode).toBe(404);
    expect((await routeRequest("GET", "/api/professions/skinning/gathering/locations", { sourceId: "x", datasetId: "y", limit: "1000" }, { gathering })).statusCode).toBe(400);
    expect((await routeRequest("GET", "/api/professions/skinning/gathering/locations", { sourceId: "x", datasetId: "y", offset: "-1" }, { gathering })).statusCode).toBe(400);
  });
  it("validates responses and turns reader failures into explicit errors", async () => {
    const catalog = gatheringCatalogSchema.parse({ datasetId: "a", client: { product: "wowf", build: "1.60.1.70630", locale: "enUS" }, professionId: "skinning", abilities: [], sources: [], maps: [], yields: [], evidence: [] });
    const gathering = { async getGathering() { return catalog; }, async getLocations() { return { total: 0, locations: [] }; } };
    const response = await routeRequest("GET", "/api/professions/skinning/gathering", {}, { gathering });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(catalog);
    expect((await routeRequest("GET", "/api/professions/skinning/gathering", {}, { gathering: { ...gathering, async getGathering() { throw new Error("offline"); } } })).statusCode).toBe(503);
  });
});
