# Nosy Productions — Gossip Movie Teasers (Design)

**Date:** 2026-07-12
**Status:** Approved for planning
**Scope of this spec:** the on-demand **teaser** pipeline. The Saturday full-length
"movie" is a documented Phase 2 that reuses the same pipeline.

## 1. Summary

Nosy runs a fake film studio, "Nosy Productions." On request it turns real workplace
gossip (from the `observations` table) into a **fully comedic, cinematic ~8-second
movie trailer** — real generated scenes (characters, offices, dramatic action), an
epic narrator voiceover, tense orchestral music, boom/whoosh sound fx, and a title
card — delivered as an mp4 directly in the user's DM.

Every teaser opens with an **MGM-parody studio ident**: a gold "NOSY PRODUCTIONS"
title card with a mascot (a giant blinking eyeball / nosy character) in place of the
roaring lion, plus a dramatic fanfare. This is the signature branding gag.

The comedy engine is contrast: a deadly-serious blockbuster trailer treating petty
office drama ("someone pushed to main on a Friday") as an epic event. The visuals
themselves are played for laughs — over-the-top slow-mo, absurd stakes, deadpan
office settings shot like an action film.

The feature is gated as a running bit: **full features only premiere on Saturdays.**
The user must push/beg once before Nosy caves and produces a teaser.

## 2. Goals / Non-goals

**Goals**
- One DM command surface: user asks for a "movie/trailer/teaser" and Nosy responds in character.
- Refuse-then-cave gate ("Saturdays only" → beg → teaser).
- Generate a genuinely funny, cinematic short video from recent gossip.
- "Smart wait" UX: acknowledge immediately, generate async, deliver when ready.
- Graceful, in-character fallback when generation fails.

**Non-goals (this spec)**
- The Saturday full-length movie (Phase 2).
- ElevenLabs narration / ffmpeg compositing (Omni Flash produces audio natively; a
  hybrid ElevenLabs narrator is a documented future upgrade).
- Persistent gate state across server restarts (in-memory is acceptable for now).

## 3. Video engine — Gemini Omni Flash (one-shot)

We use `gemini-omni-flash-preview`, which generates a video **with native audio**
(narrator voiceover, music, sound fx) and readable on-screen text from a single text
prompt, with timing control (`[0-2s] ...`) and aspect-ratio control.

The agent's core job is **prompt-craft**: converting gossip observations into a
cinematic, funny trailer prompt. **The prompt is the product.** The prompt is written
by **Claude** (Anthropic via the existing `client.ts`), using a capable model
(`DEFAULT_MODEL` / Sonnet, not Haiku) because prompt quality directly determines the
video quality.

The emitted Omni prompt must follow the **Gemini Omni Flash prompt guide** (see §5a):
timecode syntax for beats, explicit audio directives, on-screen text syntax for the
title card, and meta-prompting for rich comedic detail.

- Model: `gemini-omni-flash-preview` (preview — quality/text varies run to run).
- Aspect ratio: 16:9 (landscape).
- Delivery: `delivery: "uri"` (teasers may exceed the 4MB inline limit); poll
  `files.get` until `ACTIVE`, then download bytes.
- Options: `background=false` for synchronous unary generation.
- Duration: teaser targeted at ~8s via the prompt's timing syntax.

## 4. User experience & flow

1. User DMs something matching movie intent (e.g. "make me a movie", "nosy trailer",
   "can i get a teaser", "nosy pictures").
2. **First ask (not primed):** Nosy refuses in character and marks the user "primed":
   > 🎬 NOSY PRODUCTIONS only premieres full features on Saturdays. come back sat.
3. **User pushes again (primed):** any follow-up that reads as a beg
   (`please/pls/come on/cmon/just/teaser/pretty please`) — or another movie-ish
   message within the primed window — makes Nosy cave:
   > ugh FINE. one teaser. gimme a sec, rendering 🎬
   Nosy immediately kicks off async generation.
4. **On success (~30s–2min):** the mp4 is uploaded to the DM with a caption:
   > 🍿 NOSY PRODUCTIONS presents: *THE PULL REQUEST*
5. **On failure:** in-character fallback:
   > my studio's down 😩 catch the premiere saturday
6. A history marker (`[made a movie teaser: <title>]`) is appended so Nosy can
   reference the movie later in normal chat ("did u even watch it 💀").

## 5. Architecture & modules

Small, single-purpose units:

### `src/slack/movie.ts`
- Exports `handleMovieIntent(userId, text): Promise<boolean>` — returns `true` if it
  handled the turn (so `conversation.ts` can early-return, same pattern as games).
- Owns the gate state machine (see §6), posts the ack, fires generation async, and
  handles delivery + fallback.
- Wired into `conversation.ts` **before** the LLM turn (alongside the game triggers).

### `src/lib/trailer/script.ts`
- `buildTrailerPrompt(): Promise<TrailerScript>`.
- Pulls juiciest recent gossip via `getRecentObservations(25)`.
- **Claude** (`anthropic` client, `DEFAULT_MODEL`/Sonnet) selects + weaves the
  observations into one cohesive, over-dramatic, **fully comedic** mini-plot and emits
  a `TrailerScript`:
  - `omniPrompt: string` — the full Gemini Omni Flash prompt (structured per §5a).
  - `title: string` — short absurd movie title (e.g. "THE PULL REQUEST").
  - `caption: string` — the Slack caption line.
- Claude is driven by a system prompt that (a) embeds the Omni prompt-guide rules,
  (b) instructs it to describe **real comedic scenes**, not text cards, (c) always
  opens with the MGM-parody "NOSY PRODUCTIONS" ident, and (d) returns strict JSON
  (`{ omniPrompt, title, caption }`) so we parse reliably.
- Anonymization: prefer first names / playful framing to reduce safety-filter blocks.

### 5a. The Omni Flash prompt structure (what Claude emits)

Claude composes `omniPrompt` following the Gemini Omni Flash prompt guide, roughly:

- **Studio ident (0–2s):** MGM-parody opening — "a golden, ornate film-studio ident;
  a giant cartoon eyeball mascot blinks/roars where the MGM lion would be; ribbon
  banner reads `NOSY PRODUCTIONS`; grand orchestral fanfare." On-screen text syntax
  used for the `NOSY PRODUCTIONS` wordmark.
- **Comedic scenes (2–7s):** 2–3 timed beats using `[2-4s] ... [4-6s] ...` timecode
  syntax, each a real, absurd, deadpan office scene dramatizing the gossip in
  blockbuster style (slow-mo, dramatic push-ins, exaggerated stakes). Rich visual
  detail via meta-prompting ("be specific about people, items, environment").
- **Title card (7–8s):** the movie `title` rendered on screen via the text-in-video
  syntax, over a final music sting.
- **Audio directive (global):** "deep, over-serious movie-trailer narrator voiceover
  reading the lines; building tense orchestral score; boom/whoosh sfx on cuts."
- **Negative guidance:** "No character dialogue — narrator voiceover only. No
  captions/subtitles except the specified on-screen text."
- **Tone directive:** fully comedic — the humor comes from treating trivial office
  drama as an epic thriller.
- **Format/length:** 16:9, ~8s total; multi-shot (do *not* force a single continuous
  scene — we want trailer-style cuts).

### `src/lib/trailer/omni.ts`
- `generateVideo(omniPrompt): Promise<Buffer>`.
- Uses `@google/genai`: `interactions.create({ model, input, response_format })`.
- Polls `files.get` until `ACTIVE`; downloads mp4 → `Buffer`.
- Timeout guard (~3 min) + one retry; throws on hard failure.

### `src/lib/trailer/index.ts`
- `generateTeaser(): Promise<{ mp4: Buffer; title: string; caption: string }>`.
- Orchestrates: `buildTrailerPrompt()` → `generateVideo()` → returns asset.

### `src/slack/dm.ts` (extend)
- Add `sendVideoDM(userId, mp4, filename, title, caption): Promise<boolean>` mirroring
  `sendMemeDM` but uploading the mp4 via `files.uploadV2` with the caption.

## 6. Gate state machine

In-memory maps in `movie.ts` (single-process socket-mode app):
- `primed: Map<userId, number>` — timestamp when the user was refused; valid for a
  10-minute window.
- `rendering: Set<userId>` — a teaser is currently generating for this user.

Transitions on a movie-intent or beg message:
- Not primed + movie intent → **refuse**, set `primed[user]=now`, handled.
- Primed (within window) + (movie intent OR beg phrasing) → **cave**: clear `primed`,
  add to `rendering`, post ack, fire async generation, handled.
- Already in `rendering` → gently deflect ("it's still rendering, patience 🎬"), handled.
- Primed window expired → treat as a fresh first ask (refuse again).

**Trade-off:** in-memory state resets on restart. A `movie_gate(user_id, refused_at)`
table is the drop-in upgrade if persistence is wanted; not required for the demo.

## 7. Delivery

- `files.uploadV2` to the opened DM channel (same approach as `sendMemeDM`), with the
  mp4 buffer, a `.mp4` filename, `title`, and the caption as the initial comment.
- On upload failure, send the text fallback line so the user always gets a response.

## 8. Configuration, dependencies, scope

- **New dependency:** `@google/genai`.
- **New env vars:**
  - `GEMINI_API_KEY` — AI Studio key.
  - `GEMINI_VIDEO_MODEL` — default `gemini-omni-flash-preview`.
  - `MOVIES_ENABLED` (optional, default `true`) — feature flag mirroring `MEMES_ENABLED`.
- Wiring: `conversation.ts` imports `handleMovieIntent` and calls it before the LLM
  turn (same pattern as `startGame`); if it returns `true`, `conversation.ts`
  early-returns. `movie.ts` registers no `app.action` handlers, so no `index.ts`
  import is required.
- ElevenLabs is intentionally unused in this phase.

## 9. Error handling & edge cases

- **Safety filter block** (named people / sensitive content): prompt-craft anonymizes;
  on block → in-character fallback line.
- **No observations yet:** Nosy replies "nothing's happened worth a movie yet lol"
  (no generation attempted).
- **Concurrent / spam requests:** `rendering` set prevents double-triggering per user.
- **Long render:** the ack sets expectations; an optional "still rolling film..." ping
  after ~45s is a nice-to-have, omitted from v1.
- **Upload/size limits:** teasers are small; `delivery:"uri"` handles >4MB from Omni.

## 10. Testing

- **Unit:**
  - Gate state machine: first ask → refuse; beg while primed → cave; expired window →
    refuse again; rendering → deflect.
  - `script.ts`: given sample observations, returns a `TrailerScript` with a non-empty
    `omniPrompt`, `title`, and `caption` (Omni + LLM mocked).
- **Manual smoke:** DM `movie` → refusal; `please` → ack message then delivered mp4;
  simulate Omni failure → fallback line.

## 11. Phase 2 (future, not in this spec)

- Saturday cron auto-premieres a **full-length movie** (longer Omni prompt / multi-shot,
  optionally an ElevenLabs signature narrator overlaid via ffmpeg — the "hybrid").
- Optional persistent `movie_gate` table.
- User-directed movies ("make one about the deploy drama").
