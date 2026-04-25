import { describe, expect, it } from "vitest";
import type { TelemetryBatch } from "./brain-telemetry";
import { BrainService } from "./brain-service";
import { MockBrainLearningExtractionLlm, TelemetryProcessor } from "./telemetry-processor";

/**
 * Simula el patrón Designer + Brain: sugerencias, override manual y export PDF vectorial
 * (equivalente funcional a `DesignerStudio` + `useBrainNodeTelemetry`).
 */
function designerExportSessionBatch(): TelemetryBatch {
  const ts = new Date().toISOString();
  return {
    version: 2,
    batchId: "designer-int-1",
    sessionId: "designer-sess-1",
    projectId: "proj-designer",
    nodeId: "rf-node-designer",
    capturedAt: ts,
    createdAt: ts,
    flushReason: "export",
    nodeType: "DESIGNER",
    events: [
      { kind: "SUGGESTION_SHOWN", ts, suggestionId: "txt:hero:0" },
      { kind: "SUGGESTION_ACCEPTED", ts, suggestionId: "txt:hero:0", textPreview: "Titular aceptado" },
      { kind: "MANUAL_OVERRIDE", ts, fieldRef: "brain:tonePreset" },
      {
        kind: "CONTENT_EXPORTED",
        ts,
        exportFormat: "vector_pdf",
        designer: { pageExported: true, headlineUsed: true },
      },
    ],
  };
}

describe("Integración Designer → TelemetryProcessor", () => {
  it("genera candidatos pendientes con nodeType DESIGNER y señales coherentes", async () => {
    const store = new BrainService();
    store.seedStaticBrain({
      projectId: "proj-designer",
      workspaceId: "__root__",
      dna: { sectors: [], claims: [], palettes: [], typography: [], prohibitions: [] },
      preferences: { defaultCopyLength: "auto" },
    });
    const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), store);
    const { stored, aggregated } = await proc.processStreamEvent({
      projectId: "proj-designer",
      workspaceId: "__root__",
      nodeId: "rf-node-designer",
      receivedAt: new Date().toISOString(),
      batches: [designerExportSessionBatch()],
    });
    expect(stored).toBeGreaterThan(0);
    expect(aggregated.nodeTypes).toContain("DESIGNER");
    const pending = await store.listPendingLearnings("proj-designer");
    expect(pending.every((p) => p.telemetryNodeType === "DESIGNER")).toBe(true);
    expect(pending[0]?.candidate.evidence.eventCounts).toBeDefined();
  });
});
