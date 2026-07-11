import { app } from "./app";
import { getRecentObservations } from "../db/observations";
import { getConversationHistory, appendMessage } from "../db/messages";
import { respondToDM } from "../lib/respond";

app.message(async ({ message }) => {
  // Only handle direct messages
  if (!("channel_type" in message) || message.channel_type !== "im") return;
  // Ignore Nosy's own messages and other bots
  if ("bot_id" in message && message.bot_id) return;
  if (!("user" in message) || !message.user) return;
  if (!("text" in message) || !message.text) return;

  const userId = message.user as string;
  const userText = message.text as string;

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
