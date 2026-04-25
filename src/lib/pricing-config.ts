/**
 * Tarifas orientativas USD (ajustables en un solo sitio).
 * `recordApiUsage` y rutas que fijan `costUsd` manualmente deben basarse aquí cuando aplique.
 */

/** USD / 1M tokens — OpenAI chat (aprox.). */
export function openaiCostPerMillion(model: string | undefined): { in: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("gpt-4o-mini")) return { in: 0.15, out: 0.6 };
  if (m.includes("gpt-4.1-nano") || m.includes("4.1-nano")) return { in: 0.1, out: 0.4 };
  if (m.includes("gpt-4o")) return { in: 2.5, out: 10 };
  if (m.includes("gpt-3.5")) return { in: 0.5, out: 1.5 };
  return { in: 0.15, out: 0.6 };
}

/** USD / 1M tokens — Gemini texto / multimodal (aprox.). */
export function geminiCostPerMillion(model: string | undefined): { in: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("pro") || m.includes("3-pro") || m.includes("veo")) {
    return { in: 1.25, out: 5 };
  }
  if (m.includes("2.5-flash") || m.includes("flash")) {
    return { in: 0.075, out: 0.3 };
  }
  return { in: 0.1, out: 0.4 };
}

export function estimateOpenAIUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const { in: pi, out: po } = openaiCostPerMillion(model);
  return (inputTokens * pi + outputTokens * po) / 1_000_000;
}

/** USD / 1M tokens — embeddings OpenAI (orientativo). */
export function estimateOpenAIEmbeddingUsd(model: string | undefined, totalTokens: number): number {
  const m = (model || "").toLowerCase();
  const perM = m.includes("embedding-3-large") ? 0.13 : m.includes("embedding-3-small") ? 0.02 : 0.02;
  return (totalTokens * perM) / 1_000_000;
}

export function estimateGeminiUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const { in: pi, out: po } = geminiCostPerMillion(model);
  return (inputTokens * pi + outputTokens * po) / 1_000_000;
}

/** Coste fijo por generación de imagen cuando no hay usageMetadata de tokens. */
export function estimateGeminiImageGenerationUsd(modelKey: string): number {
  switch (modelKey) {
    case "pro3":
      return 0.12;
    case "flash25":
      return 0.02;
    case "flash31":
    default:
      return 0.05;
  }
}

/** Veo: coste orientativo por segundo de salida (sin breakdown de tokens en la API). */
export const GEMINI_VEO_USD_PER_SECOND = 0.05;

/** Seedance (Ark): orientativo por segundo de salida (la API no devuelve coste detallado). */
export const SEEDANCE_USD_PER_SECOND = 0.04;

/** Multiplicador por resolución Veo (720p < 1080p < 4K) para la estimación en UI. */
export function veoResolutionMultiplier(resolution: string | undefined): number {
  const r = (resolution || "1080p").toLowerCase();
  if (r.includes("4k")) return 1.85;
  if (r.includes("1080")) return 1.2;
  return 1;
}

/** Ligera variación por ratio Seedance en la estimación de UI. */
export function seedanceFormatMultiplier(videoFormat: string | undefined): number {
  const f = (videoFormat || "16:9").toLowerCase();
  if (f.includes("9:16")) return 1.08;
  if (f.includes("1:1")) return 1.05;
  return 1;
}

export function estimateGeminiVeoVideoUsd(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  return Math.round(d * GEMINI_VEO_USD_PER_SECOND * 1_000_000) / 1_000_000;
}

export function estimateSeedanceVideoUsd(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  return Math.round(d * SEEDANCE_USD_PER_SECOND * 1_000_000) / 1_000_000;
}

/** Estimación previa (UI) según modelo, resolución (Veo), ratio y duración. */
export function estimateVideoGeneratorPreviewUsd(args: {
  model: "veo31" | "seedance2";
  resolution: string | undefined;
  durationSec: number;
  videoFormat: string | undefined;
}): { usdPerSecond: number; totalUsd: number } {
  const d = Math.max(0, args.durationSec);
  if (args.model === "seedance2") {
    const rate =
      SEEDANCE_USD_PER_SECOND * seedanceFormatMultiplier(args.videoFormat);
    return {
      usdPerSecond: Math.round(rate * 1_000_000) / 1_000_000,
      totalUsd: Math.round(d * rate * 1_000_000) / 1_000_000,
    };
  }
  const rate = GEMINI_VEO_USD_PER_SECOND * veoResolutionMultiplier(args.resolution);
  return {
    usdPerSecond: Math.round(rate * 1_000_000) / 1_000_000,
    totalUsd: Math.round(d * rate * 1_000_000) / 1_000_000,
  };
}
