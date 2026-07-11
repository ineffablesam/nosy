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
      .filter(
        (m): m is typeof m & { user: string; text: string } =>
          Boolean(m.user && m.text)
      )
      .map((m) => ({ userId: m.user, text: m.text }));
  } catch (err) {
    console.error("[thread] Failed to fetch replies:", err);
    return [];
  }
}
