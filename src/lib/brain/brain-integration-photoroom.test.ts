import { describe, expect, it } from "vitest";
import type { TelemetryBatch } from "./brain-telemetry";
import { BrainService } from "./brain-service";
import { MockBrainLearningExtractionLlm, TelemetryProcessor } from "./telemetry-processor";

/** Lote tipo estudio Photoroom / retoque: imagen, color, estilo y export. */
function photoroomBatch(): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId: "photoroom-int-1",
    sessionId: "pr-sess-1",
    projectId: "proj-pr",
    nodeId: "node-pr",
    capturedAt: ts,
    createdAt: ts,
    flushReason: "export",
    nodeType: "PHOTOROOM",
    events: [
      { kind: "IMAGE_EDITED", ts, photoroom: { backgroundRemoved: true } },
      { kind: "COLOR_USED", ts, colorHex: "#112233" },
      { kind: "STYLE_APPLIED", ts, styleLabel: "matte" },
      {
        kind: "CONTENT_EXPORTED",
        ts,
        exportFormat: "png",
        photoroom: { exportFormat: "png", finalImageAnalysis: "producto centrado" },
      },
    ],
  };
}

describe("Integración Photoroom → TelemetryProcessor", () => {
  it("usa nodeType PHOTOROOM y produce candidatos (mock incluye CREATIVE_PREFERENCE / PROJECT_MEMORY)", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "proj-pr",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const { stored, aggregated } = await proc.processStreamEvent({
      projectId: "proj-pr",
      workspaceId: "__root__",
      nodeId: "node-pr",
      receivedAt: new Date().toISOString(),
      batches: [photoroomBatch()],
    });
    expect(stored).toBeGreaterThan(0);
    expect(aggregated.nodeTypes).toContain("PHOTOROOM");
    expect(aggregated.eventKindCounts.IMAGE_EDITED).toBeGreaterThan(0);
    const pending = await store.listPendingLearnings("proj-pr");
    expect(pending.every((p) => p.telemetryNodeType === "PHOTOROOM")).toBe(true);
    const types = new Set(pending.map((p) => p.candidate.type));
    /** El mock fijo no distingue VISUAL_MEMORY; validamos que el pipeline completa con tipos esperados del mock. */
    expect(types.has("CREATIVE_PREFERENCE") || types.has("PROJECT_MEMORY")).toBe(true);
  });
});
