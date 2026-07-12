import { describe, it, expect } from "vitest";
import { parseTrailerScript } from "./script";

describe("parseTrailerScript", () => {
  it("parses a clean JSON object", () => {
    const raw = '{"omniPrompt":"[0-2s] ident","title":"THE PULL REQUEST","caption":"presents"}';
    const s = parseTrailerScript(raw);
    expect(s.title).toBe("THE PULL REQUEST");
    expect(s.omniPrompt).toContain("[0-2s]");
    expect(s.caption).toBe("presents");
  });

  it("parses JSON wrapped in markdown fences", () => {
    const raw = '```json\n{"omniPrompt":"x","title":"Y","caption":"z"}\n```';
    const s = parseTrailerScript(raw);
    expect(s.title).toBe("Y");
  });

  it("throws on missing fields", () => {
    expect(() => parseTrailerScript('{"title":"Y"}')).toThrow();
  });

  it("throws on non-JSON", () => {
    expect(() => parseTrailerScript("not json at all")).toThrow();
  });
});
