import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { buildTrailerPrompt } from "../src/lib/trailer/script";
import { generateVideo } from "../src/lib/trailer/omni";

function sanitize(name: string): string {
  return name.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "teaser";
}

(async () => {
  console.log("1/3  Asking Claude to write a trailer prompt from recent gossip...\n");
  const script = await buildTrailerPrompt();
  console.log(`     Title:   ${script.title}`);
  console.log(`     Style:   ${script.style}`);
  console.log(`     Caption: ${script.caption}\n`);
  console.log("     ── Omni Flash prompt ─────────────────────────────────────");
  console.log(script.omniPrompt.replace(/^/gm, "     "));
  console.log("     ──────────────────────────────────────────────────────────\n");

  console.log("2/3  Rendering the teaser with Gemini Omni Flash (this can take a minute or two)...\n");
  const mp4 = await generateVideo(script.omniPrompt);

  console.log("3/3  Saving to your Downloads folder...");
  const downloads = join(homedir(), "Downloads");
  if (!existsSync(downloads)) mkdirSync(downloads, { recursive: true });
  const out = join(downloads, `NOSY_${sanitize(script.title)}_${Date.now()}.mp4`);
  writeFileSync(out, mp4);

  console.log(`\n✅ Done. ${(mp4.length / 1024).toFixed(0)} KB`);
  console.log(`   Saved: ${out}`);
})().catch((e) => {
  console.error("\n❌ Teaser generation failed:\n", e);
  process.exit(1);
});
