import { supabase } from "./client";

export interface Receipt {
  thread_key: string;
  channel_id: string;
  made_by: string;
  commitment: string;
  due_hint: string;
}

export interface StaleReceipt {
  id: string;
  thread_key: string;
  channel_id: string;
  made_by: string;
  commitment: string;
  due_hint: string;
  created_at: string;
}

export async function storeReceipt(r: Receipt): Promise<void> {
  const { error } = await supabase.from("receipts").insert(r);
  if (error) console.error("[receipts] store failed:", error);
}

export async function resolveReceiptsInThread(threadKey: string): Promise<void> {
  await supabase
    .from("receipts")
    .update({ resolved: true })
    .eq("thread_key", threadKey)
    .eq("resolved", false);
}

export async function getStaleReceipts(staleHours: number): Promise<StaleReceipt[]> {
  const cutoff = new Date(Date.now() - staleHours * 3600000).toISOString();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("receipts")
    .select("id, thread_key, channel_id, made_by, commitment, due_hint, created_at")
    .eq("resolved", false)
    .eq("alerted", false)
    .lt("created_at", cutoff)
    // Skip snoozed receipts: either no snooze, or snooze already expired.
    .or(`snooze_until.is.null,snooze_until.lt.${nowIso}`);

  if (error) {
    console.error("[receipts] getStale failed:", error);
    return [];
  }
  return (data ?? []) as StaleReceipt[];
}

export async function markReceiptAlerted(id: string): Promise<void> {
  await supabase.from("receipts").update({ alerted: true }).eq("id", id);
}

/** Push a receipt out by `hours` and re-arm it so the cron re-fires after the snooze. */
export async function snoozeReceipt(id: string, hours: number): Promise<void> {
  const snoozeUntil = new Date(Date.now() + hours * 3600000).toISOString();
  const { error } = await supabase
    .from("receipts")
    .update({ snooze_until: snoozeUntil, alerted: false })
    .eq("id", id);
  if (error) console.error("[receipts] snooze failed:", error);
}

/** Manually close a receipt from the "Mark done" button. */
export async function markReceiptDone(id: string): Promise<void> {
  const { error } = await supabase
    .from("receipts")
    .update({ resolved: true })
    .eq("id", id);
  if (error) console.error("[receipts] markDone failed:", error);
}
