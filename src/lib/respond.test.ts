import { describe, expect, it } from "vitest";
import * as respond from "./respond";

describe("LLM unavailable fallback", () => {
  it("gives a judge a clear recovery path to the demo", () => {
    const fallback = (
      respond as unknown as {
        LLM_UNAVAILABLE: { reply: string | null };
      }
    ).LLM_UNAVAILABLE;

    expect(fallback.reply).toContain("rate-limited");
    expect(fallback.reply).toContain(
      "https://www.youtube.com/watch?v=bAEFUn1op2w"
    );
  });
});
