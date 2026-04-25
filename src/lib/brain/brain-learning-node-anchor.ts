import type { LearningCandidate } from "./learning-candidate-schema";
import type { BrainNodeType } from "./brain-telemetry";

export type TelemetryAnchorEvent = {
  nodeId: string;
  batches: Array<{ nodeId?: string }>;
};

const VISUAL_TELEMETRY_LEARNING_TOPICS = new Set([
  "visual_pattern",
  "project_memory",
  "visual_direction",
  "image_preference",
  /** Legacy topics (persistidos antes de topics canónicos). */
  "visual_node_export_signals",
  "project_visual_node_signals",
  "visual_multi_node_common_direction",
  "manual_images_vs_brain_suggestions",
]);

/**
 * Nodo de lienzo al que debe anclarse un candidato al persistirlo tras un evento de telemetría.
 * No usar solo `event.nodeId` para lotes mezclados (p. ej. candidatos LLM genéricos con source en Designer).
 */
export function resolveStoredLearningCandidateNodeId(
  candidate: LearningCandidate,
  event: TelemetryAnchorEvent,
): string | undefined {
  const emitter = event.nodeId.trim();
  if (!emitter) return undefined;

  if (VISUAL_TELEMETRY_LEARNING_TOPICS.has(candidate.topic)) {
    return emitter;
  }

  const primary = candidate.evidence.primarySourceNodeId?.trim();
  if (primary) {
    if (primary.startsWith("brain:")) return undefined;
    return primary;
  }

  const sources = (candidate.evidence.sourceNodeIds ?? []).map((s) => s.trim()).filter(Boolean);
  const concrete = sources.filter((s) => !s.startsWith("brain:"));
  if (concrete.length === 1) return concrete[0]!;

  const batchIds = new Set(
    event.batches.map((b) => (typeof b.nodeId === "string" ? b.nodeId.trim() : "")).filter(Boolean),
  );
  batchIds.add(emitter);
  if (concrete.length > 1) {
    const hit = concrete.find((id) => batchIds.has(id));
    return hit;
  }

  return undefined;
}

/** Infiere tipo de nodo de canvas a partir de `evidence.sourceNodeTypes` (mock LLM u orígenes legacy). */
export function inferTelemetryNodeTypeFromEvidence(candidate: LearningCandidate): BrainNodeType | undefined {
  for (const raw of candidate.evidence.sourceNodeTypes ?? []) {
    const t = raw.toLowerCase();
    if (t.includes("photoroom")) return "PHOTOROOM";
    if (t.includes("designer")) return "DESIGNER";
    if (t.includes("article")) return "ARTICLE_WRITER";
    if (t.includes("image") && t.includes("gen")) return "IMAGE_GENERATOR";
    if (t.includes("video")) return "VIDEO_NODE";
    if (t.includes("presentation")) return "PRESENTATION_NODE";
  }
  return undefined;
}
