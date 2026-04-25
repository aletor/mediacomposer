import { describe, expect, it } from "vitest";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import type { TelemetryBatch } from "./brain-telemetry";
import {
  collectVisualNodeEvidenceDigest,
  createVisualLearningCandidatesFromVisualSignals,
} from "./brain-visual-node-signals";

function telemetryBatch(
  nodeType: TelemetryBatch["nodeType"],
  events: TelemetryBatch["events"],
  flush: TelemetryBatch["flushReason"] = "export",
  batchId = "batch-1",
): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId,
    sessionId: "sess-1",
    projectId: "p1",
    nodeId: "node-telemetry",
    capturedAt: ts,
    createdAt: ts,
    flushReason: flush,
    nodeType,
    events,
  };
}

describe("collectVisualNodeEvidenceDigest", () => {
  it("cuenta importaciones y señales Photoroom por tipo de evento", () => {
    const ts = new Date().toISOString();
    const digest = collectVisualNodeEvidenceDigest([
      telemetryBatch("PHOTOROOM", [
        { kind: "IMAGE_IMPORTED", ts, source: "USER_UPLOAD", fileName: "in.png" },
        { kind: "IMAGE_EDITED", ts, fileName: "in.png", imageFingerprint: "fp1" },
        { kind: "BACKGROUND_REMOVED", ts, fileName: "in.png", imageFingerprint: "fp1" },
        { kind: "STYLE_APPLIED", ts, fileName: "in.png", imageFingerprint: "fp1" },
        { kind: "IMAGE_EXPORTED", ts, fileName: "out.png", assetId: "a-exp" },
      ]),
    ]);
    expect(digest.photoroomImageImported).toBe(1);
    expect(digest.photoroomImageEdited).toBe(1);
    expect(digest.photoroomBackgroundRemoved).toBe(1);
    expect(digest.photoroomStyleApplied).toBe(1);
    expect(digest.photoroomImageExported).toBe(1);
  });
});

describe("createVisualLearningCandidatesFromVisualSignals", () => {
  it("Photoroom solo emite VISUAL_MEMORY y PROJECT_MEMORY con copy Photoroom", () => {
    const ts = new Date().toISOString();
    const batches = [
      telemetryBatch("PHOTOROOM", [
        { kind: "IMAGE_EXPORTED", ts, fileName: "final.png", assetId: "x1" },
        { kind: "CONTENT_EXPORTED", ts },
      ]),
    ];
    const digest = collectVisualNodeEvidenceDigest(batches);
    const cands = createVisualLearningCandidatesFromVisualSignals(
      "ph-node-1",
      digest,
      undefined,
      ["PHOTOROOM"],
      0,
      1,
    );
    expect(cands.length).toBeGreaterThanOrEqual(2);
    expect(cands.some((c) => c.type === "VISUAL_MEMORY" && c.value.includes("Photoroom"))).toBe(true);
    expect(cands.some((c) => c.type === "PROJECT_MEMORY" && c.value.includes("Photoroom"))).toBe(true);
    expect(cands.every((c) => c.evidence.primarySourceNodeId === "ph-node-1")).toBe(true);
  });

  it("Image Generator usa copy de imágenes generadas/aceptadas", () => {
    const ts = new Date().toISOString();
    const batches = [
      telemetryBatch("IMAGE_GENERATOR", [
        { kind: "IMAGE_GENERATED", ts, source: "GENERATED_IMAGE", fileName: "gen.png", imageFingerprint: "g1" },
        { kind: "CONTENT_EXPORTED", ts },
      ]),
    ];
    const digest = collectVisualNodeEvidenceDigest(batches);
    const cands = createVisualLearningCandidatesFromVisualSignals(
      "ig-node-1",
      digest,
      undefined,
      ["IMAGE_GENERATOR"],
      0,
      1,
    );
    expect(cands.some((c) => c.type === "VISUAL_MEMORY" && c.value.includes("generadas"))).toBe(true);
    expect(cands.some((c) => c.type === "PROJECT_MEMORY" && c.value.includes("editorial"))).toBe(true);
    expect(cands.every((c) => c.evidence.primarySourceNodeId === "ig-node-1")).toBe(true);
  });

  it("con patrón agregado y dos nodos visuales añade candidato multi-nodo", () => {
    const ts = new Date().toISOString();
    const batches = [
      telemetryBatch(
        "DESIGNER",
        [
          { kind: "IMAGE_USED", ts, source: "USER_UPLOAD", fileName: "d.png" },
          { kind: "CONTENT_EXPORTED", ts, designer: { exportImagesSummary: { imageFramesWithContent: 1, looseImageObjects: 0 } } },
        ],
        "export",
        "b-d",
      ),
      telemetryBatch(
        "PHOTOROOM",
        [{ kind: "IMAGE_EXPORTED", ts, fileName: "p.png", assetId: "p1" }],
        "export",
        "b-p",
      ),
    ];
    const digest = collectVisualNodeEvidenceDigest(batches);
    const analyses: BrainVisualImageAnalysis[] = [
      {
        id: "1",
        sourceAssetId: "1",
        sourceKind: "designer_image",
        subject: "equipo en estudio con luz natural",
        visualStyle: ["editorial", "cálido", "humano"],
        mood: ["cercanía"],
        colorPalette: { dominant: ["#ccc"], secondary: [] },
        composition: ["centro"],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.85,
        analyzedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        sourceAssetId: "2",
        sourceKind: "designer_image",
        subject: "detalle de producto sobre mesa de madera",
        visualStyle: ["editorial", "artesanal"],
        mood: ["calma"],
        colorPalette: { dominant: ["#000"], secondary: [] },
        composition: ["tercio"],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.82,
        analyzedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const cands = createVisualLearningCandidatesFromVisualSignals(
      "designer-node-9",
      digest,
      undefined,
      ["DESIGNER", "PHOTOROOM"],
      0,
      1,
      analyses,
    );
    const multi = cands.find((c) => c.topic === "visual_direction" && c.value.includes("Varios nodos visuales"));
    expect(multi).toBeDefined();
    expect(multi?.value).toContain("Varios nodos visuales");
    expect(cands.filter((c) => c.topic === "visual_direction" && c.type === "PROJECT_MEMORY").length).toBe(1);
  });

  it("no mezcla primarySourceNodeId entre dos exportaciones de nodos distintos", () => {
    const ts = new Date().toISOString();
    const digestA = collectVisualNodeEvidenceDigest([
      telemetryBatch("PHOTOROOM", [{ kind: "IMAGE_EXPORTED", ts, fileName: "a.png", assetId: "a" }], "export", "1"),
    ]);
    const digestB = collectVisualNodeEvidenceDigest([
      telemetryBatch("PHOTOROOM", [{ kind: "IMAGE_EXPORTED", ts, fileName: "b.png", assetId: "b" }], "export", "2"),
    ]);
    const ca = createVisualLearningCandidatesFromVisualSignals("node-a", digestA, undefined, ["PHOTOROOM"], 0, 1);
    const cb = createVisualLearningCandidatesFromVisualSignals("node-b", digestB, undefined, ["PHOTOROOM"], 0, 1);
    expect(ca[0]?.evidence.primarySourceNodeId).toBe("node-a");
    expect(cb[0]?.evidence.primarySourceNodeId).toBe("node-b");
  });
});
