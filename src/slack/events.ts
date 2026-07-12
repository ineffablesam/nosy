import { app } from "./app";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { getThreadState, setLastAlertedAt, recordMessage } from "../db/state";
import { getRecentObservations, storeObservation } from "../db/observations";
import { storeReceipt, resolveReceiptsInThread } from "../db/receipts";
import { fetchThreadMessages } from "../lib/thread";
import { analyzeThread, type AnalysisResult } from "../lib/analyze";
import { sendDM } from "./dm";

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between DMs per thread

// In-memory lock: prevents concurrent analysis of the same thread.
const analyzing = new Set<string>();

// Serial queue: ensures only one Claude call runs at a time across all threads.
// Prevents API overload when the seeder floods many threads simultaneously.
let analysisQueue = Promise.resolve();

// Global per-user rate limit: max 1 DM every 3 minutes across all threads.
const lastDMedAt = new Map<string, number>();
const GLOBAL_DM_COOLDOWN_MS = 3 * 60 * 1000;

async function sendDMRateLimited(userId: string, message: string, link: string) {
  const last = lastDMedAt.get(userId) ?? 0;
  if (Date.now() - last < GLOBAL_DM_COOLDOWN_MS) return;
  lastDMedAt.set(userId, Date.now());
  await sendDM(userId, message, link);
}

app.event("message", async ({ event }) => {
  // Only thread replies
  if (!("thread_ts" in event) || !event.thread_ts) return;
  // Ignore system noise (edits, deletions, joins) — but allow bot_message
  // so seeded demo data triggers Nosy. DMs from Nosy itself have no thread_ts
  // so they can't cause a loop.
  const SKIP_SUBTYPES = new Set([
    "message_changed", "message_deleted", "message_replied",
    "channel_join", "channel_leave", "channel_archive",
  ]);
  if ("subtype" in event && event.subtype && SKIP_SUBTYPES.has(event.subtype as string)) return;

  const { channel, thread_ts } = event as { channel: string; thread_ts: string };
  const threadKey = `${channel}:${thread_ts}`;

  // Track message activity (needed for obituary cron)
  await recordMessage(threadKey);

  // Drop event if this thread is already mid-analysis — prevents duplicate DMs
  if (analyzing.has(threadKey)) return;
  analyzing.add(threadKey);

  try {
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

    // Serialize Claude calls — one at a time to avoid API overload under seeder load
    let result: Awaited<ReturnType<typeof analyzeThread>>;
    await (analysisQueue = analysisQueue.then(() => analyzeThread(messages, memory)).then(r => { result = r; }));
    result = result!;

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

      if (result.notify && result.dm) {
        await sendDMRateLimited(userId, result.dm, threadLink);
      } else if (!isActive && result.blindspot_worthy && result.blindspot_dm) {
        await sendDMRateLimited(userId, result.blindspot_dm, threadLink);
      }
    }
  } finally {
    analyzing.delete(threadKey);
  }
});
