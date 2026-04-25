import type { BrainNodeType, TelemetryEventKind } from "./brain-telemetry";
import { TELEMETRY_EVENT_KINDS } from "./brain-telemetry";

/**
 * Contrato común Brain ↔ nodo: qué contexto puede consumir el nodo y qué señales declara emitir.
 * No codifica lógica de producto (p. ej. Designer); solo declaración para orquestación y prompts.
 */
export const BRAIN_CONTEXT_KEYS = [
  "brandDna",
  "creativePreferences",
  "projectMemory",
  "contextualMemory",
  "knowledgeCore",
  "knowledgeContext",
  "workspace",
] as const;

export type BrainContextKey = (typeof BRAIN_CONTEXT_KEYS)[number];

export type BrainNodeCapability = {
  nodeType: BrainNodeType;
  contextKeysAccepted: readonly BrainContextKey[];
  /** Subconjunto de TELEMETRY_EVENT_KINDS que este nodo puede emitir (declarativo). */
  signalsEmitted: readonly TelemetryEventKind[];
  /** Formatos de exportación que el nodo puede asociar a CONTENT_EXPORTED u orígenes de artefacto. */
  supportedExportKinds?: readonly string[];
};

const ALL_SIGNALS = TELEMETRY_EVENT_KINDS;

const DESIGNER_SIGNALS: readonly TelemetryEventKind[] = [
  "SUGGESTION_SHOWN",
  "SUGGESTION_ACCEPTED",
  "SUGGESTION_IGNORED",
  "MANUAL_OVERRIDE",
  "CONTENT_EXPORTED",
  "ASSET_USED",
  "STYLE_APPLIED",
  "COLOR_USED",
  "TYPOGRAPHY_USED",
  "IMAGE_USED",
  "IMAGE_IMPORTED",
  "TEXT_FINALIZED",
  "LAYOUT_FINALIZED",
  "DRIFT_FROM_BRAND",
  "PROJECT_SPECIFIC_SIGNAL",
];

const PHOTOROOM_SIGNALS: readonly TelemetryEventKind[] = [
  "CONTENT_EXPORTED",
  "ASSET_USED",
  "IMAGE_USED",
  "IMAGE_IMPORTED",
  "IMAGE_EDITED",
  "COLOR_USED",
  "STYLE_APPLIED",
  "PROJECT_SPECIFIC_SIGNAL",
];

const WRITER_SIGNALS: readonly TelemetryEventKind[] = [
  "SUGGESTION_SHOWN",
  "SUGGESTION_ACCEPTED",
  "SUGGESTION_IGNORED",
  "MANUAL_OVERRIDE",
  "CONTENT_EXPORTED",
  "TEXT_FINALIZED",
  "PROJECT_SPECIFIC_SIGNAL",
];

const GENERIC_CREATIVE_SIGNALS: readonly TelemetryEventKind[] = [
  "CONTENT_EXPORTED",
  "ASSET_USED",
  "PROJECT_SPECIFIC_SIGNAL",
];

export const BRAIN_NODE_CAPABILITIES: Record<BrainNodeType, BrainNodeCapability> = {
  DESIGNER: {
    nodeType: "DESIGNER",
    contextKeysAccepted: [
      "brandDna",
      "creativePreferences",
      "projectMemory",
      "contextualMemory",
      "knowledgeCore",
      "knowledgeContext",
      "workspace",
    ],
    signalsEmitted: DESIGNER_SIGNALS,
    supportedExportKinds: ["pdf", "png", "jpg", "webp"],
  },
  PHOTOROOM: {
    nodeType: "PHOTOROOM",
    contextKeysAccepted: ["brandDna", "creativePreferences", "projectMemory", "knowledgeCore", "workspace"],
    signalsEmitted: PHOTOROOM_SIGNALS,
    supportedExportKinds: ["png", "jpg", "webp", "svg"],
  },
  ARTICLE_WRITER: {
    nodeType: "ARTICLE_WRITER",
    contextKeysAccepted: [
      "brandDna",
      "creativePreferences",
      "projectMemory",
      "contextualMemory",
      "knowledgeCore",
      "knowledgeContext",
      "workspace",
    ],
    signalsEmitted: WRITER_SIGNALS,
    supportedExportKinds: ["md", "html", "pdf", "docx"],
  },
  IMAGE_GENERATOR: {
    nodeType: "IMAGE_GENERATOR",
    contextKeysAccepted: ["brandDna", "creativePreferences", "projectMemory", "knowledgeCore", "workspace"],
    signalsEmitted: [...GENERIC_CREATIVE_SIGNALS, "IMAGE_USED", "IMAGE_IMPORTED", "IMAGE_EDITED", "STYLE_APPLIED"],
    supportedExportKinds: ["png", "jpg", "webp"],
  },
  VIDEO_NODE: {
    nodeType: "VIDEO_NODE",
    contextKeysAccepted: ["brandDna", "creativePreferences", "projectMemory", "workspace"],
    signalsEmitted: GENERIC_CREATIVE_SIGNALS,
    supportedExportKinds: ["mp4", "mov", "webm"],
  },
  PRESENTATION_NODE: {
    nodeType: "PRESENTATION_NODE",
    contextKeysAccepted: [
      "brandDna",
      "creativePreferences",
      "projectMemory",
      "knowledgeCore",
      "workspace",
    ],
    signalsEmitted: [...GENERIC_CREATIVE_SIGNALS, "TEXT_FINALIZED", "LAYOUT_FINALIZED"],
    supportedExportKinds: ["pptx", "pdf"],
  },
  CUSTOM: {
    nodeType: "CUSTOM",
    contextKeysAccepted: ["brandDna", "creativePreferences", "projectMemory", "workspace"],
    /** Nodo desconocido: no restringimos señales en tiempo de compilación. */
    signalsEmitted: ALL_SIGNALS,
    supportedExportKinds: [],
  },
};

export function getBrainNodeCapability(nodeType: BrainNodeType): BrainNodeCapability {
  return BRAIN_NODE_CAPABILITIES[nodeType];
}
