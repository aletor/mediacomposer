import { describe, expect, it } from "vitest";
import {
  defaultProjectAssets,
  normalizeProjectAssets,
  type BrainVisualImageAnalysis,
  type ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import {
  buildBrainVisualPromptContext,
  composeBrainDesignerImagePrompt,
  composeBrainVisualStyleSlotPrompt,
} from "./build-brain-visual-prompt-context";

function trustedAnalysis(over: Partial<BrainVisualImageAnalysis>): BrainVisualImageAnalysis {
  return {
    id: "a1",
    sourceAssetId: "s1",
    sourceKind: "project_asset",
    subject: "",
    subjectTags: [],
    visualStyle: [],
    mood: [],
    colorPalette: { dominant: [], secondary: [] },
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
    fallbackUsed: false,
    ...over,
  };
}

function withAnalyses(base: ProjectAssetsMetadata, analyses: BrainVisualImageAnalysis[]): ProjectAssetsMetadata {
  return normalizeProjectAssets({
    ...base,
    strategy: {
      ...base.strategy,
      visualReferenceAnalysis: {
        analyses,
        lastAnalyzedAt: new Date().toISOString(),
      },
    },
  });
}

describe("buildBrainVisualPromptContext", () => {
  it("prioriza análisis remoto fiable sobre copy general en la dirección visual", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      knowledge: {
        ...base.knowledge,
        corporateContext:
          "Creative OS unifica el workflow SaaS con dashboards azules y equipos corporativos sonriendo a la pantalla.",
      },
      strategy: {
        ...base.strategy,
        funnelMessages: [{ id: "1", stage: "awareness", text: "Creative OS para escalar tu startup" }],
        visualReferenceAnalysis: {
          analyses: [
            trustedAnalysis({
              id: "v1",
              subjectTags: ["libros", "vinilos", "mesa de trabajo", "madera", "luz natural"],
              visualStyle: ["editorial documental", "lifestyle íntimo"],
              mood: ["cálido", "humano"],
              composition: ["encuadre natural en interior real"],
              graphicStyle: "madera clara, texturas táctiles",
            }),
          ],
        },
      },
    });
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.textOnlyGeneration).toBe(false);
    const blob = `${ctx.visualDirection} ${ctx.subjects.join(" ")}`.toLowerCase();
    expect(blob).toMatch(/libros|vinilos/);
    expect(blob).not.toMatch(/dashboards azules/);
    expect(blob).not.toMatch(/creative os/);
  });

  it("conserva sujetos concretos de referencias (libros, vinilos, madera, luz natural)", () => {
    const base = defaultProjectAssets();
    const assets = withAnalyses(base, [
      trustedAnalysis({
        id: "x",
        classification: "PROJECT_VISUAL_REFERENCE",
        subjectTags: ["libros", "vinilos", "portátil", "bocetos", "luz natural", "madera cálida"],
        mood: ["calma editorial"],
      }),
    ]);
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.subjects.join(" ").toLowerCase()).toMatch(/libros/);
    expect(ctx.subjects.join(" ").toLowerCase()).toMatch(/vinilos/);
    expect(ctx.lighting.join(" ").toLowerCase()).toMatch(/luz natural/);
  });

  it("marca textOnlyGeneration cuando no hay análisis remotos fiables", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets(base);
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.textOnlyGeneration).toBe(true);
    expect(ctx.visualContextWeak).toBe(true);
    expect(ctx.visualReferenceAnalysisRealCount).toBe(0);
  });

  it("confirmedVisualPatterns aparecen al inicio de la dirección visual", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      strategy: {
        ...base.strategy,
        visualReferenceAnalysis: {
          analyses: [],
          confirmedVisualPatterns: ["libros", "vinilos", "interior cálido"],
        },
      },
    });
    const ctx = buildBrainVisualPromptContext(assets);
    expect(ctx.visualDirection.toLowerCase()).toMatch(/prioridad 1/);
    expect(ctx.visualDirection.toLowerCase()).toMatch(/libros/);
    expect(ctx.sources.confirmedUserVisualDna).toBe(true);
    expect(ctx.sourceTier).toBe("confirmed");
  });

  it("con ADN confirmado el corporate no entra en el bloque A del prompt compuesto", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      knowledge: {
        ...base.knowledge,
        corporateContext: "SaaS futurista con dashboards azules y equipo corporativo sonriendo.",
      },
      strategy: {
        ...base.strategy,
        visualReferenceAnalysis: {
          analyses: [],
          confirmedVisualPatterns: ["mesa con bocetos", "madera natural"],
        },
      },
    });
    const ctx = buildBrainVisualPromptContext(assets);
    const { prompt } = composeBrainDesignerImagePrompt({
      context: ctx,
      pieceMessage: "Unificar el flujo creativo",
      pageContext: "hero",
      brandColorLine: "c",
      logoBlock: "sin logo",
    });
    const idxA = prompt.indexOf("A — DIRECCIÓN VISUAL");
    const idxCorp = prompt.indexOf("SaaS futurista");
    expect(idxCorp).toBeGreaterThan(idxA);
    expect(ctx.visualDirection.toLowerCase()).not.toMatch(/dashboards azules/);
  });

  it("incluye lista visualAvoid con términos de negative visual", () => {
    const ctx = buildBrainVisualPromptContext(defaultProjectAssets());
    const joined = ctx.visualAvoid.join(" ").toLowerCase();
    expect(joined).toMatch(/stock corporate/);
    expect(joined).toMatch(/saas/);
  });
});

describe("composeBrainDesignerImagePrompt", () => {
  it("incluye bloque EVITAR con negative prompt", () => {
    const ctx = buildBrainVisualPromptContext(defaultProjectAssets());
    const { prompt } = composeBrainDesignerImagePrompt({
      context: ctx,
      pieceMessage: "Creative OS unifica el proceso creativo",
      pageContext: "página de producto",
      brandColorLine: "Colores: #111, #222",
      logoBlock: "Sin logo",
    });
    expect(prompt).toMatch(/EVITAR/i);
    expect(prompt).toMatch(/stock corporate/i);
    expect(prompt).toMatch(/A — DIRECCIÓN VISUAL/i);
    expect(prompt).toMatch(/B — MENSAJE DE LA PIEZA/i);
  });
});

describe("composeBrainVisualStyleSlotPrompt", () => {
  it("usa VisualPromptContext en el bloque A", () => {
    const base = defaultProjectAssets();
    const assets = withAnalyses(base, [
      trustedAnalysis({
        subjectTags: ["persona creativa", "interior real"],
        visualStyle: ["documental"],
      }),
    ]);
    const ctx = buildBrainVisualPromptContext(assets, { slotKey: "environment" });
    const prompt = composeBrainVisualStyleSlotPrompt({
      context: ctx,
      slotKey: "environment",
      slotDescription: "Espacio de trabajo creativo",
      colorPrimary: "#000",
      colorSecondary: "#fff",
      colorAccent: "#f00",
    });
    expect(prompt).toMatch(/A — DIRECCIÓN VISUAL/i);
    expect(prompt.toLowerCase()).toMatch(/persona creativa|interior real|documental/);
  });
});
