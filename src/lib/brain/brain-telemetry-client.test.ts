import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelemetryBatch } from "./brain-telemetry";
import {
  BRAIN_TELEMETRY_SYNCED_EVENT,
  syncNodeTelemetryViaApi,
  type BrainTelemetrySyncedEventDetail,
} from "./brain-telemetry-client";

function makeBatch(): TelemetryBatch {
  const now = new Date().toISOString();
  return {
    version: 2,
    batchId: "batch-accepted-1",
    sessionId: "session-1",
    projectId: "project-1",
    nodeId: "designer-1",
    createdAt: now,
    capturedAt: now,
    flushReason: "manual",
    nodeType: "DESIGNER",
    events: [
      {
        kind: "SUGGESTION_ACCEPTED",
        ts: now,
        suggestionId: "txt:title:1",
        textPreview: "Titular aceptado desde Brain",
      },
    ],
  };
}

describe("brain-telemetry-client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, batchId: "batch-accepted-1" }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dispatches a browser event after a successful telemetry sync", async () => {
    const listener = vi.fn();
    window.addEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, listener);
    try {
      const batch = makeBatch();
      await syncNodeTelemetryViaApi({
        projectId: "project-1",
        nodeId: "designer-1",
        workspaceId: "space-1",
        batch,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0]?.[0] as CustomEvent<BrainTelemetrySyncedEventDetail>;
      expect(event.detail).toMatchObject({
        projectId: "project-1",
        nodeId: "designer-1",
        workspaceId: "space-1",
        batchId: "batch-accepted-1",
        nodeType: "DESIGNER",
        flushReason: "manual",
        eventKinds: ["SUGGESTION_ACCEPTED"],
      });
      expect(event.detail.syncedAt).toBeTruthy();
    } finally {
      window.removeEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, listener);
    }
  });

  it("does not dispatch the refresh event when the sync fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const listener = vi.fn();
    window.addEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, listener);
    try {
      const result = await syncNodeTelemetryViaApi({
        projectId: "project-1",
        nodeId: "designer-1",
        batch: makeBatch(),
      });
      expect(result.ok).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(BRAIN_TELEMETRY_SYNCED_EVENT, listener);
    }
  });
});
