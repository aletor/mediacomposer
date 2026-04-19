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

/**
 * JSON + comprobación de `res.ok`: lanza con mensaje útil (body `error` o status).
 * Usar en flujos donde un fallo HTTP no debe pasar desapercibido.
 */
export async function readJsonWithHttpError<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  ) {
    throw new Error(
      `${context}: el servidor devolvió HTML (${res.status}), no JSON. Revisa la ruta API o el límite del cuerpo.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${context}: respuesta no válida (${res.status}).`);
  }
  if (!res.ok) {
    const msg =
      typeof (parsed as { error?: string }).error === "string"
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}
