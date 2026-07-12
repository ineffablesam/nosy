import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

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
// DM replies use Haiku — fast and cheap, ideal for casual texting.
// Thread analysis (analyze.ts) keeps the Sonnet DEFAULT_MODEL above.
export const DM_MODEL = process.env.DM_MODEL ?? "claude-haiku-4-5-20251001";
export const GPT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4";

// Gemini (AI Studio) — used for Omni Flash video generation.
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
export const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL ?? "gemini-omni-flash-preview";
