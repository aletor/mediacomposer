import { brainDevLog } from "./brain-dev-log";
import type { TelemetryBatch } from "./brain-telemetry";

export const BRAIN_TELEMETRY_SYNCED_EVENT = "foldder-brain-telemetry-synced";

export type BrainTelemetrySyncedEventDetail = {
  projectId: string;
  nodeId: string;
  workspaceId?: string | null;
  batchId: string;
  nodeType: TelemetryBatch["nodeType"];
  flushReason: TelemetryBatch["flushReason"];
  eventKinds: TelemetryBatch["events"][number]["kind"][];
  syncedAt: string;
};

export type SyncNodeTelemetryArgs = {
  projectId: string;
  nodeId: string;
  workspaceId?: string | null;
  batch: TelemetryBatch;
  keepalive?: boolean;
};

function dispatchTelemetrySyncedEvent(args: SyncNodeTelemetryArgs) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<BrainTelemetrySyncedEventDetail>(BRAIN_TELEMETRY_SYNCED_EVENT, {
      detail: {
        projectId: args.projectId,
        nodeId: args.nodeId,
        workspaceId: args.workspaceId ?? null,
        batchId: args.batch.batchId ?? "server_assigned",
        nodeType: args.batch.nodeType,
        flushReason: args.batch.flushReason,
        eventKinds: args.batch.events.map((event) => event.kind),
        syncedAt: new Date().toISOString(),
      },
    }),
  );
}

export async function syncNodeTelemetryViaApi(args: SyncNodeTelemetryArgs): Promise<{ ok: boolean }> {
  const res = await fetch("/api/spaces/brain/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: args.projectId,
      nodeId: args.nodeId,
      workspaceId: args.workspaceId ?? undefined,
      batch: args.batch,
    }),
    keepalive: args.keepalive === true,
  });
  if (!res.ok) {
    brainDevLog("telemetry-client", "sync_http_error", { status: res.status });
    return { ok: false };
  }
  try {
    const data = (await res.json()) as { duplicate?: boolean; batchId?: string; ok?: boolean };
    brainDevLog("telemetry-client", "sync_http_ok", {
      duplicate: Boolean(data.duplicate),
      batchId: data.batchId,
    });
  } catch {
    brainDevLog("telemetry-client", "sync_http_ok_parse_skipped", {});
  }
  dispatchTelemetrySyncedEvent(args);
  return { ok: true };
}
