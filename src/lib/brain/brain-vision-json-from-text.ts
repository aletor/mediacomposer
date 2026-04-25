/** Extrae un objeto JSON del texto del modelo (markdown fence o substring). */
export function parseJsonObjectFromVisionModelText(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  const body = fence ? fence[1].trim() : t;
  try {
    return JSON.parse(body);
  } catch {
    const i = body.indexOf("{");
    const j = body.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(body.slice(i, j + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
