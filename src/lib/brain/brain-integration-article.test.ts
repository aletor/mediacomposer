import { describe, expect, it } from "vitest";
import type { TelemetryBatch } from "./brain-telemetry";
import { BrainService } from "./brain-service";
import { MockBrainLearningExtractionLlm, TelemetryProcessor } from "./telemetry-processor";

/** Nodo artículos: sugerencias, ignore, texto final y export/publicación. */
function articleWriterBatch(): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId: "article-int-1",
    sessionId: "art-sess-1",
    projectId: "proj-art",
    nodeId: "node-art",
    capturedAt: ts,
    createdAt: ts,
    flushReason: "export",
    nodeType: "ARTICLE_WRITER",
    events: [
      {
        kind: "SUGGESTION_SHOWN",
        ts,
        suggestionId: "title:1",
        article: { title: "Título sugerido A" },
      },
      {
        kind: "SUGGESTION_IGNORED",
        ts,
        suggestionId: "title:1",
        article: { title: "Título sugerido A" },
      },
      {
        kind: "TEXT_FINALIZED",
        ts,
        textPreview: "Párrafo final redactado a mano.",
        article: { tone: "técnico", audience: "B2B" },
      },
      {
        kind: "CONTENT_EXPORTED",
        ts,
        exportFormat: "md",
        article: { publishedVersion: true, topic: "IA creativa" },
      },
    ],
  };
}

describe("Integración ARTICLE_WRITER → TelemetryProcessor", () => {
  it("agrega con nodeType ARTICLE_WRITER y permite aprendizajes de tono/tema vía mock", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "proj-art",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const { stored, aggregated } = await proc.processStreamEvent({
      projectId: "proj-art",
      workspaceId: "__root__",
      nodeId: "node-art",
      receivedAt: new Date().toISOString(),
      batches: [articleWriterBatch()],
    });
    expect(stored).toBeGreaterThan(0);
    expect(aggregated.nodeTypes).toContain("ARTICLE_WRITER");
    expect(aggregated.eventKindCounts.TEXT_FINALIZED).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("proj-art");
    expect(pending.every((p) => p.telemetryNodeType === "ARTICLE_WRITER")).toBe(true);
  });
});
