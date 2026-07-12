/**
 * Games menu — a Block Kit message with buttons for all available games.
 * Triggered when the user types "games" in DMs.
 * Handles the button actions by calling each game's start function.
 */

import { app } from "./app";
import type { KnownBlock } from "@slack/types";
import { startGame }      from "./tictactoe";
import { startHangman }   from "./hangman";
import { startBlackjack } from "./blackjack";
import { startTrivia }    from "./trivia";

export async function sendGamesMenu(userId: string): Promise<void> {
  const blocks: KnownBlock[] = [
    { type: "header", text: { type: "plain_text", text: "GAME ROOM" } },
    { type: "section", text: { type: "mrkdwn", text: "pick your poison. i'm undefeated in all of them." } },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", action_id: "game_ttt",       text: { type: "plain_text", text: "Tic Tac Toe" },  value: "ttt" },
        { type: "button", action_id: "game_hangman",   text: { type: "plain_text", text: "Hangman" },      value: "hang" },
        { type: "button", action_id: "game_blackjack", style: "primary", text: { type: "plain_text", text: "Blackjack" }, value: "bj" },
        { type: "button", action_id: "game_trivia",    text: { type: "plain_text", text: "Trivia" },       value: "tri" },
      ],
    } as KnownBlock,
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "or just type the game name. _play · hangman · blackjack · trivia_" }],
    },
  ];

  try {
    await app.client.chat.postMessage({
      channel: userId,
      text: "pick a game.",
      blocks,
    });
  } catch (err) {
    console.error("[gamemenu] failed:", err);
  }
}

// Launch buttons — start the chosen game for the user who clicked.
// The game posts a NEW message (the menu message stays as-is).
const userId = (body: unknown) => (body as { user: { id: string } }).user.id;

app.action("game_ttt",       async ({ ack, body }) => { await ack(); await startGame(userId(body)); });
app.action("game_hangman",   async ({ ack, body }) => { await ack(); await startHangman(userId(body)); });
app.action("game_blackjack", async ({ ack, body }) => { await ack(); await startBlackjack(userId(body)); });
app.action("game_trivia",    async ({ ack, body }) => { await ack(); await startTrivia(userId(body)); });
