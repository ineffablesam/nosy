# Nosy

**The AI that's been watching your Slack workspace — and has opinions about it.**

> Built for the Slack Agent Builder Challenge 2026

---

## The Problem

You're subscribed to threads you care about, but Slack gives you the same notification for "ok sounds good" as it does for "we need to talk about the deploy." Everything looks the same. Nothing feels urgent until it is.

Meanwhile, commitments get made and forgotten. Decisions happen in threads you're watching but not participating in. And when a thread dies — no one knows how it ended.

## What Nosy Does

Nosy is not an assistant. You don't ask it things. It watches — and it tells you what's worth knowing.

### Watch a thread (or an entire channel)

Run `/nosy` inside any thread and Nosy subscribes you. Run it in a channel with no thread selected and Nosy watches **every thread in that channel**. It reads every message through Claude, and only contacts you when something genuinely interesting happens.

### DMs that sound like a friend, not a notification

When Nosy reaches out, it reads like a text from the most plugged-in person in your office:

> "jake just said 'almost done' again. third time this week. just wanted you to know 👀"

> "it went quiet in there right after that comment dropped. you felt that too right?"

> "they're doing the same thing they did in the Q3 planning thread — going in circles but louder"

No alert banners. No "THREAD ACTIVITY DETECTED." Just a message.

### Receipts Engine

Nosy listens for commitments. "I'll have it done by Thursday." "Shipping EOD." "Will fix this tomorrow." It stores them. If time passes and nothing happens — Nosy reaches out with an **interactive card**, not a wall of text:

> ☣️ *Receipt is overdue*
> Jake said they'd **ship the webhook refactor** — _"EOD Friday"_. that was 2 days ago and the thread's gone quiet. 👀
> `[ Nudge them 👋 ] [ Snooze 1 day ] [ Mark done ✅ ] [ Open thread ↗ ]`

Hit **Nudge** and Nosy DMs Jake *on your behalf* ("sam asked me to check in on the webhook refactor 👀"). **Snooze** pushes it out a day. **Mark done** closes it. When someone actually ships it in-thread, Nosy notices and closes the receipt automatically.

### Blindspot Alerts

You've subscribed to a thread but haven't said anything in it. A decision is being made without your input. Nosy tells you:

> "you haven't been in that thread but they're making a call about the API architecture without you. might want to weigh in 👀"



### Thread Obituaries

When a thread goes silent after being active, Nosy writes its eulogy:

> "RIP this thread. started as a 'quick question', became 23 messages of circular debate, ended when Mark said he'd 'think about it'. he has not thought about it."

### The Home Tab — Nosy's dashboard

Open the app in Slack and you land on a **live dashboard**, not an empty bot. It shows everything Nosy is holding for you: the threads and channels you're watching, your open receipts (with how late they are), recently deceased threads, and Nosy's latest takes across the workspace. One button — **🍵 Spill the tea** — and Nosy reads its whole memory and gives you the gossip right now.

### Real-Time Search (RTS) — Nosy can actually look things up

Nosy's memory is everything it's watched. But what about the stuff it *didn't* cache? Nosy uses Slack's **Real-Time Search API** (`assistant.search.context`) to search the live workspace — permission-aware — when you ask it a question. So when you DM "has Marcus pushed to main before?" or "what did Sarah say about the deploy last week?", Nosy doesn't just guess from memory — it searches the workspace and answers from real messages. Without RTS, Nosy is limited to what it happened to store. With it, Nosy knows the whole workspace.



### Memory That Compounds

Every thread Nosy reads, it stores an observation. Over time, it builds a picture of your workspace — who says what, what patterns repeat, what never gets resolved.

When Nosy DMs you, it draws on that memory. When you DM Nosy back:

> You: "has this team always been this chaotic?"
> Nosy: "honestly yes. third sprint in a row this exact thing has happened. same people, same argument, same non-decision."

Nosy isn't just watching the current thread. It's been watching the whole workspace.

---



## How It Works

```
/nosy in a thread  →  watch this specific thread
/nosy in a channel →  watch every thread in this channel
Open the app       →  Home tab dashboard: watching, open receipts, obituaries, latest takes

New message in a watched thread:
  → Claude reads the real thread content (not regex signals)
  → Decides: is this notable? Is there a commitment? Should silent subscribers be warned?
  → DMs active subscribers with drama, DMs silent subscribers with blindspot alerts
  → Stores an observation to memory
  → Checks for receipts

Hourly receipt check:
  → Any commitments unfulfilled past their deadline?
  → DM subscribers an interactive card: Nudge / Snooze / Mark done / Open thread

Hourly obituary check:
  → Any threads silent for 4+ hours after being active?
  → Claude writes the eulogy, DMs subscribers

User replies to Nosy's DM:
  → Nosy runs Slack Real-Time Search on the message (permission-aware workspace search)
  → Pulls its full memory + conversation history + the live search results
  → Responds like a friend who's been paying attention — and who looked it up
```

---



## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Slack:** Bolt for JavaScript — Events API, Slash Commands, **Block Kit** (interactive cards + App Home tab), **Real-Time Search API** (`assistant.search.context`)
- **AI:** Anthropic Claude (`claude-sonnet-4-6` for thread analysis, `claude-haiku-4-5` for DMs) with GPT fallback — reads thread content, writes DMs, makes judgment calls
- **Database:** Supabase (PostgreSQL) — subscriptions, memory, receipts, conversation history
- **Scheduling:** node-cron (receipts + obituary checks)
- **Deploy:** Railway

---

## Setup (beyond the base `.env`)

To enable the interactive surfaces and RTS:

1. **Run the migration** in Supabase: `supabase/migrations/2026-07-12-receipts-snooze.sql` (adds `receipts.snooze_until`).
2. **App Home tab:** in your Slack app config → *App Home* → enable the Home Tab and set it to **Publishable** (not read-only). Then under *Event Subscriptions* subscribe to the `app_home_opened` event. `views.publish` needs no special scope — just a bot token, which you already have.
3. **Real-Time Search:** in *OAuth & Permissions* → **User Token Scopes** → add `search:read`. Reinstall the app to your workspace, copy the new `xoxp-` token, and set it as `SLACK_USER_TOKEN` in `.env`.
4. Reinstall the app and restart. With `SLACK_USER_TOKEN` unset, Nosy still works — it just skips live search and answers from cached memory.

---



## What Makes This Different

Every other agent in this challenge is a tool — you talk to it, it helps you. Nosy acts first. It's the first Slack agent that functions as a **witness**: it has been paying attention, it has memory, and it has opinions.

- Memory compounds — the longer Nosy watches, the sharper its takes
- The DMs don't feel like notifications — they feel like a text from someone who's plugged in
- You can talk back — Nosy has a full conversation.
- It tracks what people said they'd do — and notices when they don't

---



## Demo

[Demo video link]

---



## Built by

[Your name / team]