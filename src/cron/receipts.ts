import cron from "node-cron";
import { getStaleReceipts, markReceiptAlerted } from "../db/receipts";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { sendDM } from "../slack/dm";

const STALE_HOURS = parseInt(process.env.RECEIPT_STALE_HOURS ?? "24");

export function startReceiptsCron(): void {
  cron.schedule("0 * * * *", async () => {
    console.log("[cron:receipts] checking stale receipts");
    const stale = await getStaleReceipts(STALE_HOURS);

    for (const receipt of stale) {
      const parts = receipt.thread_key.split(":");
      const channelId = parts[0] ?? receipt.channel_id;

      const subscribers = await getThreadAndChannelSubscribers(
        channelId,
        receipt.thread_key
      );

      if (subscribers.length === 0) {
        await markReceiptAlerted(receipt.id);
        continue;
      }

      const dueText =
        receipt.due_hint && receipt.due_hint !== "unclear"
          ? `they said "${receipt.due_hint}"`
          : "no timeline was given";

      const hoursAgo = Math.round(
        (Date.now() - new Date(receipt.created_at).getTime()) / 3600000
      );

      const dm =
        `<@${receipt.made_by}> said they'd ${receipt.commitment} — ` +
        `${dueText}. that was ${hoursAgo}h ago. thread's been quiet. 👀`;

      const threadTs = parts[1] ?? "";
      const threadLink = threadTs
        ? `https://slack.com/archives/${channelId}/p${threadTs.replace(".", "")}`
        : undefined;

      for (const userId of subscribers) {
        await sendDM(userId, dm, threadLink);
      }

      await markReceiptAlerted(receipt.id);
    }
  });

  console.log(`[cron:receipts] started — checking hourly, alerting after ${STALE_HOURS}h`);
}
