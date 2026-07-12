function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

export function logLLM(tag: string, message: string): void {
  console.log(`[${tag}] ${ts()} ${message}`);
}

export async function timedLLM<T>(
  tag: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  logLLM(tag, `→ ${label}`);
  try {
    const result = await fn();
    logLLM(tag, `✓ ${label} (${Date.now() - start}ms)`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logLLM(tag, `✗ ${label} (${Date.now() - start}ms) — ${msg}`);
    throw err;
  }
}
