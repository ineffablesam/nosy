import { buildTrailerPrompt } from "../src/lib/trailer/script";

(async () => {
  const script = await buildTrailerPrompt();
  console.log(`\nTITLE:   ${script.title}`);
  console.log(`STYLE:   ${script.style}`);
  console.log(`CAPTION: ${script.caption}\n`);
  console.log("── OMNI PROMPT ──────────────────────────────────────────────");
  console.log(script.omniPrompt);
  console.log("────────────────────────────────────────────────────────────\n");
  console.log(`prompt length: ${script.omniPrompt.length} chars`);
})().catch((e) => {
  console.error("\n❌ Prompt build failed:\n", e);
  process.exit(1);
});
