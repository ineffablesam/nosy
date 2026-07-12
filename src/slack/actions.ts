import { app } from "./app";
import type { KnownBlock } from "@slack/types";
import { snoozeReceipt, markReceiptDone } from "../db/receipts";
import { sendDM, sendBlockDM } from "./dm";
import {
  decodeReceiptPayload,
  threadPermalink,
  buildReceiptSettledCard,
} from "./blocks";
// Minimal shape of a BlockAction payload — Bolt's full union is verbose and we
// only need a few fields, so cast to this.
interface BlockActionBody {
  user: { id: string };
  channel: { id: string };
  message: { ts: string };
  actions: Array<{ action_id: string; value?: string }>;
}

function bodyOf(args: { body: unknown }): BlockActionBody {
  return args.body as unknown as BlockActionBody;
}

async function updateCard(
  client: typeof app.client,
  channelId: string,
  messageTs: string,
  blocks: KnownBlock[],
  text: string
): Promise<void> {
  try {
    await client.chat.update({ channel: channelId, ts: messageTs, text, blocks });
  } catch (err) {
    console.error("[actions] chat.update failed:", err);
  }
}

// ── Nudge: Nosy DMs the person who made the commitment on the clicker's behalf ─
app.action("receipt_nudge", async ({ ack, body, client }) => {
  await ack();
  const b = bodyOf({ body });
  const p = b.actions[0]?.value ? decodeReceiptPayload(b.actions[0].value) : null;
  if (!p) return;

  const link = threadPermalink(p.ch, p.t);
  await sendDM(
    p.m,
    `<@${b.user.id}> asked me to check in on *${p.c}* — you said you'd handle it 👀`,
    link
  );

  const card = buildReceiptSettledCard({
    madeBy: p.m,
    commitment: p.c,
    stateLabel: `✅ nudged <@${p.m}> — they've been pinged.`,
  });
  await updateCard(client, b.channel.id, b.message.ts, card.blocks, card.text);
});

// ── Snooze: push the receipt out 24h and re-arm it ───────────────────────────
app.action("receipt_snooze", async ({ ack, body, client }) => {
  await ack();
  const b = bodyOf({ body });
  const p = b.actions[0]?.value ? decodeReceiptPayload(b.actions[0].value) : null;
  if (!p) return;

  await snoozeReceipt(p.r, 24);

  const card = buildReceiptSettledCard({
    madeBy: p.m,
    commitment: p.c,
    stateLabel: "⏰ snoozed 1 day — i'll bug you again tomorrow.",
  });
  await updateCard(client, b.channel.id, b.message.ts, card.blocks, card.text);
});

// ── Mark done: manually close the receipt ────────────────────────────────────
app.action("receipt_done", async ({ ack, body, client }) => {
  await ack();
  const b = bodyOf({ body });
  const p = b.actions[0]?.value ? decodeReceiptPayload(b.actions[0].value) : null;
  if (!p) return;

  await markReceiptDone(p.r);

  const card = buildReceiptSettledCard({
    madeBy: p.m,
    commitment: p.c,
    stateLabel: "✅ closed — receipt settled. good vibes.",
  });
  await updateCard(client, b.channel.id, b.message.ts, card.blocks, card.text);
});

