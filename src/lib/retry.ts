/**
 * Retries an async function with exponential backoff on rate-limit errors.
 * Fails fast on all other errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 4, baseDelayMs = 3000 } = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      const status = (err as { status?: number; error?: { type?: string } }).status;
      const errType = (err as { error?: { type?: string } }).error?.type;
      const isRateLimit =
        status === 429 ||
        errType === "rate_limit_error" ||
        String(err).toLowerCase().includes("rate");

      if (isRateLimit && attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 3s, 6s, 12s, 24s
        console.warn(`[retry] rate limited — waiting ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-rate-limit errors fail immediately
      throw err;
    }
  }

  throw lastError;
}
