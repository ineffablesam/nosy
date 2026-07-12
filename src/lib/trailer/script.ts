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
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  return parseTrailerScript(text);
}
