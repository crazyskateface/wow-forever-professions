import { professionFixtureSchema } from "@forever-professions/contracts";
import leatherworkingJson from "./leatherworking.json" with { type: "json" };

export const leatherworkingFixture = professionFixtureSchema.parse(leatherworkingJson);

export const professionFixtures = [leatherworkingFixture] as const;
