/**
 * Procedencia de campos Brain (qué es “verdad consolidada” vs señal / default).
 * Se puede persistir en `ProjectAssetsMetadata` y mostrar en UI.
 */

export type BrainSourceTier =
  | "confirmed"
  | "core_document"
  | "visual_real"
  | "user_manual"
  | "pending"
  | "heuristic"
  | "mock"
  | "default"
  | "legacy"
  | "unknown";

export type BrainSourceConfidence = "high" | "medium" | "low";

export type BrainFieldSourceInfo = {
  label: string;
  sourceTier: BrainSourceTier;
  sourceConfidence: BrainSourceConfidence;
  updatedAt?: string;
  /** Valor o fragmento asociado a esta procedencia (opcional). */
  value?: string;
  /** Etiqueta corta para chips en UI. */
  badge?: string;
  /** Ruta JSON en `metadata.assets` tocada por este origen. */
  changedPath?: string;
  assetIds?: string[];
  documentIds?: string[];
  imageIds?: string[];
  learningIds?: string[];
  analyzerVersion?: string | null;
  provider?: string | null;
  fallbackUsed?: boolean;
};

/** Mapa opcional por clave lógica (identidad, tono, …) dentro de `metadata.assets`. */
export type BrainStrategyFieldProvenance = Partial<Record<string, BrainFieldSourceInfo>>;
