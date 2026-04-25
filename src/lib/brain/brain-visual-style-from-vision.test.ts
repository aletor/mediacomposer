import { describe, expect, it } from "vitest";
import type { BrainVisualImageAnalysis, BrainVisualStyle } from "@/app/spaces/project-assets-metadata";
import { defaultBrainVisualStyle } from "@/app/spaces/project-assets-metadata";
import { buildVisualStyleFromVisionAnalyses, mergeVisualStyleWithVisionDerivedDescriptions } from "./brain-visual-style-from-vision";

function trustedRow(over: Partial<BrainVisualImageAnalysis>): BrainVisualImageAnalysis {
  return {
    id: "x1",
    sourceAssetId: "img-1",
    sourceKind: "knowledge_document",
    subject: "libros, vinilos",
    subjectTags: ["libros", "vinilos", "mesa de trabajo", "luz natural"],
    visualStyle: ["editorial", "documental"],
    mood: ["cálida", "íntima"],
    colorPalette: { dominant: ["madera", "ocre"], secondary: [], temperature: "", saturation: "", contrast: "" },
    composition: ["plano medio", "luz lateral"],
    people: "persona leyendo",
    clothingStyle: "casual",
    graphicStyle: "papel, textura",
    brandSignals: [],
    possibleUse: [],
    classification: "CORE_VISUAL_DNA",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "analyzed",
    visionProviderId: "gemini-vision",
    fallbackUsed: false,
    ...over,
  };
}

describe("buildVisualStyleFromVisionAnalyses", () => {
  it("devuelve null sin filas remotas fiables", () => {
    const mock = trustedRow({ visionProviderId: "mock", fallbackUsed: false });
    expect(buildVisualStyleFromVisionAnalyses([mock])).toBeNull();
  });

  it("genera descripciones con señales del agregado", () => {
    const vs = buildVisualStyleFromVisionAnalyses([trustedRow({})]);
    expect(vs).not.toBeNull();
    expect(vs!.protagonist.description).toContain("referencia");
    expect(vs!.protagonist.description.toLowerCase()).toContain("libros");
    expect(vs!.environment.description.length).toBeGreaterThan(20);
  });
});

describe("mergeVisualStyleWithVisionDerivedDescriptions", () => {
  it("no pisa slots manuales", () => {
    const prev: BrainVisualStyle = {
      ...defaultBrainVisualStyle(),
      protagonist: {
        ...defaultBrainVisualStyle().protagonist,
        description: "Mi texto fijo",
        source: "manual",
        imageUrl: "https://example.com/a.png",
      },
    };
    const derived = defaultBrainVisualStyle();
    derived.protagonist.description = "Derivado";
    const out = mergeVisualStyleWithVisionDerivedDescriptions(prev, derived);
    expect(out.protagonist.description).toBe("Mi texto fijo");
    expect(out.protagonist.imageUrl).toBe("https://example.com/a.png");
  });
});
