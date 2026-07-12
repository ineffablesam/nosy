import { app } from "./app";

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
