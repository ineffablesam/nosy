import { app } from "./app";
import { getRecentObservations } from "../db/observations";
import { getConversationHistory, appendMessage, clearConversationHistory } from "../db/messages";
import { respondToDM, type DMResponse } from "../lib/respond";
import { generateMeme } from "../lib/meme";
import { sendMemeDM } from "./dm";

// Set MEMES_ENABLED=false in .env to disable meme generation entirely.
const MEMES_ENABLED = process.env.MEMES_ENABLED !== "false";

async function postText(userId: string, text: string): Promise<void> {
  try {
    await app.client.chat.postMessage({
      channel: userId,
      text,
      unfurl_links: false,
    });
  } catch (err) {
    console.error("[conversation] postText failed:", err);
  }
}

function memeMarker(prompt: string): string {
  const short = prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt;
  return `[sent a meme: ${short}]`;
}

/**
 * Handles a turn where Nosy decided to send a meme (optionally with text
 * before or after it). Falls back gracefully to text if generation fails.
 */
async function handleMemeTurn(userId: string, resp: DMResponse): Promise<void> {
  const prompt = resp.meme!.prompt;
  const text = resp.reply && resp.reply.trim() ? resp.reply.trim() : null;
  const placement = resp.meme!.textPlacement;

  // 1. Text before the meme (sets it up).
  if (placement === "before" && text) {
    await postText(userId, text);
  }

  // 2. Generate and deliver the meme.
  let memeOk = false;
  try {
    const meme = await generateMeme(prompt);
    memeOk = await sendMemeDM(userId, meme.image, meme.filename);
  } catch (err) {
    console.error("[conversation] meme generation failed:", err);
  }

  if (!memeOk) {
    // Make sure the user still gets something.
    if (text && placement !== "before") {
      await postText(userId, text);
    } else if (!text) {
      await postText(userId, "couldn't get the meme to load 😭 my bad");
    }
    await appendMessage(userId, {
      role: "assistant",
      content: text
        ? `${text} ${memeMarker(prompt)} [failed]`
        : `${memeMarker(prompt)} [failed]`,
    });
    return;
  }

  // 3. Text after the meme (caption / reaction).
  if (placement === "after" && text) {
    await postText(userId, text);
  }

  // 4. Record the turn in history — the marker tells future-you that a meme
  //    was just sent so you don't spam back-to-back memes.
  const memory = text ? `${text} ${memeMarker(prompt)}` : memeMarker(prompt);
  await appendMessage(userId, { role: "assistant", content: memory });
}

app.message(async ({ message }) => {
  // Only handle direct messages
  if (!("channel_type" in message) || message.channel_type !== "im") return;
  // Ignore Nosy's own messages and other bots
  if ("bot_id" in message && message.bot_id) return;
  if (!("user" in message) || !message.user) return;
  if (!("text" in message) || !message.text) return;

  const userId = message.user as string;
  const userText = (message.text as string).trim();

  // Slash commands fire both a command event AND a message event in DMs.
  // Let the command handler own those — ignore them here.
  if (userText.startsWith("/")) return;

  // "clear" resets memory AND deletes all of Nosy's messages from the DM channel
  if (/^(clear|reset|forget|start over)$/i.test(userText)) {
    await clearConversationHistory(userId);

    // Open the DM channel to get its ID, then delete all bot messages
    try {
      const dm = await app.client.conversations.open({ users: userId });
      const channelId = dm.channel?.id;
      if (channelId) {
        let cursor: string | undefined;
        do {
          const history = await app.client.conversations.history({
            channel: channelId,
            limit: 200,
            cursor,
          });
          for (const msg of history.messages ?? []) {
            if (msg.ts && msg.bot_id) {
              try { await app.client.chat.delete({ channel: channelId, ts: msg.ts }); } catch { /* skip */ }
            }
          }
          cursor = history.response_metadata?.next_cursor ?? undefined;
        } while (cursor);
      }
    } catch (err) {
      console.error("[conversation] clear DM messages failed:", err);
    }

    return;
  }

  // Save the user's message to conversation history
  await appendMessage(userId, { role: "user", content: userText });

  // Get context: conversation history + Nosy's full memory
  const [history, memory] = await Promise.all([
    getConversationHistory(userId, 10),
    getRecentObservations(25),
  ]);

  // history includes the message we just appended — pass everything except the last item
  // so the LLM doesn't see the user message twice
  const priorHistory = history.slice(0, -1);

  const resp = await respondToDM(userText, priorHistory, memory);

  if (resp.meme && MEMES_ENABLED) {
    await handleMemeTurn(userId, resp);
    return;
  }

  // Plain text reply — either no meme was chosen, or memes are disabled.
  const text = resp.reply ?? "👀";
  await appendMessage(userId, { role: "assistant", content: text });
  await postText(userId, text);
});
