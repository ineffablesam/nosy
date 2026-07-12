import cron from "node-cron";
import { getStaleReceipts, markReceiptAlerted } from "../db/receipts";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { sendBlockDM } from "../slack/dm";
import { buildReceiptCard, encodeReceiptPayload, threadPermalink } from "../slack/blocks";

const STALE_HOURS = parseInt(process.env.RECEIPT_STALE_HOURS ?? "24");

export function startReceiptsCron(): void {
  cron.schedule("0 * * * *", async () => {
    console.log("[cron:receipts] checking stale receipts");
    const stale = await getStaleReceipts(STALE_HOURS);

    for (const receipt of stale) {
      const parts = receipt.thread_key.split(":");
      const channelId = parts[0] ?? receipt.channel_id;
      const threadTs = parts[1] ?? "";
      const threadLink = threadTs ? threadPermalink(channelId, receipt.thread_key) : undefined;

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
          ? receipt.due_hint
          : null;

      const hoursAgo = Math.round(
        (Date.now() - new Date(receipt.created_at).getTime()) / 3600000
      );

      const payload = encodeReceiptPayload({
        r: receipt.id,
        m: receipt.made_by,
        c: receipt.commitment,
        t: receipt.thread_key,
        ch: channelId,
      });

      const card = buildReceiptCard({
        madeBy: receipt.made_by,
        commitment: receipt.commitment,
        dueHint: dueText,
        hoursAgo,
        threadLink: threadLink ?? "",
        payload,
      });

      for (const userId of subscribers) {
        await sendBlockDM(userId, card.text, card.blocks);
      }

      await markReceiptAlerted(receipt.id);
    }
  });

  console.log(`[cron:receipts] started — checking hourly, alerting after ${STALE_HOURS}h with interactive cards`);
}
