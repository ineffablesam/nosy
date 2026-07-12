import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Claude via SynteroLink Anthropic-compatible endpoint
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL, // https://api.synterolink.com
});

// GPT via SynteroLink OpenAI-compatible endpoint
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.synterolink.com/v1",
});

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
export const GPT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4";
