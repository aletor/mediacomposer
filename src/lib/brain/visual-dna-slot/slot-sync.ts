import type { ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import { analysisEligibleForKnowledgeVisualDnaSlot } from "./analysis-eligible";
import {
  createPendingVisualDnaSlotFromKnowledgeDocument,
  createVisualDnaSlotFromImage,
  normalizeVisualDnaSlot,
  normalizeVisualDnaSlots,
} from "./normalize";
import type { VisualDnaSlot } from "./types";

/** IDs de documento cuyo slot se borró a mano; solo se conservan si el documento sigue en el pozo. */
export function normalizeVisualDnaSlotSuppressedSourceIds(
  raw: unknown,
  existingDocumentIds: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    if (!existingDocumentIds.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Imágenes de conocimiento con análisis listo y URL/data para visión, que aún no tienen slot.
 */
export function listKnowledgeImageRefsMissingVisualDnaSlot(assets: ProjectAssetsMetadata): Array<{
  ref: ReturnType<typeof collectVisualImageAssetRefs>[number];
  analysis: NonNullable<ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"]>["analyses"][number];
}> {
  const slots = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots);
  const byDoc = new Set(slots.map((s) => s.sourceDocumentId).filter(Boolean));
  const docIds = new Set(assets.knowledge.documents.map((d) => d.id));
  const suppressed = new Set(
    normalizeVisualDnaSlotSuppressedSourceIds(assets.strategy.visualDnaSlotSuppressedSourceIds, docIds),
  );
  const analyses = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const byAsset = new Map(analyses.map((a) => [a.sourceAssetId, a]));
  const refs = collectVisualImageAssetRefs(assets).filter((r) => r.sourceKind === "knowledge_document");
  const out: Array<{ ref: (typeof refs)[number]; analysis: (typeof analyses)[number] }> = [];
  for (const ref of refs) {
    if (!ref.imageUrlForVision?.trim()) continue;
    if (suppressed.has(ref.id)) continue;
    if (byDoc.has(ref.id)) continue;
    const a = byAsset.get(ref.id);
    if (!a || !analysisEligibleForKnowledgeVisualDnaSlot(a)) continue;
    out.push({ ref, analysis: a });
  }
  return out;
}

export function appendKnowledgeImageVisualDnaSlots(assets: ProjectAssetsMetadata): {
  nextSlots: VisualDnaSlot[];
  appended: VisualDnaSlot[];
} {
  const existing = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots);
  const missing = listKnowledgeImageRefsMissingVisualDnaSlot(assets);
  const appended: VisualDnaSlot[] = [];
  for (const { ref, analysis } of missing) {
    appended.push(
      createVisualDnaSlotFromImage({
        ref,
        analysis,
        brainMeta: assets.brainMeta,
      }),
    );
  }
  return { nextSlots: [...existing, ...appended], appended };
}

const PENDING_ANALYSIS_TEXTS = new Set([
  "preparando análisis visual…",
  "preparando analisis visual…",
  "preparando análisis visual...",
  "preparando analisis visual...",
  "cápsula visual pendiente de análisis.",
  "capsula visual pendiente de analisis.",
]);

function isPendingAnalysisText(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return PENDING_ANALYSIS_TEXTS.has(raw.trim().toLowerCase());
}

function hasSectionSignals(section: VisualDnaSlot["people"] | undefined): boolean {
  if (!section) return false;
  return Boolean(
    section.notes?.trim() ||
      section.same?.description?.trim() ||
      section.same?.prompt?.trim() ||
      section.same?.imageUrl?.trim() ||
      section.similar?.description?.trim() ||
      section.similar?.prompt?.trim() ||
      section.similar?.imageUrl?.trim(),
  );
}

function slotStillLooksLikePendingPlaceholder(slot: VisualDnaSlot): boolean {
  if (isPendingAnalysisText(slot.hero.description) || isPendingAnalysisText(slot.hero.conclusion)) return true;
  if (isPendingAnalysisText(slot.generalStyle.summary) || isPendingAnalysisText(slot.generalStyle.title)) return true;
  const hasPalette = slot.palette.dominantColors.some((color) => color.trim().length > 0);
  const hasStructuredSignals =
    hasSectionSignals(slot.people) ||
    hasSectionSignals(slot.objects) ||
    hasSectionSignals(slot.environments) ||
    hasSectionSignals(slot.textures);
  return !hasPalette && !hasStructuredSignals;
}

function mergeAnalyzedVisualDnaSlotIntoExisting(existing: VisualDnaSlot, analyzed: VisualDnaSlot): VisualDnaSlot {
  const hasExistingMosaic = Boolean(existing.mosaic.imageUrl?.trim() || existing.mosaic.s3Path?.trim());
  return (
    normalizeVisualDnaSlot({
      ...analyzed,
      id: existing.id,
      label: existing.label?.trim() || analyzed.label,
      createdAt: existing.createdAt || analyzed.createdAt,
      updatedAt: new Date().toISOString(),
      sourceImageId: existing.sourceImageId ?? analyzed.sourceImageId,
      sourceDocumentId: existing.sourceDocumentId ?? analyzed.sourceDocumentId,
      sourceImageUrl: analyzed.sourceImageUrl ?? existing.sourceImageUrl,
      sourceS3Path: analyzed.sourceS3Path ?? existing.sourceS3Path,
      status: hasExistingMosaic ? "ready" : existing.status === "generating" ? "generating" : analyzed.status,
      mosaic: {
        ...analyzed.mosaic,
        ...existing.mosaic,
      },
      lastGenerationPrompts: existing.lastGenerationPrompts ?? analyzed.lastGenerationPrompts,
      lastError: hasExistingMosaic ? undefined : existing.lastError,
      staleReasons: existing.staleReasons,
    }) ?? existing
  );
}

/**
 * Repara placeholders de Looks visuales cuando el análisis remoto ya existe.
 *
 * La subida crea un slot `pending` para dar feedback inmediato. Cuando luego llega
 * `visualReferenceAnalysis`, no debemos crear otro slot duplicado: debemos hidratar
 * el slot existente conservando id, mosaico y estado. Sin esto, la UI podía quedarse
 * eternamente en "Preparando análisis visual…" aunque el mosaico ya estuviera listo.
 */
export function upgradeAnalyzedKnowledgeImageVisualDnaSlots(assets: ProjectAssetsMetadata): {
  nextSlots: VisualDnaSlot[];
  upgraded: VisualDnaSlot[];
} {
  const existing = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots);
  const analyses = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const byAsset = new Map(analyses.map((a) => [a.sourceAssetId, a]));
  const refs = collectVisualImageAssetRefs(assets).filter((r) => r.sourceKind === "knowledge_document");
  const refById = new Map(refs.map((r) => [r.id, r]));
  const upgraded: VisualDnaSlot[] = [];
  const nextSlots = existing.map((slot) => {
    const docId = slot.sourceDocumentId?.trim();
    if (!docId) return slot;
    const ref = refById.get(docId);
    const analysis = byAsset.get(docId);
    if (!ref || !analysis || !analysisEligibleForKnowledgeVisualDnaSlot(analysis)) return slot;
    if (!slotStillLooksLikePendingPlaceholder(slot)) return slot;
    const analyzedSlot = createVisualDnaSlotFromImage({
      ref,
      analysis,
      brainMeta: assets.brainMeta,
    });
    const merged = mergeAnalyzedVisualDnaSlotIntoExisting(slot, analyzedSlot);
    upgraded.push(merged);
    return merged;
  });
  return { nextSlots, upgraded };
}

function isKnowledgeImageDocument(doc: ProjectAssetsMetadata["knowledge"]["documents"][number]): boolean {
  const mime = String(doc.mime || "").toLowerCase();
  return doc.type === "image" || doc.format === "image" || mime.startsWith("image/");
}

function isCapsuleSourceDocument(doc: ProjectAssetsMetadata["knowledge"]["documents"][number]): boolean {
  return doc.brainSourceScope === "capsule";
}

/**
 * Looks visuales necesita feedback inmediato: la imagen debe aparecer como cápsula
 * aunque el análisis remoto todavía esté en curso. Estos slots son placeholders
 * seguros: quedan `pending` y el sync solo los genera cuando existe análisis `analyzed`.
 */
export function appendPendingCapsuleImageVisualDnaSlots(assets: ProjectAssetsMetadata): {
  nextSlots: VisualDnaSlot[];
  appended: VisualDnaSlot[];
} {
  const existing = normalizeVisualDnaSlots(assets.strategy.visualDnaSlots);
  const byDoc = new Set(existing.map((s) => s.sourceDocumentId).filter(Boolean));
  const docIds = new Set(assets.knowledge.documents.map((d) => d.id));
  const suppressed = new Set(
    normalizeVisualDnaSlotSuppressedSourceIds(assets.strategy.visualDnaSlotSuppressedSourceIds, docIds),
  );
  const appended: VisualDnaSlot[] = [];
  for (const doc of assets.knowledge.documents) {
    if (!isCapsuleSourceDocument(doc)) continue;
    if (!isKnowledgeImageDocument(doc)) continue;
    if (suppressed.has(doc.id)) continue;
    if (byDoc.has(doc.id)) continue;
    appended.push(createPendingVisualDnaSlotFromKnowledgeDocument({ doc, brainMeta: assets.brainMeta }));
    byDoc.add(doc.id);
  }
  return { nextSlots: [...existing, ...appended], appended };
}
