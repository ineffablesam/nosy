import { supabase } from "./client";

interface ThreadState {
  thread_key: string;
  last_alerted_at: string | null;
  last_message_at: string | null;
  message_count: number;
  obituary_sent: boolean;
  updated_at: string;
}

export async function getThreadState(threadKey: string): Promise<ThreadState | null> {
  const { data } = await supabase
    .from("thread_state")
    .select("*")
    .eq("thread_key", threadKey)
    .maybeSingle();
  return data as ThreadState | null;
}

export async function setLastAlertedAt(threadKey: string): Promise<void> {
  await upsertState(threadKey, { last_alerted_at: new Date().toISOString() });
}

export async function recordMessage(threadKey: string): Promise<void> {
  const existing = await getThreadState(threadKey);
  await upsertState(threadKey, {
    last_message_at: new Date().toISOString(),
    message_count: (existing?.message_count ?? 0) + 1,
    obituary_sent: false,
  });
}

export async function markObituary(threadKey: string): Promise<void> {
  await upsertState(threadKey, { obituary_sent: true });
}

async function upsertState(threadKey: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from("thread_state")
    .upsert(
      { thread_key: threadKey, updated_at: new Date().toISOString(), ...fields },
      { onConflict: "thread_key" }
    );
  if (error) console.error("[state] upsert failed:", error);
}
