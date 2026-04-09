/**
 * Cliente para POST /api/gemini/generate-stream (NDJSON con fases y progreso real de servidor).
 */

export type GeminiStreamResult = {
  output: string;
  key?: string;
  model?: string;
  time?: number;
};

export async function geminiGenerateWithServerProgress(
  body: Record<string, unknown>,
  onProgress: (pct: number, stage: string) => void
): Promise<GeminiStreamResult> {
  const res = await fetch("/api/gemini/generate-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(t) as { error?: string };
      if (j?.error) msg = String(j.error);
      else if (t) msg = t.slice(0, 300);
    } catch {
      if (t) msg = t.slice(0, 300);
    }
    throw new Error(msg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Sin cuerpo de respuesta");

  const dec = new TextDecoder();
  let buf = "";
  let result: GeminiStreamResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;

      const msg = JSON.parse(line) as {
        type?: string;
        progress?: number;
        stage?: string;
        output?: string;
        key?: string;
        model?: string;
        time?: number;
        error?: string;
      };

      if (msg.type === "phase" && typeof msg.progress === "number") {
        onProgress(msg.progress, msg.stage || "");
      }
      if (msg.type === "done" && typeof msg.output === "string") {
        result = {
          output: msg.output,
          key: typeof msg.key === "string" ? msg.key : undefined,
          model: typeof msg.model === "string" ? msg.model : undefined,
          time: typeof msg.time === "number" ? msg.time : undefined,
        };
      }
      if (msg.type === "error") {
        throw new Error(msg.error || "Error en generación");
      }
    }
  }

  if (!result?.output) {
    throw new Error("Respuesta incompleta del servidor");
  }
  return result;
}
