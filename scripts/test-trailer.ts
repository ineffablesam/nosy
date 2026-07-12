import { generateTeaser } from "../src/lib/trailer";
import { writeFileSync } from "node:fs";

(async () => {
  console.log("Building trailer prompt with Claude + rendering with Omni Flash...");
  const teaser = await generateTeaser();
  const out = `/tmp/${teaser.title.replace(/\s+/g, "_")}.mp4`;
  writeFileSync(out, teaser.mp4);
  console.log(`Title:   ${teaser.title}`);
  console.log(`Caption: ${teaser.caption}`);
  console.log(`Saved:   ${out} (${(teaser.mp4.length / 1024).toFixed(0)} KB)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
