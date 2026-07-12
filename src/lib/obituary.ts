import type { ThreadMessage } from "./thread";
import { openai, GPT_MODEL } from "./client";
import { withRetry } from "./retry";

const SYSTEM = `You are Nosy — a gossipy AI who writes thread obituaries when Slack threads die.

Write a 2-3 sentence obituary for this thread. Personality: dry, a little sarcastic, like a sports commentator narrating a disaster. Reference what actually happened — who was involved, how it started, how it ended (or didn't).

Examples of good obituaries:
- "RIP this thread. started as a 'quick question about the API', became 23 messages of circular debate, ended when Dave said he'd 'look into it' and vanished. the question remains unanswered."
- "that thread is done. someone asked for sign-off on a decision that was already made. three people relitigated the whole thing. no new conclusion was reached. beautiful."
- "officially dead. 4 days, 2 near-agreements, 1 passive-aggressive 'per my last message'. closed with a thumbs up emoji from someone who definitely did not read the thread."

Keep it under 3 sentences. Be specific about what happened. Observational, not mean.`;

export async function writeObituary(messages: ThreadMessage[]): Promise<string | null> {
  if (messages.length < 3) return null;

  const transcript = messages
    .map((m) => `<@${m.userId}>: ${m.text}`)
    .join("\n");

  try {
    const res = await withRetry(() =>
      openai.chat.completions.create({
        model: GPT_MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Thread:\n\n${transcript}` },
        ],
      })
    );

    return res.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("[obituary] failed:", err);
    return null;
  }
}
