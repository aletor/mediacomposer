import type { BrainVisualImageAnalysis, ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import {
  filterLegacyFunnelMessages,
  filterLegacyLanguageTraits,
  isLegacyDemoFunnelText,
  isMockOrFallbackAnalyzed,
  isTrustedRemoteVisionAnalysis,
} from "./brain-brand-summary";
import { resolveLearningPendingAnchorNodeId } from "./brain-connected-signals-ui";
import { BRAIN_VISION_PROVENANCE_EVENT_KEY } from "./brain-learning-provenance";
import { inferTelemetryNodeTypeFromEvidence } from "./brain-learning-node-anchor";
import type { StoredLearningCandidate } from "./learning-candidate-schema";

export type BrainRestudyCleanupFlags = {
  clearPendingLearnings: boolean;
  clearMockVisualAnalyses: boolean;
  clearLegacyEnglishCopy: boolean;
  /** Si true, filtra rasgos EN demo y mensajes embudo legacy en `strategy`. */
  treatAsSpanishProject: boolean;
};

function pendingLooksGenericNoEvidence(row: StoredLearningCandidate): boolean {
  if (row.candidate.evidence.evidenceSource !== "visual_reference") return false;
  const ex = row.candidate.evidence.examples?.filter((x) => x.trim()) ?? [];
  if (ex.length > 0) return false;
  const v = row.candidate.value.trim();
  return v.length > 0 && v.length < 56;
}

function pendingDesignerInPhotoroom(row: StoredLearningCandidate): boolean {
  if (row.telemetryNodeType !== "PHOTOROOM") return false;
  const inferred = inferTelemetryNodeTypeFromEvidence(row.candidate);
  if (inferred === "DESIGNER") return true;
  const blob = `${row.candidate.topic} ${row.candidate.value} ${row.candidate.reasoning}`.toLowerCase();
  return blob.includes("designer") && !blob.includes("photoroom");
}

function pendingIncompatibleNodeTypes(row: StoredLearningCandidate): boolean {
  const inferred = inferTelemetryNodeTypeFromEvidence(row.candidate);
  if (!inferred || !row.telemetryNodeType) return false;
  return inferred !== row.telemetryNodeType;
}

function pendingMockAnalyzer(row: StoredLearningCandidate): boolean {
  const ec = row.candidate.evidence.eventCounts ?? {};
  const raw = ec[BRAIN_VISION_PROVENANCE_EVENT_KEY];
  if (typeof raw === "string" && (raw.includes("fallback") || raw.includes("mock"))) return true;
  const fb = ec.brain_vision_fallback_mock_count;
  if (typeof fb === "number" && fb > 0) return true;
  const blob = JSON.stringify(ec).toLowerCase();
  return blob.includes("mock-1") || blob.includes("fallback_or_mock");
}

/** Elimina filas mock/fallback/failed para permitir reintento; conserva overrides manuales y análisis remotos fiables. */
export function pruneVisualReferenceAnalysesForRestudy(
  analyses: BrainVisualImageAnalysis[] | undefined,
  clearMock: boolean,
): BrainVisualImageAnalysis[] {
  const list = analyses ?? [];
  if (!clearMock) return [...list];
  return list.filter((a) => {
    if (a.userVisualOverride) return true;
    if (isTrustedRemoteVisionAnalysis(a)) return true;
    if (a.analysisStatus === "failed") return false;
    if (isMockOrFallbackAnalyzed(a)) return false;
    if (String(a.analyzerVersion ?? "").toLowerCase().startsWith("mock")) return false;
    return true;
  });
}

/** Limpia copy demo en estrategia (solo metadatos; no toca ADN confirmado en otras estructuras). */
export function stripLegacyEnglishFromStrategy(strategy: ProjectAssetsMetadata["strategy"]): ProjectAssetsMetadata["strategy"] {
  return {
    ...strategy,
    funnelMessages: filterLegacyFunnelMessages(strategy.funnelMessages),
    languageTraits: filterLegacyLanguageTraits(strategy.languageTraits),
  };
}

export function shouldPrunePendingLearningRow(row: StoredLearningCandidate, flags: BrainRestudyCleanupFlags): boolean {
  if (!flags.clearPendingLearnings) return false;
  if (row.status !== "PENDING_REVIEW") return false;

  if (pendingMockAnalyzer(row)) return true;

  if (!resolveLearningPendingAnchorNodeId(row)) return true;

  if (pendingDesignerInPhotoroom(row)) return true;
  if (pendingIncompatibleNodeTypes(row)) return true;
  if (pendingLooksGenericNoEvidence(row)) return true;

  if (flags.treatAsSpanishProject) {
    if (isLegacyDemoFunnelText(row.candidate.value)) return true;
  }

  return false;
}
