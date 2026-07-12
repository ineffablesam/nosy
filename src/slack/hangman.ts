/**
 * Hangman — ASCII gallows in a code block, QWERTY letter-keyboard as buttons.
 *
 * State: "WORD|GUESSEDLETTERS|WRONGCOUNT"   e.g.  "DEPLOY|AEI|2"
 * Every button carries the full state in its value field.
 */

import { app } from "./app";
import type { KnownBlock } from "@slack/types";
import { appendMessage } from "../db/messages";

function recordGame(userId: string, note: string): void {
  void appendMessage(userId, { role: "assistant", content: `[game: ${note}]` }).catch(() => {});
}

const WORDS = [
  "DEPLOY", "COMMIT", "STAGING", "ROLLBACK", "HOTFIX", "SPRINT",
  "STANDUP", "REFACTOR", "PIPELINE", "OUTAGE", "WEBHOOK", "LATENCY",
  "BACKLOG", "TIMEOUT", "CLUSTER", "PROMISE", "PAYLOAD", "REBASE",
  "REVIEW", "TICKET", "MERGE", "INCIDENT", "POSTMORTEM",
];

const MAX_WRONG = 6;
const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function gallows(wrong: number): string {
  const head = wrong >= 1 ? "O"  : " ";
  const body = wrong >= 2 ? "│"  : " ";
  const larm = wrong >= 3 ? "/"  : " ";
  const rarm = wrong >= 4 ? "\\" : " ";
  const lleg = wrong >= 5 ? "/"  : " ";
  const rleg = wrong >= 6 ? "\\" : " ";
  return [
    "  ┌───┐",
    `  │   ${head}`,
    `  │  ${larm}${body}${rarm}`,
    `  │  ${lleg} ${rleg}`,
    "  │   ",
    "──┴───",
  ].join("\n");
}

function wordLine(word: string, guessed: Set<string>): string {
  return word.split("").map(c => guessed.has(c) ? ` ${c} ` : " _ ").join("");
}

function encode(word: string, guessed: Set<string>, wrong: number): string {
  return `${word}|${[...guessed].join("")}|${wrong}`;
}

function decode(val: string): { word: string; guessed: Set<string>; wrong: number } | null {
  const [word, g, w] = val.split("|");
  if (!word || w === undefined) return null;
  return { word, guessed: new Set(g ? g.split("") : []), wrong: parseInt(w, 10) || 0 };
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const OPENERS = [
  "okay hangman. try not to embarrass yourself.",
  "let's see how good your vocabulary is. (spoiler: it isn't)",
  "workplace vocabulary edition. bet you can't get this one.",
];
const CORRECT_QUIPS = ["yep", "nice", "ok sure", "you know your stuff apparently", "fine"];
const WRONG_QUIPS  = ["nope", "nah", "lol no", "bold guess", "rip", "not it"];
const WIN_LINES    = ["ok you got it. beginner's luck.", "correct. don't let it go to your head.", "fine i'll allow it."];
const LOSE_LINES   = ["skill issue. the word was", "rip. it was", "and that's game. word was"];

function buildBlocks(word: string, guessed: Set<string>, wrong: number, comment: string, over: boolean): KnownBlock[] {
  const state = encode(word, guessed, wrong);
  const wrongLetters = [...guessed].filter(l => !word.includes(l));
  const blocks: KnownBlock[] = [];

  blocks.push({ type: "header", text: { type: "plain_text", text: "HANGMAN" } });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: comment } });

  // Gallows art + word side by side (two sections in sequence reads cleanly)
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "```\n" + gallows(wrong) + "\n```" },
  });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `\`${wordLine(word, guessed)}\`\n${word.length} letters` },
  });

  if (wrongLetters.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Wrong: *${wrongLetters.join("  ")}*   (${wrong}/${MAX_WRONG})` }],
    });
  }

  if (over) {
    blocks.push({
      type: "actions",
      elements: [{
        type: "button", action_id: "hang_restart", style: "primary",
        text: { type: "plain_text", text: "play again" }, value: "r",
      }],
    } as KnownBlock);
    return blocks;
  }

  // Keyboard — only unguessed letters remain
  for (const row of KEYBOARD_ROWS) {
    const avail = row.split("").filter(l => !guessed.has(l));
    if (!avail.length) continue;
    blocks.push({
      type: "actions",
      elements: avail.map(l => ({
        type: "button", action_id: `hang_${l}`,
        text: { type: "plain_text", text: l }, value: state,
      })),
    } as KnownBlock);
  }
  return blocks;
}

export async function startHangman(userId: string): Promise<void> {
  const word = pick(WORDS);
  const comment = pick(OPENERS);
  try {
    await app.client.chat.postMessage({
      channel: userId, text: comment,
      blocks: buildBlocks(word, new Set(), 0, comment, false),
    });
  } catch (err) { console.error("[hangman] start failed:", err); }
}

app.action(/^hang_[A-Z]$/, async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as {
    user: { id: string };
    channel: { id: string }; message: { ts: string };
    actions: Array<{ action_id: string; value: string }>;
  };
  const action = b.actions[0];
  if (!action) return;

  const letter = action.action_id.slice(5); // "hang_X" → "X"
  const s = decode(action.value);
  if (!s) return;

  const { word, guessed, wrong } = s;
  if (guessed.has(letter)) return;
  guessed.add(letter);

  const hit = word.includes(letter);
  const newWrong = hit ? wrong : wrong + 1;
  const won  = word.split("").every(c => guessed.has(c));
  const dead = newWrong >= MAX_WRONG;

  let comment: string;
  const over = won || dead;

  if (won)  comment = `${pick(WIN_LINES)} *${word}*`;
  else if (dead) comment = `${pick(LOSE_LINES)} *${word}*`;
  else      comment = hit ? `${letter} — ${pick(CORRECT_QUIPS)}` : `${letter} — ${pick(WRONG_QUIPS)}`;

  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts, text: comment,
    blocks: buildBlocks(word, guessed, newWrong, comment, over),
  });

  if (won)  recordGame(b.user.id, `hangman — got "${word}" with ${newWrong} wrong guesses. ok.`);
  if (dead) recordGame(b.user.id, `hangman — couldn't get "${word}". ${MAX_WRONG} wrong guesses. skill issue.`);
});

app.action("hang_restart", async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as { channel: { id: string }; message: { ts: string } };
  const word = pick(WORDS);
  const comment = pick(OPENERS);
  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts, text: comment,
    blocks: buildBlocks(word, new Set(), 0, comment, false),
  });
});
