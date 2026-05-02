import type { BrainEvidenceItem } from "@/lib/brain/brain-creative-memory-types";

/** Capa seleccionable dentro de un slot (nodos creativos futuros). */
export type VisualDnaLayer =
  | "general"
  | "people"
  | "objects"
  | "environments"
  | "textures"
  | "palette";

export type VisualDnaSlotStatus = "pending" | "generating" | "ready" | "failed" | "stale";

export type VisualDnaSlotMosaicProvider = "nano_banana" | "gemini" | "openai" | "manual" | "unknown";

export type VisualDnaSlotAnalysisOrigin = "remote_ai" | "local_heuristic" | "fallback" | "mock" | "manual";

export type VisualDnaSlotAsset = {
  imageUrl?: string;
  s3Path?: string;
  prompt?: string;
  description?: string;
  role?: "same" | "similar";
  confidence?: number;
};

export type VisualDnaMosaicAdvice = {
  id: string;
  title: string;
  observed: string;
  creativeUse: string;
  promptHint: string;
  avoid?: string;
  visualKeywords: string[];
  confidence?: number;
};

export type VisualDnaMosaicIntelligence = {
  schemaVersion: "visual_dna_mosaic_intelligence_v1";
  source: "mosaic_image";
  analyzedAt?: string;
  provider?: "gemini" | "openai" | "mock" | "unknown";
  people: VisualDnaMosaicAdvice[];
  environments: VisualDnaMosaicAdvice[];
  textures: VisualDnaMosaicAdvice[];
  objects: VisualDnaMosaicAdvice[];
  generalLooks: VisualDnaMosaicAdvice[];
  globalCreativeDirection?: {
    summary?: string;
    bestFor?: string[];
    avoid?: string[];
    visualKeywords?: string[];
  };
  confidence?: number;
  lastError?: string;
};

export type VisualDnaSlot = {
  id: string;
  label: string;
  sourceImageId?: string;
  sourceDocumentId?: string;
  sourceImageUrl?: string;
  sourceS3Path?: string;
  createdAt: string;
  updatedAt?: string;
  brainVersion?: number;

  status: VisualDnaSlotStatus;

  palette: {
    dominantColors: string[];
    colorNotes?: string;
  };

  hero: {
    imageUrl?: string;
    prompt?: string;
    description?: string;
    conclusion?: string;
  };

  people: {
    same?: VisualDnaSlotAsset;
    similar?: VisualDnaSlotAsset;
    notes?: string;
  };

  objects: {
    same?: VisualDnaSlotAsset;
    similar?: VisualDnaSlotAsset;
    notes?: string;
  };

  environments: {
    same?: VisualDnaSlotAsset;
    similar?: VisualDnaSlotAsset;
    notes?: string;
  };

  textures: {
    same?: VisualDnaSlotAsset;
    similar?: VisualDnaSlotAsset;
    notes?: string;
  };

  generalStyle: {
    title?: string;
    summary?: string;
    mood?: string[];
    lighting?: string[];
    composition?: string[];
    materiality?: string[];
    avoid?: string[];
    safeGenerationRules?: string[];
  };

  mosaic: {
    imageUrl?: string;
    s3Path?: string;
    provider?: VisualDnaSlotMosaicProvider;
    prompt?: string;
    diagnostics?: unknown;
  };

  mosaicIntelligence?: VisualDnaMosaicIntelligence;

  /** Prompts internos (p. ej. tablero Nano) y reglas inyectadas en la última generación. */
  lastGenerationPrompts?: {
    mosaicUserPrompt?: string;
    mosaicSystemNotes?: string;
    safeRulesDigest?: string[];
  };

  evidence?: BrainEvidenceItem[];
  confidence?: number;
  analysisOrigin?: VisualDnaSlotAnalysisOrigin;

  lastError?: string;
  staleReasons?: string[];
};
