import { supabase } from "./client";

export interface Observation {
  thread_key: string;
  channel_id: string;
  people: string[];
  observation: string;
}

export async function storeObservation(obs: Observation): Promise<void> {
  const { error } = await supabase.from("observations").insert(obs);
  if (error) console.error("[observations] store failed:", error);
}

export async function getRecentObservations(limit = 20): Promise<string[]> {
  const { data, error } = await supabase
    .from("observations")
    .select("observation, created_at, people")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.reverse().map((r) => {
    const ago = formatAgo(new Date(r.created_at as string));
    const who = (r.people as string[])?.length
      ? ` (${(r.people as string[])?.join(", ")})`
      : "";
    return `[${ago}]${who}: ${r.observation as string}`;
  });
}

function formatAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
