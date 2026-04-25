/** Marca en `eventCounts` para filtrar tarjetas «Visual / Imagen» en Por revisar (transversal a nodos). */
export const VISUAL_NODE_REVIEW_BUNDLE_KEY = "visual_node_review_bundle";

/** Compatibilidad con candidatos persistidos antes del refactor node-agnostic. */
export const LEGACY_DESIGNER_VISUAL_REVIEW_BUNDLE_KEY = "designer_visual_review_bundle";

/** @deprecated Preferir `VISUAL_NODE_REVIEW_BUNDLE_KEY`; mismo valor que la clave legada. */
export const DESIGNER_VISUAL_REVIEW_BUNDLE_KEY = LEGACY_DESIGNER_VISUAL_REVIEW_BUNDLE_KEY;

/** True si el candidato proviene del paquete de revisión visual (clave nueva o legada). */
export function hasVisualLearningReviewBundle(eventCounts?: Record<string, number | string>): boolean {
  if (!eventCounts) return false;
  const n = (k: string) => {
    const v = eventCounts[k];
    return typeof v === "number" ? v : 0;
  };
  return n(VISUAL_NODE_REVIEW_BUNDLE_KEY) > 0 || n(LEGACY_DESIGNER_VISUAL_REVIEW_BUNDLE_KEY) > 0;
}
