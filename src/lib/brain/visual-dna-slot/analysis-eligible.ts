import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";

/**
 * True si la fila de visión ya permite crear un slot ADN por imagen.
 *
 * El mosaico de una cápsula depende del análisis visual real. Crear slots con filas
 * `pending/queued/analyzing` deja cápsulas fantasma que intentan generar tablero sin
 * paleta, sujetos ni composición. Los JSON antiguos sin `analysisStatus` se tratan
 * como listos por compatibilidad.
 */
export function analysisEligibleForKnowledgeVisualDnaSlot(a: BrainVisualImageAnalysis): boolean {
  if (a.analysisStatus === "failed") return false;
  const st = a.analysisStatus ?? "analyzed";
  return st === "analyzed";
}
