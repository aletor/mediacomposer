export type HexColor = `#${string}` | string;

export type BrandSector = {
  id: string;
  label: string;
  weight?: number;
};

export type BrandClaim = {
  id: string;
  text: string;
  channel?: string;
  /** Si true, Brain no debe contradecir ni sobrescribir sin confirmación explícita del usuario. */
  locked?: boolean;
};

export type BrandPalette = {
  id: string;
  name?: string;
  swatches: HexColor[];
  locked?: boolean;
};

export type BrandTypographySlot = {
  id: string;
  role: "primary" | "secondary" | "accent" | "mono" | "display";
  family: string;
  weights?: number[];
  usage?: string;
  locked?: boolean;
};

export type BrandProhibition = {
  text: string;
  locked?: boolean;
};

export type BrandDNA = {
  sectors: BrandSector[];
  claims: BrandClaim[];
  palettes: BrandPalette[];
  typography: BrandTypographySlot[];
  prohibitions: BrandProhibition[];
};

export function prohibitionText(p: BrandProhibition): string {
  return p.text.trim();
}

/** Metadatos de versión para ADN o preferencias tras promoción manual. */
export type BrainEntityVersionStamp = {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  sourceLearningId?: string;
};

export type TextLengthPreference = "short" | "medium" | "long" | "auto";

export type CreativePreferences = {
  defaultCopyLength: TextLengthPreference;
  visualStyleHabit?: string;
  toneNotes?: string;
  locale?: string;
};

/** Memoria explícita del proyecto/campaña/pieza; no contamina el ADN global. */
export type ProjectMemoryEntry = {
  id: string;
  topic: string;
  value: string;
  createdAt: string;
  sourceLearningId?: string;
};

export type ProjectMemory = {
  entries: ProjectMemoryEntry[];
};

/** Contexto lateral u outlier; reutilizable si un proyecto futuro es semánticamente cercano. */
export type ContextualMemoryEntry = {
  id: string;
  topic: string;
  value: string;
  isOutlier: boolean;
  createdAt: string;
  sourceLearningId?: string;
};

export type TelemetryImageSource =
  | "brain"
  | "upload"
  | "generated"
  | "library"
  | "unknown"
  /** Origen explícito (Designer / producto). */
  | "USER_UPLOAD"
  | "BRAIN_SUGGESTION"
  | "PROJECT_ASSET"
  | "EXTERNAL"
  | "GENERATED_IMAGE"
  | "PHOTOROOM_EDIT"
  | "VIDEO_FRAME"
  | "MOODBOARD_REFERENCE"
  | "BRAIN_REFERENCE";

export type TelemetryFlushReason = "unmount" | "export" | "manual";

export type { BrainNodeType, TelemetryBatch, TelemetryEvent, TelemetryEventKind } from "./brain-telemetry";

export type BrainContextSnapshot = {
  projectId: string;
  workspaceId: string;
  brandDna: BrandDNA;
  preferences: CreativePreferences;
  projectMemory: ProjectMemory;
  contextualMemory: ContextualMemoryEntry[];
};
