import { describe, expect, it } from "vitest";
import { defaultProjectAssets, normalizeProjectAssets, type ProjectAssetsMetadata } from "@/app/spaces/project-assets-metadata";
import { buildBrainRuntimeContext } from "@/lib/brain/brain-runtime-context";
import {
  appendKnowledgeImageVisualDnaSlots,
  appendPendingCapsuleImageVisualDnaSlots,
  listKnowledgeImageRefsMissingVisualDnaSlot,
  upgradeAnalyzedKnowledgeImageVisualDnaSlots,
} from "@/lib/brain/visual-dna-slot/slot-sync";
import {
  createVisualDnaSlotFromImage,
  markVisualDnaSlotStale,
  normalizeVisualDnaSlots,
  removeVisualDnaSlot,
  updateVisualDnaSlot,
} from "@/lib/brain/visual-dna-slot/normalize";
import type { BrainVisualAssetRef } from "@/lib/brain/brain-visual-analysis";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import {
  applyMosaicFailureToSlot,
  applyMosaicSuccessToSlot,
  generateVisualDnaSlotMosaic,
} from "@/lib/brain/visual-dna-slot/generate-mosaic";
import { buildVisualDnaSlotMosaicPayload } from "@/lib/brain/visual-dna-slot/mosaic-payload";

function baseKnowledgeImageAssets(): ProjectAssetsMetadata {
  const docId = "doc-img-1";
  const a: BrainVisualImageAnalysis = {
    id: "an-1",
    sourceAssetId: docId,
    sourceKind: "knowledge_document",
    subject: "Producto en mesa",
    visualStyle: ["minimal"],
    mood: ["cálido"],
    colorPalette: { dominant: ["#112233", "#445566", "#aabbcc"], secondary: [] },
    composition: ["centrado"],
    people: "no",
    clothingStyle: "",
    graphicStyle: "limpio",
    brandSignals: [],
    possibleUse: [],
    classification: "PROJECT_VISUAL_REFERENCE",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "analyzed",
    visionProviderId: "gemini-vision",
  };
  return normalizeProjectAssets({
    ...defaultProjectAssets(),
    knowledge: {
      ...defaultProjectAssets().knowledge,
      documents: [
        {
          id: docId,
          name: "foto.png",
          size: 1200,
          mime: "image/png",
          type: "image",
          format: "image",
          status: "Analizado",
          dataUrl: "data:image/png;base64,AAAA",
        },
      ],
    },
    strategy: {
      ...defaultProjectAssets().strategy,
      visualReferenceAnalysis: {
        analyses: [a],
        aggregated: {
          recurringStyles: [],
          dominantMoods: [],
          dominantPalette: ["#112233"],
          dominantSecondaryPalette: [],
          frequentSubjects: [],
          compositionNotes: [],
          peopleClothingNotes: [],
          graphicStyleNotes: [],
          implicitBrandMessages: [],
          narrativeSummary: "",
          countsByClassification: {},
          excludedFromVisualDnaCount: 0,
        },
      },
      safeCreativeRules: {
        schemaVersion: "1",
        visualAbstractionRules: ["No copiar la referencia literal"],
        imageGenerationAvoid: ["No logos de terceros"],
        writingClaimRules: [],
        brandSafetyRules: [],
        legalOrComplianceWarnings: [],
        canUse: [],
        shouldAvoid: [],
        doNotGenerate: ["No clonar imagen original"],
        evidence: [],
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

describe("VisualDnaSlot library", () => {
  it("crear un nuevo VisualDnaSlot no borra slots anteriores", () => {
    const assets = baseKnowledgeImageAssets();
    const { nextSlots, appended } = appendKnowledgeImageVisualDnaSlots(assets);
    expect(appended).toHaveLength(1);
    const assets2 = normalizeProjectAssets({
      ...assets,
      strategy: { ...assets.strategy, visualDnaSlots: nextSlots },
    });
    const secondDoc = "doc-img-2";
    const a2: BrainVisualImageAnalysis = {
      ...assets2.strategy.visualReferenceAnalysis!.analyses[0],
      id: "an-2",
      sourceAssetId: secondDoc,
    };
    const merged = normalizeProjectAssets({
      ...assets2,
      knowledge: {
        ...assets2.knowledge,
        documents: [
          ...assets2.knowledge.documents,
          {
            id: secondDoc,
            name: "foto2.png",
            size: 1200,
            mime: "image/png",
            type: "image",
            format: "image",
            status: "Analizado",
            dataUrl: "data:image/png;base64,BBBB",
          },
        ],
      },
      strategy: {
        ...assets2.strategy,
        visualReferenceAnalysis: {
          ...assets2.strategy.visualReferenceAnalysis!,
          analyses: [...assets2.strategy.visualReferenceAnalysis!.analyses, a2],
        },
      },
    });
    const { nextSlots: next2, appended: app2 } = appendKnowledgeImageVisualDnaSlots(merged);
    expect(app2).toHaveLength(1);
    expect(next2).toHaveLength(2);
    expect(next2.map((s) => s.sourceDocumentId).sort()).toEqual([secondDoc, "doc-img-1"].sort());
  });

  it("regenerar un slot actualiza solo ese slot (updateVisualDnaSlot)", () => {
    const s1 = createVisualDnaSlotFromImage({
      ref: { id: "a", name: "A", mime: "image/png", sourceKind: "knowledge_document", imageUrlForVision: "data:x" },
      analysis: baseKnowledgeImageAssets().strategy.visualReferenceAnalysis!.analyses[0],
    });
    const s2 = createVisualDnaSlotFromImage({
      ref: { id: "b", name: "B", mime: "image/png", sourceKind: "knowledge_document", imageUrlForVision: "data:y" },
      analysis: { ...baseKnowledgeImageAssets().strategy.visualReferenceAnalysis!.analyses[0], id: "x", sourceAssetId: "b" },
    });
    const list = normalizeVisualDnaSlots([s1, s2]);
    const updated = updateVisualDnaSlot(list, s1.id, { label: "Renamed", status: "ready" });
    expect(updated.find((s) => s.id === s1.id)?.label).toBe("Renamed");
    expect(updated.find((s) => s.id === s2.id)?.label).toBe(s2.label);
  });

  it("normalizeVisualDnaSlots conserva datos antiguos (ids y mosaico)", () => {
    const raw = [
      { id: "x", label: "L", createdAt: "2020-01-01T00:00:00.000Z", status: "ready", palette: { dominantColors: ["#fff"] }, hero: {}, people: {}, objects: {}, environments: {}, textures: {}, generalStyle: {}, mosaic: { imageUrl: "data:image/png;base64,ZZ" } },
    ];
    const n = normalizeVisualDnaSlots(raw);
    expect(n[0].mosaic.imageUrl).toContain("data:image");
    expect(n[0].id).toBe("x");
  });

  it("buildBrainRuntimeContext puede devolver selectedVisualDnaSlot y filtrar capa", () => {
    const assets = baseKnowledgeImageAssets();
    const { nextSlots } = appendKnowledgeImageVisualDnaSlots(assets);
    const withSlots = normalizeProjectAssets({
      ...assets,
      strategy: { ...assets.strategy, visualDnaSlots: nextSlots },
    });
    const slotId = nextSlots[0]!.id;
    const ctx = buildBrainRuntimeContext({
      assets: withSlots,
      targetNodeType: "nanoBanana",
      selectedVisualDnaSlotId: slotId,
      selectedVisualDnaLayer: "palette",
    });
    expect(ctx.visualDnaSlotsSummary?.length).toBeGreaterThan(0);
    expect(ctx.selectedVisualDnaSlot?.layer).toBe("palette");
    expect(ctx.selectedVisualDnaLayer).toBe("palette");
  });

  it("buildVisualDnaSlotMosaicPayload incluye digest de safeCreativeRules", () => {
    const assets = baseKnowledgeImageAssets();
    const ref: BrainVisualAssetRef = {
      id: "doc-img-1",
      name: "foto.png",
      mime: "image/png",
      sourceKind: "knowledge_document",
      imageUrlForVision: "data:image/png;base64,AAAA",
    };
    const row = { ref, analysis: assets.strategy.visualReferenceAnalysis!.analyses[0] };
    const pack = buildVisualDnaSlotMosaicPayload({
      slotId: "slot-1",
      sourceDocumentId: ref.id,
      row,
      aggregated: assets.strategy.visualReferenceAnalysis!.aggregated ?? null,
      safeCreativeRules: assets.strategy.safeCreativeRules,
      corporateContext: "Marca eco de café.",
    });
    expect(pack.prompt).toMatch(/No clonar imagen original|Reglas seguras del proyecto/i);
    expect(pack.safeRulesDigest.length).toBeGreaterThan(0);
  });

  it("si falla generación, el slot queda failed y los anteriores siguen ready", async () => {
    const assets = baseKnowledgeImageAssets();
    const s1 = createVisualDnaSlotFromImage({
      ref: { id: "doc-img-1", name: "A", mime: "image/png", sourceKind: "knowledge_document", imageUrlForVision: "data:x" },
      analysis: assets.strategy.visualReferenceAnalysis!.analyses[0],
    });
    const ready = applyMosaicSuccessToSlot(
      { ...s1, status: "generating" },
      {
        imageUrl: "data:image/png;base64,OK",
        mosaicPrompt: "p",
        diagnostics: {},
        safeRulesDigest: [],
      },
    );
    const s2 = createVisualDnaSlotFromImage({
      ref: { id: "b", name: "B", mime: "image/png", sourceKind: "knowledge_document", imageUrlForVision: "data:y" },
      analysis: { ...assets.strategy.visualReferenceAnalysis!.analyses[0], id: "z", sourceAssetId: "b" },
    });
    const failed = applyMosaicFailureToSlot({ ...s2, status: "generating" }, "API error");
    const list = normalizeVisualDnaSlots([ready, failed]);
    expect(list.find((s) => s.id === ready.id)?.status).toBe("ready");
    expect(list.find((s) => s.id === failed.id)?.status).toBe("failed");

    const row = { ref: ready.sourceDocumentId ? { id: ready.sourceDocumentId, name: "A", mime: "image/png", sourceKind: "knowledge_document" as const, imageUrlForVision: "data:x" } : (null as never), analysis: assets.strategy.visualReferenceAnalysis!.analyses[0] };
    const gen = await generateVisualDnaSlotMosaic({
      slot: ready,
      row: row as { ref: BrainVisualAssetRef; analysis: BrainVisualImageAnalysis },
      assets,
      generateImage: async () => ({ output: "" }),
    });
    expect(gen.ok).toBe(false);
  });

  it("appendKnowledgeImageVisualDnaSlots no crea slots con filas pending", () => {
    const assets = baseKnowledgeImageAssets();
    const pendingA = { ...assets.strategy.visualReferenceAnalysis!.analyses[0], analysisStatus: "pending" as const };
    const withPending = normalizeProjectAssets({
      ...assets,
      strategy: {
        ...assets.strategy,
        visualReferenceAnalysis: {
          ...assets.strategy.visualReferenceAnalysis!,
          analyses: [pendingA],
        },
      },
    });
    const { appended } = appendKnowledgeImageVisualDnaSlots(withPending);
    expect(appended).toHaveLength(0);
  });

  it("appendPendingCapsuleImageVisualDnaSlots crea un placeholder visible para Looks visuales", () => {
    const assets = normalizeProjectAssets({
      ...defaultProjectAssets(),
      knowledge: {
        ...defaultProjectAssets().knowledge,
        documents: [
          {
            id: "capsule-img-1",
            name: "look.jpg",
            size: 1200,
            mime: "image/jpeg",
            type: "image",
            format: "image",
            scope: "context",
            brainSourceScope: "capsule",
            status: "Subido",
            s3Path: "knowledge-files/look.jpg",
            uploadedAt: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    });
    const { nextSlots, appended } = appendPendingCapsuleImageVisualDnaSlots(assets);
    expect(appended).toHaveLength(1);
    expect(nextSlots[0]?.status).toBe("pending");
    expect(nextSlots[0]?.sourceDocumentId).toBe("capsule-img-1");
    expect(nextSlots[0]?.sourceS3Path).toBe("knowledge-files/look.jpg");
  });

  it("appendPendingCapsuleImageVisualDnaSlots no crea placeholders para imágenes de Proyecto", () => {
    const assets = normalizeProjectAssets({
      ...defaultProjectAssets(),
      knowledge: {
        ...defaultProjectAssets().knowledge,
        documents: [
          {
            id: "project-img-1",
            name: "project.jpg",
            size: 1200,
            mime: "image/jpeg",
            type: "image",
            format: "image",
            scope: "context",
            brainSourceScope: "project",
            status: "Subido",
            s3Path: "knowledge-files/project.jpg",
            uploadedAt: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    });
    expect(appendPendingCapsuleImageVisualDnaSlots(assets).appended).toHaveLength(0);
  });

  it("appendKnowledgeImageVisualDnaSlots no duplica una cápsula que ya tiene placeholder", () => {
    const assets = normalizeProjectAssets({
      ...baseKnowledgeImageAssets(),
      knowledge: {
        ...baseKnowledgeImageAssets().knowledge,
        documents: [
          {
            ...baseKnowledgeImageAssets().knowledge.documents[0],
            brainSourceScope: "capsule",
            scope: "context",
            s3Path: "knowledge-files/look.png",
          },
        ],
      },
    });
    const withPlaceholder = normalizeProjectAssets({
      ...assets,
      strategy: {
        ...assets.strategy,
        visualDnaSlots: appendPendingCapsuleImageVisualDnaSlots(assets).nextSlots,
      },
    });
    expect(appendKnowledgeImageVisualDnaSlots(withPlaceholder).appended).toHaveLength(0);
  });

  it("upgradeAnalyzedKnowledgeImageVisualDnaSlots hidrata placeholders sin perder mosaico", () => {
    const assets = normalizeProjectAssets({
      ...baseKnowledgeImageAssets(),
      knowledge: {
        ...baseKnowledgeImageAssets().knowledge,
        documents: [
          {
            ...baseKnowledgeImageAssets().knowledge.documents[0],
            brainSourceScope: "capsule",
            scope: "context",
            s3Path: "knowledge-files/look.png",
          },
        ],
      },
    });
    const placeholder = appendPendingCapsuleImageVisualDnaSlots(assets).appended[0];
    const withReadyMosaic = normalizeProjectAssets({
      ...assets,
      strategy: {
        ...assets.strategy,
        visualDnaSlots: [
          applyMosaicSuccessToSlot(placeholder, {
            imageUrl: "https://example.com/mosaic.png",
            s3Path: "knowledge-files/mosaic.png",
            mosaicPrompt: "mosaic prompt",
            safeRulesDigest: [],
          }),
        ],
      },
    });

    const { nextSlots, upgraded } = upgradeAnalyzedKnowledgeImageVisualDnaSlots(withReadyMosaic);

    expect(upgraded).toHaveLength(1);
    expect(nextSlots).toHaveLength(1);
    expect(nextSlots[0].id).toBe(placeholder.id);
    expect(nextSlots[0].status).toBe("ready");
    expect(nextSlots[0].mosaic.s3Path).toBe("knowledge-files/mosaic.png");
    expect(nextSlots[0].hero.description).toContain("Producto en mesa");
    expect(nextSlots[0].generalStyle.summary).not.toContain("pendiente");
    expect(nextSlots[0].palette.dominantColors).toContain("#112233");
  });

  it("listKnowledgeImageRefsMissingVisualDnaSlot respeta slots existentes", () => {
    const assets = baseKnowledgeImageAssets();
    const { nextSlots } = appendKnowledgeImageVisualDnaSlots(assets);
    const withSlots = normalizeProjectAssets({
      ...assets,
      strategy: { ...assets.strategy, visualDnaSlots: nextSlots },
    });
    expect(listKnowledgeImageRefsMissingVisualDnaSlot(withSlots)).toHaveLength(0);
  });

  it("listKnowledgeImageRefsMissingVisualDnaSlot no recrea slot si el documento está en suprimidos", () => {
    const assets = baseKnowledgeImageAssets();
    const docId = assets.knowledge.documents[0].id;
    const noSlotButSuppressed = normalizeProjectAssets({
      ...assets,
      strategy: {
        ...assets.strategy,
        visualDnaSlots: [],
        visualDnaSlotSuppressedSourceIds: [docId],
      },
    });
    expect(listKnowledgeImageRefsMissingVisualDnaSlot(noSlotButSuppressed)).toHaveLength(0);
    expect(appendKnowledgeImageVisualDnaSlots(noSlotButSuppressed).appended).toHaveLength(0);
  });

  it("normalizeProjectAssets descarta suprimidos si el documento ya no está en el pozo", () => {
    const assets = baseKnowledgeImageAssets();
    const cleaned = normalizeProjectAssets({
      ...assets,
      knowledge: { ...assets.knowledge, documents: [] },
      strategy: {
        ...assets.strategy,
        visualDnaSlotSuppressedSourceIds: ["doc-img-1"],
      },
    });
    expect(cleaned.strategy.visualDnaSlotSuppressedSourceIds).toBeUndefined();
  });

  it("removeVisualDnaSlot elimina solo el id indicado", () => {
    const a = createVisualDnaSlotFromImage({
      ref: { id: "1", name: "A", mime: "image/png", sourceKind: "knowledge_document" },
      analysis: baseKnowledgeImageAssets().strategy.visualReferenceAnalysis!.analyses[0],
    });
    const b = createVisualDnaSlotFromImage({
      ref: { id: "2", name: "B", mime: "image/png", sourceKind: "knowledge_document" },
      analysis: { ...baseKnowledgeImageAssets().strategy.visualReferenceAnalysis!.analyses[0], sourceAssetId: "2" },
    });
    const out = removeVisualDnaSlot([a, b], a.id);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(b.id);
  });

  it("markVisualDnaSlotStale marca un solo slot", () => {
    const a = createVisualDnaSlotFromImage({
      ref: { id: "1", name: "A", mime: "image/png", sourceKind: "knowledge_document" },
      analysis: baseKnowledgeImageAssets().strategy.visualReferenceAnalysis!.analyses[0],
    });
    const b = createVisualDnaSlotFromImage({
      ref: { id: "2", name: "B", mime: "image/png", sourceKind: "knowledge_document" },
      analysis: { ...baseKnowledgeImageAssets().strategy.visualReferenceAnalysis!.analyses[0], sourceAssetId: "2" },
    });
    const out = markVisualDnaSlotStale([a, b], a.id, ["voice_changed"]);
    expect(out.find((s) => s.id === a.id)?.status).toBe("stale");
    expect(out.find((s) => s.id === b.id)?.status).toBe("pending");
  });
});
