import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gemini, VIDEO_MODEL } from "../client";
import { logLLM, timedLLM } from "../llmLog";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 3 * 60 * 1000;

/**
 * Generates a video from a prompt via Gemini Omni Flash and returns the mp4 bytes.
 * Handles both inline base64 delivery and URI delivery (for files > 4MB).
 */
export async function generateVideo(omniPrompt: string): Promise<Buffer> {
  logLLM("omni", `rendering ${VIDEO_MODEL} (${omniPrompt.length} char prompt)`);
  const interaction = await timedLLM("omni", `gemini/${VIDEO_MODEL} create`, () =>
    gemini.interactions.create({
      model: VIDEO_MODEL,
      input: omniPrompt,
      response_format: { type: "video", aspect_ratio: "16:9", delivery: "uri" },
    } as unknown as Parameters<typeof gemini.interactions.create>[0])
  );

  const output = (
    interaction as unknown as {
      output_video?: { data?: string; uri?: string };
    }
  ).output_video;

  if (output?.data) {
    const buf = Buffer.from(output.data, "base64");
    logLLM("omni", `inline video ready (${(buf.length / 1024).toFixed(0)} KB)`);
    return buf;
  }
  if (!output?.uri) {
    throw new Error("Omni returned no video data or uri");
  }
  const videoUri = output.uri;

  const fileName = videoUri.split("/").pop()?.split(":")[0];
  if (!fileName) throw new Error("could not parse Omni file name from uri");

  logLLM("omni", `polling file ${fileName} for up to ${MAX_WAIT_MS / 1000}s`);
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
  await timedLLM("omni", "download mp4", () =>
    gemini.files.download({ file: videoUri, downloadPath })
  );
  try {
    const buf = await fs.readFile(downloadPath);
    logLLM("omni", `video ready (${(buf.length / 1024).toFixed(0)} KB)`);
    return buf;
  } finally {
    await fs.rm(downloadPath, { force: true });
  }
}
