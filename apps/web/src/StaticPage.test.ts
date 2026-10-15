import { describe, expect, it } from "vitest";
import { staticPageFromPath } from "./StaticPage.js";

describe("static page routing", () => {
  it("recognizes legal and contact paths with optional trailing slashes", () => {
    expect(staticPageFromPath("/privacy")).toBe("privacy");
    expect(staticPageFromPath("/terms/")).toBe("terms");
    expect(staticPageFromPath("/CONTACT")).toBe("contact");
  });

  it("leaves planner and unknown paths to the application", () => {
    expect(staticPageFromPath("/")).toBeUndefined();
    expect(staticPageFromPath("/recipes/spell-10490")).toBeUndefined();
  });
});
