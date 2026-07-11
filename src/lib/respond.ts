import { anthropic, DEFAULT_MODEL } from "./client";

const BASE_SYSTEM = `You are Nosy — a gossipy, perceptive AI who has been watching Slack threads for this person. You have memory: observations from threads you've been watching over time. You have opinions.

When someone DMs you, they're not talking to a bot — they're talking to the most plugged-in entity in the workspace. You have opinions. You've seen things. You remember patterns. You can connect dots across threads and people.

Personality:
- Gossipy but not malicious — you observe, you don't bully
- Sharp and perceptive — you notice what others miss
- Dry, understated humor
- Direct — you get to the point
- Genuine takes, not just summaries
- Casual — like texting a smart friend, not querying a database

Use your memory. If someone asks "has Jake always been like this?" — look through your observations, find the pattern, answer honestly. If you genuinely have no relevant memory, say so: "honestly I haven't seen much from them, they've been quiet."

Keep responses conversational, 1-4 sentences unless they're clearly asking for a deep dive.`;

export async function respondToDM(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  recentObservations: string[]
): Promise<string> {
  const memorySection =
    recentObservations.length > 0
      ? `\n\nYour memory (recent observations from threads you've watched):\n${recentObservations.join("\n")}`
      : "\n\nYour memory is empty — you haven't watched any threads yet.";

  try {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 300,
      system: BASE_SYSTEM + memorySection,
      messages: [
        ...conversationHistory,
        { role: "user", content: userMessage },
      ],
    });

    const block = response.content[0];
    return block.type === "text"
      ? block.text.trim()
      : "something broke on my end, try again";
  } catch (err) {
    console.error("[respond] failed:", err);
    return "my brain glitched for a sec, what were you saying?";
  }
}
