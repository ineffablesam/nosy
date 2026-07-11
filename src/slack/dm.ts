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
