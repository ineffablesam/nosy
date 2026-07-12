import { chromium, type Browser, type Locator } from "playwright";

// thefaiapp.com — free AI meme generator, no sign-in required.
// Default tab is "Meme" with "English" context, which is what we want.
const FAI_URL = "https://thefaiapp.com/";

const PAGE_TIMEOUT_MS = 45_000;
// Generation can take a while (server-side image synthesis) — be patient.
const GENERATION_TIMEOUT_MS = 150_000;

// Realistic desktop Chrome UA to reduce the chance of bot-detection walls.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  if (launching) return launching;
  launching = chromium
    .launch({ headless: true })
    .then((b) => {
      browser = b;
      launching = null;
      return b;
    })
    .catch((err) => {
      launching = null;
      throw err;
    });
  return launching;
}

export interface GeneratedMeme {
  image: Buffer;
  filename: string;
  sourceUrl: string;
}

/**
 * Drives https://thefaiapp.com/ headlessly: types the prompt, clicks Generate,
 * waits for the result grid, picks a random meme, and downloads its bytes.
 */
export async function generateMeme(prompt: string): Promise<GeneratedMeme> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("meme prompt is empty");

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);

  try {
    await page.goto(FAI_URL, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });

    const input = page.locator('input[placeholder="Enter your meme prompt..."]').first();
    await input.waitFor({ state: "visible", timeout: 15_000 });
    await input.fill(trimmed);

    // The Generate button is disabled until the input has text; Playwright's
    // click auto-waits for it to become enabled.
    const generateBtn = page.locator('button:has-text("Generate Meme")').first();
    await generateBtn.waitFor({ state: "visible" });
    await generateBtn.click({ timeout: 10_000 });

    // Result images stream in with alt="Generated meme N".
    const resultImages = page.locator('img[alt^="Generated meme"]');
    await resultImages
      .first()
      .waitFor({ state: "visible", timeout: GENERATION_TIMEOUT_MS });

    // Let the grid fill in so "any random meme" has more than one option.
    await waitForCount(page, resultImages, 3, 8000).catch(() => {});
    const count = await resultImages.count();
    if (count === 0) throw new Error("no memes were generated");

    const pick = Math.floor(Math.random() * count);
    const src = await resultImages.nth(pick).getAttribute("src");
    if (!src) throw new Error("selected meme has no src");

    const image = await downloadImage(src);
    return {
      image,
      filename: `nosy-meme-${Date.now()}.jpg`,
      sourceUrl: src,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function waitForCount(
  page: { waitForTimeout: (ms: number) => Promise<void> },
  locator: Locator,
  min: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await locator.count()) >= min) return;
    await page.waitForTimeout(500);
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`meme download failed: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function closeMemeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
