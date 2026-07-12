import { App } from "@slack/bolt";

export const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  socketMode: process.env.SOCKET_MODE === "true",
  appToken: process.env.SLACK_APP_TOKEN,
  // Allow events from our own bot so seeded messages trigger Nosy.
  // No infinite-loop risk: Nosy only posts to DM channels (D...) which
  // have no thread_ts and are filtered out immediately in events.ts.
  ignoreSelf: false,
});
