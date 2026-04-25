import type { LearningCandidate } from "./learning-candidate-schema";
import type { BrainNodeType } from "./brain-telemetry";

export const EXPORTED_ARTIFACT_KINDS = [
  "pdf",
  "image",
  "article",
  "presentation",
  "logo",
  "video",
  "other",
] as const;

export type ExportedArtifactKind = (typeof EXPORTED_ARTIFACT_KINDS)[number];

export type ArtifactPayload = {
  kind: ExportedArtifactKind;
  title?: string;
  mimeType?: string;
  byteSize?: number;
  artifactId?: string;
  fingerprint?: string;
  excerptOrSummary?: string;
  exportFormat?: string;
  sourceNodeId?: string;
  telemetryNodeType?: BrainNodeType;
  metadata?: Record<string, unknown>;
};

function isExportedArtifactKind(v: unknown): v is ExportedArtifactKind {
  return typeof v === "string" && (EXPORTED_ARTIFACT_KINDS as readonly string[]).includes(v);
}

/**
 * Analiza un artefacto exportado (PDF, imagen, artículo, etc.) y propone candidatos de aprendizaje.
 * Implementación base determinista; sustituible por LLM sin cambiar la firma pública.
 */
export function analyzeExportedArtifact(projectId: string, artifactPayload: ArtifactPayload): LearningCandidate[] {
  void projectId;
  if (!artifactPayload || typeof artifactPayload !== "object") return [];
  const kind = isExportedArtifactKind(artifactPayload.kind) ? artifactPayload.kind : "other";
  const nodeId = artifactPayload.sourceNodeId?.trim() || "export:artifact";
  const nodeTypeLabel = artifactPayload.telemetryNodeType?.toLowerCase() ?? "export";
  const title = artifactPayload.title?.trim() || "Artefacto exportado";
  const fmt = artifactPayload.exportFormat?.trim() || kind;
  const summary =
    artifactPayload.excerptOrSummary?.trim().slice(0, 280) ||
    `Exportación ${fmt}${artifactPayload.byteSize ? ` (~${artifactPayload.byteSize} B)` : ""}.`;

  const baseEvidence = {
    sourceNodeIds: [nodeId],
    sourceNodeTypes: [nodeTypeLabel],
    primarySourceNodeId: nodeId,
    evidenceSource: "artifact_analysis" as const,
    relatedArtifactKinds: [kind, fmt].filter((x, i, a) => a.indexOf(x) === i),
    ...(artifactPayload.artifactId?.trim()
      ? { sourceArtifactIds: [artifactPayload.artifactId.trim().slice(0, 256)] }
      : {}),
    examples: [summary],
    eventCounts: { export_events: 1 },
  };

  const candidates: LearningCandidate[] = [
    {
      type: "PROJECT_MEMORY",
      scope: "PROJECT",
      topic: "project_memory",
      value: `Tras exportar «${title}», conviene recordar para esta pieza: ${summary}`,
      confidence: 0.35,
      reasoning: "Señal final del entregable; acotar a proyecto hasta confirmación.",
      evidence: baseEvidence,
    },
  ];

  return candidates;
}
