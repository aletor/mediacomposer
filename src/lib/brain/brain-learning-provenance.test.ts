import { describe, expect, it } from "vitest";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import {
  BRAIN_VISION_PROVENANCE_EVENT_KEY,
  computeBrainVisionProvenanceKeyFromAnalyses,
  countVisualImageAnalysisDisposition,
  getPendingLearningProvenanceUi,
} from "./brain-learning-provenance";
import type { StoredLearningCandidate } from "./learning-candidate-schema";

describe("countVisualImageAnalysisDisposition", () => {
  it("separa visión remota fiable de fallback/mock", () => {
    const analyses: BrainVisualImageAnalysis[] = [
      {
        id: "1",
        sourceAssetId: "a",
        sourceKind: "knowledge_document",
        subject: "s",
        visualStyle: [],
        mood: [],
        colorPalette: { dominant: [], secondary: [] },
        composition: [],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.7,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        analysisStatus: "analyzed",
        visionProviderId: "gemini-vision",
        fallbackUsed: false,
      },
      {
        id: "2",
        sourceAssetId: "b",
        sourceKind: "knowledge_document",
        subject: "s",
        visualStyle: [],
        mood: [],
        colorPalette: { dominant: [], secondary: [] },
        composition: [],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.5,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        analysisStatus: "analyzed",
        visionProviderId: "mock",
        fallbackUsed: true,
      },
      {
        id: "3",
        sourceAssetId: "c",
        sourceKind: "knowledge_document",
        subject: "s",
        visualStyle: [],
        mood: [],
        colorPalette: { dominant: [], secondary: [] },
        composition: [],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.5,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        analysisStatus: "failed",
      },
    ];
    const c = countVisualImageAnalysisDisposition(analyses);
    expect(c.realRemoteAnalyzed).toBe(1);
    expect(c.fallbackOrMockAnalyzed).toBe(1);
    expect(c.failed).toBe(1);
  });
});

describe("computeBrainVisionProvenanceKeyFromAnalyses", () => {
  it("detecta mezcla real + fallback", () => {
    const analyses: BrainVisualImageAnalysis[] = [
      {
        id: "1",
        sourceAssetId: "a",
        sourceKind: "knowledge_document",
        subject: "s",
        visualStyle: [],
        mood: [],
        colorPalette: { dominant: [], secondary: [] },
        composition: [],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.7,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        analysisStatus: "analyzed",
        visionProviderId: "gemini-vision",
        fallbackUsed: false,
      },
      {
        id: "2",
        sourceAssetId: "b",
        sourceKind: "knowledge_document",
        subject: "s",
        visualStyle: [],
        mood: [],
        colorPalette: { dominant: [], secondary: [] },
        composition: [],
        people: "",
        clothingStyle: "",
        graphicStyle: "",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.5,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        analysisStatus: "analyzed",
        visionProviderId: "mock",
      },
    ];
    expect(computeBrainVisionProvenanceKeyFromAnalyses(analyses)).toBe("real_with_fallback");
  });
});

describe("getPendingLearningProvenanceUi", () => {
  it("lee brain_vision_provenance en visual_reference", () => {
    const row = {
      id: "1",
      projectId: "p",
      status: "PENDING_REVIEW" as const,
      sourceSessionIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      candidate: {
        type: "VISUAL_MEMORY" as const,
        scope: "PROJECT" as const,
        topic: "visual_direction",
        value: "x",
        confidence: 0.5,
        reasoning: "r",
        evidence: {
          sourceNodeIds: ["brain:visual_references"],
          sourceNodeTypes: ["brain_studio"],
          evidenceSource: "visual_reference" as const,
          eventCounts: { [BRAIN_VISION_PROVENANCE_EVENT_KEY]: "real_gemini" },
        },
      },
    } satisfies StoredLearningCandidate;
    expect(getPendingLearningProvenanceUi(row).badge).toContain("Gemini");
  });
});
