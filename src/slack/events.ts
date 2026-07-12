import { app } from "./app";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { getThreadState, setLastAlertedAt, recordMessage } from "../db/state";
import { getRecentObservations, storeObservation } from "../db/observations";
import { storeReceipt, resolveReceiptsInThread } from "../db/receipts";
import { fetchThreadMessages } from "../lib/thread";
import { analyzeThread } from "../lib/analyze";
import { logLLM } from "../lib/llmLog";
import { sendDM } from "./dm";

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between DMs per thread

// Per-thread mutex — if a burst arrives mid-analysis, rerun when done.
const analyzing = new Set<string>();
const needsRerun = new Set<string>();

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
  const messages = await fetchThreadMessages(channel, thread_ts);
  if (messages.length === 0) {
    logLLM("events", `skip ${threadKey} — no messages fetched`);
    return;
  }

  logLLM("events", `analyze ${threadKey} — ${messages.length} msgs, ${subscribers.length} subscriber(s)`);
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
    const preview =
      result.observation.length > 72
        ? `${result.observation.slice(0, 72)}…`
        : result.observation;
    logLLM("events", `stored observation — ${preview}`);
  } else {
    logLLM("events", "no observation returned");
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
  if (!shouldAlert) {
    logLLM("events", `done ${threadKey} — no alert`);
    return;
  }

  // Cooldown only gates DMs — observations/receipts always accumulate.
  const state = await getThreadState(threadKey);
  if (
    state?.last_alerted_at &&
    Date.now() - new Date(state.last_alerted_at).getTime() < COOLDOWN_MS
  ) {
    logLLM("events", `done ${threadKey} — alert suppressed (cooldown)`);
    return;
  }

  logLLM("events", `sending alert to ${subscribers.length} subscriber(s)`);
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
}

async function scheduleAnalysis(
  channel: string,
  thread_ts: string,
  threadKey: string,
  subscribers: string[]
): Promise<void> {
  if (analyzing.has(threadKey)) {
    needsRerun.add(threadKey);
    return;
  }

  analyzing.add(threadKey);
  try {
    do {
      needsRerun.delete(threadKey);
      await runAnalysis(channel, thread_ts, threadKey, subscribers);
    } while (needsRerun.has(threadKey));
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
  if (subscribers.length === 0) {
    logLLM("events", `skip ${threadKey} — no subscribers`);
    return;
  }

  logLLM("events", `thread reply ${threadKey}`);
  scheduleAnalysis(channel, thread_ts, threadKey, subscribers).catch((err) =>
    console.error("[events] scheduleAnalysis failed:", err)
  );
});
