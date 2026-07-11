import { app } from "./app";
import { subscribe, getSubscribers } from "../db/subscriptions";

app.command("/nosy", async ({ command, ack, respond }) => {
  await ack();

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
