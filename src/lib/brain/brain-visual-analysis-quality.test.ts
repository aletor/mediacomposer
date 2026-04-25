import { describe, expect, it } from "vitest";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import { validateVisualAnalysisSpecificity } from "./brain-visual-analysis-quality";

function base(over: Partial<BrainVisualImageAnalysis>): BrainVisualImageAnalysis {
  return {
    id: "1",
    sourceAssetId: "a1",
    sourceKind: "knowledge_document",
    subject: "",
    visualStyle: [],
    mood: [],
    colorPalette: { dominant: [], secondary: [], temperature: "", saturation: "", contrast: "" },
    composition: [],
    people: "",
    clothingStyle: "",
    graphicStyle: "",
    brandSignals: [],
    possibleUse: [],
    classification: "CORE_VISUAL_DNA",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "analyzed",
    visionProviderId: "gemini-vision",
    ...over,
  };
}

describe("validateVisualAnalysisSpecificity", () => {
  it("marca mock", () => {
    const a = base({ visionProviderId: "mock", fallbackUsed: false });
    expect(validateVisualAnalysisSpecificity(a)).toBe("mock");
  });

  it("marca failed", () => {
    const a = base({ analysisStatus: "failed" });
    expect(validateVisualAnalysisSpecificity(a)).toBe("failed");
  });

  it("marca too_generic si solo hay términos vagos", () => {
    const a = base({
      subjectTags: ["lifestyle", "minimalista", "calma", "personas", "moderno", "contemporáneo"],
      visualStyle: ["accesible"],
      mood: ["cercanía"],
    });
    expect(validateVisualAnalysisSpecificity(a)).toBe("too_generic");
  });

  it("marca specific con señales concretas", () => {
    const a = base({
      subjectTags: ["libros", "vinilos", "mesa de trabajo", "laptop", "madera", "luz natural"],
      visualStyle: ["editorial", "documental"],
      mood: [],
    });
    expect(validateVisualAnalysisSpecificity(a)).toBe("specific");
  });
});
