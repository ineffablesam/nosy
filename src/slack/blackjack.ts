/**
 * Blackjack — you vs. Nosy (dealer) in DMs.
 *
 * Cards rendered as ASCII art boxes in a code block for a "casino terminal" look.
 * Dealer draws to soft 17. State stored as compact JSON in button values.
 */

import { app } from "./app";
import type { KnownBlock } from "@slack/types";
import { appendMessage } from "../db/messages";

function recordGame(userId: string, note: string): void {
  void appendMessage(userId, { role: "assistant", content: `[game: ${note}]` }).catch(() => {});
}

const RANKS = ["A","2","3","4","5","6","7","8","9","T","J","Q","K"];
const SUITS = ["s","h","d","c"];
const SUIT_SYM: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

type Card = string; // e.g. "As" = Ace of Spades, "Td" = Ten of Diamonds, "?" = face-down

interface BJState { p: Card[]; d: Card[]; }

function draw(): Card {
  return RANKS[Math.floor(Math.random() * 13)] + SUITS[Math.floor(Math.random() * 4)];
}

function label(card: Card): string {
  if (card === "?") return "██ ";
  const rank = card[0] === "T" ? "10" : card[0];
  return (rank + (SUIT_SYM[card[1]] ?? card[1])).padEnd(3);
}

/** Render a row of cards as ASCII art boxes joined horizontally. */
function renderHand(cards: Card[]): string {
  const art = cards.map(c => ["┌────┐", `│ ${label(c)}│`, "└────┘"]);
  return [0, 1, 2].map(row => art.map(a => a[row]).join("  ")).join("\n");
}

function value(cards: Card[]): number {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c === "?") continue;
    const r = c[0];
    if (r === "A") { aces++; total += 11; }
    else if (["T","J","Q","K"].includes(r)) total += 10;
    else total += parseInt(r, 10);
  }
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}

function encode(s: BJState): string { return JSON.stringify(s); }
function decode(v: string): BJState | null {
  try {
    const s = JSON.parse(v) as BJState;
    return Array.isArray(s.p) && Array.isArray(s.d) ? s : null;
  } catch { return null; }
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const OPENERS     = ["dealing. this is basically charity.", "i never lose. you'll see.", "let's go. i deal, you cry."];
const HIT_QUIPS   = ["bold.", "ok ok.", "sure.", "interesting.", "alright then."];
const WIN_LINES   = ["fine. you got lucky. again?", "ok that was decent. again?", "beginner's luck. again?"];
const LOSE_LINES  = ["house wins. naturally. again?", "told you. again?", "never in doubt. again?"];
const PUSH_LINES  = ["tie. boring. again?", "draw. nobody wins. again?", "fine. push. again?"];
const BUST_LINES  = ["bust. way too greedy. again?", "too many. again?", "rip. again?"];
const BJ_LINES    = ["BLACKJACK! ok you actually got me. again?", "BLACKJACK! respect. again?"];

function buildBlocks(state: BJState, comment: string, done: boolean): KnownBlock[] {
  const stateStr = encode(state);
  const pv = value(state.p);
  const dVisibleCards = state.d.filter(c => c !== "?");
  const dv = done ? value(state.d) : value(dVisibleCards);

  const dealerNote = done
    ? `DEALER   ${dv > 21 ? "(BUST)" : `= ${dv}`}`
    : `DEALER   shows ${value(dVisibleCards)}  +  hidden`;

  const playerStatus = pv > 21 ? "BUST" : pv === 21 && state.p.length === 2 ? "BLACKJACK!" : `= ${pv}`;
  const playerNote = `YOU   ${playerStatus}`;

  const blocks: KnownBlock[] = [];
  blocks.push({ type: "header", text: { type: "plain_text", text: "BLACKJACK" } });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: comment } });

  // Dealer hand
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*${dealerNote}*\n\`\`\`\n${renderHand(state.d)}\n\`\`\`` },
  });

  // Player hand
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*${playerNote}*\n\`\`\`\n${renderHand(state.p)}\n\`\`\`` },
  });

  if (done) {
    blocks.push({
      type: "actions",
      elements: [{
        type: "button", action_id: "bj_restart", style: "primary",
        text: { type: "plain_text", text: "play again" }, value: "r",
      }],
    } as KnownBlock);
  } else {
    blocks.push({
      type: "actions",
      elements: [
        { type: "button", action_id: "bj_hit",   style: "primary", text: { type: "plain_text", text: "  Hit  " },   value: stateStr },
        { type: "button", action_id: "bj_stand", style: "danger",  text: { type: "plain_text", text: "  Stand  " }, value: stateStr },
      ],
    } as KnownBlock);
  }
  return blocks;
}

export async function startBlackjack(userId: string): Promise<void> {
  const state: BJState = { p: [draw(), draw()], d: [draw(), "?"] };
  let comment = pick(OPENERS);
  let done = false;

  if (value(state.p) === 21) {
    state.d[1] = draw();
    done = true;
    comment = pick(BJ_LINES);
  }

  try {
    await app.client.chat.postMessage({
      channel: userId, text: comment,
      blocks: buildBlocks(state, comment, done),
    });
  } catch (err) { console.error("[bj] start failed:", err); }
}

// Hit
app.action("bj_hit", async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as {
    user: { id: string };
    channel: { id: string }; message: { ts: string };
    actions: Array<{ value: string }>;
  };
  const state = decode(b.actions[0]?.value ?? "");
  if (!state) return;

  state.p.push(draw());
  const pv = value(state.p);
  let comment: string;
  let done = false;

  if (pv > 21) {
    done = true;
    state.d[1] = draw();
    comment = pick(BUST_LINES);
    recordGame(b.user.id, `blackjack — busted at ${pv}. hit when they shouldn't have.`);
  } else if (pv === 21) {
    done = true;
    state.d[1] = draw();
    while (value(state.d) < 17) state.d.push(draw());
    const dv = value(state.d);
    if (dv > 21 || pv > dv) {
      comment = pick(WIN_LINES);
      recordGame(b.user.id, `blackjack — they won with 21, i had ${dv}. fine.`);
    } else if (pv === dv) {
      comment = pick(PUSH_LINES);
      recordGame(b.user.id, `blackjack — push at ${pv}. tie.`);
    } else {
      comment = pick(LOSE_LINES);
      recordGame(b.user.id, `blackjack — lost with 21 to my ${dv}. somehow.`);
    }
  } else {
    comment = pick(HIT_QUIPS);
  }

  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts, text: comment,
    blocks: buildBlocks(state, comment, done),
  });
});

// Stand
app.action("bj_stand", async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as {
    user: { id: string };
    channel: { id: string }; message: { ts: string };
    actions: Array<{ value: string }>;
  };
  const state = decode(b.actions[0]?.value ?? "");
  if (!state) return;

  state.d[1] = draw();
  while (value(state.d) < 17) state.d.push(draw());

  const pv = value(state.p);
  const dv = value(state.d);
  let comment: string;

  if (dv > 21 || pv > dv) {
    comment = pick(WIN_LINES);
    recordGame(b.user.id, `blackjack — won with ${pv}, i busted/had ${dv}. ok fine.`);
  } else if (pv === dv) {
    comment = pick(PUSH_LINES);
    recordGame(b.user.id, `blackjack — push at ${pv}. tie. boring.`);
  } else {
    comment = pick(LOSE_LINES);
    recordGame(b.user.id, `blackjack — lost with ${pv}, i had ${dv}. stood too early.`);
  }

  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts, text: comment,
    blocks: buildBlocks(state, comment, true),
  });
});

// Restart
app.action("bj_restart", async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as { channel: { id: string }; message: { ts: string } };
  const state: BJState = { p: [draw(), draw()], d: [draw(), "?"] };
  const comment = pick(OPENERS);
  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts, text: comment,
    blocks: buildBlocks(state, comment, false),
  });
});
