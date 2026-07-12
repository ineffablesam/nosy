/**
 * Tic Tac Toe — plays live in a DM message via Block Kit buttons.
 *
 * Each button carries the board state as its value (9-char string: X/O/_).
 * When a cell is clicked, Nosy makes its counter-move and calls chat.update
 * on the same message — the board mutates in place, no new message posted.
 *
 * User = ✕ (X)   Nosy = ◎ (O)
 */

import { app } from "./app";
import type { KnownBlock } from "@slack/types";
import { appendMessage } from "../db/messages";

function recordGame(userId: string, note: string): void {
  void appendMessage(userId, { role: "assistant", content: `[game: ${note}]` }).catch(() => {});
}

type Cell = "X" | "O" | "_";
type Board = Cell[]; // always length 9

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diagonals
];

function checkWinner(board: Board): "X" | "O" | "draw" | null {
  for (const [a, b, c] of WINS) {
    if (board[a] !== "_" && board[a] === board[b] && board[b] === board[c]) {
      return board[a] as "X" | "O";
    }
  }
  if (board.every((c) => c !== "_")) return "draw";
  return null;
}

/** Nosy's move: win > block > center > corner > edge */
function nosyMove(board: Board): number {
  const avail = board.map((c, i) => (c === "_" ? i : -1)).filter((i) => i >= 0);
  // Win
  for (const i of avail) {
    const b = [...board]; b[i] = "O";
    if (checkWinner(b) === "O") return i;
  }
  // Block
  for (const i of avail) {
    const b = [...board]; b[i] = "X";
    if (checkWinner(b) === "X") return i;
  }
  if (board[4] === "_") return 4;
  const corners = [0, 2, 6, 8].filter((i) => board[i] === "_");
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return avail[0];
}

// ── Display ──────────────────────────────────────────────────────────────────

const SYM: Record<Cell, string> = { X: "✕", O: "◎", _: "·" };

function boardToText(board: Board): string {
  const r = (i: number) => SYM[board[i]];
  return [
    `${r(0)} │ ${r(1)} │ ${r(2)}`,
    `──┼───┼──`,
    `${r(3)} │ ${r(4)} │ ${r(5)}`,
    `──┼───┼──`,
    `${r(6)} │ ${r(7)} │ ${r(8)}`,
  ].join("\n");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Nosy's lines ─────────────────────────────────────────────────────────────

const OPENERS = [
  "ok fine. you go first since you clearly need the head start 😇\ntap a square.",
  "tic tac toe?? sure. i've literally never lost btw\ntap a square.",
  "lmaooo ok let's go. don't embarrass yourself\ntap a square.",
  "bold of you to challenge me. i'll let you go first\ntap a square.",
  "you wanna play me?? brave. i respect the confidence tho\ntap a square.",
];

const AFTER_PLAYER: string[] = [
  "interesting.", "ok ok.", "hm.", "sure.", "noted.", "classic.", "lol ok.", "bold.",
];

const AFTER_NOSY: string[] = [
  "and that's how it's done 😇", "easy.", "think fast.", "no thoughts.", "👀",
  "and i'll take that.", "see what i did there?", "🍿",
];

const WIN_FOR_YOU = [
  "...okay fine you got me. rematch?",
  "i let you win tbh. rematch?",
  "ok that was a fluke. play again?",
  "alright fine. you're better than i thought. again?",
];

const WIN_FOR_NOSY = [
  "lmaoooo i told you 💀 play again?",
  "called it. not even close. again?",
  "never lost. never will. again?",
  "rip 💀 play again?",
  "i win. you knew this was going to happen. again?",
];

const DRAWS = [
  "ok you're not completely terrible. draw. again?",
  "tie. respectable i guess. again?",
  "fine. evenly matched. we don't talk about this. again?",
  "draw. i had you though. again?",
];

// ── Block builder ─────────────────────────────────────────────────────────────

export function buildGameBlocks(
  board: Board,
  comment: string,
  gameOver: boolean
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  blocks.push({ type: "section", text: { type: "mrkdwn", text: comment } });

  if (gameOver) {
    // Static board — no more interactive buttons
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "```\n" + boardToText(board) + "\n```" },
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "ttt_restart",
          style: "primary",
          text: { type: "plain_text", text: "play again" },
          value: "restart",
        },
      ],
    } as KnownBlock);
  } else {
    // 3 rows × 3 buttons — each button carries the full board state as its value
    for (let row = 0; row < 3; row++) {
      const elements = [];
      for (let col = 0; col < 3; col++) {
        const idx = row * 3 + col;
        const cell = board[idx];
        elements.push({
          type: "button",
          action_id: `ttt_${idx}`,
          text: {
            type: "plain_text",
            text: cell === "_" ? "   " : cell === "X" ? " ✕ " : " ◎ ",
          },
          value: board.join(""), // encode state in every button's value
        });
      }
      blocks.push({ type: "actions", elements } as KnownBlock);
    }
  }

  return blocks;
}

// ── Public: start a game ──────────────────────────────────────────────────────

export async function startGame(userId: string): Promise<void> {
  const board: Board = Array(9).fill("_") as Board;
  const comment = pick(OPENERS);
  try {
    await app.client.chat.postMessage({
      channel: userId,
      text: comment,
      blocks: buildGameBlocks(board, comment, false),
      unfurl_links: false,
    });
  } catch (err) {
    console.error("[ttt] startGame failed:", err);
  }
}

// ── Action: cell clicked ──────────────────────────────────────────────────────

app.action(/^ttt_\d$/, async ({ ack, body, client }) => {
  await ack();

  const b = body as unknown as {
    user: { id: string };
    channel: { id: string };
    message: { ts: string };
    actions: Array<{ action_id: string; value: string }>;
  };

  const action = b.actions[0];
  if (!action) return;

  const pos = parseInt(action.action_id.replace("ttt_", ""), 10);
  const boardStr = action.value ?? "";
  if (boardStr.length !== 9 || isNaN(pos)) return;

  const board = boardStr.split("") as Board;
  if (board[pos] !== "_") return;

  board[pos] = "X";
  const afterPlayer = checkWinner(board);

  if (afterPlayer === "X") {
    const msg = pick(WIN_FOR_YOU);
    await client.chat.update({
      channel: b.channel.id, ts: b.message.ts, text: msg,
      blocks: buildGameBlocks(board, `✕ *you win!*\n${msg}`, true),
    });
    recordGame(b.user.id, "tic tac toe — you beat me. don't get used to it.");
    return;
  }
  if (afterPlayer === "draw") {
    const msg = pick(DRAWS);
    await client.chat.update({
      channel: b.channel.id, ts: b.message.ts, text: msg,
      blocks: buildGameBlocks(board, `*draw!*\n${msg}`, true),
    });
    recordGame(b.user.id, "tic tac toe — draw. neither of us wants to talk about it.");
    return;
  }

  const nosyPos = nosyMove(board);
  board[nosyPos] = "O";
  const afterNosy = checkWinner(board);

  if (afterNosy === "O") {
    const msg = pick(WIN_FOR_NOSY);
    await client.chat.update({
      channel: b.channel.id, ts: b.message.ts, text: msg,
      blocks: buildGameBlocks(board, `◎ *nosy wins.*\n${msg}`, true),
    });
    recordGame(b.user.id, "tic tac toe — i won. as expected. they never learn.");
    return;
  }
  if (afterNosy === "draw") {
    const msg = pick(DRAWS);
    await client.chat.update({
      channel: b.channel.id, ts: b.message.ts, text: msg,
      blocks: buildGameBlocks(board, `*draw!*\n${msg}`, true),
    });
    recordGame(b.user.id, "tic tac toe — draw. fine.");
    return;
  }

  // ── Game continues ────────────────────────────────────────────────────────
  const comment = `${pick(AFTER_PLAYER)} ${pick(AFTER_NOSY)} your move.`;
  await client.chat.update({
    channel: b.channel.id,
    ts: b.message.ts,
    text: comment,
    blocks: buildGameBlocks(board, comment, false),
  });
});

// ── Action: play again ────────────────────────────────────────────────────────

app.action("ttt_restart", async ({ ack, body, client }) => {
  await ack();

  const b = body as unknown as {
    channel: { id: string };
    message: { ts: string };
  };

  const board: Board = Array(9).fill("_") as Board;
  const comment = pick(OPENERS);

  await client.chat.update({
    channel: b.channel.id,
    ts: b.message.ts,
    text: comment,
    blocks: buildGameBlocks(board, comment, false),
  });
});
