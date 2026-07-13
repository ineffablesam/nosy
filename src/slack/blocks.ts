import type { KnownBlock } from "@slack/types";

/**
 * Shared Block Kit builders for Nosy's interactive surfaces.
 * Keeps block construction out of the cron / action handlers so both can
 * render the same receipt card without duplicating layout.
 */

export interface ReceiptCardPayload {
  /** receipts.id */
  r: string;
  /** made_by user id */
  m: string;
  /** commitment text (truncated for the button value) */
  c: string;
  /** thread_key: "channelId:threadTs" */
  t: string;
  /** channel id (for the permalink) */
  ch: string;
}

/** Slack button `value` is a string ≤ 2000 chars — we JSON-encode a compact payload. */
export function encodeReceiptPayload(p: ReceiptCardPayload): string {
  return JSON.stringify({
    r: p.r,
    m: p.m,
    c: p.c.length > 140 ? p.c.slice(0, 140) + "…" : p.c,
    t: p.t,
    ch: p.ch,
  });
}

export function decodeReceiptPayload(value: string): ReceiptCardPayload | null {
  try {
    return JSON.parse(value) as ReceiptCardPayload;
  } catch {
    return null;
  }
}

export function threadPermalink(channelId: string, threadKey: string): string {
  const ts = threadKey.split(":")[1] ?? "";
  return `https://slack.com/archives/${channelId}/p${ts.replace(".", "")}`;
}

interface ReceiptCardOpts {
  madeBy: string;
  commitment: string;
  dueHint?: string | null;
  /** hours since the commitment was made */
  hoursAgo: number;
  threadLink: string;
  payload: string;
}

/** The interactive overdue-receipt card sent to a subscriber's DM. */
export function buildReceiptCard(opts: ReceiptCardOpts): {
  text: string;
  blocks: KnownBlock[];
} {
  const due = opts.dueHint && opts.dueHint !== "unclear" ? ` — they said _"${opts.dueHint}"_` : "";
  const body = `<@${opts.madeBy}> said they'd *${opts.commitment}*${due}. that was ${opts.hoursAgo}h ago and the thread's gone quiet. 👀`;

  return {
    text: body,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*📋 Receipt is overdue*\n${body}` },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "Nosy is holding this receipt. do something about it." }] },
      { type: "divider" },
      {
        type: "actions",
        elements: [
          { type: "button", action_id: "receipt_nudge", style: "primary", value: opts.payload, text: { type: "plain_text", text: "Nudge them 👋" } },
          { type: "button", action_id: "receipt_snooze", value: opts.payload, text: { type: "plain_text", text: "Snooze 1 day" } },
          { type: "button", action_id: "receipt_done", value: opts.payload, text: { type: "plain_text", text: "Mark done ✅" } },
          { type: "button", action_id: "receipt_open", url: opts.threadLink, value: opts.payload, text: { type: "plain_text", text: "Open thread ↗" } },
        ],
      },
    ],
  };
}

/** Post-action replacement card — same context, buttons stripped, state label shown. */
export function buildReceiptSettledCard(opts: {
  madeBy: string;
  commitment: string;
  stateLabel: string;
}): { text: string; blocks: KnownBlock[] } {
  const body = `<@${opts.madeBy}> said they'd *${opts.commitment}*`;
  return {
    text: `${body}\n${opts.stateLabel}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*📋 Receipt*\n${body}` },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: opts.stateLabel }] },
    ],
  };
}
