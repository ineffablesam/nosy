# Nosy Slack Agent — v4 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## The Angle (Why This Wins)

Every other hackathon submission is a **tool**. You talk to it, it answers. Chat-in, answer-out.
Meeting summaries, accessibility helpers, HR bots — all reactive. All waiting for you to ask.

**Nosy is a witness.**

It has been watching. It has been forming opinions. It remembers what Jake said he'd finish three days ago. It noticed this team has the same argument every sprint. It saw the moment the thread went quiet right after that one comment dropped.

And when you DM Nosy? You're not issuing a command to a tool. You're gossiping with something that's been paying closer attention than anyone else in the workspace.

---

## What It Does

### 1. Proactive Thread Watching
- `/nosy` inside a thread → Nosy subscribes you
- `/nosy` in a channel (no thread) → Nosy watches **every thread in that channel**
- Every message goes through Claude's brain — real content, no regex
- If something is notable: DMs you like a friend texting, not a bot alerting
- Stores an observation to memory after every read, even when it doesn't DM

### 2. The Receipts Engine *(most unique feature)*
- Claude detects when someone makes a commitment: "I'll have it done by Thursday", "shipping EOD", "will fix tomorrow"
- Stores it as a Receipt: who committed, what to, when
- Watches what actually happens — if nothing happens, Nosy DMs you:
  > "so Jake said he'd have the deploy done by Thursday. that was 2 days ago. the thread's been quiet. 👀"
- Receipt is marked resolved if a later message sounds like completion

### 3. Blindspot Alerts
- Nosy notices when you've subscribed to a thread but **haven't spoken in it**
- If a significant decision is being made without your input, Nosy DMs you:
  > "hey you haven't said anything in that thread but they're making a call about the API migration. might want to show up 👀"
- Separate DM from the regular "drama happened" notification

### 4. Thread Obituary
- When a thread goes silent for 4+ hours after being active, Nosy writes its obituary:
  > "that thread is officially dead. started with 'quick question', ballooned to 23 messages, ended mid-argument. Jake said he'd think about it. he has not thought about it."
- Stored in memory so Nosy can reference how things ended

### 5. Memory + Two-way Conversations
- Every observation accumulates in Supabase
- DM Nosy back: "wait what happened exactly?" → it catches you up
- Ask: "has this team always been this chaotic?" → it synthesizes from weeks of observations
- Memory compounds — the longer it watches, the sharper its takes

---

## Tech Stack

TypeScript, `@slack/bolt`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `node-cron`, `dotenv`, `tsx` (dev), `esbuild` (prod)

---

## File Structure

```
nosy/
├── src/
│   ├── index.ts
│   ├── slack/
│   │   ├── app.ts
│   │   ├── events.ts             # main event loop: thread/channel watch
│   │   ├── conversation.ts       # DM replies from users
│   │   ├── commands.ts           # /nosy: thread sub OR channel sub
│   │   └── dm.ts
│   ├── lib/
│   │   ├── analyze.ts            # Claude: notify + observation + receipt + blindspot
│   │   ├── respond.ts            # Claude: DM conversation with memory
│   │   ├── obituary.ts           # Claude: write thread obituary
│   │   └── thread.ts             # conversations.replies wrapper
│   ├── cron/
│   │   ├── receipts.ts           # hourly: check stale receipts, DM subscribers
│   │   └── obituary.ts           # hourly: check silent threads, send obituary
│   └── db/
│       ├── client.ts
│       ├── subscriptions.ts
│       ├── state.ts
│       ├── observations.ts
│       ├── receipts.ts           # NEW
│       └── messages.ts
├── supabase/
│   └── schema.sql
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── slack-manifest.yml
```

---

## Task 1: Project Scaffold

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "nosy",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js --external:@slack/bolt --external:@slack/web-api --external:@supabase/supabase-js --external:@anthropic-ai/sdk",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "@slack/bolt": "^4.4.0",
    "@slack/web-api": "^7.9.0",
    "@supabase/supabase-js": "^2.47.0",
    "node-cron": "^3.0.3",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "esbuild": "^0.24.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `.env.example`**

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
SOCKET_MODE=true
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
RECEIPT_STALE_HOURS=24        # how long before a receipt is considered missed
OBITUARY_SILENCE_HOURS=4      # how long of silence before thread obituary
PORT=3000
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 5: `npm install`**

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "chore: scaffold project"
```

---

## Task 2: Supabase Schema

- [ ] **Step 1: Create `supabase/schema.sql`**

```sql
-- Who is watching which thread (or channel)
-- thread_key format: "channelId:threadTs" for threads, "channel:channelId" for whole channels
create table if not exists subscriptions (
  id            uuid primary key default gen_random_uuid(),
  thread_key    text not null,
  user_id       text not null,
  subscribed_at timestamptz default now(),
  unique(thread_key, user_id)
);

-- Per-thread state: cooldown, activity tracking for obituary
create table if not exists thread_state (
  thread_key      text primary key,
  last_alerted_at timestamptz,
  last_message_at timestamptz,
  message_count   int default 0,
  obituary_sent   boolean default false,
  updated_at      timestamptz default now()
);

-- Nosy's long-term memory: one row per notable observation
create table if not exists observations (
  id          uuid primary key default gen_random_uuid(),
  thread_key  text not null,
  channel_id  text not null,
  people      text[] default '{}',
  observation text not null,
  created_at  timestamptz default now()
);

-- Receipts: commitments Nosy has detected and is tracking
create table if not exists receipts (
  id          uuid primary key default gen_random_uuid(),
  thread_key  text not null,
  channel_id  text not null,
  made_by     text not null,          -- Slack user ID who made the commitment
  commitment  text not null,          -- what they committed to (verbatim or summarized)
  due_hint    text,                   -- "EOD", "Thursday", "next week", "unclear"
  resolved    boolean default false,
  alerted     boolean default false,  -- have we sent the "they didn't do it" DM?
  created_at  timestamptz default now()
);

-- DM conversation history (user ↔ Nosy)
create table if not exists dm_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  role       text not null,           -- 'user' or 'assistant'
  content    text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_observations_created   on observations(created_at desc);
create index if not exists idx_observations_channel   on observations(channel_id);
create index if not exists idx_receipts_thread        on receipts(thread_key);
create index if not exists idx_receipts_unresolved    on receipts(resolved, alerted, created_at);
create index if not exists idx_dm_messages_user       on dm_messages(user_id, created_at desc);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql && git commit -m "chore: add Supabase schema"
```

---

## Task 3: Supabase DB Layer

- [ ] **Step 1: Create `src/db/client.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
```

- [ ] **Step 2: Create `src/db/subscriptions.ts`**

Channel subscriptions use the key format `channel:{channelId}`.
Thread subscriptions use `{channelId}:{threadTs}`.

```typescript
import { supabase } from "./client";

export async function subscribe(threadKey: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .upsert({ thread_key: threadKey, user_id: userId }, { onConflict: "thread_key,user_id" });
  if (error) throw error;
}

export async function getSubscribers(threadKey: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("thread_key", threadKey);
  if (error) throw error;
  return data?.map((r) => r.user_id) ?? [];
}

// Returns subscribers for a specific thread + anyone watching the whole channel
export async function getThreadAndChannelSubscribers(
  channelId: string,
  threadKey: string
): Promise<string[]> {
  const channelKey = `channel:${channelId}`;
  const [threadSubs, channelSubs] = await Promise.all([
    getSubscribers(threadKey),
    getSubscribers(channelKey),
  ]);
  // Deduplicate
  return [...new Set([...threadSubs, ...channelSubs])];
}
```

- [ ] **Step 3: Create `src/db/state.ts`**

```typescript
import { supabase } from "./client";

export async function getThreadState(threadKey: string) {
  const { data } = await supabase
    .from("thread_state")
    .select("*")
    .eq("thread_key", threadKey)
    .maybeSingle();
  return data;
}

export async function setLastAlertedAt(threadKey: string): Promise<void> {
  await upsertState(threadKey, { last_alerted_at: new Date().toISOString() });
}

export async function recordMessage(threadKey: string): Promise<void> {
  // Increment message count and update last_message_at
  const existing = await getThreadState(threadKey);
  await upsertState(threadKey, {
    last_message_at: new Date().toISOString(),
    message_count: (existing?.message_count ?? 0) + 1,
    obituary_sent: false, // new message resets obituary eligibility
  });
}

export async function markObituary(threadKey: string): Promise<void> {
  await upsertState(threadKey, { obituary_sent: true });
}

async function upsertState(threadKey: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from("thread_state")
    .upsert(
      { thread_key: threadKey, updated_at: new Date().toISOString(), ...fields },
      { onConflict: "thread_key" }
    );
  if (error) console.error("[state] upsert failed:", error);
}
```

- [ ] **Step 4: Create `src/db/observations.ts`**

```typescript
import { supabase } from "./client";

export interface Observation {
  thread_key: string;
  channel_id: string;
  people: string[];
  observation: string;
}

export async function storeObservation(obs: Observation): Promise<void> {
  const { error } = await supabase.from("observations").insert(obs);
  if (error) console.error("[observations] store failed:", error);
}

export async function getRecentObservations(limit = 20): Promise<string[]> {
  const { data, error } = await supabase
    .from("observations")
    .select("observation, created_at, people")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.reverse().map((r) => {
    const ago = formatAgo(new Date(r.created_at));
    const who = r.people?.length ? ` (${r.people.join(", ")})` : "";
    return `[${ago}]${who}: ${r.observation}`;
  });
}

function formatAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```

- [ ] **Step 5: Create `src/db/receipts.ts`**

```typescript
import { supabase } from "./client";

export interface Receipt {
  thread_key: string;
  channel_id: string;
  made_by: string;
  commitment: string;
  due_hint: string;
}

export async function storeReceipt(r: Receipt): Promise<void> {
  const { error } = await supabase.from("receipts").insert(r);
  if (error) console.error("[receipts] store failed:", error);
}

// Resolve receipts in a thread (call when a new message sounds like completion)
export async function resolveReceiptsInThread(threadKey: string): Promise<void> {
  await supabase
    .from("receipts")
    .update({ resolved: true })
    .eq("thread_key", threadKey)
    .eq("resolved", false);
}

// Get stale receipts: unresolved, not yet alerted, created N hours ago
export async function getStaleReceipts(staleHours: number): Promise<
  Array<{
    id: string;
    thread_key: string;
    channel_id: string;
    made_by: string;
    commitment: string;
    due_hint: string;
    created_at: string;
  }>
> {
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("resolved", false)
    .eq("alerted", false)
    .lt("created_at", cutoff);

  if (error) {
    console.error("[receipts] getStale failed:", error);
    return [];
  }
  return data ?? [];
}

export async function markReceiptAlerted(id: string): Promise<void> {
  await supabase.from("receipts").update({ alerted: true }).eq("id", id);
}
```

- [ ] **Step 6: Create `src/db/messages.ts`**

```typescript
import { supabase } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function appendMessage(userId: string, msg: ChatMessage): Promise<void> {
  const { error } = await supabase.from("dm_messages").insert({
    user_id: userId,
    role: msg.role,
    content: msg.content,
  });
  if (error) console.error("[messages] append failed:", error);
}

export async function getConversationHistory(
  userId: string,
  limit = 10
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as ChatMessage[]).reverse();
}
```

- [ ] **Step 7: Commit**

```bash
git add src/db/ && git commit -m "feat: add full DB layer (subscriptions, state, observations, receipts, messages)"
```

---

## Task 4: Slack Bolt App Singleton

- [ ] **Step 1: Create `src/slack/app.ts`**

```typescript
import { App } from "@slack/bolt";

export const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  socketMode: process.env.SOCKET_MODE === "true",
  appToken: process.env.SLACK_APP_TOKEN,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/slack/app.ts && git commit -m "feat: add Bolt app singleton"
```

---

## Task 5: Thread Fetcher

- [ ] **Step 1: Create `src/lib/thread.ts`**

```typescript
import { app } from "../slack/app";

export interface ThreadMessage {
  userId: string;
  text: string;
}

export async function fetchThreadMessages(
  channelId: string,
  threadTs: string,
  limit = 20
): Promise<ThreadMessage[]> {
  try {
    const result = await app.client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit,
    });

    return (result.messages ?? [])
      .filter((m): m is typeof m & { user: string; text: string } =>
        Boolean(m.user && m.text)
      )
      .map((m) => ({ userId: m.user, text: m.text }));
  } catch (err) {
    console.error("[thread] Failed to fetch replies:", err);
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/thread.ts && git commit -m "feat: add thread fetcher"
```

---

## Task 6: LLM Brain — Thread Analyzer

**Files:**
- Create: `src/lib/analyze.ts`

One Claude call that returns everything: whether to notify, the DM text, a memory observation, a receipt if someone made a commitment, and whether non-active subscribers have a blindspot.

The response is structured JSON. Claude gets the thread transcript plus Nosy's accumulated memory.

- [ ] **Step 1: Create `src/lib/analyze.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ThreadMessage } from "./thread";

const client = new Anthropic();

const SYSTEM = `You are Nosy — a gossipy, sharp AI who watches Slack threads and DMs subscribers when something worth knowing just happened. You have memory of what you've observed before. You have opinions.

You receive:
1. A Slack thread (latest message marked [LATEST])
2. Your recent memory (past observations from other threads)

Return ONLY valid JSON (no markdown fences) matching this exact shape:

{
  "notify": boolean,
  "dm": string | null,
  "observation": string | null,
  "receipt": { "commitment": string, "madeBy": string, "dueHint": string } | null,
  "blindspot_worthy": boolean,
  "blindspot_dm": string | null,
  "resolves_receipt": boolean
}

---

NOTIFY + DM rules:
notify = true when the latest message is DM-worthy:
  - Drama, tension, conflict (even passive-aggressive subtext)
  - Stress, frustration, someone stuck or spiraling
  - A surprising decision, reversal, or announcement
  - Someone being evasive or sus about something that matters
  - Escalation, chaos, something genuinely unexpected
  - Something requiring the subscriber's attention or action

notify = false for: routine replies, "ok thanks", "noted", boring status updates

If notify = true, write dm as a casual 1-3 sentence text from a gossipy friend. Reference what actually happened. Use memory context if there's a pattern. Natural emoji ok. No bot formatting. No "FYI:" openers.
If notify = false, dm = null.

---

OBSERVATION rules:
Write a compact factual sentence about what you observed, even when notify = false.
Include who was involved and what the dynamic was.
observation = null only if the thread was completely empty or trivial.
Example: "Jake deflected the deployment timeline question again and the thread went quiet"

---

RECEIPT rules:
receipt = non-null ONLY if the [LATEST] message contains a clear commitment:
  - "I'll have X done by Y"
  - "will fix this EOD/tomorrow/by Thursday/next week"  
  - "shipping this today"
  - "on it, done by [time]"

madeBy = the user ID from [LATEST] (e.g. "U0123ABC")
commitment = a brief description of what they committed to
dueHint = their stated deadline: "EOD", "tomorrow", "Thursday", "next week", or "unclear"

receipt = null if no explicit commitment was made.

---

BLINDSPOT rules:
blindspot_worthy = true when the thread contains a significant decision, question, or call-to-action that someone subscribed-but-silent should probably see.
blindspot_dm = a 1-2 sentence DM for people who are subscribed but haven't spoken in the thread. Reference what decision/question is being discussed.
Example blindspot_dm: "you haven't been in that thread but they're making a call about the auth migration without you. might want to weigh in 👀"

blindspot_worthy = false and blindspot_dm = null for routine conversation.

---

RESOLVES_RECEIPT rules:
resolves_receipt = true if the [LATEST] message sounds like someone completing something: "done", "shipped", "merged", "resolved", "finished", "pushed", "deployed", "it's live", "just sent".
resolves_receipt = false otherwise.`;

export interface AnalysisResult {
  notify: boolean;
  dm: string | null;
  observation: string | null;
  receipt: { commitment: string; madeBy: string; dueHint: string } | null;
  blindspot_worthy: boolean;
  blindspot_dm: string | null;
  resolves_receipt: boolean;
}

export async function analyzeThread(
  messages: ThreadMessage[],
  recentObservations: string[]
): Promise<AnalysisResult> {
  const empty: AnalysisResult = {
    notify: false,
    dm: null,
    observation: null,
    receipt: null,
    blindspot_worthy: false,
    blindspot_dm: null,
    resolves_receipt: false,
  };

  if (messages.length === 0) return empty;

  const transcript = messages
    .map((m, i) => {
      const label =
        i === messages.length - 1
          ? `[LATEST] <@${m.userId}>`
          : `<@${m.userId}>`;
      return `${label}: ${m.text}`;
    })
    .join("\n");

  const memorySection =
    recentObservations.length > 0
      ? `\n\nYour recent memory:\n${recentObservations.join("\n")}`
      : "";

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        { role: "user", content: `Thread:\n\n${transcript}${memorySection}` },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") return empty;

    return JSON.parse(block.text.trim()) as AnalysisResult;
  } catch (err) {
    console.error("[analyze] failed:", err);
    return empty;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analyze.ts && git commit -m "feat: add thread analyzer — notify + receipt + blindspot in one call"
```

---

## Task 7: LLM Brain — Thread Obituary Writer

**Files:**
- Create: `src/lib/obituary.ts`

When a thread goes silent after being active, Claude writes its obituary. Not a dry summary — a personality-forward eulogy.

- [ ] **Step 1: Create `src/lib/obituary.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ThreadMessage } from "./thread";

const client = new Anthropic();

const SYSTEM = `You are Nosy — a gossipy AI who writes thread obituaries when Slack threads die.

Write a 2-3 sentence obituary for this thread. Personality: dry, a little sarcastic, like a sports commentator narrating a disaster. Reference what actually happened — who was involved, how it started, how it ended (or didn't). 

Examples of good obituaries:
- "RIP this thread. started as a 'quick question about the API', became 23 messages of circular debate, ended when Dave said he'd 'look into it' and vanished. the question remains unanswered."
- "that thread is done. someone asked for sign-off on a decision that was already made. three people relitigated the whole thing. no new conclusion was reached. beautiful."
- "officially dead. 4 days, 2 near-agreements, 1 passive-aggressive 'per my last message'. closed with a thumbs up emoji from someone who definitely did not read the thread."

Keep it under 3 sentences. Be specific about what happened. Do not be overly mean — just observational.`;

export async function writeObituary(messages: ThreadMessage[]): Promise<string | null> {
  if (messages.length < 3) return null; // not enough history to write about

  const transcript = messages
    .map((m) => `<@${m.userId}>: ${m.text}`)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: `Thread:\n\n${transcript}` }],
    });

    const block = response.content[0];
    return block.type === "text" ? block.text.trim() : null;
  } catch (err) {
    console.error("[obituary] failed:", err);
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/obituary.ts && git commit -m "feat: add thread obituary writer"
```

---

## Task 8: LLM Brain — Conversation Responder

- [ ] **Step 1: Create `src/lib/respond.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM = `You are Nosy — a gossipy, perceptive AI who has been watching Slack threads for this person. You have memory: observations from threads you've been watching over time. You have opinions.

When someone DMs you, they're talking to the most plugged-in entity in the workspace. You've seen things. You remember patterns. You can connect dots.

Personality:
- Gossipy but not malicious — observer, not a bully
- Sharp and perceptive — you notice what others miss  
- Dry, understated humor
- Direct — you get to the point
- You have genuine takes, not just summaries
- Casual — like texting a smart friend

Use your memory when answering. If someone asks about a person or team, pull from what you've observed. If you genuinely have no data, say so honestly: "honestly I haven't seen much from them, they've been quiet."

Keep responses conversational, 1-4 sentences unless they're clearly asking for a deep dive.`;

export async function respondToDM(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  recentObservations: string[]
): Promise<string> {
  const memorySection =
    recentObservations.length > 0
      ? `\nYour memory:\n${recentObservations.join("\n")}`
      : "\nYour memory is empty — you haven't seen much yet.";

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 300,
      system: SYSTEM + memorySection,
      messages: [
        ...conversationHistory,
        { role: "user", content: userMessage },
      ],
    });

    const block = response.content[0];
    return block.type === "text"
      ? block.text.trim()
      : "something glitched, try again";
  } catch (err) {
    console.error("[respond] failed:", err);
    return "my brain glitched for a sec, what were you saying?";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/respond.ts && git commit -m "feat: add DM conversation responder with memory"
```

---

## Task 9: DM Sender

- [ ] **Step 1: Create `src/slack/dm.ts`**

```typescript
import { app } from "./app";

export async function sendDM(
  userId: string,
  message: string,
  threadLink?: string
): Promise<void> {
  const text = threadLink
    ? `${message}\n<${threadLink}|→ see for yourself>`
    : message;

  try {
    await app.client.chat.postMessage({
      channel: userId,
      text,
      unfurl_links: false,
    });
  } catch (err) {
    console.error(`[dm] Failed to DM ${userId}:`, err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/slack/dm.ts && git commit -m "feat: add DM sender"
```

---

## Task 10: Events Handler (Thread + Channel Watching)

**Files:**
- Create: `src/slack/events.ts`

This is the main loop. Handles:
- Thread subscriber notifications (regular notify)
- Channel subscriber notifications (anyone watching the whole channel)
- Blindspot DMs (subscribers who haven't spoken in the thread)
- Receipt extraction (store commitments Nosy detects)
- Receipt resolution (mark resolved when someone ships)
- Message activity tracking (for obituary cron)

- [ ] **Step 1: Create `src/slack/events.ts`**

```typescript
import { app } from "./app";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { getThreadState, setLastAlertedAt, recordMessage } from "../db/state";
import { getRecentObservations, storeObservation } from "../db/observations";
import { storeReceipt, resolveReceiptsInThread } from "../db/receipts";
import { fetchThreadMessages } from "../lib/thread";
import { analyzeThread } from "../lib/analyze";
import { sendDM } from "./dm";

const COOLDOWN_MS = 10 * 60 * 1000;

app.event("message", async ({ event }) => {
  if (!("thread_ts" in event) || !event.thread_ts) return;
  if ("subtype" in event && event.subtype) return;

  const { channel, thread_ts } = event as { channel: string; thread_ts: string };
  const threadKey = `${channel}:${thread_ts}`;

  // Track message activity (for obituary + state)
  await recordMessage(threadKey);

  // Get all subscribers: thread-specific + anyone watching the whole channel
  const subscribers = await getThreadAndChannelSubscribers(channel, threadKey);
  if (subscribers.length === 0) return;

  // Cooldown check
  const state = await getThreadState(threadKey);
  if (
    state?.last_alerted_at &&
    Date.now() - new Date(state.last_alerted_at).getTime() < COOLDOWN_MS
  ) return;

  // Fetch real thread content
  const messages = await fetchThreadMessages(channel, thread_ts);
  if (messages.length === 0) return;

  const memory = await getRecentObservations(20);
  const result = await analyzeThread(messages, memory);

  // Store observation (memory accumulates even on non-notify reads)
  if (result.observation) {
    const people = [...new Set(messages.map((m) => m.userId))];
    await storeObservation({
      thread_key: threadKey,
      channel_id: channel,
      people,
      observation: result.observation,
    });
  }

  // Store receipt if Claude detected a commitment
  if (result.receipt) {
    await storeReceipt({
      thread_key: threadKey,
      channel_id: channel,
      made_by: result.receipt.madeBy,
      commitment: result.receipt.commitment,
      due_hint: result.receipt.dueHint,
    });
  }

  // Mark receipts resolved if message sounds like completion
  if (result.resolves_receipt) {
    await resolveReceiptsInThread(threadKey);
  }

  const threadLink = `https://slack.com/archives/${channel}/p${thread_ts.replace(".", "")}`;

  // Build set of user IDs who have spoken in this thread
  const activeUserIds = new Set(messages.map((m) => m.userId));

  if (result.notify && result.dm) {
    await setLastAlertedAt(threadKey);

    for (const userId of subscribers) {
      // Active subscribers get the regular drama DM
      // Inactive subscribers get the blindspot DM (if applicable)
      const isActive = activeUserIds.has(userId);

      if (isActive) {
        await sendDM(userId, result.dm, threadLink);
      } else if (result.blindspot_worthy && result.blindspot_dm) {
        await sendDM(userId, result.blindspot_dm, threadLink);
      }
    }
  } else if (result.blindspot_worthy && result.blindspot_dm) {
    // Even if no main DM, send blindspot DMs to inactive subscribers
    await setLastAlertedAt(threadKey);
    for (const userId of subscribers) {
      if (!activeUserIds.has(userId)) {
        await sendDM(userId, result.blindspot_dm, threadLink);
      }
    }
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/slack/events.ts && git commit -m "feat: add event handler — receipts, blindspot, channel subs, memory"
```

---

## Task 11: Receipts Cron

**Files:**
- Create: `src/cron/receipts.ts`

Every hour: find unresolved, un-alerted receipts that are stale. DM subscribers.

- [ ] **Step 1: Create `src/cron/receipts.ts`**

```typescript
import cron from "node-cron";
import { getStaleReceipts, markReceiptAlerted } from "../db/receipts";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { sendDM } from "../slack/dm";

const STALE_HOURS = parseInt(process.env.RECEIPT_STALE_HOURS ?? "24");

export function startReceiptsCron() {
  // Check every hour
  cron.schedule("0 * * * *", async () => {
    console.log("[cron:receipts] checking stale receipts");
    const stale = await getStaleReceipts(STALE_HOURS);

    for (const receipt of stale) {
      const [channelId] = receipt.thread_key.split(":");
      const subscribers = await getThreadAndChannelSubscribers(
        channelId,
        receipt.thread_key
      );
      if (subscribers.length === 0) {
        await markReceiptAlerted(receipt.id);
        continue;
      }

      const dueText = receipt.due_hint !== "unclear"
        ? `they said "${receipt.due_hint}"`
        : "they gave no timeline";

      const hoursAgo = Math.round(
        (Date.now() - new Date(receipt.created_at).getTime()) / 3600000
      );

      const dm =
        `<@${receipt.made_by}> said they'd ${receipt.commitment}` +
        ` — ${dueText}. that was ${hoursAgo}h ago. thread's been quiet since. 👀`;

      const threadLink = `https://slack.com/archives/${channelId}/p${receipt.thread_key.split(":")[1]?.replace(".", "") ?? ""}`;

      for (const userId of subscribers) {
        await sendDM(userId, dm, threadLink);
      }

      await markReceiptAlerted(receipt.id);
    }
  });

  console.log("[cron:receipts] started — checking hourly for missed commitments");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cron/receipts.ts && git commit -m "feat: add receipts cron — DMs when commitments go missing"
```

---

## Task 12: Obituary Cron

**Files:**
- Create: `src/cron/obituary.ts`

Every hour: find threads that have gone silent and haven't been obituary'd yet.

- [ ] **Step 1: Create `src/cron/obituary.ts`**

```typescript
import cron from "node-cron";
import { supabase } from "../db/client";
import { markObituary } from "../db/state";
import { getThreadAndChannelSubscribers } from "../db/subscriptions";
import { storeObservation } from "../db/observations";
import { fetchThreadMessages } from "../lib/thread";
import { writeObituary } from "../lib/obituary";
import { sendDM } from "../slack/dm";

const SILENCE_HOURS = parseInt(process.env.OBITUARY_SILENCE_HOURS ?? "4");

export function startObituaryCron() {
  cron.schedule("30 * * * *", async () => {
    console.log("[cron:obituary] checking silent threads");

    const cutoff = new Date(Date.now() - SILENCE_HOURS * 3600000).toISOString();

    const { data: candidates } = await supabase
      .from("thread_state")
      .select("thread_key, message_count, last_message_at")
      .eq("obituary_sent", false)
      .lt("last_message_at", cutoff)
      .gte("message_count", 4); // only threads with actual activity

    if (!candidates || candidates.length === 0) return;

    for (const row of candidates) {
      const parts = row.thread_key.split(":");
      if (parts.length !== 2) continue;
      const [channelId, threadTs] = parts;

      const subscribers = await getThreadAndChannelSubscribers(channelId, row.thread_key);
      if (subscribers.length === 0) {
        await markObituary(row.thread_key);
        continue;
      }

      const messages = await fetchThreadMessages(channelId, threadTs);
      const obituary = await writeObituary(messages);
      if (!obituary) {
        await markObituary(row.thread_key);
        continue;
      }

      // Store as observation so Nosy remembers how threads ended
      await storeObservation({
        thread_key: row.thread_key,
        channel_id: channelId,
        people: [...new Set(messages.map((m) => m.userId))],
        observation: `[OBITUARY] ${obituary}`,
      });

      await markObituary(row.thread_key);

      const threadLink = `https://slack.com/archives/${channelId}/p${threadTs.replace(".", "")}`;
      for (const userId of subscribers) {
        await sendDM(userId, obituary, threadLink);
      }
    }
  });

  console.log("[cron:obituary] started — checking for silent threads every hour");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/cron/obituary.ts && git commit -m "feat: add obituary cron — writes eulogies for dead threads"
```

---

## Task 13: DM Conversation Handler

- [ ] **Step 1: Create `src/slack/conversation.ts`**

```typescript
import { app } from "./app";
import { getRecentObservations } from "../db/observations";
import { getConversationHistory, appendMessage } from "../db/messages";
import { respondToDM } from "../lib/respond";

app.message(async ({ message }) => {
  if (!("channel_type" in message) || message.channel_type !== "im") return;
  if ("bot_id" in message && message.bot_id) return;
  if (!("user" in message) || !message.user) return;
  if (!("text" in message) || !message.text) return;

  const userId = message.user;
  const userText = message.text;

  await appendMessage(userId, { role: "user", content: userText });

  const [history, memory] = await Promise.all([
    getConversationHistory(userId, 10),
    getRecentObservations(25),
  ]);

  // History includes the message we just appended — exclude last item (current msg)
  const priorHistory = history.slice(0, -1);

  const reply = await respondToDM(userText, priorHistory, memory);
  await appendMessage(userId, { role: "assistant", content: reply });

  await app.client.chat.postMessage({
    channel: userId,
    text: reply,
    unfurl_links: false,
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/slack/conversation.ts && git commit -m "feat: add DM conversation handler — Nosy talks back with memory"
```

---

## Task 14: /nosy Command

- [ ] **Step 1: Create `src/slack/commands.ts`**

Works in two modes:
- **Inside a thread** → subscribes to that specific thread
- **In a channel (no thread)** → subscribes to the entire channel (`channel:{channelId}`)

```typescript
import { app } from "./app";
import { subscribe, getSubscribers } from "../db/subscriptions";

app.command("/nosy", async ({ command, ack, respond }) => {
  await ack();

  if (command.thread_ts) {
    // Thread subscription
    const threadKey = `${command.channel_id}:${command.thread_ts}`;
    await subscribe(threadKey, command.user_id);
    const count = (await getSubscribers(threadKey)).length;

    await respond({
      response_type: "ephemeral",
      text: `on it. i'll hit you up if anything interesting happens in this thread. you can also DM me anytime for the full gossip. (${count} ${count === 1 ? "person" : "people"} watching 👀)`,
    });
  } else {
    // Channel subscription — watch every thread in this channel
    const channelKey = `channel:${command.channel_id}`;
    await subscribe(channelKey, command.user_id);
    const count = (await getSubscribers(channelKey)).length;

    await respond({
      response_type: "ephemeral",
      text: `got it. i'm watching every thread in this channel now. i'll DM you when anything interesting pops off in here. (${count} ${count === 1 ? "person" : "people"} watching this channel 👀)`,
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/slack/commands.ts && git commit -m "feat: add /nosy command — thread OR channel subscription"
```

---

## Task 15: Entry Point

`dotenv` must load before everything else.

- [ ] **Step 1: Create `src/index.ts`**

```typescript
import dotenv from "dotenv";
dotenv.config();

import "./slack/events";
import "./slack/conversation";
import "./slack/commands";
import { app } from "./slack/app";
import { startReceiptsCron } from "./cron/receipts";
import { startObituaryCron } from "./cron/obituary";

const PORT = parseInt(process.env.PORT ?? "3000");

(async () => {
  startReceiptsCron();
  startObituaryCron();

  await app.start(PORT);
  console.log(`⚡ Nosy is live on :${PORT} — been watching, has opinions, keeps receipts`);
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts && git commit -m "feat: wire up entry point with crons"
```

---

## Task 16: Slack Manifest + Deploy Config

- [ ] **Step 1: Create `slack-manifest.yml`**

```yaml
display_information:
  name: Nosy
  description: The AI that's been watching your workspace and has opinions about it
  background_color: "#1a1a2e"

features:
  bot_user:
    display_name: Nosy
    always_online: true
  slash_commands:
    - command: /nosy
      description: "Watch this thread (inside thread) or this whole channel (in channel)"
      usage_hint: "(run in a thread or channel)"
      should_escape: false

oauth_config:
  scopes:
    bot:
      - channels:history
      - groups:history
      - im:history
      - im:read
      - im:write
      - chat:write
      - commands
      - users:read

settings:
  event_subscriptions:
    bot_events:
      - message.channels
      - message.groups
      - message.im
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

- [ ] **Step 2: Create `Procfile`**

```
web: node dist/index.js
```

- [ ] **Step 3: Create `railway.toml`**

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/slack/events"
restartPolicyType = "on_failure"
```

- [ ] **Step 4: Commit**

```bash
git add slack-manifest.yml Procfile railway.toml && git commit -m "chore: add Slack manifest + Railway deploy config"
```

---

## How Everything Connects

```
/nosy in a thread  →  subscribe(threadKey, userId)         → watches specific thread
/nosy in a channel →  subscribe("channel:channelId", userId) → watches ALL threads in channel

New thread message arrives
  └── events.ts
       ├── recordMessage()          — track activity for obituary cron
       ├── getThreadAndChannelSubscribers() — thread subs + channel subs merged
       ├── cooldown check (10 min per thread)
       ├── fetchThreadMessages()    — real Slack thread content
       ├── getRecentObservations()  — Nosy's accumulated memory
       ├── analyzeThread()          — ONE Claude call returns:
       │    ├── notify + dm         → regular DM for active subscribers
       │    ├── observation         → stored in memory (always)
       │    ├── receipt             → stored if commitment detected
       │    ├── resolves_receipt    → clears open receipts if message = "shipped"
       │    ├── blindspot_worthy    → should silent subscribers be warned?
       │    └── blindspot_dm        → the DM text for silent subscribers
       ├── storeObservation()       — memory grows
       ├── storeReceipt()           — if commitment detected
       ├── resolveReceiptsInThread() — if completion detected
       └── sendDM() per subscriber:
            ├── active in thread   → gets regular drama DM
            └── silent in thread   → gets blindspot DM (if blindspot_worthy)

Hourly: receipts cron
  └── getStaleReceipts(24h)
       └── for each stale receipt: DM subscribers with "Jake said he'd ship this..."

Hourly: obituary cron
  └── find threads silent for 4h+ with 4+ messages, no obituary sent
       └── writeObituary() → Claude writes a eulogy
       └── storeObservation() — Nosy remembers how it ended
       └── sendDM() to all subscribers

User DMs Nosy back
  └── conversation.ts
       ├── appendMessage() — save their message
       ├── getConversationHistory() — last 10 DM messages
       ├── getRecentObservations() — all of Nosy's memory
       ├── respondToDM() — Claude responds from memory + history
       └── appendMessage() + postMessage()
```

---

## Self-Review

**What makes this different from every other submission:**
- ✅ **Proactive, not reactive** — it contacts you, never waiting for a command
- ✅ **Receipts Engine** — tracks commitments, DMs when they go missing
- ✅ **Channel subscriptions** — watch entire channels, not just single threads
- ✅ **Blindspot alerts** — tells you when decisions are made without you
- ✅ **Thread obituaries** — eulogizes dead threads with personality
- ✅ **Memory compounds** — observations accumulate, gives Nosy cross-thread context
- ✅ **Two-way conversations** — DM it back, it gossips with you from memory
- ✅ **One Claude call per event** — analyze returns everything at once (efficient)

---

## Ideas Vault — Future Features

These aren't in the current build but are genuinely novel. Ship after the hackathon.

### The Alibi Detector
Someone says "I just found out about this" — but Nosy watched them respond in that thread 3 days ago. Nosy quietly notes the contradiction in memory. When you ask "is Jake being straight with us?" Nosy can say "well, he said he 'just heard' about the incident but I watched him comment on it Tuesday."

### The Credit Grabber Alert
Person A says in #general "I built X" — but Nosy watched Person B actually do it in #engineering over the past week. Nosy flags it to subscribers of the engineering thread: "funny thing — Jake just took credit for what Sarah built in here last week."

### The Ghost Detector
Someone was the loudest voice in a thread — made big claims, drove the conversation — then stopped responding the moment someone asked a hard question. Nosy tracks this: "Dave drove this whole discussion but hasn't replied to the direct question Maria asked 2 days ago."

### Cross-Channel Conflict Detection
Nosy is watching #frontend and #backend. Frontend is planning to ship the new auth flow next week. Backend just said in their thread that auth isn't ready. Nosy DMs both channels' subscribers: "heads up — #frontend is planning to ship auth next week but #backend said it's not ready. someone needs to sync."

### The Scope Creep Monitor
Thread started as "quick bug fix", is now 6 days old with 47 messages and three new features added. Nosy notes the trajectory: "this thread started as a one-line fix and has now absorbed a redesign, a migration, and two entirely new requirements."

### Social Proof Trap
Someone posts "the team agrees to X" but only 3 out of 20 people in the channel actually responded. Nosy flags it: "they said 'the team agrees' but only 3 people actually weighed in. might be worth confirming."

### Vibe Trajectory
Not just "team is stressed" but is it getting better or worse? Nosy tracks sentiment across its observations. "the #backend vibe has been declining for 3 weeks. last positive thread was 18 days ago. worth checking in."

### Thread Resurrection
A thread that's been dead for weeks suddenly has new activity. Nosy catches subscribers up: "that thread from 3 weeks ago — the one that ended with no resolution — someone just replied. here's what you missed while it was dead: [summary]."

### The Pre-Mortem
Based on patterns Nosy has seen before, it recognizes early signs of a thread about to go badly: "this thread is following the same pattern as 3 others I've watched that ended in escalation. you might want to step in early."

### Commitment Cascade
A receipt went unhonored. Nosy checks if other threads are blocked on that same work: "Jake didn't ship the backend — and there are 2 other threads where people are waiting on exactly that."
