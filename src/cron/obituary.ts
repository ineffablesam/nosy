import cron from "node-cron";
import { supabase } from "../db/client";
import { markObituary } from "../db/state";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { storeObservation } from "../db/observations";
import { fetchThreadMessages } from "../lib/thread";
import { writeObituary } from "../lib/obituary";
import { sendDM } from "../slack/dm";

const SILENCE_HOURS = parseInt(process.env.OBITUARY_SILENCE_HOURS ?? "4");

export function startObituaryCron(): void {
  // Offset from receipts cron by 30 min so they don't both hit Claude at the same time
  cron.schedule("30 * * * *", async () => {
    console.log("[cron:obituary] checking for silent threads");

    const cutoff = new Date(Date.now() - SILENCE_HOURS * 3600000).toISOString();

    const { data: candidates, error } = await supabase
      .from("thread_state")
      .select("thread_key, message_count, last_message_at")
      .eq("obituary_sent", false)
      .lt("last_message_at", cutoff)
      .gte("message_count", 4);

    if (error) {
      console.error("[cron:obituary] query failed:", error);
      return;
    }
    if (!candidates || candidates.length === 0) return;

    for (const row of candidates as Array<{
      thread_key: string;
      message_count: number;
      last_message_at: string;
    }>) {
      const parts = row.thread_key.split(":");
      if (parts.length !== 2) {
        await markObituary(row.thread_key);
        continue;
      }
      const [channelId, threadTs] = parts as [string, string];

      const subscribers = await getThreadAndChannelSubscribers(channelId, row.thread_key);
      if (subscribers.length === 0) {
        await markObituary(row.thread_key);
        continue;
      }

      const messages = await fetchThreadMessages(channelId, threadTs);
      const obituary = await writeObituary(messages);

      await markObituary(row.thread_key);

      if (!obituary) continue;

      // Store the obituary as an observation so Nosy remembers how this thread ended
      await storeObservation({
        thread_key: row.thread_key,
        channel_id: channelId,
        people: [...new Set(messages.map((m) => m.userId))],
        observation: `[OBITUARY] ${obituary}`,
      });

      const threadLink = `https://slack.com/archives/${channelId}/p${threadTs.replace(".", "")}`;
      for (const userId of subscribers) {
        await sendDM(userId, obituary, threadLink);
      }
    }
  });

  console.log(`[cron:obituary] started — eulogizing threads silent for ${SILENCE_HOURS}h+`);
}
