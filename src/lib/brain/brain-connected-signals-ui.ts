import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import { BRAIN_VISION_PROVENANCE_EVENT_KEY } from "@/lib/brain/brain-learning-provenance";
import type { BrainNodeType } from "@/lib/brain/brain-telemetry";
import { inferTelemetryNodeTypeFromEvidence } from "@/lib/brain/brain-learning-node-anchor";

/** Texto fijo cuando no hay telemetría reciente en memoria para ese nodo. */
export const BRAIN_NO_RECENT_SIGNALS_COPY = "Sin señales recientes";

/** Nota solo para desarrollo: memoria efímera en el proceso servidor. */
export const BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES =
  "Las señales recientes se guardan en memoria durante esta sesión de servidor.";

export const BRAIN_RECENT_SIGNALS_TOOLTIP_ES =
  "Resumen de eventos de telemetría recientes en memoria del servidor para este nodo. No es análisis de imagen salvo que esos eventos existan en la sesión actual.";

export const BRAIN_PENDING_QUEUE_TOOLTIP_ES =
  "Aprendizajes propuestos pendientes de tu decisión. El texto no garantiza visión remota: revisa la procedencia en Brain Studio · Por revisar.";

export const BRAIN_IMAGE_INVENTORY_NODE_TOOLTIP_ES =
  "Imágenes detectadas como referencia o recurso visual en el proyecto (inventario). No implica que todas tengan análisis con Gemini u OpenAI.";

export const BRAIN_VISION_REAL_COUNT_NODE_TOOLTIP_ES =
  "Imágenes con fila de análisis marcada como visión remota (Gemini u OpenAI) sin mock ni fallback, según metadatos guardados del proyecto.";

/**
 * Edad relativa corta para “Última señal · …”.
 * `nowMs` inyectable en tests.
 */
export function formatBrainSignalRelativeAge(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMin = Math.floor((nowMs - t) / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD} d`;
}

export function formatPendingReviewLine(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 aprendizaje en revisión" : `${count} aprendizajes en revisión`;
}

function isBrainPseudoNodeId(id: string): boolean {
  return id.startsWith("brain:");
}

/** Nodo ancla para contadores: `nodeId`, `primarySourceNodeId`, o único `sourceNodeIds` concreto (sin brain:*). */
export function resolveLearningCandidateAnchorNodeId(row: StoredLearningCandidate): string | undefined {
  const nid = row.nodeId?.trim();
  if (nid && !isBrainPseudoNodeId(nid)) return nid;
  const primary = row.candidate.evidence.primarySourceNodeId?.trim();
  if (primary && !isBrainPseudoNodeId(primary)) return primary;
  const concrete = (row.candidate.evidence.sourceNodeIds ?? []).map((x) => x.trim()).filter(Boolean).filter((x) => !isBrainPseudoNodeId(x));
  if (concrete.length === 1) return concrete[0];
  return undefined;
}

/** True si el candidato enlaza a un nodo real del lienzo (no solo brain:*). */
export function learningCandidateHasExplicitCanvasNodeId(row: StoredLearningCandidate, nodeId: string): boolean {
  const cid = nodeId.trim();
  if (!cid) return false;
  if (row.nodeId?.trim() === cid) return true;
  const p = row.candidate.evidence.primarySourceNodeId?.trim();
  if (p && !isBrainPseudoNodeId(p) && p === cid) return true;
  return (row.candidate.evidence.sourceNodeIds ?? []).some((x) => {
    const t = x.trim();
    return Boolean(t) && !isBrainPseudoNodeId(t) && t === cid;
  });
}

/**
 * Candidatos sin `evidenceSource` o referencias visuales antiguas sin marca de visión:
 * no usar `primarySourceNodeId` como ancla para contadores / tarjeta (evita cruces Designer/Photoroom).
 */
export function isAmbiguousHistoricPendingLearningRow(row: StoredLearningCandidate): boolean {
  const ev = row.candidate.evidence;
  const src = ev.evidenceSource;
  if (src === "visual_reference") {
    const p = ev.eventCounts?.[BRAIN_VISION_PROVENANCE_EVENT_KEY];
    return typeof p !== "string" || !String(p).trim();
  }
  if (!src) return true;
  return false;
}

/** Ancla para contadores y tarjeta Brain compacta (más estricta con históricos). */
export function resolveLearningPendingAnchorNodeId(row: StoredLearningCandidate): string | undefined {
  if (isAmbiguousHistoricPendingLearningRow(row)) {
    const nid = row.nodeId?.trim();
    if (nid && !isBrainPseudoNodeId(nid)) return nid;
    return undefined;
  }
  return resolveLearningCandidateAnchorNodeId(row);
}

/**
 * ¿Este pendiente debe mostrarse en la tarjeta de un nodo concreto del lienzo?
 * Evita mezclar candidatos LLM de Designer bajo Photoroom u otro tipo.
 */
export function learningRowMatchesCanvasNode(
  row: StoredLearningCandidate,
  clientId: string,
  clientBrainNodeType?: BrainNodeType | "OTHER",
): boolean {
  const cid = clientId.trim();
  if (!cid) return false;
  const anchor = resolveLearningPendingAnchorNodeId(row);
  if (!anchor || anchor !== cid) return false;

  const telType = row.telemetryNodeType ?? inferTelemetryNodeTypeFromEvidence(row.candidate);
  if (clientBrainNodeType && clientBrainNodeType !== "OTHER" && telType) {
    if (telType !== clientBrainNodeType) return false;
  }

  const types = (row.candidate.evidence.sourceNodeTypes ?? []).map((t) => t.toLowerCase());
  if (clientBrainNodeType === "PHOTOROOM") {
    const mentionsDesigner = types.some((t) => t.includes("designer"));
    const mentionsPhoto = types.some((t) => t.includes("photoroom"));
    if (mentionsDesigner && !mentionsPhoto) return false;
  }
  if (clientBrainNodeType === "DESIGNER") {
    const mentionsDesigner = types.some((t) => t.includes("designer"));
    const mentionsPhoto = types.some((t) => t.includes("photoroom"));
    if (mentionsPhoto && !mentionsDesigner) return false;
  }

  return true;
}

export function buildPendingCountByNodeId(rows: StoredLearningCandidate[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows) {
    const anchor = resolveLearningPendingAnchorNodeId(row);
    if (!anchor) continue;
    m.set(anchor, (m.get(anchor) ?? 0) + 1);
  }
  return m;
}

export type ConnectedNodeSignalsCopyInput = {
  summaryLine: string | null;
  lastAt: string | null;
  pendingCount: number;
  expanded: boolean;
};

/**
 * Textos de señales / pendientes / última señal para un nodo conectado (sin incluir nombre ni tipo).
 */
export function connectedNodeSignalsCopy(input: ConnectedNodeSignalsCopyInput): {
  signalsLine: string;
  pendingLine: string | null;
  lastSignalLine: string | null;
} {
  const trimmed = input.summaryLine?.trim() || null;
  const signalsLine = trimmed || BRAIN_NO_RECENT_SIGNALS_COPY;
  const pendingLine = formatPendingReviewLine(input.pendingCount);
  const lastSignalLine =
    input.expanded && input.lastAt?.trim()
      ? `Última señal · ${formatBrainSignalRelativeAge(input.lastAt.trim())}`
      : null;
  return { signalsLine, pendingLine, lastSignalLine };
}
