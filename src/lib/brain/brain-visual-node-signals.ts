import type { TelemetryImageSource } from "./brain-models";
import type { LearningCandidate } from "./learning-candidate-schema";
import type { BrainNodeType, NodeVisualHintsPayload, TelemetryBatch, TelemetryEvent } from "./brain-telemetry";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import { aggregateVisualPatterns, isVisualTelemetryNodeType } from "./brain-visual-analysis";
import {
  LEGACY_DESIGNER_VISUAL_REVIEW_BUNDLE_KEY,
  VISUAL_NODE_REVIEW_BUNDLE_KEY,
} from "./brain-visual-review-constants";
import { labelForBrainNodeSource } from "./brain-review-labels";

const MAX_CANDIDATES = 12;

const VISUAL_NODE_PRIORITY: BrainNodeType[] = [
  "DESIGNER",
  "PHOTOROOM",
  "IMAGE_GENERATOR",
  "VIDEO_NODE",
  "PRESENTATION_NODE",
  "CUSTOM",
];

export type VisualNodeEvidenceDigest = {
  /** Orden de aparición en los lotes (útil para trazas). */
  nodeTypesPresent: BrainNodeType[];
  hasDesignerNode: boolean;
  hasExportFlush: boolean;
  hasContentExported: boolean;
  /** USER_UPLOAD en nodos con telemetría visual (agregado). */
  userUploadImported: number;
  userUploadUsed: number;
  importedBySource: Partial<Record<TelemetryImageSource, number>>;
  usedBySource: Partial<Record<TelemetryImageSource, number>>;
  importedBySourceDesigner: Partial<Record<TelemetryImageSource, number>>;
  usedBySourceDesigner: Partial<Record<TelemetryImageSource, number>>;
  uploadsByNode: Partial<Record<BrainNodeType, { imported: number; used: number }>>;
  exportImagesSummary: { imageFramesWithContent: number; looseImageObjects: number } | null;
  imageSuggestionShown: number;
  photoroomImageImported: number;
  photoroomImageEdited: number;
  photoroomBackgroundRemoved: number;
  photoroomMaskUsed: number;
  photoroomLayersUsed: number;
  photoroomStyleApplied: number;
  photoroomColorUsed: number;
  photoroomImageExported: number;
  photoroomLogoEdited: number;
  imageGeneratorGenerated: number;
  imageGeneratorExported: number;
  videoFrameUsed: number;
  videoPosterUsed: number;
  samples: Array<{
    fileName?: string;
    pageId?: string;
    frameId?: string;
    source?: TelemetryImageSource;
    nodeTypeHint?: BrainNodeType;
  }>;
};

/** @deprecated Usar `VisualNodeEvidenceDigest`. */
export type DesignerVisualEvidenceDigest = VisualNodeEvidenceDigest;

export function collectVisualNodeEvidenceDigest(batches: TelemetryBatch[]): VisualNodeEvidenceDigest {
  const digest: VisualNodeEvidenceDigest = {
    nodeTypesPresent: [],
    hasDesignerNode: false,
    hasExportFlush: false,
    hasContentExported: false,
    userUploadImported: 0,
    userUploadUsed: 0,
    importedBySource: {},
    usedBySource: {},
    importedBySourceDesigner: {},
    usedBySourceDesigner: {},
    uploadsByNode: {},
    exportImagesSummary: null,
    imageSuggestionShown: 0,
    photoroomImageImported: 0,
    photoroomImageEdited: 0,
    photoroomBackgroundRemoved: 0,
    photoroomMaskUsed: 0,
    photoroomLayersUsed: 0,
    photoroomStyleApplied: 0,
    photoroomColorUsed: 0,
    photoroomImageExported: 0,
    photoroomLogoEdited: 0,
    imageGeneratorGenerated: 0,
    imageGeneratorExported: 0,
    videoFrameUsed: 0,
    videoPosterUsed: 0,
    samples: [],
  };
  const seenNt = new Set<BrainNodeType>();
  const sampleKeys = new Set<string>();

  function tryPushSample(ev: TelemetryEvent, nodeType: BrainNodeType): void {
    if (digest.samples.length >= 8) return;
    const key = `${nodeType}|${ev.kind}|${ev.fileName ?? ""}|${ev.frameId ?? ""}|${ev.pageId ?? ""}`;
    if (sampleKeys.has(key)) return;
    sampleKeys.add(key);
    digest.samples.push({
      fileName: ev.fileName,
      pageId: ev.pageId,
      frameId: ev.frameId,
      source: ev.source,
      nodeTypeHint: nodeType,
    });
  }

  function bumpUpload(node: BrainNodeType, field: "imported" | "used"): void {
    digest.uploadsByNode[node] ??= { imported: 0, used: 0 };
    digest.uploadsByNode[node]![field] += 1;
  }

  for (const batch of batches) {
    if (batch.version !== 2) continue;
    if (!seenNt.has(batch.nodeType)) {
      seenNt.add(batch.nodeType);
      digest.nodeTypesPresent.push(batch.nodeType);
    }
    if (batch.nodeType === "DESIGNER") digest.hasDesignerNode = true;
    if (batch.flushReason === "export") digest.hasExportFlush = true;

    for (const e of batch.events) {
      const ev = e as TelemetryEvent;
      if (ev.kind === "SUGGESTION_SHOWN" && ev.suggestionId?.trim().startsWith("img:")) {
        digest.imageSuggestionShown += 1;
      }

      if (!isVisualTelemetryNodeType(batch.nodeType)) continue;

      if (ev.kind === "IMAGE_IMPORTED" && ev.source) {
        digest.importedBySource[ev.source] = (digest.importedBySource[ev.source] ?? 0) + 1;
        if (batch.nodeType === "DESIGNER") {
          digest.importedBySourceDesigner[ev.source] = (digest.importedBySourceDesigner[ev.source] ?? 0) + 1;
        }
        if (ev.source === "USER_UPLOAD") {
          bumpUpload(batch.nodeType, "imported");
          tryPushSample(ev, batch.nodeType);
        }
      }
      if (ev.kind === "IMAGE_USED" && ev.source) {
        digest.usedBySource[ev.source] = (digest.usedBySource[ev.source] ?? 0) + 1;
        if (batch.nodeType === "DESIGNER") {
          digest.usedBySourceDesigner[ev.source] = (digest.usedBySourceDesigner[ev.source] ?? 0) + 1;
        }
        if (ev.source === "USER_UPLOAD") {
          bumpUpload(batch.nodeType, "used");
          tryPushSample(ev, batch.nodeType);
        }
      }
      if (batch.nodeType === "PHOTOROOM" && ev.kind === "IMAGE_IMPORTED") {
        digest.photoroomImageImported += 1;
        tryPushSample(ev, batch.nodeType);
      }
      if (batch.nodeType === "PHOTOROOM" && ev.kind === "IMAGE_EDITED") {
        digest.photoroomImageEdited += 1;
        tryPushSample(ev, batch.nodeType);
      }
      if (batch.nodeType === "PHOTOROOM") {
        if (ev.kind === "BACKGROUND_REMOVED") digest.photoroomBackgroundRemoved += 1;
        if (ev.kind === "MASK_USED") digest.photoroomMaskUsed += 1;
        if (ev.kind === "LAYER_USED") digest.photoroomLayersUsed += 1;
        if (ev.kind === "STYLE_APPLIED") digest.photoroomStyleApplied += 1;
        if (ev.kind === "COLOR_USED") digest.photoroomColorUsed += 1;
        if (ev.kind === "IMAGE_EXPORTED") {
          digest.photoroomImageExported += 1;
          tryPushSample(ev, batch.nodeType);
        }
        if (ev.kind === "LOGO_EDITED" || ev.kind === "LOGO_CREATED") digest.photoroomLogoEdited += 1;
      }
      if (batch.nodeType === "IMAGE_GENERATOR") {
        if (ev.kind === "IMAGE_GENERATED") {
          digest.imageGeneratorGenerated += 1;
          tryPushSample(ev, batch.nodeType);
        }
        if (ev.kind === "IMAGE_EXPORTED") digest.imageGeneratorExported += 1;
      }
      if (batch.nodeType === "VIDEO_NODE") {
        if (ev.kind === "VIDEO_FRAME_USED") {
          digest.videoFrameUsed += 1;
          tryPushSample(ev, batch.nodeType);
        }
        if (ev.kind === "VIDEO_POSTER_USED") {
          digest.videoPosterUsed += 1;
          tryPushSample(ev, batch.nodeType);
        }
      }
      if (ev.kind === "CONTENT_EXPORTED") {
        digest.hasContentExported = true;
        const s = ev.designer?.exportImagesSummary;
        if (s) {
          const next = {
            imageFramesWithContent: typeof s.imageFramesWithContent === "number" ? s.imageFramesWithContent : 0,
            looseImageObjects: typeof s.looseImageObjects === "number" ? s.looseImageObjects : 0,
          };
          if (!digest.exportImagesSummary) {
            digest.exportImagesSummary = { ...next };
          } else {
            digest.exportImagesSummary = {
              imageFramesWithContent: Math.max(digest.exportImagesSummary.imageFramesWithContent, next.imageFramesWithContent),
              looseImageObjects: Math.max(digest.exportImagesSummary.looseImageObjects, next.looseImageObjects),
            };
          }
        }
      }
    }
  }

  for (const nt of Object.keys(digest.uploadsByNode) as BrainNodeType[]) {
    const u = digest.uploadsByNode[nt];
    if (!u) continue;
    digest.userUploadImported += u.imported;
    digest.userUploadUsed += u.used;
  }

  return digest;
}

/** @deprecated Usar `collectVisualNodeEvidenceDigest`. */
export const collectDesignerVisualEvidence = collectVisualNodeEvidenceDigest;

export function extractVisualHintsFromBatches(batches: TelemetryBatch[]): NodeVisualHintsPayload | undefined {
  let last: NodeVisualHintsPayload | undefined;
  for (const batch of batches) {
    for (const e of batch.events) {
      const ev = e as TelemetryEvent;
      const dh = ev.designer?.visualHints;
      const ph = ev.photoroom?.visualHints;
      const top = ev.visualHints;
      if (dh && typeof dh === "object") last = { ...last, ...dh };
      if (ph && typeof ph === "object") last = { ...last, ...ph };
      if (top && typeof top === "object") last = { ...last, ...top };
    }
  }
  return last && Object.keys(last).length ? last : undefined;
}

function hintEnrichmentSentence(h: NodeVisualHintsPayload | undefined): string {
  if (!h) return "";
  const parts: string[] = [];
  if (h.mood?.trim()) parts.push(`tono ${h.mood.trim()}`);
  if (h.style?.trim()) parts.push(`estilo ${h.style.trim()}`);
  if (h.colorsNote?.trim()) parts.push(`color ${h.colorsNote.trim()}`);
  if (h.composition?.trim()) parts.push(`composición ${h.composition.trim()}`);
  if (h.people?.trim()) parts.push(`personas ${h.people.trim()}`);
  if (h.clothing?.trim()) parts.push(`ropa ${h.clothing.trim()}`);
  if (h.visualMessage?.trim()) parts.push(`mensaje ${h.visualMessage.trim()}`);
  if (!parts.length) return "";
  return ` Señales de análisis visual: ${parts.join("; ")}.`;
}

function orderedVisualNodeLabels(digest: VisualNodeEvidenceDigest): string[] {
  const present = new Set(digest.nodeTypesPresent.filter(isVisualTelemetryNodeType));
  return VISUAL_NODE_PRIORITY.filter((t) => present.has(t)).map((t) => labelForBrainNodeSource(t));
}

function exportContextPhrase(digest: VisualNodeEvidenceDigest): string {
  const present = digest.nodeTypesPresent.filter(isVisualTelemetryNodeType);
  if (present.length === 1 && present[0] === "PHOTOROOM") {
    if (digest.photoroomImageExported > 0) return "Imagen exportada";
    if (digest.photoroomImageEdited > 0 || digest.photoroomStyleApplied > 0) return "Imagen editada";
    return "Señales Photoroom";
  }
  if (present.includes("IMAGE_GENERATOR") && !present.includes("DESIGNER")) return "Imagen aceptada";
  if (present.includes("VIDEO_NODE") && (digest.videoFrameUsed > 0 || digest.videoPosterUsed > 0)) {
    return "Frame usado";
  }
  if (present.includes("VIDEO_NODE")) return "Exportación de vídeo";
  return "Exportación";
}

export function basadoSummaryLine(digest: VisualNodeEvidenceDigest): string {
  const labels = orderedVisualNodeLabels(digest);
  const nodes = labels.length ? labels.join(" · ") : "Nodo visual";
  const ctx = exportContextPhrase(digest);
  const up = digest.userUploadImported;
  const us = digest.userUploadUsed;
  const sub = `${up} imagen${up === 1 ? "" : "es"} importada${up === 1 ? "" : "s"}`;
  const use = `${us} imagen${us === 1 ? "" : "es"} usada${us === 1 ? "" : "s"}`;
  const editNote =
    digest.photoroomImageEdited > 0
      ? ` · ${digest.photoroomImageEdited} edición${digest.photoroomImageEdited === 1 ? "" : "es"} visual${digest.photoroomImageEdited === 1 ? "" : "es"}`
      : "";
  const photoExtra =
    digest.nodeTypesPresent.includes("PHOTOROOM") &&
    (digest.photoroomBackgroundRemoved > 0 ||
      digest.photoroomMaskUsed > 0 ||
      digest.photoroomLayersUsed > 0 ||
      digest.photoroomColorUsed > 0 ||
      digest.photoroomImageExported > 0)
      ? ` · Ph: ${digest.photoroomImageImported} imp. · ${digest.photoroomImageEdited} edit. · ${digest.photoroomBackgroundRemoved} fondos · ${digest.photoroomMaskUsed} másc. · ${digest.photoroomLayersUsed} capas · ${digest.photoroomColorUsed} colores · ${digest.photoroomImageExported} exp.`
      : "";
  return `Basado en: ${nodes} · ${ctx} · ${sub} · ${use}${editNote}${photoExtra}`.slice(0, 420);
}

/**
 * Señal fuerte histórica de Designer: export + CONTENT_EXPORTED + uso o resumen de imágenes en export.
 */
export function shouldEmitDesignerVisualLearnings(
  digest: VisualNodeEvidenceDigest,
  nodeTypes: BrainNodeType[],
  exportFlushCount: number,
): boolean {
  if (!digest.hasDesignerNode) return false;
  if (!nodeTypes.includes("DESIGNER")) return false;
  if (exportFlushCount < 1 || !digest.hasExportFlush) return false;
  if (!digest.hasContentExported) return false;

  const du = digest.uploadsByNode.DESIGNER?.used ?? 0;
  if (du > 0) return true;

  const sum = digest.exportImagesSummary;
  const exportedImages = sum !== null ? (sum.imageFramesWithContent ?? 0) + (sum.looseImageObjects ?? 0) : 0;
  const di = digest.uploadsByNode.DESIGNER?.imported ?? 0;
  if (di > 0 && exportedImages > 0) return true;

  return false;
}

function shouldEmitPhotoroomExportSignals(digest: VisualNodeEvidenceDigest, nodeTypes: BrainNodeType[]): boolean {
  if (!nodeTypes.includes("PHOTOROOM")) return false;
  if (!digest.nodeTypesPresent.includes("PHOTOROOM")) return false;
  if (digest.photoroomImageEdited > 0) return true;
  if (digest.photoroomImageExported > 0) return true;
  if (digest.photoroomBackgroundRemoved > 0) return true;
  if (digest.photoroomMaskUsed > 0) return true;
  if (digest.photoroomLayersUsed > 0) return true;
  if (digest.photoroomStyleApplied > 0) return true;
  if ((digest.uploadsByNode.PHOTOROOM?.used ?? 0) > 0) return true;
  if (digest.hasContentExported && digest.photoroomImageEdited + digest.photoroomImageExported > 0) return true;
  return false;
}

function shouldEmitImageGeneratorExportSignals(
  digest: VisualNodeEvidenceDigest,
  nodeTypes: BrainNodeType[],
  acceptedImageSlots: number,
): boolean {
  if (!nodeTypes.includes("IMAGE_GENERATOR")) return false;
  if (!digest.nodeTypesPresent.includes("IMAGE_GENERATOR")) return false;
  return (
    acceptedImageSlots > 0 ||
    digest.imageGeneratorGenerated > 0 ||
    digest.imageGeneratorExported > 0 ||
    (digest.uploadsByNode.IMAGE_GENERATOR?.used ?? 0) > 0
  );
}

function shouldEmitVideoExportSignals(digest: VisualNodeEvidenceDigest, nodeTypes: BrainNodeType[]): boolean {
  if (!nodeTypes.includes("VIDEO_NODE")) return false;
  if (!digest.nodeTypesPresent.includes("VIDEO_NODE")) return false;
  return digest.videoFrameUsed > 0 || digest.videoPosterUsed > 0 || digest.hasContentExported;
}

/** True si hay señales visuales consolidables en un cierre por exportación (transversal a nodos). */
export function shouldEmitVisualNodeLearnings(
  digest: VisualNodeEvidenceDigest,
  nodeTypes: BrainNodeType[],
  exportFlushCount: number,
  acceptedImageSlots: number,
): boolean {
  if (exportFlushCount < 1 || !digest.hasExportFlush) return false;

  if (shouldEmitDesignerVisualLearnings(digest, nodeTypes, exportFlushCount)) return true;
  if (shouldEmitPhotoroomExportSignals(digest, nodeTypes)) return true;
  if (shouldEmitImageGeneratorExportSignals(digest, nodeTypes, acceptedImageSlots)) return true;
  if (shouldEmitVideoExportSignals(digest, nodeTypes)) return true;

  return false;
}

function shouldOfferCautiousUploadOverSuggestionsLoose(
  digest: VisualNodeEvidenceDigest,
  nodeTypes: BrainNodeType[],
  acceptedImageSlots: number,
  exportFlushCount: number,
): boolean {
  return (
    shouldEmitVisualNodeLearnings(digest, nodeTypes, exportFlushCount, acceptedImageSlots) &&
    digest.hasDesignerNode &&
    nodeTypes.includes("DESIGNER") &&
    digest.imageSuggestionShown > 0 &&
    acceptedImageSlots === 0 &&
    (digest.uploadsByNode.DESIGNER?.used ?? 0) > 0
  );
}

export function mergeVisualNodeSignalsWithLlmCandidates(
  visual: LearningCandidate[],
  llm: LearningCandidate[],
  max: number = MAX_CANDIDATES,
): LearningCandidate[] {
  const overrideTypes = new Set(visual.map((v) => v.type));
  const filteredLlm = llm.filter((c) => !overrideTypes.has(c.type));
  return [...visual, ...filteredLlm].slice(0, max);
}

/** @deprecated Usar `mergeVisualNodeSignalsWithLlmCandidates`. */
export const mergeDesignerVisualWithLlmCandidates = mergeVisualNodeSignalsWithLlmCandidates;

function sourceNodeTypesForEvidence(digest: VisualNodeEvidenceDigest): BrainNodeType[] {
  return digest.nodeTypesPresent.filter(isVisualTelemetryNodeType);
}

function relatedArtifactKindsForEvidence(digest: VisualNodeEvidenceDigest): string[] {
  const out: string[] = [];
  const moodboardTouches =
    (digest.importedBySource.MOODBOARD_REFERENCE ?? 0) + (digest.usedBySource.MOODBOARD_REFERENCE ?? 0) > 0;
  if (digest.hasDesignerNode) out.push("Designer · Exportación");
  if (digest.nodeTypesPresent.includes("PHOTOROOM")) {
    if (digest.photoroomImageExported > 0) out.push("Photoroom · Imagen exportada");
    else if (digest.photoroomImageEdited > 0 || digest.photoroomStyleApplied > 0) out.push("Photoroom · Imagen editada");
    else out.push("Photoroom · Señales visuales");
  }
  if (digest.nodeTypesPresent.includes("IMAGE_GENERATOR")) {
    const acceptedLike =
      digest.imageGeneratorExported > 0 ||
      (digest.uploadsByNode.IMAGE_GENERATOR?.used ?? 0) > 0 ||
      (digest.usedBySource.GENERATED_IMAGE ?? 0) > 0;
    if (acceptedLike) out.push("Image Generator · Imagen aceptada");
    else if (digest.imageGeneratorGenerated > 0) out.push("Image Generator · Imagen generada");
    else out.push("Image Generator · Señales visuales");
  }
  if (digest.nodeTypesPresent.includes("VIDEO_NODE")) {
    if (digest.videoFrameUsed > 0) out.push("Video · Frame usado");
    if (digest.videoPosterUsed > 0) out.push("Video · Póster usado");
    if (digest.videoFrameUsed === 0 && digest.videoPosterUsed === 0) out.push("Video · Exportación");
  }
  if (moodboardTouches) out.push("Moodboard · Referencia visual");
  if (digest.nodeTypesPresent.includes("CUSTOM")) {
    out.push("Nodo visual · Señales");
  }
  if (!out.length) {
    const ctx = exportContextPhrase(digest);
    return ["Nodo visual", ctx];
  }
  return out;
}

export function createVisualLearningCandidatesFromVisualSignals(
  eventNodeId: string,
  digest: VisualNodeEvidenceDigest,
  hints: NodeVisualHintsPayload | undefined,
  nodeTypes: BrainNodeType[],
  acceptedImageSlots: number,
  exportFlushCount: number,
  telemetryImageAnalyses?: BrainVisualImageAnalysis[],
): LearningCandidate[] {
  if (!shouldEmitVisualNodeLearnings(digest, nodeTypes, exportFlushCount, acceptedImageSlots)) return [];

  const hintExtra = hintEnrichmentSentence(hints);
  const basado = basadoSummaryLine(digest);
  const exParts: string[] = [basado];
  if (digest.exportImagesSummary) {
    exParts.push(
      `exportImagesSummary: marcos ${digest.exportImagesSummary.imageFramesWithContent}, sueltas ${digest.exportImagesSummary.looseImageObjects}`,
    );
  }
  for (const s of digest.samples.slice(0, 4)) {
    const bits = [`nodeId ${eventNodeId}`, `nodeType ${s.nodeTypeHint ?? "DESIGNER"}`];
    if (s.fileName) bits.push(`fileName ${s.fileName}`);
    if (s.pageId) bits.push(`pageId ${s.pageId}`);
    if (s.frameId) bits.push(`frameId ${s.frameId}`);
    if (s.source) bits.push(`source ${s.source}`);
    exParts.push(bits.join(" · "));
  }

  const baseEventCounts: Record<string, number> = {
    [VISUAL_NODE_REVIEW_BUNDLE_KEY]: 1,
    [LEGACY_DESIGNER_VISUAL_REVIEW_BUNDLE_KEY]: digest.hasDesignerNode ? 1 : 0,
    visual_user_upload_imported: digest.userUploadImported,
    visual_user_upload_used: digest.userUploadUsed,
    visual_image_suggestion_shown: digest.imageSuggestionShown,
    visual_image_slots_accepted: acceptedImageSlots,
    photoroom_image_imported: digest.photoroomImageImported,
    photoroom_image_edited: digest.photoroomImageEdited,
    photoroom_background_removed: digest.photoroomBackgroundRemoved,
    photoroom_mask_used: digest.photoroomMaskUsed,
    photoroom_layers_used: digest.photoroomLayersUsed,
    photoroom_style_applied: digest.photoroomStyleApplied,
    photoroom_color_used: digest.photoroomColorUsed,
    photoroom_image_exported: digest.photoroomImageExported,
    photoroom_logo_edited: digest.photoroomLogoEdited,
    image_generator_generated: digest.imageGeneratorGenerated,
    image_generator_exported: digest.imageGeneratorExported,
    video_frame_used: digest.videoFrameUsed,
    video_poster_used: digest.videoPosterUsed,
  };

  if (digest.hasDesignerNode) {
    baseEventCounts.designer_user_upload_imported = digest.uploadsByNode.DESIGNER?.imported ?? 0;
    baseEventCounts.designer_user_upload_used = digest.uploadsByNode.DESIGNER?.used ?? 0;
    baseEventCounts.designer_image_suggestion_shown = digest.imageSuggestionShown;
    baseEventCounts.designer_image_slots_accepted = acceptedImageSlots;
  }
  for (const [k, v] of Object.entries(digest.importedBySourceDesigner)) {
    if (typeof v === "number" && v > 0) baseEventCounts[`designer_evt_IMAGE_IMPORTED_${k}`] = v;
  }
  for (const [k, v] of Object.entries(digest.usedBySourceDesigner)) {
    if (typeof v === "number" && v > 0) baseEventCounts[`designer_evt_IMAGE_USED_${k}`] = v;
  }
  if (digest.exportImagesSummary) {
    baseEventCounts.designer_export_image_frames = digest.exportImagesSummary.imageFramesWithContent;
    baseEventCounts.designer_export_loose_images = digest.exportImagesSummary.looseImageObjects;
  }

  const agg =
    telemetryImageAnalyses && telemetryImageAnalyses.length > 0
      ? aggregateVisualPatterns(telemetryImageAnalyses)
      : null;
  const patternLine = agg?.patternSummary?.trim();
  const signalBits = agg
    ? [
        ...agg.compositionNotes.slice(0, 2),
        ...agg.dominantMoods.slice(0, 2),
        ...agg.recurringStyles.slice(0, 3),
      ].filter(Boolean)
    : [];
  const señalesLine = signalBits.length ? `Señales: ${signalBits.join(" · ")}.` : "";

  const examplesWithSignals = señalesLine ? [señalesLine, ...exParts] : exParts;

  const evidenceBase = {
    sourceNodeIds: [eventNodeId],
    sourceNodeTypes: sourceNodeTypesForEvidence(digest),
    primarySourceNodeId: eventNodeId,
    evidenceSource: "telemetry" as const,
    relatedArtifactKinds: relatedArtifactKindsForEvidence(digest),
    examples: examplesWithSignals,
    eventCounts: { ...baseEventCounts },
  };

  const phOnly =
    digest.nodeTypesPresent.includes("PHOTOROOM") &&
    !digest.hasDesignerNode &&
    (digest.photoroomImageEdited > 0 || digest.photoroomImageExported > 0 || digest.photoroomStyleApplied > 0);
  const igSignal =
    digest.nodeTypesPresent.includes("IMAGE_GENERATOR") &&
    (digest.imageGeneratorGenerated > 0 || digest.imageGeneratorExported > 0 || acceptedImageSlots > 0);
  const vidSignal =
    digest.nodeTypesPresent.includes("VIDEO_NODE") && (digest.videoFrameUsed > 0 || digest.videoPosterUsed > 0);

  const defaultVisualGeneric = `Esta pieza consolida decisiones visuales finales a partir de imágenes reales en el lienzo.${hintExtra}`
    .trim()
    .slice(0, 500);
  const defaultVisualPh = `Las imágenes finales editadas en Photoroom usan un tratamiento visual coherente con la dirección del proyecto.${hintExtra}`
    .trim()
    .slice(0, 500);
  const defaultVisualIg = `En este proyecto se han aceptado imágenes generadas como parte de la dirección visual.${hintExtra}`.trim().slice(0, 500);
  const defaultVisualVid = `Los frames usados en vídeo refuerzan una dirección visual concreta del proyecto.${hintExtra}`.trim().slice(0, 500);

  const defaultVisual = phOnly ? defaultVisualPh : igSignal && !digest.hasDesignerNode ? defaultVisualIg : vidSignal ? defaultVisualVid : defaultVisualGeneric;
  const visualValue =
    patternLine && patternLine.length > 24
      ? `${patternLine.replace(/\.$/, "")}${hintExtra}`.trim().slice(0, 500)
      : defaultVisual;

  const defaultProjectGeneric = `En este proyecto se consolidó una dirección visual a partir de imágenes reales en el lienzo.${hintExtra}`
    .trim()
    .slice(0, 500);
  const defaultProjectIg = `En este proyecto se han aceptado imágenes generadas con estilo editorial, humano y cálido como referencia visual del proyecto.${hintExtra}`
    .trim()
    .slice(0, 500);
  const defaultProjectPh = `Las imágenes finales editadas en Photoroom consolidan criterio visual para piezas posteriores.${hintExtra}`.trim().slice(0, 500);
  const defaultProjectVid = `Los frames y pósters de vídeo aportan referencia visual reutilizable en el proyecto.${hintExtra}`.trim().slice(0, 500);

  const defaultProject = igSignal ? defaultProjectIg : phOnly ? defaultProjectPh : vidSignal ? defaultProjectVid : defaultProjectGeneric;
  const projectValue =
    patternLine && patternLine.length > 24
      ? `En este proyecto se han usado imágenes con ${patternLine
          .replace(/^Esta pieza usa imágenes\s*/i, "")
          .replace(/\.$/, "")} como parte de la dirección visual.${hintExtra}`
          .trim()
          .slice(0, 500)
      : defaultProject;

  const designerUsed = digest.uploadsByNode.DESIGNER?.used ?? 0;
  const visualMemory: LearningCandidate = {
    type: "VISUAL_MEMORY",
    scope: "PROJECT",
    topic: "visual_pattern",
    value: visualValue,
    confidence:
      designerUsed > 0 || digest.userUploadUsed > 0
        ? patternLine
          ? Math.min(0.9, 0.78 + 0.06)
          : 0.78
        : patternLine
          ? Math.min(0.85, 0.62 + 0.06)
          : 0.62,
    reasoning:
      patternLine
        ? "Análisis visual agregado (mock o visión) sobre telemetría de nodos visuales en exportación; revisión humana requerida."
            .slice(0, 150)
        : "Exportación con telemetría de imágenes; no se modifica el ADN hasta que confirmes.".slice(0, 150),
    evidence: { ...evidenceBase },
  };

  const projectMemory: LearningCandidate = {
    type: "PROJECT_MEMORY",
    scope: "PROJECT",
    topic: "project_visual_node_signals",
    value: projectValue,
    confidence: patternLine ? Math.min(0.82, 0.58 + 0.08) : 0.58,
    reasoning: "Misma señal acotada al proyecto; revisión recomendada antes de promover a ADN o memoria global.".slice(0, 150),
    evidence: { ...evidenceBase },
  };

  const out: LearningCandidate[] = [visualMemory, projectMemory];

  const multiKinds = (["DESIGNER", "PHOTOROOM", "IMAGE_GENERATOR", "VIDEO_NODE"] as const).filter((t) =>
    digest.nodeTypesPresent.includes(t),
  );
  if (multiKinds.length >= 2 && patternLine && patternLine.length > 24) {
    out.push({
      type: "PROJECT_MEMORY",
      scope: "PROJECT",
      topic: "visual_direction",
      value: "Varios nodos visuales refuerzan una dirección visual común en este proyecto.".trim().slice(0, 500),
      confidence: Math.min(0.72, 0.48 + multiKinds.length * 0.05),
      reasoning:
        "Señales de exportación convergentes desde más de un nodo visual; revisión humana antes de promover.".slice(
          0,
          150,
        ),
      evidence: {
        ...evidenceBase,
        eventCounts: { ...baseEventCounts, visual_multi_node_count: multiKinds.length },
      },
    });
  }

  if (shouldOfferCautiousUploadOverSuggestionsLoose(digest, nodeTypes, acceptedImageSlots, exportFlushCount)) {
    out.push({
      type: "CREATIVE_PREFERENCE",
      scope: "PROJECT",
      topic: "image_preference",
      value: "En este proyecto se han preferido imágenes propias frente a sugerencias visuales automáticas.".trim().slice(0, 500),
      confidence: 0.42,
      reasoning:
        "Hubo sugerencias de imagen en pantalla sin aceptación registrada y uso de subidas propias; interpretación cautelosa.".slice(0, 150),
      evidence: {
        ...evidenceBase,
        eventCounts: { ...baseEventCounts },
      },
    });
  }

  return out;
}

/** @deprecated Usar `createVisualLearningCandidatesFromVisualSignals`. */
export const buildDesignerVisualLearningCandidates = createVisualLearningCandidatesFromVisualSignals;
