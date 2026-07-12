# Nosy Productions — Movie Teasers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Nosy turn recent workplace gossip into a fully comedic ~8s cinematic movie
trailer (Gemini Omni Flash) delivered in DMs, gated behind a "premieres Saturday" bit
that caves to a teaser when the user begs.

**Architecture:** A DM-intent handler (`movie.ts`) owns a small in-memory refuse→cave
gate, acks immediately, then fires an async pipeline. The pipeline is three focused
units: Claude writes a Gemini-Omni-guide-compliant trailer prompt (`script.ts`), an Omni
Flash client renders the mp4 (`omni.ts`), and an orchestrator (`trailer/index.ts`) glues
them. Delivery reuses Slack `files.uploadV2` via a new `sendVideoDM`.

**Tech Stack:** TypeScript, `@slack/bolt` v4, `@anthropic-ai/sdk` (Claude Sonnet for
prompt-craft), `@google/genai` (`gemini-omni-flash-preview` for video), Supabase, vitest
(new, for unit tests).

**Spec:** `docs/superpowers/specs/2026-07-12-nosy-pictures-movie-teasers-design.md`

---

## File Structure

- Create: `src/slack/movieGate.ts` — pure refuse→cave gate state machine (unit-tested).
- Create: `src/lib/trailer/script.ts` — Claude prompt-craft + `parseTrailerScript` (unit-tested).
- Create: `src/lib/trailer/omni.ts` — Gemini Omni Flash client (create → poll → download mp4).
- Create: `src/lib/trailer/index.ts` — `generateTeaser()` orchestrator.
- Create: `src/slack/movie.ts` — DM intent detection + gate + ack + async deliver/fallback.
- Modify: `src/slack/dm.ts` — add `sendVideoDM(...)`.
- Modify: `src/slack/conversation.ts` — call `handleMovieIntent` before the LLM turn.
- Modify: `src/lib/client.ts` — export a `gemini` client + `VIDEO_MODEL`.
- Modify: `.env.example`, `README.md` — new env vars + feature docs.
- Create: `scripts/test-trailer.ts` — manual end-to-end smoke script.
- Create: `vitest.config.ts`, tests under `src/**/*.test.ts`.

---

## Task 1: Project setup — deps, vitest, config

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `src/lib/client.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @google/genai
npm install -D vitest
```
Expected: both added to `package.json`, no errors.

- [ ] **Step 2: Add test script to package.json**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Add the Gemini client to src/lib/client.ts**

Append to `src/lib/client.ts`:
```ts
import { GoogleGenAI } from "@google/genai";

// Gemini (AI Studio) — used for Omni Flash video generation.
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
export const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL ?? "gemini-omni-flash-preview";
```

- [ ] **Step 5: Add env vars to .env.example**

Append to `.env.example`:
```bash
# Gemini AI Studio key — used for Omni Flash movie-teaser generation.
GEMINI_API_KEY=
# Video model. Preview model; text/quality varies run to run.
GEMINI_VIDEO_MODEL=gemini-omni-flash-preview
# Set to false to disable the movie-teaser feature.
MOVIES_ENABLED=true
```

- [ ] **Step 6: Verify build + typecheck still pass**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/client.ts .env.example
git commit -m "chore: add gemini + vitest deps and movie-teaser config"
```

---

## Task 2: Gate state machine (`movieGate.ts`) — TDD

The gate is pure logic so we can test it without Slack. It tracks per-user "primed"
timestamps and a "rendering" set, and decides the next action.

**Files:**
- Create: `src/slack/movieGate.ts`
- Test: `src/slack/movieGate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/slack/movieGate.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { MovieGate } from "./movieGate";

describe("MovieGate", () => {
  let gate: MovieGate;
  beforeEach(() => { gate = new MovieGate({ primedWindowMs: 10_000, now: () => 1_000 }); });

  it("refuses a first movie request and primes the user", () => {
    expect(gate.decide("U1", "make me a movie")).toBe("refuse");
  });

  it("caves when a primed user begs", () => {
    gate.decide("U1", "make me a movie"); // refuse + prime
    expect(gate.decide("U1", "please just a teaser")).toBe("cave");
  });

  it("caves when a primed user asks for a movie again", () => {
    gate.decide("U1", "movie");
    expect(gate.decide("U1", "cmon movie")).toBe("cave");
  });

  it("refuses again if the primed window expired", () => {
    let t = 1_000;
    const g = new MovieGate({ primedWindowMs: 5_000, now: () => t });
    g.decide("U1", "movie"); // primed at t=1000
    t = 10_000;              // window expired
    expect(g.decide("U1", "please")).toBe("refuse");
  });

  it("deflects while a render is in progress", () => {
    gate.decide("U1", "movie");
    gate.decide("U1", "please"); // cave
    gate.markRendering("U1");
    expect(gate.decide("U1", "another movie")).toBe("deflect");
  });

  it("returns 'ignore' for non-movie text", () => {
    expect(gate.decide("U1", "hey what's up")).toBe("ignore");
  });

  it("clears rendering so the user can request again", () => {
    gate.decide("U1", "movie");
    gate.decide("U1", "please");
    gate.markRendering("U1");
    gate.clearRendering("U1");
    expect(gate.decide("U1", "movie")).toBe("refuse");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/slack/movieGate.test.ts`
Expected: FAIL — "Cannot find module './movieGate'".

- [ ] **Step 3: Write minimal implementation**

Create `src/slack/movieGate.ts`:
```ts
export type GateDecision = "ignore" | "refuse" | "cave" | "deflect";

const MOVIE_INTENT = /\b(movie|trailer|teaser|nosy\s*productions?|nosy\s*pictures?)\b/i;
const BEG = /\b(please|pls|plz|come\s*on|c'?mon|just|pretty\s*please|teaser|one\s*more)\b/i;

export interface MovieGateOptions {
  primedWindowMs?: number;
  now?: () => number;
}

export class MovieGate {
  private primed = new Map<string, number>();
  private rendering = new Set<string>();
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(opts: MovieGateOptions = {}) {
    this.windowMs = opts.primedWindowMs ?? 10 * 60 * 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  decide(userId: string, text: string): GateDecision {
    const isMovie = MOVIE_INTENT.test(text);
    const isBeg = BEG.test(text);
    const primedAt = this.primed.get(userId);
    const isPrimed = primedAt !== undefined && this.now() - primedAt <= this.windowMs;

    if (this.rendering.has(userId)) {
      return isMovie || (isPrimed && isBeg) ? "deflect" : "ignore";
    }
    if (isPrimed && (isMovie || isBeg)) {
      this.primed.delete(userId);
      return "cave";
    }
    if (isMovie) {
      this.primed.set(userId, this.now());
      return "refuse";
    }
    return "ignore";
  }

  markRendering(userId: string): void { this.rendering.add(userId); }
  clearRendering(userId: string): void { this.rendering.delete(userId); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/slack/movieGate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/slack/movieGate.ts src/slack/movieGate.test.ts
git commit -m "feat: add movie teaser refuse->cave gate state machine"
```

---

## Task 3: Trailer prompt-craft (`script.ts`) — Claude + tested parser

Claude turns gossip into a Gemini-Omni-guide-compliant trailer prompt. We unit-test the
pure `parseTrailerScript` (JSON extraction) and keep the Claude call thin.

**Files:**
- Create: `src/lib/trailer/script.ts`
- Test: `src/lib/trailer/script.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/trailer/script.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/trailer/script.test.ts`
Expected: FAIL — cannot find module './script'.

- [ ] **Step 3: Write the implementation**

Create `src/lib/trailer/script.ts`:
```ts
import { anthropic, DEFAULT_MODEL } from "../client";
import { getRecentObservations } from "../../db/observations";

export interface TrailerScript {
  omniPrompt: string;
  title: string;
  caption: string;
}

const SYSTEM = `You are the head writer at "NOSY PRODUCTIONS", a comedy film studio run by Nosy, a gossipy Slack bot. You turn petty workplace gossip into a prompt for Google's Gemini Omni Flash text-to-video model, which generates an ~8 second COMEDIC movie trailer (video WITH audio: narrator voice, music, sound fx, on-screen text).

The humor comes from CONTRAST: treat trivial office drama (someone pushed to main, a meeting ran long, two people disagreed on Slack) as an epic, high-stakes blockbuster thriller. Deadpan. Absurd. Fully comedic.

Write ONE prompt string ("omniPrompt") following the Gemini Omni Flash prompt guide EXACTLY:
- Use timecode syntax for beats: [0-2s] ... [2-4s] ... [4-6s] ... [6-8s] ...
- [0-2s] MUST be an MGM-parody studio ident: an ornate golden film-studio ident where a giant cartoon EYEBALL mascot blinks and roars in place of the MGM lion; an ornate ribbon banner reads "NOSY PRODUCTIONS"; grand orchestral fanfare. Use on-screen text so the words "NOSY PRODUCTIONS" render clearly.
- Middle beats: 2-3 real, absurd, deadpan office SCENES that dramatize the gossip like an action film (slow-mo, dramatic push-ins, exaggerated stakes). Be specific about people, wardrobe, props, and environment (meta-prompting for rich detail). Use first names only.
- Final beat: a title card rendering the movie title on screen over a music sting.
- Audio directive: "Audio: a deep, over-serious movie-trailer narrator voiceover reading dramatic lines about the drama; a building tense orchestral score; boom and whoosh sound effects on cuts."
- Negatives: "No character dialogue — narrator voiceover only. No subtitles except the specified on-screen text."
- 16:9 landscape. Trailer-style cuts (do NOT force a single continuous shot).

Return ONLY valid JSON, no markdown, in this exact shape:
{"omniPrompt": string, "title": string, "caption": string}
- "title": a short, absurd ALL-CAPS movie title based on the gossip (e.g. "THE PULL REQUEST").
- "caption": one short in-character line for the Slack post (lowercase, Nosy's texting voice).`;

export function parseTrailerScript(raw: string): TrailerScript {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in trailer script");
  const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<TrailerScript>;
  if (!obj.omniPrompt || !obj.title || !obj.caption) {
    throw new Error("trailer script missing required fields");
  }
  return { omniPrompt: obj.omniPrompt, title: obj.title, caption: obj.caption };
}

export async function buildTrailerPrompt(): Promise<TrailerScript> {
  const observations = await getRecentObservations(25);
  if (observations.length === 0) {
    throw new Error("NO_GOSSIP");
  }
  const gossip = observations.join("\n");
  const res = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      { role: "user", content: `Recent workplace gossip Nosy has witnessed:\n\n${gossip}\n\nPick the juiciest thread and write the trailer.` },
    ],
  });
  const text = res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseTrailerScript(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/trailer/script.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/trailer/script.ts src/lib/trailer/script.test.ts
git commit -m "feat: add Claude trailer prompt-craft for Nosy Productions"
```

---

## Task 4: Omni Flash video client (`omni.ts`)

Calls Omni Flash, handles both inline base64 and URI delivery, polls until the file is
ready, downloads the mp4 bytes. Verify the SDK surface early (preview API).

**Files:**
- Create: `src/lib/trailer/omni.ts`

- [ ] **Step 1: Verify the @google/genai SDK exposes the interactions API**

Run:
```bash
node -e "const g=require('@google/genai'); const c=new g.GoogleGenAI({apiKey:'x'}); console.log('interactions:', typeof c.interactions, '| files:', typeof c.files)"
```
Expected: `interactions: object | files: object`.
If `interactions` is `undefined`, run `npm install @google/genai@latest` and re-check;
if still missing, the preview API must be called via REST — see Step 3's REST fallback
comment and implement that branch instead.

- [ ] **Step 2: Write the implementation**

Create `src/lib/trailer/omni.ts`:
```ts
import { gemini, VIDEO_MODEL } from "../client";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 3 * 60 * 1000;

/**
 * Generates a video from a prompt via Gemini Omni Flash and returns the mp4 bytes.
 * Handles both inline base64 delivery and URI delivery (for files > 4MB).
 */
export async function generateVideo(omniPrompt: string): Promise<Buffer> {
  const interaction = await gemini.interactions.create({
    model: VIDEO_MODEL,
    input: omniPrompt,
    response_format: { type: "video", aspect_ratio: "16:9", delivery: "uri" },
  } as unknown as Parameters<typeof gemini.interactions.create>[0]);

  const output = (interaction as unknown as {
    output_video?: { data?: string; uri?: string };
  }).output_video;

  if (output?.data) {
    return Buffer.from(output.data, "base64");
  }
  if (!output?.uri) {
    throw new Error("Omni returned no video data or uri");
  }

  const fileName = output.uri.split("/").pop()?.split(":")[0];
  if (!fileName) throw new Error("could not parse Omni file name from uri");

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const info = await gemini.files.get({ name: `files/${fileName}` });
    const state = (info as unknown as { state?: string }).state;
    if (state === "ACTIVE") break;
    if (state === "FAILED") throw new Error("Omni video processing FAILED");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const bytes = await gemini.files.download({ file: output.uri });
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer);
}
```

Note: if Step 1 showed the SDK lacks `interactions`, replace the SDK calls with `fetch`
against `https://generativelanguage.googleapis.com/v1beta/interactions?key=${process.env.GEMINI_API_KEY}`
(POST body `{ model, input, response_format }`), read `steps[].model_output.content[].video`
for `data`/`uri`, poll `.../v1beta/files/{name}?key=...` for `state === "ACTIVE"`, then GET
the uri with `&key=...` to download bytes. Same return type (`Buffer`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/trailer/omni.ts
git commit -m "feat: add Gemini Omni Flash video client"
```

---

## Task 5: Orchestrator (`trailer/index.ts`)

**Files:**
- Create: `src/lib/trailer/index.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/trailer/index.ts`:
```ts
import { buildTrailerPrompt } from "./script";
import { generateVideo } from "./omni";

export interface Teaser {
  mp4: Buffer;
  title: string;
  caption: string;
}

/** Builds the Claude prompt, renders the Omni video, returns the deliverable. */
export async function generateTeaser(): Promise<Teaser> {
  const script = await buildTrailerPrompt();
  const mp4 = await generateVideo(script.omniPrompt);
  return { mp4, title: script.title, caption: script.caption };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/trailer/index.ts
git commit -m "feat: add teaser generation orchestrator"
```

---

## Task 6: Video delivery (`sendVideoDM`)

**Files:**
- Modify: `src/slack/dm.ts`

- [ ] **Step 1: Add sendVideoDM**

Append to `src/slack/dm.ts`:
```ts
/**
 * Uploads an mp4 to Nosy's DM with the user, with a caption as the initial comment.
 * Returns true on success, false on failure (caller should fall back to text).
 */
export async function sendVideoDM(
  userId: string,
  video: Buffer,
  filename: string,
  title: string,
  caption: string
): Promise<boolean> {
  try {
    const dm = await app.client.conversations.open({ users: userId });
    const channelId = dm.channel?.id;
    if (!channelId) {
      console.error("[dm] sendVideoDM: could not open DM channel");
      return false;
    }
    await app.client.files.uploadV2({
      channel_id: channelId,
      file: video,
      filename,
      title,
      initial_comment: caption,
    });
    return true;
  } catch (err) {
    console.error(`[dm] sendVideoDM failed for ${userId}:`, err);
    return false;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/slack/dm.ts
git commit -m "feat: add sendVideoDM for delivering mp4 teasers"
```

---

## Task 7: Movie intent handler + wiring (`movie.ts`)

Ties the gate, orchestrator, and delivery together, and posts the in-character messages.

**Files:**
- Create: `src/slack/movie.ts`
- Modify: `src/slack/conversation.ts`

- [ ] **Step 1: Write movie.ts**

Create `src/slack/movie.ts`:
```ts
import { app } from "./app";
import { MovieGate } from "./movieGate";
import { generateTeaser } from "../lib/trailer";
import { sendVideoDM } from "./dm";
import { appendMessage } from "../db/messages";

const MOVIES_ENABLED = process.env.MOVIES_ENABLED !== "false";
const gate = new MovieGate();

async function post(userId: string, text: string): Promise<void> {
  try {
    await app.client.chat.postMessage({ channel: userId, text, unfurl_links: false });
  } catch (err) {
    console.error("[movie] post failed:", err);
  }
}

async function renderAndDeliver(userId: string): Promise<void> {
  try {
    const teaser = await generateTeaser();
    const ok = await sendVideoDM(
      userId,
      teaser.mp4,
      `nosy-productions-${Date.now()}.mp4`,
      `NOSY PRODUCTIONS presents: ${teaser.title}`,
      `🍿 NOSY PRODUCTIONS presents: *${teaser.title}*\n${teaser.caption}`
    );
    if (!ok) {
      await post(userId, "the film's ready but slack won't take it 😩 try again in a sec");
      return;
    }
    await appendMessage(userId, { role: "assistant", content: `[made a movie teaser: ${teaser.title}]` });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason === "NO_GOSSIP") {
      await post(userId, "nothing's happened worth a movie yet lol. go stir up some drama first");
    } else {
      console.error("[movie] render failed:", err);
      await post(userId, "my studio's down 😩 catch the premiere saturday");
    }
  } finally {
    gate.clearRendering(userId);
  }
}

/**
 * Returns true if the message was a movie-related turn (caller should early-return).
 */
export async function handleMovieIntent(userId: string, text: string): Promise<boolean> {
  if (!MOVIES_ENABLED) return false;
  const decision = gate.decide(userId, text);
  switch (decision) {
    case "refuse":
      await post(userId, "🎬 NOSY PRODUCTIONS only premieres full features on *Saturdays*. come back sat");
      return true;
    case "deflect":
      await post(userId, "it's still rendering, patience 🎬 hollywood wasn't built in a day");
      return true;
    case "cave":
      gate.markRendering(userId);
      await post(userId, "ugh FINE. one teaser. gimme a sec, rendering 🎬🍿");
      void renderAndDeliver(userId);
      return true;
    case "ignore":
    default:
      return false;
  }
}
```

- [ ] **Step 2: Wire into conversation.ts**

In `src/slack/conversation.ts`, add the import near the other game imports (around line 11):
```ts
import { handleMovieIntent } from "./movie";
```

Then, immediately AFTER the game trigger block and BEFORE the `clear` handler
(after line 107, before the `/^(clear|reset...)/` block), add:
```ts
  // Movie teasers — refuse->cave gate, handled before the LLM turn.
  if (await handleMovieIntent(userId, userText)) return;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Lint check the two files**

Use the editor lint/`npx tsc --noEmit` output; expected: no new errors in
`src/slack/movie.ts` or `src/slack/conversation.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/slack/movie.ts src/slack/conversation.ts
git commit -m "feat: wire movie teaser intent + gate into DM flow"
```

---

## Task 8: Manual smoke script + docs

**Files:**
- Create: `scripts/test-trailer.ts`
- Modify: `README.md`

- [ ] **Step 1: Create the smoke script**

Create `scripts/test-trailer.ts`:
```ts
import { generateTeaser } from "../src/lib/trailer";
import { writeFileSync } from "node:fs";

(async () => {
  console.log("Building trailer prompt with Claude + rendering with Omni Flash...");
  const teaser = await generateTeaser();
  const out = `/tmp/${teaser.title.replace(/\s+/g, "_")}.mp4`;
  writeFileSync(out, teaser.mp4);
  console.log(`Title:   ${teaser.title}`);
  console.log(`Caption: ${teaser.caption}`);
  console.log(`Saved:   ${out} (${(teaser.mp4.length / 1024).toFixed(0)} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the smoke script (requires GEMINI_API_KEY + seeded observations)**

Run: `npx tsx --env-file .env scripts/test-trailer.ts`
Expected: prints a title/caption and writes a playable mp4 to `/tmp/`. Open it and
confirm: MGM-parody ident, comedic scenes, narrator voice, music, title card.
If Omni returns a safety block, note the message; the fallback path is covered in Task 7.

- [ ] **Step 3: Manual DM smoke test**

With `npm run dev` running: DM Nosy "make me a movie" → expect the Saturday refusal.
Reply "please just a teaser" → expect the "rendering 🎬" ack, then an mp4 arrives.

- [ ] **Step 4: Document the feature in README.md**

Add a short "Movie teasers" subsection under the features list describing: the
`movie`/`teaser` request, the Saturday gate + beg-to-unlock bit, Omni Flash generation,
and the `GEMINI_API_KEY` / `MOVIES_ENABLED` env vars.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all vitest suites pass (movieGate + script).

- [ ] **Step 6: Commit**

```bash
git add scripts/test-trailer.ts README.md
git commit -m "docs: add movie teaser smoke script and README section"
```

---

## Self-Review Notes

- **Spec coverage:** ident+comedic scenes (Task 3 SYSTEM prompt), Claude prompt-craft
  (Task 3), Omni one-shot (Task 4), gate refuse→cave (Task 2/7), smart-wait ack + async
  (Task 7), fallback lines incl. NO_GOSSIP (Task 7), delivery (Task 6), config/deps
  (Task 1), tests (Task 2/3) + manual integration (Task 8). Phase 2 (Saturday cron,
  ElevenLabs hybrid, persistent gate) intentionally excluded.
- **Type consistency:** `TrailerScript {omniPrompt,title,caption}` (Task 3) →
  `Teaser {mp4,title,caption}` (Task 5) → `sendVideoDM(...title,caption)` (Task 6) →
  `handleMovieIntent` (Task 7). `MovieGate.decide/markRendering/clearRendering` consistent
  across Task 2 and Task 7.
- **Known risk:** `@google/genai` preview surface (`interactions`) verified in Task 4
  Step 1 with a REST fallback documented if absent.
