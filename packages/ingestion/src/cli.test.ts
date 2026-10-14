import { describe, expect, it } from "vitest";
import { normalizeScriptArguments, parseBuildImportScriptArguments } from "./cli.js";

describe("script argument normalization", () => {
  it("accepts arguments with or without a forwarded separator", () => {
    expect(normalizeScriptArguments(["dataset.json"])).toEqual(["dataset.json"]);
    expect(normalizeScriptArguments(["--", "dataset.json"])).toEqual([
      "dataset.json",
    ]);
  });
});

describe("build import arguments", () => {
  it("parses an optional Classic-to-Forever baseline", () => {
    expect(
      parseBuildImportScriptArguments([
        "--",
        "forever.json",
        "--compare-against",
        "classic.json",
      ]),
    ).toEqual({
      inputPath: "forever.json",
      compareAgainst: {
        path: "classic.json",
        comparisonType: "CLASSIC_TO_FOREVER",
      },
    });
  });

  it("supports Forever build-to-build comparisons", () => {
    expect(
      parseBuildImportScriptArguments([
        "current.json",
        "--compare-against",
        "previous.json",
        "--comparison-type",
        "forever-build",
      ]),
    ).toMatchObject({
      compareAgainst: { comparisonType: "FOREVER_BUILD_TO_BUILD" },
    });
  });

  it("rejects unknown or incomplete options", () => {
    expect(() =>
      parseBuildImportScriptArguments(["forever.json", "--compare-against"]),
    ).toThrow("requires a baseline");
    expect(() =>
      parseBuildImportScriptArguments(["forever.json", "--comparison-type", "other"]),
    ).toThrow("classic-forever or forever-build");
  });
});
