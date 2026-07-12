import { buildTrailerPrompt } from "./script";
import { generateVideo } from "./omni";

export interface Teaser {
  mp4: Buffer;
  title: string;
  caption: string;
}

/** Builds the Claude prompt, renders the Omni video, returns the deliverable. */
export async function generateTeaser(): Promise<Teaser> {
  const script = await buildTrailerPrompt();
  const mp4 = await generateVideo(script.omniPrompt);
  return { mp4, title: script.title, caption: script.caption };
}
