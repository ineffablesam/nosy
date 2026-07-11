import { app } from "./app";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { getThreadState, setLastAlertedAt, recordMessage } from "../db/state";
import { getRecentObservations, storeObservation } from "../db/observations";
import { storeReceipt, resolveReceiptsInThread } from "../db/receipts";
import { fetchThreadMessages } from "../lib/thread";
import { analyzeThread } from "../lib/analyze";
import { sendDM } from "./dm";

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between DMs per thread

app.event("message", async ({ event }) => {
  // Only thread replies
  if (!("thread_ts" in event) || !event.thread_ts) return;
  // Ignore edits, deletions, bot messages, joins, etc.
  if ("subtype" in event && event.subtype) return;

  const { channel, thread_ts } = event as { channel: string; thread_ts: string };
  const threadKey = `${channel}:${thread_ts}`;

  // Track message activity (needed for obituary cron)
  await recordMessage(threadKey);

  // Get all subscribers: thread-specific + anyone watching the whole channel
  const subscribers = await getThreadAndChannelSubscribers(channel, threadKey);
  if (subscribers.length === 0) return;

  // Cooldown: don't run Claude on every single message in a fast thread
  const state = await getThreadState(threadKey);
  if (
    state?.last_alerted_at &&
    Date.now() - new Date(state.last_alerted_at).getTime() < COOLDOWN_MS
  ) return;

  // Fetch the real thread content
  const messages = await fetchThreadMessages(channel, thread_ts);
  if (messages.length === 0) return;

  // Pull Nosy's accumulated memory
  const memory = await getRecentObservations(20);

  // One Claude call: notify + dm + observation + receipt + blindspot + resolves_receipt
  const result = await analyzeThread(messages, memory);

  // Always store observations — memory compounds over time
  if (result.observation) {
    const people = [...new Set(messages.map((m) => m.userId))];
    await storeObservation({
      thread_key: threadKey,
      channel_id: channel,
      people,
      observation: result.observation,
    });
  }

  // Store receipt if Claude detected a commitment
  if (result.receipt) {
    await storeReceipt({
      thread_key: threadKey,
      channel_id: channel,
      made_by: result.receipt.madeBy,
      commitment: result.receipt.commitment,
      due_hint: result.receipt.dueHint,
    });
  }

  // Mark receipts resolved if message sounds like completion
  if (result.resolves_receipt) {
    await resolveReceiptsInThread(threadKey);
  }

  const shouldAlert = result.notify || result.blindspot_worthy;
  if (!shouldAlert) return;

  await setLastAlertedAt(threadKey);

  const threadLink = `https://slack.com/archives/${channel}/p${thread_ts.replace(".", "")}`;

  // Build set of user IDs who have actually spoken in this thread
  const activeUserIds = new Set(messages.map((m) => m.userId));

  for (const userId of subscribers) {
    const isActive = activeUserIds.has(userId);

    if (isActive && result.notify && result.dm) {
      // Active subscriber gets the main drama DM
      await sendDM(userId, result.dm, threadLink);
    } else if (!isActive && result.blindspot_worthy && result.blindspot_dm) {
      // Silent subscriber gets the blindspot warning
      await sendDM(userId, result.blindspot_dm, threadLink);
    }
  }
});
