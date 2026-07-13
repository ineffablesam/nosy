import { supabase } from "./client";

export async function subscribe(threadKey: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .upsert({ thread_key: threadKey, user_id: userId }, { onConflict: "thread_key,user_id" });
  if (error) throw error;
}

export async function getSubscribers(threadKey: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("thread_key", threadKey);
  if (error) throw error;
  return data?.map((r) => r.user_id) ?? [];
}

// Returns subscribers for a specific thread + anyone watching the whole channel
export async function getThreadAndChannelSubscribers(
  channelId: string,
  threadKey: string
): Promise<string[]> {
  const channelKey = `channel:${channelId}`;
  const [threadSubs, channelSubs] = await Promise.all([
    getSubscribers(threadKey),
    getSubscribers(channelKey),
  ]);
  return [...new Set([...threadSubs, ...channelSubs])];
}
