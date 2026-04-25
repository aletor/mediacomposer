import { readResponseJson } from "@/lib/read-response-json";

export type BrainTelemetrySummaryRow = {
  nodeId: string;
  summaryLine: string | null;
  lastAt: string | null;
};

export type TelemetryByNodeIdMap = Record<string, { summaryLine: string | null; lastAt: string | null }>;

/**
 * Resumen de señales recientes en memoria del servidor (mismo criterio que `summarizeRecentTelemetryForNodes`).
 */
export async function fetchBrainTelemetrySummaryByNodeId(
  projectId: string,
  nodeIds: string[],
): Promise<TelemetryByNodeIdMap> {
  const idList = [...new Set(nodeIds.map((x) => x.trim()).filter(Boolean))];
  if (!idList.length || !projectId.trim()) return {};
  const url = `/api/spaces/brain/telemetry/summary?projectId=${encodeURIComponent(
    projectId.trim(),
  )}&nodeIds=${encodeURIComponent(idList.join(","))}`;
  const res = await fetch(url);
  const json = await readResponseJson<{ nodes?: BrainTelemetrySummaryRow[] }>(res, "brain/telemetry/summary");
  const next: TelemetryByNodeIdMap = {};
  for (const row of json?.nodes ?? []) {
    next[row.nodeId] = { summaryLine: row.summaryLine ?? null, lastAt: row.lastAt ?? null };
  }
  return next;
}
