/**
 * Parse fetch Response bodies as JSON without throwing when the server returns HTML (404/500 pages).
 */
export async function readResponseJson<T>(res: Response, context: string): Promise<T | null> {
  const text = await res.text();
  const trimmed = text.trim();
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  ) {
    console.warn(
      `[${context}] Expected JSON but received HTML (status ${res.status}). Check the API route or dev server.`
    );
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.warn(`[${context}] JSON parse failed:`, (e as Error).message);
    return null;
  }
}
