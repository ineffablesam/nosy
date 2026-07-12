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
