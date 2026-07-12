import { app } from "./app";
import { subscribe, getSubscribers } from "../db/subscriptions";
import { supabase } from "../db/client";

app.command("/nosy", async ({ command, ack, respond }) => {
  await ack();

  // ── /nosy nuke confirm ─────────────────────────────────────────────────────
  if (command.text.trim().toLowerCase() === "nuke confirm") {
    await respond({
      response_type: "ephemeral",
      text: "☢️ nuking everything… give me a sec",
    });

    const results: string[] = [];

    // 1. Wipe all DB tables (each uses its own non-null key column as filter)
    const tableFilters: [string, string][] = [
      ["dm_messages",  "user_id"],
      ["observations", "thread_key"],
      ["receipts",     "thread_key"],
      ["thread_state", "thread_key"],
      ["subscriptions","thread_key"],
    ];
    await Promise.all(
      tableFilters.map(async ([t, col]) => {
        try {
          const { error } = await supabase.from(t).delete().not(col, "is", null);
          if (error) results.push(`db:${t} failed`);
        } catch {
          results.push(`db:${t} failed`);
        }
      })
    );
    results.push("db wiped");

    // 2. Close all DM channels (requires im:read + im:write)
    try {
      let cursor: string | undefined;
      let dmsClosed = 0;
      do {
        const res = await app.client.conversations.list({
          types: "im",
          limit: 200,
          cursor,
        });
        for (const ch of res.channels ?? []) {
          if (ch.id) {
            await app.client.conversations.close({ channel: ch.id }).catch(() => {});
            dmsClosed++;
          }
        }
        cursor = res.response_metadata?.next_cursor ?? undefined;
      } while (cursor);
      results.push(`${dmsClosed} DMs closed`);
    } catch (err) {
      results.push("DMs close failed");
      console.error("[nuke] DMs close failed:", err);
    }

    // 3. Delete all messages from every public channel.
    //    We intentionally do NOT archive — archiving kicks the bot out and
    //    bot tokens cannot unarchive, which breaks the seeder on the next run.
    //    Deleting messages leaves channels active and empty (a clean slate).
    try {
      let cursor: string | undefined;
      let deletedMsgs = 0;
      do {
        const res = await app.client.conversations.list({
          types: "public_channel",
          exclude_archived: true,
          limit: 200,
          cursor,
        });
        for (const ch of res.channels ?? []) {
          if (!ch.id) continue;
          if (!ch.is_member) {
            await app.client.conversations.join({ channel: ch.id }).catch(() => {});
          }
          let msgCursor: string | undefined;
          do {
            const history = await app.client.conversations.history({
              channel: ch.id,
              limit: 200,
              cursor: msgCursor,
            });
            for (const msg of history.messages ?? []) {
              if (!msg.ts) continue;
              // Delete thread replies FIRST — otherwise deleting the parent
              // leaves a "This message was deleted" tombstone in the channel.
              if (msg.reply_count && msg.reply_count > 0) {
                let replyCursor: string | undefined;
                do {
                  const thread = await app.client.conversations.replies({
                    channel: ch.id,
                    ts: msg.ts,
                    limit: 200,
                    cursor: replyCursor,
                  });
                  // replies() returns parent as index 0 — skip it, delete the rest
                  for (const reply of (thread.messages ?? []).slice(1)) {
                    if (reply.ts) {
                      await app.client.chat.delete({ channel: ch.id, ts: reply.ts }).catch(() => {});
                      deletedMsgs++;
                      await new Promise((r) => setTimeout(r, 100));
                    }
                  }
                  replyCursor = thread.response_metadata?.next_cursor ?? undefined;
                } while (replyCursor);
              }
              // Now delete the parent — no replies left, so no tombstone.
              await app.client.chat.delete({ channel: ch.id, ts: msg.ts }).catch(() => {});
              deletedMsgs++;
              await new Promise((r) => setTimeout(r, 100));
            }
            msgCursor = history.response_metadata?.next_cursor ?? undefined;
          } while (msgCursor);
        }
        cursor = res.response_metadata?.next_cursor ?? undefined;
      } while (cursor);
      results.push(`${deletedMsgs} messages deleted from channels`);
    } catch (err) {
      results.push("channel clear failed");
      console.error("[nuke] channel clear failed:", err);
    }

    console.log("[nuke] done:", results.join(" | "));
    return;
  }

  // ── /nosy nuke (without confirm) ──────────────────────────────────────────
  if (command.text.trim().toLowerCase() === "nuke") {
    await respond({
      response_type: "ephemeral",
      text: "⚠️ this will wipe *everything* — all DB data, all DMs, all public channels.\ntype `/nosy nuke confirm` to actually do it.",
    });
    return;
  }

  // ── normal subscribe commands ──────────────────────────────────────────────
  if (command.thread_ts) {
    // Thread subscription: watch this specific thread
    const threadKey = `${command.channel_id}:${command.thread_ts}`;
    await subscribe(threadKey, command.user_id);

    const count = (await getSubscribers(threadKey)).length;
    await respond({
      response_type: "ephemeral",
      text:
        `on it. i'll hit you up if anything interesting happens in this thread. ` +
        `you can also DM me anytime if you want the full gossip. ` +
        `(${count} ${count === 1 ? "person" : "people"} watching 👀)`,
    });
  } else {
    // Channel subscription: watch every thread in this channel
    const channelKey = `channel:${command.channel_id}`;
    await subscribe(channelKey, command.user_id);

    const count = (await getSubscribers(channelKey)).length;
    await respond({
      response_type: "ephemeral",
      text:
        `got it. i'm watching every thread in this channel now. ` +
        `i'll DM you when anything interesting pops off in here. ` +
        `(${count} ${count === 1 ? "person" : "people"} watching this channel 👀)`,
    });
  }
});
