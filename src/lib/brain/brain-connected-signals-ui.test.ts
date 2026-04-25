import { describe, expect, it, vi, afterEach } from "vitest";
import type { StoredLearningCandidate } from "./learning-candidate-schema";
import {
  BRAIN_NO_RECENT_SIGNALS_COPY,
  connectedNodeSignalsCopy,
  formatBrainSignalRelativeAge,
  learningRowMatchesCanvasNode,
  resolveLearningPendingAnchorNodeId,
} from "./brain-connected-signals-ui";

describe("brain-connected-signals-ui", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connectedNodeSignalsCopy usa summaryLine cuando hay telemetría", () => {
    const out = connectedNodeSignalsCopy({
      summaryLine: "1 exportación · 2 textos",
      lastAt: null,
      pendingCount: 0,
      expanded: false,
    });
    expect(out.signalsLine).toBe("1 exportación · 2 textos");
    expect(out.pendingLine).toBeNull();
    expect(out.lastSignalLine).toBeNull();
  });

  it("connectedNodeSignalsCopy muestra Sin señales recientes si no hay resumen", () => {
    const out = connectedNodeSignalsCopy({
      summaryLine: null,
      lastAt: null,
      pendingCount: 0,
      expanded: false,
    });
    expect(out.signalsLine).toBe(BRAIN_NO_RECENT_SIGNALS_COPY);
  });

  it("connectedNodeSignalsCopy añade línea de pendientes y última señal en expandido", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T14:05:00.000Z"));
    const out = connectedNodeSignalsCopy({
      summaryLine: "1 color",
      lastAt: "2026-04-24T14:00:00.000Z",
      pendingCount: 2,
      expanded: true,
    });
    expect(out.pendingLine).toBe("2 aprendizajes en revisión");
    expect(out.lastSignalLine).toBe("Última señal · hace 5 min");
  });

  it("formatBrainSignalRelativeAge — menos de un minuto", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T15:00:30.000Z"));
    expect(formatBrainSignalRelativeAge("2026-04-24T15:00:10.000Z")).toBe("ahora");
  });

  it("learningRowMatchesCanvasNode — coincide por nodeId y tipo de telemetría", () => {
    const row = {
      id: "1",
      projectId: "p",
      nodeId: "ph-1",
      telemetryNodeType: "PHOTOROOM" as const,
      status: "PENDING_REVIEW" as const,
      candidate: {
        type: "VISUAL_MEMORY" as const,
        scope: "PROJECT" as const,
        topic: "visual_node_export_signals",
        value: "x",
        confidence: 0.7,
        reasoning: "r",
        evidence: {
          sourceNodeIds: ["ph-1"],
          sourceNodeTypes: ["photoroom"],
          primarySourceNodeId: "ph-1",
        },
      },
      sourceSessionIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies StoredLearningCandidate;
    expect(learningRowMatchesCanvasNode(row, "ph-1", "PHOTOROOM")).toBe(true);
    expect(learningRowMatchesCanvasNode(row, "ph-1", "DESIGNER")).toBe(false);
  });

  it("learningRowMatchesCanvasNode — no mezcla Designer bajo Photoroom por tipos de evidencia", () => {
    const row = {
      id: "2",
      projectId: "p",
      nodeId: "ph-1",
      telemetryNodeType: "DESIGNER" as const,
      status: "PENDING_REVIEW" as const,
      candidate: {
        type: "CREATIVE_PREFERENCE" as const,
        scope: "PROJECT" as const,
        topic: "tone",
        value: "Designer length",
        confidence: 0.5,
        reasoning: "r",
        evidence: {
          sourceNodeIds: ["ph-1"],
          sourceNodeTypes: ["designer"],
          primarySourceNodeId: "ph-1",
        },
      },
      sourceSessionIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies StoredLearningCandidate;
    expect(learningRowMatchesCanvasNode(row, "ph-1", "PHOTOROOM")).toBe(false);
  });

  it("histórico sin evidenceSource solo ancla por nodeId (no por primarySource)", () => {
    const row = {
      id: "3",
      projectId: "p",
      nodeId: undefined,
      telemetryNodeType: "PHOTOROOM" as const,
      status: "PENDING_REVIEW" as const,
      candidate: {
        type: "VISUAL_MEMORY" as const,
        scope: "PROJECT" as const,
        topic: "visual_node_export_signals",
        value: "x",
        confidence: 0.7,
        reasoning: "r",
        evidence: {
          sourceNodeIds: ["ph-1"],
          sourceNodeTypes: ["photoroom"],
          primarySourceNodeId: "ph-1",
        },
      },
      sourceSessionIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    } satisfies StoredLearningCandidate;
    expect(resolveLearningPendingAnchorNodeId(row)).toBeUndefined();
    expect(learningRowMatchesCanvasNode(row, "ph-1", "PHOTOROOM")).toBe(false);
  });
});
