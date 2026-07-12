import { WebClient } from "@slack/web-api";

/**
 * Slack Real-Time Search (RTS) — the `assistant.search.context` method.
 *
 * RTS is one of the three hackathon-required technologies and is the genuine
 * fit for Nosy: instead of only knowing what it cached in Supabase, Nosy can
 * search the live workspace (permission-aware) to answer questions about
 * things it never explicitly stored — "has Marcus pushed to main before?",
 * "what did Sarah say about the deploy last week?", etc.
 *
 * NOTE: search respects the *user's* permissions, so this requires a USER
 * token (xoxp-) with the `search:read` scope — not the bot token. For the
 * demo we search as the installer (whose token is in SLACK_USER_TOKEN). In a
 * multi-user deployment you'd do per-user OAuth and store each user's token.
 *
 * If SLACK_USER_TOKEN is absent, searchWorkspace returns [] and Nosy falls
 * back to its cached memory — nothing crashes.
 */

const USER_TOKEN = process.env.SLACK_USER_TOKEN;
export const RTS_ENABLED = Boolean(USER_TOKEN) && process.env.RTS_ENABLED !== "false";

export interface RtsHit {
  text: string;
  userId: string;
  permalink: string;
  channelName?: string;
  ts: string;
}

const client = USER_TOKEN ? new WebClient(USER_TOKEN) : null;

export async function searchWorkspace(
  query: string,
  limit = 6
): Promise<RtsHit[]> {
  if (!client) return [];
  try {
    // apiCall avoids depending on SDK type defs for this newer method.
    const res = (await client.apiCall("assistant.search.context", {
      query,
      content_types: ["messages"],
      include_context_messages: false,
      limit,
    })) as {
      ok: boolean;
      messages?: Array<{
        text?: string;
        user?: string;
        author?: string;
        permalink?: string;
        ts?: string;
        channel?: { name?: string };
      }>;
    };

    if (!res.ok || !res.messages) return [];

    return res.messages
      .map((m) => ({
        text: m.text ?? "",
        userId: m.user ?? m.author ?? "unknown",
        permalink: m.permalink ?? "",
        channelName: m.channel?.name,
        ts: m.ts ?? "",
      }))
      .filter((h) => h.text.length > 0)
      .slice(0, limit);
  } catch (err) {
    console.error("[rts] assistant.search.context failed:", err);
    return [];
  }
}
