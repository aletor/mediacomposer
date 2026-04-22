const RETRYABLE_ERROR_NAMES = new Set([
  "InternalServerError",
  "LimitExceededException",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "ThrottlingException",
]);

function isRetryable(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  if (!name) return false;
  return RETRYABLE_ERROR_NAMES.has(name);
}

export async function withDynamoRetry<T>(
  fn: () => Promise<T>,
  options?: { baseDelayMs?: number; maxAttempts?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 25;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt >= maxAttempts) {
        throw error;
      }
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
