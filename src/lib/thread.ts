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
      .filter((m): m is typeof m & { text: string } => Boolean(m.text))
      .map((m) => ({
        // Real users have m.user; bot/seeded messages use username or bot_id as fallback
        userId: m.user ?? (m as unknown as Record<string, unknown>).username as string ?? m.bot_id ?? "unknown",
        text: m.text!,
      }));
  } catch (err) {
    console.error("[thread] Failed to fetch replies:", err);
    return [];
  }
}
