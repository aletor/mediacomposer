import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import type { StoredLearningCandidate } from "./learning-candidate-schema";

/** Clave en `evidence.eventCounts` para candidatos desde referencias visuales (Brain Studio). */
export const BRAIN_VISION_PROVENANCE_EVENT_KEY = "brain_vision_provenance" as const;

export type BrainVisionProvenanceKey =
  | "real_gemini"
  | "real_openai"
  | "mixed_real_remote"
  | "real_with_fallback"
  | "fallback_or_mock"
  | "failed_only"
  | "unknown";

export type VisualAnalysisDispositionCounts = {
  /** Filas con visión remota (Gemini u OpenAI) sin fallback ni mock. */
  realRemoteAnalyzed: number;
  /** Filas con estado analizado pero no cuentan como visión remota fiable (mock, fallback o metadatos incompletos). */
  fallbackOrMockAnalyzed: number;
  failed: number;
  inProgress: number;
  totalRows: number;
};

function isRealRemoteVision(a: BrainVisualImageAnalysis): boolean {
  return (
    a.analysisStatus === "analyzed" &&
    (a.visionProviderId === "gemini-vision" || a.visionProviderId === "openai-vision") &&
    a.fallbackUsed !== true
  );
}

/** Conteos a partir de la capa guardada `visualReferenceAnalysis.analyses`. */
export function countVisualImageAnalysisDisposition(
  analyses: BrainVisualImageAnalysis[] | undefined | null,
): VisualAnalysisDispositionCounts {
  const list = analyses ?? [];
  let realRemoteAnalyzed = 0;
  let fallbackOrMockAnalyzed = 0;
  let failed = 0;
  let inProgress = 0;
  for (const a of list) {
    const st = a.analysisStatus;
    if (st === "failed") {
      failed++;
      continue;
    }
    if (st === "analyzed") {
      if (isRealRemoteVision(a)) realRemoteAnalyzed++;
      else fallbackOrMockAnalyzed++;
      continue;
    }
    if (st === "pending" || st === "queued" || st === "analyzing") {
      inProgress++;
    }
  }
  return { realRemoteAnalyzed, fallbackOrMockAnalyzed, failed, inProgress, totalRows: list.length };
}

export function computeBrainVisionProvenanceKeyFromAnalyses(
  analyses: BrainVisualImageAnalysis[],
): BrainVisionProvenanceKey {
  if (!analyses.length) return "unknown";
  const analyzed = analyses.filter((a) => a.analysisStatus === "analyzed");
  if (!analyzed.length) {
    return analyses.some((a) => a.analysisStatus === "failed") ? "failed_only" : "unknown";
  }

  const realGem = analyzed.filter(
    (a) => a.visionProviderId === "gemini-vision" && a.fallbackUsed !== true,
  ).length;
  const realOpen = analyzed.filter(
    (a) => a.visionProviderId === "openai-vision" && a.fallbackUsed !== true,
  ).length;
  const fb = analyzed.length - realGem - realOpen;

  if (realGem + realOpen === 0 && fb > 0) return "fallback_or_mock";
  if (fb > 0 && realGem + realOpen > 0) return "real_with_fallback";
  if (realGem > 0 && realOpen > 0) return "mixed_real_remote";
  if (realOpen > 0) return "real_openai";
  if (realGem > 0) return "real_gemini";
  return "unknown";
}

export type PendingLearningProvenanceUi = {
  /** Texto corto para chip/badge */
  badge: string;
  /** Explicación para title / tooltip */
  tooltip: string;
};

const PROVENANCE_KEY_TOOLTIPS: Record<BrainVisionProvenanceKey, PendingLearningProvenanceUi> = {
  real_gemini: {
    badge: "Visión real · Gemini",
    tooltip: "Los patrones se basaron en análisis con Gemini Vision (sin fallback heurístico en el lote).",
  },
  real_openai: {
    badge: "Visión real · OpenAI",
    tooltip: "Los patrones se basaron en análisis con OpenAI Vision (sin fallback heurístico en el lote).",
  },
  mixed_real_remote: {
    badge: "Visión real · mixta",
    tooltip: "En el lote hubo imágenes analizadas con Gemini y con OpenAI (sin fallback en esas filas).",
  },
  real_with_fallback: {
    badge: "Visión real + fallback",
    tooltip:
      "Parte del lote se analizó con visión remota y parte con mock o fallback heurístico; revisa antes de promover.",
  },
  fallback_or_mock: {
    badge: "Fallback heurístico",
    tooltip:
      "Este aprendizaje se generó solo con análisis simulado o heurístico local; no sustituye visión remota.",
  },
  failed_only: {
    badge: "Error de visión",
    tooltip: "Las filas de análisis visual estaban en error; la cola no refleja visión remota correcta.",
  },
  unknown: {
    badge: "Histórico / sin procedencia",
    tooltip:
      "No hay metadatos fiables de proveedor de visión en este candidato; trátalo como inventario o histórico.",
  },
};

function readProvenanceKeyFromRow(row: StoredLearningCandidate): BrainVisionProvenanceKey | null {
  const raw = row.candidate.evidence.eventCounts?.[BRAIN_VISION_PROVENANCE_EVENT_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const k = raw.trim() as BrainVisionProvenanceKey;
  if (k in PROVENANCE_KEY_TOOLTIPS) return k;
  return null;
}

/**
 * Texto honesto para «Por revisar»: inventario vs visión real vs telemetría vs manual.
 */
export function getPendingLearningProvenanceUi(row: StoredLearningCandidate): PendingLearningProvenanceUi {
  const ev = row.candidate.evidence;
  const src = ev.evidenceSource;

  if (src === "manual") {
    return {
      badge: "Manual",
      tooltip: "Aprendizaje introducido o editado manualmente; no proviene de visión automática ni de telemetría.",
    };
  }
  if (src === "telemetry") {
    return {
      badge: "Telemetría de nodo",
      tooltip:
        "Derivado de acciones en el lienzo (exportaciones, edición, etc.); no implica análisis de imagen remoto salvo que se indique en la evidencia.",
    };
  }
  if (src === "export") {
    return {
      badge: "Exportación",
      tooltip: "Basado en señales de exportación u artefactos generados, no en análisis de imagen remoto.",
    };
  }
  if (src === "artifact_analysis") {
    return {
      badge: "Artefacto",
      tooltip: "Proviene del análisis de un artefacto o pieza concreta.",
    };
  }

  if (src === "visual_reference") {
    const key = readProvenanceKeyFromRow(row);
    if (key) return PROVENANCE_KEY_TOOLTIPS[key];
    return {
      badge: "Histórico / sin procedencia",
      tooltip:
        "Cola desde referencias visuales sin marca de proveedor de visión; puede ser anterior a visión remota o datos incompletos.",
    };
  }

  if (!src) {
    return {
      badge: "Histórico / sin procedencia",
      tooltip:
        "Falta el campo de origen (evidencia legacy). No asumir visión remota ni telemetría concreta hasta revisar la evidencia.",
    };
  }

  return {
    badge: "Origen genérico",
    tooltip: "Revisa la evidencia y el nodo enlazado antes de promover.",
  };
}
