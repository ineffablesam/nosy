// Register Slack event handlers and commands
import "./slack/events";
import "./slack/conversation";
import "./slack/commands";
import "./slack/actions";
import "./slack/tictactoe";
import "./slack/hangman";
import "./slack/blackjack";
import "./slack/trivia";
import "./slack/gamemenu";

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
