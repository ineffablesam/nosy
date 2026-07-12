import { app } from "./app";
import type { KnownBlock } from "@slack/types";

export async function sendDM(
  userId: string,
  message: string,
  threadLink?: string
): Promise<void> {
  const text = threadLink
    ? `${message}\n<${threadLink}|→ see for yourself>`
    : message;

  try {
    await app.client.chat.postMessage({
      channel: userId,
      text,
      unfurl_links: false,
    });
  } catch (err) {
    console.error(`[dm] Failed to DM ${userId}:`, err);
  }
}

/**
 * Posts a Block Kit message to the user's DM. `fallbackText` is what Slack shows
 * in notifications / inaccessible clients, so it must carry the gist on its own.
 * Returns the message ts + channel id so callers can later chat.update the card.
 */
export async function sendBlockDM(
  userId: string,
  fallbackText: string,
  blocks: KnownBlock[]
): Promise<{ ok: boolean; ts?: string; channelId?: string }> {
  try {
    const res = await app.client.chat.postMessage({
      channel: userId,
      text: fallbackText,
      blocks,
      unfurl_links: false,
    });
    return { ok: true, ts: res.ts as string | undefined, channelId: res.channel as string | undefined };
  } catch (err) {
    console.error(`[dm] sendBlockDM failed for ${userId}:`, err);
    return { ok: false };
  }
}

/**
 * Uploads an image to Nosy's DM with the user and shares it in the conversation.
 * Returns true on success, false on failure (caller should fall back to text).
 */
export async function sendMemeDM(
  userId: string,
  image: Buffer,
  filename: string,
  title = "meme"
): Promise<boolean> {
  try {
    const dm = await app.client.conversations.open({ users: userId });
    const channelId = dm.channel?.id;
    if (!channelId) {
      console.error("[dm] sendMemeDM: could not open DM channel");
      return false;
    }
    await app.client.files.uploadV2({
      channel_id: channelId,
      file: image,
      filename,
      title,
      alt_text: "meme",
    });
    return true;
  } catch (err) {
    console.error(`[dm] sendMemeDM failed for ${userId}:`, err);
    return false;
  }
}
