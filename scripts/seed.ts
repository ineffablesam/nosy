/**
 * Nosy Demo Workspace Seeder
 * Creates channels and populates them with realistic fake conversations.
 *
 * Run with:
 *   npx tsx --env-file .env scripts/seed.ts
 *
 * Requirements:
 *   - SLACK_BOT_TOKEN in .env
 *   - Bot needs chat:write.customize scope (update manifest + reinstall if needed)
 *   - Script posts as "bot with fake username" — messages look like real people
 */

import { WebClient } from "@slack/web-api";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POST_DELAY_MS = 1200; // ~50 req/min rate limit safe zone

// ---------------------------------------------------------------------------
// Fake users (name + emoji avatar)
// ---------------------------------------------------------------------------
const USERS = {
  jake:   { username: "Jake Chen",      icon_emoji: ":male-technologist:" },
  sarah:  { username: "Sarah Okonkwo",  icon_emoji: ":woman-office-worker:" },
  marcus: { username: "Marcus Reyes",   icon_emoji: ":man-mechanic:" },
  elena:  { username: "Elena Vasquez",  icon_emoji: ":woman-artist:" },
  tom:    { username: "Tom Wheeler",    icon_emoji: ":man-beard:" },
  priya:  { username: "Priya Nair",     icon_emoji: ":woman-student:" },
  dave:   { username: "Dave Kim",       icon_emoji: ":man-factory-worker:" },
  maria:  { username: "Maria Santos",   icon_emoji: ":woman-health-worker:" },
  alex:   { username: "Alex Turner",    icon_emoji: ":man-in-tuxedo:" },
  chris:  { username: "Chris Morgan",   icon_emoji: ":crown:" },
};

type UserKey = keyof typeof USERS;

// ---------------------------------------------------------------------------
// Channel definitions
// ---------------------------------------------------------------------------
const CHANNELS = [
  "general",
  "engineering",
  "backend",
  "frontend",
  "incidents",
  "design",
  "product",
  "support",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createChannel(name: string): Promise<string> {
  try {
    const res = await client.conversations.create({ name, is_private: false });
    const channelId = res.channel?.id ?? "";
    console.log(`  ✓ Created #${name} (${channelId})`);
    await delay(POST_DELAY_MS);
    // Bot joins channel
    await client.conversations.join({ channel: channelId });
    await delay(POST_DELAY_MS);
    return channelId;
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "data" in err &&
      typeof (err as { data: { error?: string } }).data === "object" &&
      (err as { data: { error?: string } }).data.error === "name_taken"
    ) {
      // Channel already exists — find it
      const list = await client.conversations.list({ exclude_archived: true, limit: 200 });
      const ch = list.channels?.find((c) => c.name === name);
      if (ch?.id) {
        console.log(`  ~ #${name} already exists (${ch.id})`);
        await client.conversations.join({ channel: ch.id });
        await delay(POST_DELAY_MS);
        return ch.id;
      }
    }
    console.error(`  ✗ Failed to create #${name}:`, err);
    return "";
  }
}

async function post(
  channel: string,
  user: UserKey,
  text: string,
  thread_ts?: string
): Promise<string> {
  try {
    const res = await client.chat.postMessage({
      channel,
      text,
      thread_ts,
      ...USERS[user],
    });
    await delay(POST_DELAY_MS);
    return res.ts ?? "";
  } catch (err) {
    console.error(`Post failed:`, err);
    return "";
  }
}

async function react(channel: string, ts: string, emoji: string) {
  try {
    await client.reactions.add({ channel, timestamp: ts, name: emoji });
    await delay(800);
  } catch {
    // ignore already_reacted
  }
}

// ---------------------------------------------------------------------------
// Conversation scripts per channel
// ---------------------------------------------------------------------------

async function seedGeneral(channel: string) {
  console.log("  Seeding #general...");

  let ts = await post(channel, "chris", "good morning team 👋 reminder that the Q3 planning session is this Thursday at 2pm. please come with your roadmap items ready.");
  await react(channel, ts, "thumbsup");
  await react(channel, ts, "white_check_mark");

  ts = await post(channel, "alex", "quick heads up — we landed the Meridian deal! $180k ARR. took 3 months but we got there 🎉");
  await react(channel, ts, "tada");
  await react(channel, ts, "fire");
  await react(channel, ts, "raised_hands");

  ts = await post(channel, "tom", "great work alex. that's the biggest deal this quarter");
  await post(channel, "sarah", "yes!! congrats 🥳", ts);
  await post(channel, "jake", "legend", ts);

  ts = await post(channel, "chris", "reminder to everyone: performance reviews open next Monday. please complete your self-reviews by EOD Wednesday. HR will be sending the link shortly.");
  await react(channel, ts, "eyes");
  await react(channel, ts, "sweat_smile");

  ts = await post(channel, "dave", "is the VPN being weird for anyone else today? keeps dropping every 20 mins");
  await post(channel, "marcus", "yes!! thought it was just me", ts);
  await post(channel, "sarah", "same, had 4 drops this morning", ts);
  await post(channel, "jake", "IT is aware, they said 'looking into it' which means... who knows", ts);
  await react(channel, ts, "sob");

  await post(channel, "elena", "hey does anyone know if we have a brand style guide? working on some external docs and can't find it anywhere");
  ts = await post(channel, "priya", "it's in Notion somewhere... let me find it");
  await post(channel, "priya", "ok I cannot find it. @chris does this exist?", ts);
  await post(channel, "chris", "it should be in the design folder. I'll ask marketing to re-share it tomorrow", ts);
  // nobody follows up — good for Nosy's memory

  ts = await post(channel, "maria", "team — we're getting a lot of tickets about the export feature being slow. just a heads up in case engineering wants to prioritize this week");
  await post(channel, "jake", "noted, will take a look", ts);
  await post(channel, "marcus", "yeah I've seen this too, might be the new query we added last week", ts);
}

async function seedEngineering(channel: string) {
  console.log("  Seeding #engineering...");

  // Scenario 1: deploy gone wrong
  let ts = await post(channel, "jake", "deploying v2.4.1 to prod now. should be quick, just the auth timeout fix");
  await react(channel, ts, "crossed_fingers");
  await post(channel, "dave", "🚀", ts);

  await delay(2000);
  ts = await post(channel, "jake", "uh. deployment is taking longer than expected");
  await post(channel, "marcus", "how long?", ts);
  await post(channel, "jake", "it's been 12 minutes. normally takes 2", ts);
  await post(channel, "dave", "checking the logs now", ts);
  await react(channel, ts, "sob");

  ts = await post(channel, "dave", "found it. the new migration is locking the users table. we have 8000 rows and the migration is doing a full scan");
  await post(channel, "jake", "oh no", ts);
  await post(channel, "marcus", "do we need to roll back?", ts);
  await post(channel, "dave", "let it run, it's at 60%. killing it now would be worse", ts);
  await post(channel, "jake", "ok. pinging support to let them know login might be slow", ts);

  await post(channel, "jake", "migration complete. we're live. login times are back to normal. post-mortem tomorrow");
  await react(channel, ts, "phew");

  // Scenario 2: code review drama
  ts = await post(channel, "sarah", "just left comments on the auth PR. some of it is pretty major, sorry Marcus 😬");
  ts = await post(channel, "marcus", "what do you mean major");
  await post(channel, "sarah", "the token refresh logic will cause a race condition under load. I left a comment explaining it", ts);
  await post(channel, "marcus", "I've been doing this for 6 years Sarah I think I know how token refresh works", ts);
  await react(channel, ts, "eyes");
  await post(channel, "sarah", "I'm not questioning your experience, I'm saying there's a specific bug. look at the comment", ts);
  await post(channel, "jake", "hey both of you — let's take this to a quick call and look at it together. no point debating in github comments", ts);
  await post(channel, "marcus", "fine", ts);
  await post(channel, "sarah", "agreed", ts);
  // radio silence after — good for obituary

  // Scenario 3: commitment (good for receipts demo)
  ts = await post(channel, "tom", "what's the status on the webhook refactor? this was supposed to be done last week");
  await post(channel, "jake", "yeah sorry, I got pulled into the auth incident. I'll have it done by EOD Friday, promise", ts);
  await post(channel, "tom", "Friday is fine but it blocks the Meridian integration. just want to make sure", ts);
  await post(channel, "jake", "I understand. Friday EOD, it'll be done", ts);
  // jake doesn't follow up — receipts will catch this

  // Scenario 4: architecture debate
  ts = await post(channel, "marcus", "ok hot take: we should move the job queue from Redis to Postgres. we're already using Postgres and the Redis infra is annoying to maintain");
  await post(channel, "dave", "absolutely not. Redis handles 50k jobs/second. Postgres will fall over", ts);
  await post(channel, "marcus", "we do 200 jobs a day Dave", ts);
  await post(channel, "dave", "today. what about in 2 years?", ts);
  await post(channel, "sarah", "I actually think Marcus has a point for our current scale", ts);
  await post(channel, "jake", "let's not do this without a proper RFC. Marcus can you write one up?", ts);
  await post(channel, "marcus", "sure I'll have it done this week", ts);
  // RFC never appears
}

async function seedBackend(channel: string) {
  console.log("  Seeding #backend...");

  let ts = await post(channel, "marcus", "heads up: I'm changing the /users endpoint to return snake_case instead of camelCase to match the rest of the API. doing it in the next PR");
  await post(channel, "sarah", "wait does this break the frontend??", ts);
  await post(channel, "marcus", "frontend should handle both cases right?", ts);
  await post(channel, "sarah", "no? why would it? we built it to match your schema", ts);
  await post(channel, "marcus", "oh. I didn't realize. let me check with Jake", ts);
  await post(channel, "jake", "yeah this will break like 40 places in the frontend. please don't merge without coordinating", ts);
  await post(channel, "marcus", "ok ok. I'll hold off. sorry", ts);
  await react(channel, ts, "face_palm");

  ts = await post(channel, "dave", "the database CPU is at 78% right now. anyone running a heavy query?");
  await post(channel, "marcus", "not me", ts);
  await post(channel, "sarah", "not me", ts);
  await post(channel, "dave", "checking... looks like it's the analytics export job someone scheduled every 5 minutes. who set that up?", ts);
  // silence — nobody claims it

  ts = await post(channel, "marcus", "quick PSA: I accidentally pushed to main. it was just a config change but still. sorry. adding a branch protection rule now");
  await react(channel, ts, "scream");
  await react(channel, ts, "sob");
  await post(channel, "jake", "Marcus...", ts);
  await post(channel, "marcus", "I know I know. never again", ts);
  await post(channel, "dave", "adding you to the 'pushed to main' hall of shame. you're in good company", ts);

  // commitment for receipts
  ts = await post(channel, "marcus", "the rate limiter PR is ready for review. I'll have the tests written by tomorrow morning");
  await react(channel, ts, "thumbsup");
  // no tests appear tomorrow
}

async function seedFrontend(channel: string) {
  console.log("  Seeding #frontend...");

  let ts = await post(channel, "sarah", "ok I need to vent. whoever decided to use CSS-in-JS for this project has made my life a nightmare. we have 14 different button styles because nobody can find the component");
  await react(channel, ts, "this");
  await react(channel, ts, "sob");
  await post(channel, "elena", "I've been saying this for months. the design system is a mess", ts);
  await post(channel, "priya", "agreed. I spent 2 hours last week looking for the modal component", ts);
  await post(channel, "jake", "ok let's fix it then. Sarah can you lead a cleanup sprint?", ts);
  await post(channel, "sarah", "yes. I'll have a proposal by end of week", ts);
  // proposal never comes — receipts catches it

  ts = await post(channel, "sarah", "does anyone know why the dashboard is 8mb? I'm looking at the bundle and it's insane");
  await post(channel, "priya", "oh I added a new charting library last week. do we have too many?", ts);
  await post(channel, "sarah", "we now have THREE charting libraries. chart.js, recharts, and d3", ts);
  await post(channel, "priya", "oh no. I didn't know the others existed", ts);
  await post(channel, "jake", "let's consolidate to recharts and remove the others. Priya can you do that?", ts);
  await post(channel, "priya", "on it, will do it by Thursday", ts);
  await react(channel, ts, "thumbsup");

  ts = await post(channel, "sarah", "the login form is broken in Safari 16. getting reports from 3 customers");
  await post(channel, "priya", "confirmed. it's the CSS :has() selector. not supported in Safari 16", ts);
  await post(channel, "sarah", "of course. ok fixing now", ts);
  await post(channel, "sarah", "fix deployed. can someone on a mac confirm?", ts);
  await post(channel, "elena", "confirmed working here 🙌", ts);
  await react(channel, ts, "white_check_mark");
}

async function seedIncidents(channel: string) {
  console.log("  Seeding #incidents...");

  // Incident 1: prod is down
  let ts = await post(channel, "dave", "🔴 PROD IS DOWN. getting 502s on all API endpoints. investigating now");
  await react(channel, ts, "fire");
  await react(channel, ts, "sos");
  await post(channel, "jake", "on it", ts);
  await post(channel, "marcus", "checking backend", ts);
  await post(channel, "tom", "how many customers affected?", ts);
  await post(channel, "dave", "all of them. this is a full outage", ts);
  await post(channel, "tom", "ok. keep this channel updated every 5 minutes. I'm calling the CEO", ts);

  await post(channel, "dave", "root cause: the load balancer health check is failing because we deployed a new version that changed the /health endpoint path. it's a config mismatch");
  await post(channel, "jake", "fixing the config now", ts);
  await delay(2000);
  await post(channel, "jake", "config updated. health checks passing. bringing instances back online", ts);
  await post(channel, "dave", "🟢 services recovering. 80% of requests succeeding now");
  await delay(2000);
  await post(channel, "dave", "🟢 fully recovered. total downtime: 23 minutes. writing up the post-mortem now");
  await react(channel, ts, "phew");

  // Incident 2: slow database
  ts = await post(channel, "marcus", "🟡 database response times are spiking. p99 is at 8 seconds. not a full outage but customers will notice");
  await post(channel, "dave", "looking at the slow query log", ts);
  await post(channel, "dave", "found it. someone's analytics query is doing a full table scan on the events table. 40 million rows. query has been running for 22 minutes", ts);
  await post(channel, "marcus", "can we kill it?", ts);
  await post(channel, "dave", "killing now... done. p99 back to 180ms", ts);
  await post(channel, "marcus", "ok. who owns that query? it needs an index", ts);
  // radio silence — nobody claims it
}

async function seedDesign(channel: string) {
  console.log("  Seeding #design...");

  let ts = await post(channel, "elena", "sharing the new onboarding flow designs: [figma link]. would love feedback from product and eng before I finalize");
  await react(channel, ts, "fire");
  await react(channel, ts, "eyes");
  await post(channel, "priya", "these look great! one thing — the step 3 form is asking for way too much info upfront", ts);
  await post(channel, "elena", "yeah I was worried about that too. what if we split it into two steps?", ts);
  await post(channel, "priya", "yes exactly. also the CTA button on step 1 is a bit small on mobile", ts);
  await post(channel, "elena", "good catch. will fix both and re-share by EOD tomorrow", ts);

  ts = await post(channel, "priya", "quick question: are we still using the old blue (#1a73e8) or the new one (#0057FF)?");
  await post(channel, "elena", "the new one. I updated the design system last week", ts);
  await post(channel, "sarah", "wait nobody told engineering. our stylesheets still have the old value", ts);
  await post(channel, "elena", "oh no. sorry, I thought it was in the changelog", ts);
  await post(channel, "priya", "I'll send a note to all of eng. also we should have a handoff process for this stuff", ts);

  ts = await post(channel, "elena", "does anyone have a preference on the new dashboard card layout? option A or B?");
  await post(channel, "priya", "A", ts);
  await post(channel, "chris", "B", ts);
  await post(channel, "tom", "A", ts);
  await post(channel, "jake", "A", ts);
  await post(channel, "elena", "ok A it is. Chris you're outvoted lol", ts);
  await post(channel, "chris", "I stand by my choice", ts);
}

async function seedProduct(channel: string) {
  console.log("  Seeding #product...");

  let ts = await post(channel, "tom", "putting together the Q4 roadmap. I want everyone's honest take: what's the ONE thing we should ship that would have the most impact?");
  await post(channel, "sarah", "real-time collaboration. customers keep asking for it", ts);
  await post(channel, "marcus", "better API docs. we're losing developers because our docs are terrible", ts);
  await post(channel, "alex", "mobile app. I lose deals every month because we're web-only", ts);
  await post(channel, "elena", "the reporting dashboard. current one is almost unusable", ts);
  await post(channel, "tom", "all valid. I'll put together a scoring matrix and share back", ts);
  // scoring matrix never comes

  ts = await post(channel, "tom", "we're thinking about raising prices by 20% for new customers. existing customers would be grandfathered. thoughts?");
  await post(channel, "alex", "risky. we're still in a growth phase", ts);
  await post(channel, "chris", "we're underpriced relative to competitors. I think it's the right move", ts);
  await post(channel, "marcus", "as long as we improve the product first. hard to justify 20% increase with current bugs", ts);
  await post(channel, "tom", "fair points. will model it out. Marcus's point about bugs is important — Jake can we get a bug burndown going?", ts);
  await post(channel, "jake", "yes, I'll kick off a bug sprint next week and share numbers", ts);
  // bug sprint never happens — good for receipts

  ts = await post(channel, "elena", "customer interview recap: talked to 8 customers this week. top 3 themes: (1) export is too slow, (2) can't find things in navigation, (3) no email notifications. sharing full notes in Notion");
  await react(channel, ts, "thumbsup");
  await react(channel, ts, "eyes");
  await post(channel, "tom", "the navigation feedback is interesting. we've had that come up before", ts);
  await post(channel, "priya", "yeah it's been in our backlog for months. maybe it's time to prioritize it", ts);
}

async function seedSupport(channel: string) {
  console.log("  Seeding #support...");

  let ts = await post(channel, "maria", "getting multiple tickets about the CSV export timing out. seems to be happening for accounts with more than 5000 rows. tagging engineering");
  await post(channel, "jake", "I know about this. we added a 30s timeout last month that's too aggressive. Marcus can you bump it to 120s as a quick fix?", ts);
  await post(channel, "marcus", "will do, shipping it now", ts);
  await delay(2000);
  await post(channel, "marcus", "deployed. should be fixed", ts);
  await post(channel, "maria", "confirming — customers are saying it works now. thank you!", ts);
  await react(channel, ts, "white_check_mark");

  ts = await post(channel, "maria", "we have a customer (Bellhaven Corp) threatening to churn. they're upset about the downtime last week. Alex can you reach out to their account manager?");
  await post(channel, "alex", "on it. I'll call them today", ts);
  await post(channel, "alex", "update: spoke with them. they're staying. offered 1 month free. they were reasonable once I actually called them", ts);
  await react(channel, ts, "raised_hands");

  ts = await post(channel, "maria", "question: are we supposed to be able to add members to a workspace while on the Starter plan? getting contradictory answers from the docs");
  await post(channel, "tom", "no, that's a Pro feature. the docs might be outdated", ts);
  await post(channel, "elena", "I'll update the docs today", ts);
  await post(channel, "tom", "thank you", ts);

  ts = await post(channel, "maria", "we have 14 open tickets that are marked 'waiting on engineering'. oldest one is 23 days old. can we do a triage session this week?");
  await post(channel, "jake", "yes. let's do Wednesday 3pm. I'll look through them before then", ts);
  await post(channel, "maria", "perfect, sending the invite", ts);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🌱 Nosy workspace seeder starting...\n");

  if (!process.env.SLACK_BOT_TOKEN) {
    console.error("Error: SLACK_BOT_TOKEN not set");
    process.exit(1);
  }

  console.log("Creating channels...");
  const channelIds: Record<string, string> = {};
  for (const name of CHANNELS) {
    channelIds[name] = await createChannel(name);
  }

  console.log("\nSeeding conversations...");

  if (channelIds.general)     await seedGeneral(channelIds.general);
  if (channelIds.engineering) await seedEngineering(channelIds.engineering);
  if (channelIds.backend)     await seedBackend(channelIds.backend);
  if (channelIds.frontend)    await seedFrontend(channelIds.frontend);
  if (channelIds.incidents)   await seedIncidents(channelIds.incidents);
  if (channelIds.design)      await seedDesign(channelIds.design);
  if (channelIds.product)     await seedProduct(channelIds.product);
  if (channelIds.support)     await seedSupport(channelIds.support);

  console.log("\n✅ Done! Your workspace now has:");
  console.log(`  - ${CHANNELS.length} channels`);
  console.log("  - ~120 messages across realistic scenarios");
  console.log("  - Threads, reactions, and drama");
  console.log("  - Unresolved commitments (great for Receipts demo)");
  console.log("  - Decisions made without key people (Blindspot demo)");
  console.log("  - Dead threads (Obituary demo)");
  console.log("\nNext: run /nosy in a thread and watch the magic.");
}

main().catch(console.error);
