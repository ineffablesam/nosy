import { app } from "./app";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { getThreadState, setLastAlertedAt, recordMessage } from "../db/state";
import { getRecentObservations, storeObservation } from "../db/observations";
import { storeReceipt, resolveReceiptsInThread } from "../db/receipts";
import { fetchThreadMessages } from "../lib/thread";
import { analyzeThread } from "../lib/analyze";
import { sendDM } from "./dm";

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between DMs per thread

// How long to wait after the last message in a thread before running analysis.
// Lets a burst of seeder messages settle so Claude sees the full story.
const DEBOUNCE_MS = parseInt(process.env.ANALYSIS_DEBOUNCE_MS ?? "8000");

// Per-thread debounce timers — reset on every new message.
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Mutex: prevents two timers for the same thread from analyzing concurrently.
const analyzing = new Set<string>();

// Serial queue: ensures only one Claude call runs at a time across all threads.
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

async function runAnalysis(
  channel: string,
  thread_ts: string,
  threadKey: string,
  subscribers: string[]
): Promise<void> {
  // Mutex: if a previous timer already triggered analysis for this thread, skip.
  if (analyzing.has(threadKey)) return;
  analyzing.add(threadKey);

  try {
    // Cooldown: don't re-alert within 10 min of the last DM for this thread.
    const state = await getThreadState(threadKey);
    if (
      state?.last_alerted_at &&
      Date.now() - new Date(state.last_alerted_at).getTime() < COOLDOWN_MS
    ) return;

    // Fetch the full thread — all messages have now arrived (burst settled).
    const messages = await fetchThreadMessages(channel, thread_ts);
    if (messages.length === 0) return;

    const memory = await getRecentObservations(20);

    // Serialize Claude calls — one at a time to avoid API overload.
    let result: Awaited<ReturnType<typeof analyzeThread>>;
    await (analysisQueue = analysisQueue.then(() => analyzeThread(messages, memory)).then(r => { result = r; }));
    result = result!;

    if (result.observation) {
      const people = [...new Set(messages.map((m) => m.userId))];
      await storeObservation({
        thread_key: threadKey,
        channel_id: channel,
        people,
        observation: result.observation,
      });
    }

    if (result.receipt) {
      await storeReceipt({
        thread_key: threadKey,
        channel_id: channel,
        made_by: result.receipt.madeBy,
        commitment: result.receipt.commitment,
        due_hint: result.receipt.dueHint,
      });
    }

    if (result.resolves_receipt) {
      await resolveReceiptsInThread(threadKey);
    }

    const shouldAlert = result.notify || result.blindspot_worthy;
    if (!shouldAlert) return;

    await setLastAlertedAt(threadKey);

    const threadLink = `https://slack.com/archives/${channel}/p${thread_ts.replace(".", "")}`;
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
}

app.event("message", async ({ event }) => {
  // Only thread replies
  if (!("thread_ts" in event) || !event.thread_ts) return;
  // Ignore system noise (edits, deletions, joins) — but allow bot_message
  // so seeded demo data triggers Nosy.
  const SKIP_SUBTYPES = new Set([
    "message_changed", "message_deleted", "message_replied",
    "channel_join", "channel_leave", "channel_archive",
  ]);
  if ("subtype" in event && event.subtype && SKIP_SUBTYPES.has(event.subtype as string)) return;

  const { channel, thread_ts } = event as { channel: string; thread_ts: string };
  const threadKey = `${channel}:${thread_ts}`;

  // Always track message activity (needed for obituary cron).
  await recordMessage(threadKey);

  const subscribers = await getThreadAndChannelSubscribers(channel, threadKey);
  if (subscribers.length === 0) return;

  // Reset the debounce timer — each new message pushes analysis further out.
  // Once the burst stops for DEBOUNCE_MS, runAnalysis fires with the full thread.
  const existing = debounceTimers.get(threadKey);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    threadKey,
    setTimeout(() => {
      debounceTimers.delete(threadKey);
      runAnalysis(channel, thread_ts, threadKey, subscribers).catch((err) =>
        console.error("[events] runAnalysis failed:", err)
      );
    }, DEBOUNCE_MS)
  );
});
