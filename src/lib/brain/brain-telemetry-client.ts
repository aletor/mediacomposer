import { brainDevLog } from "./brain-dev-log";
import type { TelemetryBatch } from "./brain-telemetry";

export type SyncNodeTelemetryArgs = {
  projectId: string;
  nodeId: string;
  workspaceId?: string | null;
  batch: TelemetryBatch;
  keepalive?: boolean;
};

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
  return { ok: true };
}
