/**
 * Nosy Trivia — 5 random tech/workplace questions, multiple choice.
 *
 * State per button: JSON with correctness flag, score, round, and remaining
 * question indices. Correct option text is re-derived from the question index
 * so we never need to store it in the value string.
 *
 * Value shape: { c: 0|1, s: number, r: number, t: number, qi: number[] }
 * Next button:  { s: number, r: number, t: number, qi: number[] }
 */

import { app } from "./app";
import type { KnownBlock } from "@slack/types";
import { appendMessage } from "../db/messages";

function recordGame(userId: string, note: string): void {
  void appendMessage(userId, { role: "assistant", content: `[game: ${note}]` }).catch(() => {});
}

interface TQ { q: string; opts: string[]; answer: number; }

const QUESTIONS: TQ[] = [
  { q: "What does LGTM mean in code review?",
    opts: ["Looks Good To Me", "Let's Go Test More", "Latest Git To Main", "Log Global Test Mode"], answer: 0 },
  { q: "Which git command saves uncommitted changes temporarily?",
    opts: ["git stash", "git save", "git shelve", "git pocket"], answer: 0 },
  { q: "What is 'technical debt'?",
    opts: ["Code shortcuts that need future fixing", "Money owed for servers", "Bugs filed in Jira", "Legacy docs"], answer: 0 },
  { q: "What does 'dogfooding' mean?",
    opts: ["Using your own product internally", "Testing with real animals", "Code review by a junior", "A stress test"], answer: 0 },
  { q: "CI/CD stands for?",
    opts: ["Continuous Integration / Continuous Deployment", "Code Inspect / Code Deploy", "Central Index / Content Delivery", "Compile Install / Check Done"], answer: 0 },
  { q: "What is a post-mortem in engineering?",
    opts: ["Analysis after an incident", "End-of-sprint retro", "Deleting old code", "A security audit"], answer: 0 },
  { q: "YAGNI stands for?",
    opts: ["You Aren't Gonna Need It", "Your API Gets New Interfaces", "Yet Another Git Node", "You Always Generate Needed Items"], answer: 0 },
  { q: "P0 incident =?",
    opts: ["Critical — top priority", "Low — fix eventually", "A production release number", "Pre-release build"], answer: 0 },
  { q: "Rubber duck debugging means?",
    opts: ["Explaining code aloud to find bugs", "A load testing method", "Pair programming", "Reading error logs"], answer: 0 },
  { q: "A/B testing compares?",
    opts: ["Two versions to see which performs better", "Production vs. staging", "Before and after a refactor", "Two developers' PRs"], answer: 0 },
  { q: "Feature flagging means?",
    opts: ["Toggling features without redeploying", "Marking code for review", "UI color coding", "Writing spec docs"], answer: 0 },
  { q: "MVP in product =?",
    opts: ["Minimum Viable Product", "Most Valuable Program", "Maximum Valid Prototype", "Multi-Vendor Platform"], answer: 0 },
  { q: "A canary deployment does what?",
    opts: ["Rolls out to a small subset first", "Deploys only to prod", "Tests in a sandbox", "Emergency rollback"], answer: 0 },
  { q: "Zero downtime deployment means?",
    opts: ["Deploy without interrupting users", "Deploy at midnight", "Staging-only deploy", "Manual deployment"], answer: 0 },
  { q: "What is 'monkey patching'?",
    opts: ["Modifying code at runtime", "Writing edge-case tests", "Overriding CSS", "Reverting commits"], answer: 0 },
  { q: "Trunk-based development means?",
    opts: ["Committing frequently to the main branch", "A branch per feature", "Deleting old branches", "A specific git flag"], answer: 0 },
  { q: "What is 'pair programming'?",
    opts: ["Two devs working on the same code simultaneously", "Running two builds in parallel", "A type of code review", "Sharing a git branch"], answer: 0 },
  { q: "What does 'shift left' in testing mean?",
    opts: ["Test earlier in the development cycle", "Move QA to a separate team", "Write tests after shipping", "Use fewer test environments"], answer: 0 },
  { q: "What is an SLA?",
    opts: ["Service Level Agreement — uptime/performance guarantees", "Server Load Analyzer", "Software Launch Audit", "Staging Load Assessment"], answer: 0 },
  { q: "What does 'idempotent' mean in APIs?",
    opts: ["Calling it multiple times has the same result", "It only works once", "It returns random results", "It requires authentication"], answer: 0 },
];

const TOTAL = 5;
const OPTS  = ["A", "B", "C", "D"] as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildQuestion(qi: number[], score: number, round: number): KnownBlock[] {
  const q = QUESTIONS[qi[0]];
  const shuffled = shuffle(q.opts);
  const correct  = q.opts[q.answer];

  const btn = (opt: string, i: number): object => ({
    type: "button",
    action_id: `tri_${OPTS[i]}`,
    text: { type: "plain_text", text: `${OPTS[i]}.  ${opt.length > 38 ? opt.slice(0, 35) + "…" : opt}` },
    value: JSON.stringify({ c: opt === correct ? 1 : 0, s: score, r: round, t: TOTAL, qi }),
  });

  return [
    { type: "header", text: { type: "plain_text", text: "NOSY TRIVIA" } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Round ${round} of ${TOTAL}   ·   Score: *${score}*` }] },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*${q.q}*` } },
    { type: "actions", elements: [btn(shuffled[0], 0), btn(shuffled[1], 1)] } as KnownBlock,
    { type: "actions", elements: [btn(shuffled[2], 2), btn(shuffled[3], 3)] } as KnownBlock,
  ];
}

function buildResult(
  correct: boolean, correctText: string,
  newScore: number, round: number, nextQi: number[],
): KnownBlock[] {
  const done = round >= TOTAL;
  const body = correct
    ? `*Correct!*  +100\n_${correctText}_`
    : `*Wrong.*\n_The answer: ${correctText}_`;

  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: "NOSY TRIVIA" } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Round ${round} of ${TOTAL}   ·   Score: *${newScore}*` }] },
    { type: "section", text: { type: "mrkdwn", text: body } },
  ];

  if (!done) {
    blocks.push({
      type: "actions",
      elements: [{
        type: "button", action_id: "tri_next", style: "primary",
        text: { type: "plain_text", text: "Next →" },
        value: JSON.stringify({ s: newScore, r: round, t: TOTAL, qi: nextQi }),
      }],
    } as KnownBlock);
  } else {
    const max = TOTAL * 100;
    const pct = Math.round((newScore / max) * 100);
    const verdict =
      pct === 100 ? "perfect score. suspicious." :
      pct >= 80   ? "actually impressive." :
      pct >= 60   ? "not bad." :
      pct >= 40   ? "better luck next time." :
                    "maybe google some things.";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Final: ${newScore} / ${max}   (${pct}%)*\n${verdict}` },
    });
    blocks.push({
      type: "actions",
      elements: [{
        type: "button", action_id: "tri_restart", style: "primary",
        text: { type: "plain_text", text: "play again" }, value: "r",
      }],
    } as KnownBlock);
  }
  return blocks;
}

export async function startTrivia(userId: string): Promise<void> {
  const qi = shuffle([...Array(QUESTIONS.length).keys()]).slice(0, TOTAL);
  try {
    await app.client.chat.postMessage({
      channel: userId,
      text: "NOSY TRIVIA — round 1. don't google it.",
      blocks: buildQuestion(qi, 0, 1),
    });
  } catch (err) { console.error("[trivia] start failed:", err); }
}

// Answer (A / B / C / D)
app.action(/^tri_[ABCD]$/, async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as {
    user: { id: string };
    channel: { id: string }; message: { ts: string };
    actions: Array<{ value: string }>;
  };
  let s: { c: 0|1; s: number; r: number; t: number; qi: number[] };
  try { s = JSON.parse(b.actions[0]?.value ?? ""); } catch { return; }

  const correct    = s.c === 1;
  const newScore   = s.s + (correct ? 100 : 0);
  const correctAns = QUESTIONS[s.qi[0]].opts[QUESTIONS[s.qi[0]].answer];
  const nextQi     = s.qi.slice(1);
  const isLast     = s.r >= s.t;

  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts,
    text: correct ? "Correct!" : "Wrong.",
    blocks: buildResult(correct, correctAns, newScore, s.r, nextQi),
  });

  if (isLast) {
    const pct = Math.round((newScore / (s.t * 100)) * 100);
    const verdict = pct >= 80 ? "somehow impressive" : pct >= 50 ? "mid" : "rough showing tbh";
    recordGame(b.user.id, `trivia — scored ${newScore}/${s.t * 100} (${pct}%). ${verdict}.`);
  }
});

// Next question
app.action("tri_next", async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as {
    channel: { id: string }; message: { ts: string };
    actions: Array<{ value: string }>;
  };
  let s: { s: number; r: number; t: number; qi: number[] };
  try { s = JSON.parse(b.actions[0]?.value ?? ""); } catch { return; }

  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts,
    text: `Round ${s.r + 1}.`,
    blocks: buildQuestion(s.qi, s.s, s.r + 1),
  });
});

// Restart
app.action("tri_restart", async ({ ack, body, client }) => {
  await ack();
  const b = body as unknown as { channel: { id: string }; message: { ts: string } };
  const qi = shuffle([...Array(QUESTIONS.length).keys()]).slice(0, TOTAL);
  await client.chat.update({
    channel: b.channel.id, ts: b.message.ts,
    text: "NOSY TRIVIA — round 1.",
    blocks: buildQuestion(qi, 0, 1),
  });
});
