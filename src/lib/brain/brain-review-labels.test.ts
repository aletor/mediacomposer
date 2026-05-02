import { describe, expect, it } from "vitest";
import {
  formatLearningReviewExample,
  formatLearningReviewCardHeadline,
  formatLearningReviewReasoning,
  formatLearningReviewText,
  humanEvidenceBullets,
  stripLearningValueUiPrefixes,
} from "./brain-review-labels";
import { VISUAL_NODE_REVIEW_BUNDLE_KEY } from "./brain-visual-review-constants";
import type { StoredLearningCandidate } from "./learning-candidate-schema";

describe("stripLearningValueUiPrefixes", () => {
  it("quita prefijos de interfaz conocidos", () => {
    expect(stripLearningValueUiPrefixes("Brain ha detectado que Esta pieza usa X.")).toBe("Esta pieza usa X.");
    expect(stripLearningValueUiPrefixes("Parece que el tono es formal.")).toBe("el tono es formal.");
    expect(stripLearningValueUiPrefixes("El sistema ha detectado que Hay conflicto.")).toBe("Hay conflicto.");
  });

  it("encadena varios prefijos si hiciera falta", () => {
    expect(stripLearningValueUiPrefixes("Brain ha detectado que Parece que listo.")).toBe("listo.");
  });
});

describe("humanEvidenceBullets", () => {
  it("con señales Photoroom no menciona Designer ni IMAGE_IMPORTED genérico", () => {
    const row: StoredLearningCandidate = {
      id: "1",
      projectId: "p",
      telemetryNodeType: "PHOTOROOM",
      status: "PENDING_REVIEW",
      sourceSessionIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      candidate: {
        type: "VISUAL_MEMORY",
        scope: "PROJECT",
        topic: "visual_node_export_signals",
        value: "x",
        confidence: 0.5,
        reasoning: "r",
        evidence: {
          sourceNodeIds: ["n1"],
          sourceNodeTypes: ["PHOTOROOM"],
          primarySourceNodeId: "n1",
          evidenceSource: "telemetry",
          relatedArtifactKinds: ["Photoroom · Imagen exportada"],
          examples: ["Basado en: Photoroom · Imagen exportada · 0 imágenes importadas · 0 imágenes usadas"],
          eventCounts: {
            [VISUAL_NODE_REVIEW_BUNDLE_KEY]: 1,
            photoroom_image_exported: 1,
            photoroom_image_edited: 1,
            photoroom_background_removed: 1,
            photoroom_layers_used: 2,
            photoroom_color_used: 3,
          },
        },
      },
    };
    const bullets = humanEvidenceBullets(row);
    expect(bullets.some((b) => b.includes("Designer"))).toBe(false);
    expect(bullets.some((b) => b.includes("IMAGE_IMPORTED"))).toBe(false);
    expect(bullets.some((b) => b.includes("Photoroom") || b.includes("fondo eliminado"))).toBe(true);
  });
});

describe("formatLearningReviewCardHeadline", () => {
  it("añade el prefijo de producto al valor limpio", () => {
    expect(formatLearningReviewCardHeadline("Esta pieza usa imágenes propias.")).toBe(
      "Brain ha detectado que Esta pieza usa imágenes propias.",
    );
  });

  it("normaliza valores que aún llevan prefijo guardado", () => {
    expect(formatLearningReviewCardHeadline("Brain ha detectado que Duplicado.")).toBe("Brain ha detectado que Duplicado.");
  });

  it("traduce candidatos técnicos heredados a una enseñanza clara", () => {
    expect(formatLearningReviewText("Repeated manual changes to Brain length and tone presets in Designer.")).toBe(
      "sueles ajustar el tono y la longitud de las sugerencias de texto en Designer.",
    );
    expect(formatLearningReviewCardHeadline("Mixed accept/ignore on same text slots—contextual only, not a preference.")).toBe(
      "Brain ha detectado que hay señales mezcladas en las sugerencias de texto; por ahora conviene tratarlo como contexto puntual, no como una preferencia estable.",
    );
  });

  it("traduce razonamientos y ejemplos internos de telemetría", () => {
    expect(formatLearningReviewReasoning("Stronger signal from manualOverrideCounts than from ignored suggestions alone.")).toContain(
      "has ajustado manualmente",
    );
    expect(formatLearningReviewExample("manual:brain:lengthPreset")).toBe(
      "Cambiaste la longitud de una sugerencia de Brain.",
    );
  });
});
