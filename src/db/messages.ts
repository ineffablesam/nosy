import { supabase } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function appendMessage(userId: string, msg: ChatMessage): Promise<void> {
  const { error } = await supabase.from("dm_messages").insert({
    user_id: userId,
    role: msg.role,
    content: msg.content,
  });
  if (error) console.error("[messages] append failed:", error);
}

export async function clearConversationHistory(userId: string): Promise<void> {
  const { error } = await supabase.from("dm_messages").delete().eq("user_id", userId);
  if (error) console.error("[messages] clear failed:", error);
}

export async function getConversationHistory(
  userId: string,
  limit = 10
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as ChatMessage[]).reverse();
}
