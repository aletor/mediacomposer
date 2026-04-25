"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useDesignerSpaceId } from "@/contexts/DesignerSpaceIdContext";
import { useSpacesActiveProjectId } from "@/contexts/SpacesActiveProjectIdContext";
import type { TelemetryFlushReason } from "./brain-models";
import type { BrainNodeType, TelemetryBatch, TelemetryEvent } from "./brain-telemetry";
import { brainDevLog } from "./brain-dev-log";
import { syncNodeTelemetryViaApi } from "./brain-telemetry-client";

export type UseBrainNodeTelemetryOptions = {
  canvasNodeId: string;
  nodeType: BrainNodeType;
};

export type UseBrainNodeTelemetryResult = {
  nodeType: BrainNodeType;
  track: (event: Omit<TelemetryEvent, "ts"> & { ts?: string }) => void;
  flushTelemetry: (reason?: TelemetryFlushReason) => Promise<void>;
};

function newBatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b_${Math.random().toString(36).slice(2, 14)}`;
}

function toBatch(
  events: TelemetryEvent[],
  sessionId: string,
  reason: TelemetryFlushReason,
  nodeType: BrainNodeType,
  projectId: string,
  nodeId: string,
): TelemetryBatch {
  const createdAt = new Date().toISOString();
  return {
    version: 2,
    batchId: newBatchId(),
    sessionId,
    projectId,
    nodeId,
    createdAt,
    capturedAt: createdAt,
    flushReason: reason,
    nodeType,
    events: events.map((e) => ({ ...e })),
  };
}

function isEmptyBatch(b: TelemetryBatch): boolean {
  return b.events.length === 0;
}

export function useBrainNodeTelemetry(opts: UseBrainNodeTelemetryOptions): UseBrainNodeTelemetryResult {
  const { canvasNodeId, nodeType } = opts;
  const projectId = useSpacesActiveProjectId();
  const workspaceId = useDesignerSpaceId();
  const projectIdRef = useRef(projectId);
  const workspaceIdRef = useRef(workspaceId);
  const nodeIdRef = useRef(canvasNodeId);
  useLayoutEffect(() => {
    projectIdRef.current = projectId;
    workspaceIdRef.current = workspaceId;
    nodeIdRef.current = canvasNodeId;
  }, [projectId, workspaceId, canvasNodeId]);

  const eventsRef = useRef<TelemetryEvent[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  const ensureSessionId = useCallback(() => {
    if (sessionIdRef.current) return;
    sessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Math.random().toString(36).slice(2, 12)}`;
  }, []);

  const track = useCallback((event: Omit<TelemetryEvent, "ts"> & { ts?: string }) => {
    ensureSessionId();
    const { ts: optionalTs, ...rest } = event;
    eventsRef.current.push({
      ...(rest as Omit<TelemetryEvent, "ts">),
      ts: optionalTs ?? new Date().toISOString(),
    } as TelemetryEvent);
    const cap = 800;
    if (eventsRef.current.length > cap) {
      eventsRef.current.splice(0, eventsRef.current.length - cap);
    }
  }, [ensureSessionId]);

  const flushTelemetry = useCallback(async (reason: TelemetryFlushReason = "manual") => {
    const pid = projectIdRef.current?.trim() || "";
    const nid = nodeIdRef.current.trim();
    if (!pid || !nid) return;
    ensureSessionId();
    const batch = toBatch(eventsRef.current, sessionIdRef.current!, reason, nodeType, pid, nid);
    if (isEmptyBatch(batch)) return;
    brainDevLog("telemetry-client", "flush_batch", {
      reason,
      batchId: batch.batchId,
      sessionId: batch.sessionId,
      nodeId: nid,
      projectId: pid,
      nodeType,
      events: batch.events.length,
    });
    eventsRef.current = [];
    await syncNodeTelemetryViaApi({
      projectId: pid,
      nodeId: nid,
      workspaceId: workspaceIdRef.current ?? "__root__",
      batch,
      keepalive: reason === "unmount",
    });
  }, [ensureSessionId, nodeType]);

  useEffect(() => {
    return () => {
      const pid = projectIdRef.current?.trim() || "";
      const nid = nodeIdRef.current.trim();
      if (!pid || !nid) return;
      ensureSessionId();
      const batch = toBatch(eventsRef.current, sessionIdRef.current!, "unmount", nodeType, pid, nid);
      if (isEmptyBatch(batch)) return;
      eventsRef.current = [];
      void syncNodeTelemetryViaApi({
        projectId: pid,
        nodeId: nid,
        workspaceId: workspaceIdRef.current ?? "__root__",
        batch,
        keepalive: true,
      });
    };
  }, [ensureSessionId, nodeType]);

  return useMemo(
    () => ({
      nodeType,
      track,
      flushTelemetry,
    }),
    [flushTelemetry, nodeType, track],
  );
}
