import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gemini, VIDEO_MODEL } from "../client";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 3 * 60 * 1000;

/**
 * Generates a video from a prompt via Gemini Omni Flash and returns the mp4 bytes.
 * Handles both inline base64 delivery and URI delivery (for files > 4MB).
 */
export async function generateVideo(omniPrompt: string): Promise<Buffer> {
  const interaction = await gemini.interactions.create({
    model: VIDEO_MODEL,
    input: omniPrompt,
    response_format: { type: "video", aspect_ratio: "16:9", delivery: "uri" },
  } as unknown as Parameters<typeof gemini.interactions.create>[0]);

  const output = (
    interaction as unknown as {
      output_video?: { data?: string; uri?: string };
    }
  ).output_video;

  if (output?.data) {
    return Buffer.from(output.data, "base64");
  }
  if (!output?.uri) {
    throw new Error("Omni returned no video data or uri");
  }

  const fileName = output.uri.split("/").pop()?.split(":")[0];
  if (!fileName) throw new Error("could not parse Omni file name from uri");

  let active = false;
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const info = await gemini.files.get({ name: `files/${fileName}` });
    const state = (info as unknown as { state?: string }).state;
    if (state === "ACTIVE") {
      active = true;
      break;
    }
    if (state === "FAILED") throw new Error("Omni video processing FAILED");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (!active) throw new Error("Omni video processing timed out");

  // The SDK's files.download writes the bytes to disk and resolves to void,
  // so download to a temp path and read the mp4 back into a Buffer.
  const downloadPath = join(tmpdir(), `omni-${fileName}.mp4`);
  await gemini.files.download({ file: output.uri, downloadPath });
  try {
    return await fs.readFile(downloadPath);
  } finally {
    await fs.rm(downloadPath, { force: true });
  }
}
