import { describe, expect, it } from "vitest";
import { normalizeScriptArguments } from "./cli.js";

describe("script argument normalization", () => {
  it("accepts arguments with or without a forwarded separator", () => {
    expect(normalizeScriptArguments(["dataset.json"])).toEqual(["dataset.json"]);
    expect(normalizeScriptArguments(["--", "dataset.json"])).toEqual([
      "dataset.json",
    ]);
  });
});
