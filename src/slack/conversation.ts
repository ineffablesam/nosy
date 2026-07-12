import { app } from "./app";
import { getRecentObservations } from "../db/observations";
import { getConversationHistory, appendMessage, clearConversationHistory } from "../db/messages";
import { respondToDM } from "../lib/respond";

app.message(async ({ message }) => {
  // Only handle direct messages
  if (!("channel_type" in message) || message.channel_type !== "im") return;
  // Ignore Nosy's own messages and other bots
  if ("bot_id" in message && message.bot_id) return;
  if (!("user" in message) || !message.user) return;
  if (!("text" in message) || !message.text) return;

  const userId = message.user as string;
  const userText = (message.text as string).trim();

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
  // so Claude doesn't see the user message twice
  const priorHistory = history.slice(0, -1);

  const reply = await respondToDM(userText, priorHistory, memory);

  await appendMessage(userId, { role: "assistant", content: reply });

  await app.client.chat.postMessage({
    channel: userId,
    text: reply,
    unfurl_links: false,
  });
});
