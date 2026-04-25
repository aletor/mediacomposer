import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BrainValidationError, defaultBrainService } from "@/lib/brain/brain-service";
import { telemetryCountsToSummaryLine } from "@/lib/brain/brain-telemetry-summary-format";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? "";
    const nodeIdsRaw = searchParams.get("nodeIds") ?? "";
    const nodeIds = nodeIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!nodeIds.length) {
      return NextResponse.json({ nodes: [] });
    }
    const digest = defaultBrainService.summarizeRecentTelemetryForNodes(projectId, nodeIds);
    const nodes = digest.map((row) => ({
      nodeId: row.nodeId,
      lastAt: row.lastAt,
      summaryLine: telemetryCountsToSummaryLine(row.eventCounts),
    }));
    return NextResponse.json({ nodes });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[brain/telemetry/summary]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
