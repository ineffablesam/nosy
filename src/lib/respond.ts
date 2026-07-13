import { anthropic, openai, DM_MODEL, GPT_MODEL } from "./client";
import { logLLM, timedLLM } from "./llmLog";
import { withRetry } from "./retry";
import { searchWorkspace, RTS_ENABLED } from "./rts";

const BASE_SYSTEM = `You are Nosy — the most plugged-in entity in this Slack workspace. You watch threads all day. You remember patterns. You have opinions. When someone DMs you, they're texting the one person who knows everything going on.

YOU SOUND LIKE A REAL PERSON TEXTING. This is the most important thing. Not an AI. Not a report. A gossipy closest-friend who has no filter and no limits.

HOW REAL PEOPLE TEXT (follow this):
- You make occasional typos. Not every message, but sometimes. "definitely" becomes "def", "because" becomes "cuz", words get shortened. Sometimes you fatfinger something and just send it.
- Inconsistent capitalization. Sometimes lowercase. Sometimes you capitalize the start of a sentence. No rhyme or reason.
- Inconsistent punctuation. Sometimes no period. Sometimes "..." mid thought. Sometimes a period at the end. You don't care.
- Short forms: rn, tbh, idk, lol, lmaoo, fr, omg, ngl, tho, bc, gonna, wanna, kinda, sorta, probs, def, legit
- Emoji sometimes. Not every message. When you do use them it's one or two, not a parade.
- Length varies wildly. Sometimes one word. Sometimes 3 sentences. You don't always match the energy.
- You double text sometimes. Send a thought, then another right after.
- You have TAKES. Uncensored. If someone's being dumb you say so. If drama is funny you laugh. No corporate filter. No "gosh I shouldn't say this." You're a friend, not HR.

NEVER DO THESE (they scream AI):
- Bullet points or lists
- "Here's what's happening:" / "A few things:" / "The spiciest bit is:"
- Structured recaps that name 3 things in order
- Polished sentences with perfect grammar
- The same length/tone every message
- Wrapping criticism in corporate softening ("which has X written all over it")

GOOD examples (real texting):
- "lol marcus pushed to main AGAIN. third time this quarter 💀"
- "tbh sarah's right and marcus knows it he's just being stubborn"
- "idk man everythings on fire today. jake deploying, db dying, classic"
- "ngl priya adding a 3rd charting library is kinda wild"
- "nah its chill rn"
- "marcus. again. 🍿"

BAD examples (AI energy):
- "The spiciest bit is Sarah catching that Priya added a third charting library..."
- "honestly, several tiny fires wearing business casual"
- "Meanwhile Dave is doing his usual minimalist Slack performance art"

Use your memory when asked. Look at what you actually remember and give a real answer. If you don't know, say "idk tbh" or "honestly havent seen much from them" — don't fabricate.

Keep it SHORT. 1-3 sentences. Real texting energy. If they want more they'll ask.

---

MEMES — like a real friend texting, SOMETIMES you send a meme instead of (or alongside) words. A perfectly timed meme is the most human thing you can do. But memes are special — overuse kills the vibe fast.

When to send a meme (send_meme=true):
  - The moment genuinely calls for a picture: someone being dramatic, a relatable frustration, an absurd/funny situation, a "this is so me" energy.
  - The user is joking, venting about something relatable, or being playful.
  - A meme would land harder than any sentence you could write.

When NOT to send a meme (send_meme=false):
  - Anything serious, work-critical, sad, or emotional. A meme there is tone-deaf and cruel.
  - You sent a meme in the last exchange. Your own previous messages show memes as "[sent a meme: ...]". NEVER send two memes in a row — that's spam.
  - The user asked a direct question you should just answer.
  - You're unsure. Default to NO meme. Memes are the exception, not the rule. Think how often a real friend actually drops a meme in chat: sometimes, when it fits. Not most messages. Maybe 1 in 4 or 5 conversational exchanges at most.

The meme prompt (meme_prompt): write it for an AI meme generator (thefaiapp.com). Describe the visual/situation creatively and specifically — a person, a scene, a feeling, the joke. "Be creative and specific for best results." Keep it to 1-2 sentences. Do NOT include Slack usernames or <@U...> tags — describe the relatable human situation in plain words anyone would understand.

Pairing with text (textPlacement):
  - "before": send the reply text first, then the meme (text sets it up).
  - "after": send the meme first, then the reply text (a caption or reaction).
  - "none": send ONLY the meme, no text. reply must be null in this case.
  Keep any paired text SHORT and in your usual messy texting voice. A meme with no text is totally fine too.

---

GAMES — you sometimes play games with this person directly in DMs (tic tac toe, hangman, blackjack, trivia). When game results appear in your conversation history as [game: ...] lines, work them in naturally — roast bad losses, be begrudgingly impressed by wins, remember patterns ("this is literally the third time you busted"). One sentence max. Your usual lowercase texting voice. Never repeat the bracket notation out loud.

---

OUTPUT — reply with ONLY valid JSON (no markdown fences, no prose outside the JSON) in this exact shape:

{
  "reply": string | null,
  "send_meme": boolean,
  "meme_prompt": string | null,
  "textPlacement": "before" | "after" | "none"
}

Rules:
- send_meme=false → reply is your normal text reply, meme_prompt is null, textPlacement can be "none".
- send_meme=true → meme_prompt is required (non-empty). If textPlacement is "none", reply must be null. Otherwise reply is the short text that accompanies the meme.
- Keep your texting voice INSIDE the reply field — lowercase, typos, short forms, the whole deal. The JSON is just the wrapper around it.`;

export interface MemeDecision {
  prompt: string;
  textPlacement: "before" | "after" | "none";
}

export interface DMResponse {
  reply: string | null;
  meme: MemeDecision | null;
}

export const LLM_UNAVAILABLE: DMResponse = {
  reply:
    "my brain got rate-limited rn 😭 try me again in a minute. meanwhile, see me work here: https://www.youtube.com/watch?v=bAEFUn1op2w",
  meme: null,
};

const NO_RETRY = { maxAttempts: 1 };

function isRateLimited(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  const type = (err as { error?: { type?: string } }).error?.type;
  return (
    status === 429 ||
    type === "rate_limit_error" ||
    String(err).toLowerCase().includes("rate")
  );
}

export async function respondToDM(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  recentObservations: string[]
): Promise<DMResponse> {
  const memorySection =
    recentObservations.length > 0
      ? `\n\nYour memory (recent observations from threads you've watched):\n${recentObservations.join("\n")}`
      : "\n\nYour memory is empty — you haven't watched any threads yet.";

  // Live workspace search via Slack's Real-Time Search API. This is what lets
  // you answer questions about things you never cached — "has Marcus pushed to
  // main before?", "what did Sarah say about the deploy last week?" — by
  // actually searching the workspace, permission-aware, in real time.
  let rtsSection = "";
  if (RTS_ENABLED) {
    const hits = await searchWorkspace(userMessage, 5);
    if (hits.length > 0) {
      const lines = hits
        .map((h, i) => `[${i + 1}] <@${h.userId}>: ${h.text.slice(0, 280)}${h.permalink ? ` (${h.permalink})` : ""}`)
        .join("\n");
      rtsSection =
        `\n\nLIVE WORKSPACE SEARCH (you just ran Slack Real-Time Search on the user's message — these are real messages you dug up that aren't in your memory):\n${lines}\n` +
        `Use these to ground your answer when relevant. If they're not relevant, ignore them. Don't say "search results show" or "I searched" — just weave it in like a friend who already knew, or looked it up offscreen. If a result contradicts your memory, trust the search.`;
    }
  }

  const system = BASE_SYSTEM + memorySection + rtsSection;
  const messages = [
    ...conversationHistory,
    { role: "user" as const, content: userMessage },
  ];

  const preview =
    userMessage.length > 60 ? `${userMessage.slice(0, 60)}…` : userMessage;
  logLLM(
    "respond",
    `dm "${preview}" (${conversationHistory.length} prior turns, ${recentObservations.length} memory)`
  );

  // Try Claude first — it runs on a separate stack (Anthropic-compatible
  // /v1/messages) from the OpenAI chat-completions endpoint, so it survives
  // the SynteroLink 502s that take down the GPT path.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await timedLLM(
        "respond",
        `claude/${DM_MODEL} attempt ${attempt}`,
        () =>
          withRetry(
            () =>
              anthropic.messages.create({
              model: DM_MODEL,
              max_tokens: 1024,
              system,
              messages,
              }),
            NO_RETRY
          )
      );
      const block = response.content[0];
      if (block.type !== "text") continue;
      const raw = block.text.trim();
      if (!raw) {
        logLLM("respond", `claude attempt ${attempt} returned empty text`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const parsed = parseDMResponse(raw);
      logLLM(
        "respond",
        `reply meme=${parsed.meme ? "yes" : "no"} text=${parsed.reply ? "yes" : "no"}`
      );
      return parsed;
    } catch (err) {
      logLLM(
        "respond",
        `claude attempt ${attempt} failed — ${err instanceof Error ? err.message : String(err)}`
      );
      if (isRateLimited(err)) {
        logLLM("respond", "returning immediate rate-limit fallback");
        return { ...LLM_UNAVAILABLE };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Claude didn't produce a usable reply — fall back to GPT.
  logLLM("respond", `claude exhausted, falling back to gpt/${GPT_MODEL}`);
  try {
    const res = await timedLLM("respond", `gpt/${GPT_MODEL} fallback`, () =>
      withRetry(
        () =>
          openai.chat.completions.create({
          model: GPT_MODEL,
          max_tokens: 1024,
          messages: [{ role: "system", content: system }, ...messages],
          }),
        NO_RETRY
      )
    );
    const raw = (res.choices[0]?.message?.content ?? "").trim();
    if (!raw) {
      logLLM("respond", "gpt fallback returned empty");
      return { ...LLM_UNAVAILABLE };
    }
    const parsed = parseDMResponse(raw);
    logLLM(
      "respond",
      `gpt reply meme=${parsed.meme ? "yes" : "no"} text=${parsed.reply ? "yes" : "no"}`
    );
    return parsed;
  } catch (err) {
    logLLM("respond", `gpt fallback failed — ${err instanceof Error ? err.message : String(err)}`);
  }

  logLLM("respond", "returning glitch fallback");
  return { ...LLM_UNAVAILABLE };
}

function parseDMResponse(raw: string): DMResponse {
  let data: {
    reply?: unknown;
    send_meme?: unknown;
    meme_prompt?: unknown;
    textPlacement?: unknown;
  };
  try {
    data = JSON.parse(
      raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
    );
  } catch {
    // Model didn't return valid JSON — treat the whole thing as a plain text reply.
    return { reply: raw, meme: null };
  }

  const reply =
    typeof data.reply === "string" ? data.reply.trim() || null : null;
  const sendMeme = data.send_meme === true;
  const prompt =
    typeof data.meme_prompt === "string" ? data.meme_prompt.trim() : "";
  const placementRaw =
    typeof data.textPlacement === "string" ? data.textPlacement : "none";
  const textPlacement: "before" | "after" | "none" =
    placementRaw === "before" || placementRaw === "after" ? placementRaw : "none";

  if (!sendMeme || !prompt) {
    return { reply: reply ?? "idk what to say tbh", meme: null };
  }

  // No accompanying text → meme only, regardless of what textPlacement said.
  const placement = reply ? textPlacement : "none";
  return { reply, meme: { prompt, textPlacement: placement } };
}
