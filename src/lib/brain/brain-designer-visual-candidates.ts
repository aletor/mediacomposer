/**
 * Compatibilidad: la lógica vive en `brain-visual-node-signals.ts` (transversal a nodos visuales).
 * Mantener importaciones desde este módulo no rompe integraciones existentes.
 */
export {
  DESIGNER_VISUAL_REVIEW_BUNDLE_KEY,
  LEGACY_DESIGNER_VISUAL_REVIEW_BUNDLE_KEY,
  VISUAL_NODE_REVIEW_BUNDLE_KEY,
} from "./brain-visual-review-constants";

export type { DesignerVisualEvidenceDigest, VisualNodeEvidenceDigest } from "./brain-visual-node-signals";

export {
  basadoSummaryLine,
  buildDesignerVisualLearningCandidates,
  collectDesignerVisualEvidence,
  collectVisualNodeEvidenceDigest,
  createVisualLearningCandidatesFromVisualSignals,
  extractVisualHintsFromBatches,
  mergeDesignerVisualWithLlmCandidates,
  mergeVisualNodeSignalsWithLlmCandidates,
  shouldEmitDesignerVisualLearnings,
  shouldEmitVisualNodeLearnings,
} from "./brain-visual-node-signals";
