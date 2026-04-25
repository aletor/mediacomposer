import { describe, expect, it } from "vitest";
import { defaultProjectAssets, type BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import {
  buildBrainBrandSummary,
  buildSpanishTrustedVisualNarrative,
  filterLegacyFunnelMessages,
  isLegacyDemoFunnelText,
} from "./brain-brand-summary";
import { aggregateVisualPatterns } from "./brain-visual-analysis";

describe("isLegacyDemoFunnelText", () => {
  it("detecta copy demo Foldder", () => {
    expect(isLegacyDemoFunnelText("Discover the Creative OS that transforms your workflow.")).toBe(true);
    expect(isLegacyDemoFunnelText("Hola, somos una marca real de café.")).toBe(false);
  });
});

describe("filterLegacyFunnelMessages", () => {
  it("conserva mensajes no demo", () => {
    const msgs = [
      { id: "a", stage: "awareness" as const, text: "Discover the Creative OS that transforms your workflow." },
      { id: "b", stage: "consideration" as const, text: "Nuestro tono es cercano y claro." },
    ];
    const out = filterLegacyFunnelMessages(msgs);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("cercano");
  });
});

describe("buildBrainBrandSummary", () => {
  it("marca mensajes embudo como Legacy si solo queda demo", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      strategy: {
        ...base.strategy,
        funnelMessages: [{ id: "x", stage: "awareness", text: "Explore how Foldder unifies the creative process." }],
        languageTraits: ["Professional", "Collaborative", "Innovative"],
      },
    });
    const r = buildBrainBrandSummary(assets);
    expect(r.messages.badge).toBe("Legacy filtrado");
    expect(r.tone.badge).toBe("Legacy filtrado");
    const inv = r.diagnostics.inventory as { funnelLegacyExcluded?: number };
    expect(inv.funnelLegacyExcluded).toBe(1);
  });

  it("usa narrativa visual en español solo con visión remota de confianza", () => {
    const analyses: BrainVisualImageAnalysis[] = [
      {
        id: "1",
        sourceAssetId: "img-1",
        sourceKind: "knowledge_document",
        subject: "persona, portátil",
        subjectTags: ["persona creativa", "portátil", "bocetos", "mesa de trabajo"],
        visualStyle: ["editorial", "documental"],
        mood: ["concentración", "cálida"],
        colorPalette: { dominant: ["#111"], secondary: [] },
        composition: ["plano medio", "luz lateral suave"],
        people: "Equipo en mesa con materiales",
        clothingStyle: "casual premium",
        graphicStyle: "papel, digital",
        brandSignals: [],
        possibleUse: [],
        classification: "PROJECT_VISUAL_REFERENCE",
        coherenceScore: 0.8,
        analyzedAt: "2026-01-01T00:00:00.000Z",
        analysisStatus: "analyzed",
        visionProviderId: "gemini-vision",
        fallbackUsed: false,
        visualMessage: ["proceso creativo en curso"],
      },
    ];
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      strategy: {
        ...base.strategy,
        funnelMessages: [],
        languageTraits: [],
        visualReferenceAnalysis: { analyses },
      },
    });
    const r = buildBrainBrandSummary(assets);
    expect(r.visualDirection.badge).toBe("Visual real");
    expect(r.visualDirection.value).toContain("visión remota");
    expect(r.visualDirection.value.toLowerCase()).toContain("persona creativa");
    const agg = aggregateVisualPatterns(analyses);
    const nar = buildSpanishTrustedVisualNarrative(analyses, agg);
    expect(nar.text.length).toBeGreaterThan(80);
  });

  it("mensajes vacíos usan tier pendiente / sin consolidar, no como ADN confirmado", () => {
    const base = defaultProjectAssets();
    const assets = normalizeProjectAssets({
      ...base,
      strategy: { ...base.strategy, funnelMessages: [], languageTraits: [] },
    });
    const r = buildBrainBrandSummary(assets);
    expect(r.messages.sourceTier).toBe("default");
    expect(r.messages.badge).toMatch(/Sin consolidar|Default|Pendiente/i);
  });
});
