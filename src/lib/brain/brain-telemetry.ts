import type { TelemetryFlushReason, TelemetryImageSource } from "./brain-models";

export const BRAIN_NODE_TYPES = [
  "DESIGNER",
  "PHOTOROOM",
  "ARTICLE_WRITER",
  "IMAGE_GENERATOR",
  "VIDEO_NODE",
  "PRESENTATION_NODE",
  "CUSTOM",
] as const;

export type BrainNodeType = (typeof BRAIN_NODE_TYPES)[number];

export const TELEMETRY_EVENT_KINDS = [
  "ASSET_USED",
  "BACKGROUND_REMOVED",
  "COLOR_USED",
  "CONTENT_EXPORTED",
  "DRIFT_FROM_BRAND",
  "IMAGE_EDITED",
  "IMAGE_EXPORTED",
  "IMAGE_GENERATED",
  "IMAGE_IMPORTED",
  "IMAGE_USED",
  "LAYER_USED",
  "LAYOUT_FINALIZED",
  "LOGO_CREATED",
  "LOGO_EDITED",
  "MANUAL_OVERRIDE",
  "MASK_USED",
  "PROJECT_SPECIFIC_SIGNAL",
  "PROMPT_ACCEPTED",
  "PROMPT_USED",
  "STYLE_APPLIED",
  "SUGGESTION_ACCEPTED",
  "SUGGESTION_IGNORED",
  "SUGGESTION_SHOWN",
  "TEXT_FINALIZED",
  "TYPOGRAPHY_USED",
  "VIDEO_FRAME_USED",
  "VIDEO_POSTER_USED",
  "VISUAL_ASSET_USED",
] as const;

export type TelemetryEventKind = (typeof TELEMETRY_EVENT_KINDS)[number];

/** Pistas opcionales del análisis visual (Designer / visión) para enriquecer candidatos Brain. */
export type DesignerVisualHintsPayload = {
  mood?: string;
  style?: string;
  colorsNote?: string;
  composition?: string;
  people?: string;
  clothing?: string;
  visualMessage?: string;
};

/** Alias transversal: mismas pistas que Designer, reutilizable en Photoroom u otros nodos visuales. */
export type NodeVisualHintsPayload = DesignerVisualHintsPayload;

export type DesignerTelemetryPayload = {
  headlineUsed?: boolean;
  paragraphUsed?: boolean;
  ctaUsed?: boolean;
  layoutStructure?: string;
  pageExported?: boolean;
  imageFrameUsed?: boolean;
  typographyUsed?: string;
  brainPanelFieldRef?: string;
  visualHints?: DesignerVisualHintsPayload;
  /** Resumen al exportar: imágenes presentes en el documento. */
  exportImagesSummary?: {
    imageFramesWithContent: number;
    looseImageObjects: number;
  };
};

export type PhotoroomTelemetryPayload = {
  imageSubject?: string;
  backgroundRemoved?: boolean;
  maskUsed?: boolean;
  layerStructure?: string;
  colorGrade?: string;
  filtersApplied?: string[];
  finalImageAnalysis?: string;
  logoGeneratedOrEdited?: boolean;
  visualComposition?: string;
  exportFormat?: string;
  /** Dimensiones del raster exportado (documento o vista previa al nodo). */
  exportWidth?: number;
  exportHeight?: number;
  layersCount?: number;
  masksCount?: number;
  colorsUsed?: number;
  stylesApplied?: number;
  imagesUsed?: number;
  visualHints?: NodeVisualHintsPayload;
};

export type ArticleTelemetryPayload = {
  topic?: string;
  title?: string;
  outline?: string;
  finalText?: string;
  tone?: string;
  audience?: string;
  keywords?: string[];
  discardedAngles?: string[];
  publishedVersion?: boolean;
};

/** Artefacto asociado a exportación / pieza (transversal a nodos). */
export type TelemetryArtifactType = "pdf" | "image" | "video" | "presentation" | "design" | "article" | "unknown";

export type TelemetryEvent = {
  kind: TelemetryEventKind;
  ts: string;
  suggestionId?: string;
  fieldRef?: string;
  lengthChars?: number;
  assetRef?: string;
  source?: TelemetryImageSource;
  /** Id de asset Designer (p. ej. HR/OPT) cuando aplica. */
  assetId?: string;
  fileName?: string;
  mimeType?: string;
  /** Página del documento multipágina (`DesignerPageState.id`). */
  pageId?: string;
  /** Marco imagen u objeto imagen (`FreehandObject.id`). */
  frameId?: string;
  /** Capa explícita (Photoroom, vídeo, nodos futuros). */
  layerId?: string;
  maskId?: string;
  canvasObjectId?: string;
  exportId?: string;
  artifactType?: TelemetryArtifactType;
  /** Si true en un evento de exportación, marca uso en pieza final aunque el flush sea genérico. */
  usedInExport?: boolean;
  /** Pistas visuales en el propio evento (cualquier nodo). */
  visualHints?: NodeVisualHintsPayload;
  imageWidth?: number;
  imageHeight?: number;
  exportFormat?: string;
  textPreview?: string;
  textLength?: number;
  colorHex?: string;
  typographyFamily?: string;
  layoutLabel?: string;
  styleLabel?: string;
  imageFingerprint?: string;
  designer?: DesignerTelemetryPayload;
  photoroom?: PhotoroomTelemetryPayload;
  article?: ArticleTelemetryPayload;
  custom?: Record<string, unknown>;
};

export type TelemetryBatch = {
  version: 2;
  /** Idempotencia: mismo batchId no se procesa dos veces en ingest. Si falta, el servidor asigna uno nuevo. */
  batchId?: string;
  sessionId: string;
  capturedAt: string;
  /** Momento de creación del lote en cliente (ISO). Si falta, se usa capturedAt. */
  createdAt?: string;
  /** Eco del nodo de canvas; debe coincidir con el nodeId del API. */
  nodeId?: string;
  /** Eco del proyecto; debe coincidir con el projectId del API. */
  projectId?: string;
  flushReason: TelemetryFlushReason;
  nodeType: BrainNodeType;
  events: TelemetryEvent[];
};

export type BrainOutboundContext = {
  brandDnaSummary: unknown;
  knowledgeSummary: unknown;
  tone?: string;
  audience?: string;
  claims?: string[];
  palette?: string[];
  typography?: string[];
  visualStyle?: string;
  creativePreferences?: unknown;
  projectMemory?: unknown;
  contextualSnippets?: unknown[];
  constraints?: string[];
  suggestionsForNodeType?: unknown;
};

export type BrainNodeTelemetryApi = {
  readonly nodeType: BrainNodeType;
  track(event: Omit<TelemetryEvent, "ts"> & { ts?: string }): void;
  flushTelemetry(reason?: TelemetryFlushReason): Promise<void>;
};
