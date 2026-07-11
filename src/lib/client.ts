import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from environment automatically.
// Set ANTHROPIC_BASE_URL=https://api.synterolink.com to use the custom endpoint.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

// Default model — override per-call if needed
export const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
