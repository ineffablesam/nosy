import dotenv from "dotenv";
dotenv.config();

// Register Slack event handlers and commands
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
  console.log(
    `⚡ Nosy is live on :${PORT} — been watching, has opinions, keeps receipts`
  );
})();
