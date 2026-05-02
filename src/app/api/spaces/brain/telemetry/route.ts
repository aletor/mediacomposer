import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { brainDevLog } from "@/lib/brain/brain-dev-log";
import type { TelemetryBatch } from "@/lib/brain/brain-telemetry";
import { BrainValidationError, defaultBrainService } from "@/lib/brain/brain-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as {
      projectId?: string;
      nodeId?: string;
      workspaceId?: string;
      batch?: TelemetryBatch;
    };
    const projectId = body.projectId ?? "";
    const nodeId = body.nodeId ?? "";
    const batch = body.batch;
    if (!batch || typeof batch !== "object") {
      return NextResponse.json({ error: "batch required" }, { status: 400 });
    }
    brainDevLog("api/telemetry", "batch_received", {
      projectId,
      nodeId,
      batchId: batch.batchId,
      events: batch.events?.length ?? 0,
    });
    const result = await defaultBrainService.syncNodeTelemetry(projectId, nodeId, batch, body.workspaceId);
    if ("record" in result) {
      const { record } = result;
      /**
       * En desarrollo, tras un flush `export` o una sugerencia aceptada, ejecutar el processor
       * sobre ese lote para que aparezcan candidatos en Brain Studio sin worker aparte (memoria mock).
       * Desactivar: BRAIN_DEV_SKIP_EXPORT_PROCESSOR=1
       */
      const hasAcceptedSuggestion = record.batch.events?.some((event) => event.kind === "SUGGESTION_ACCEPTED") ?? false;
      const runLearningProcessor =
        process.env.NODE_ENV === "development" &&
        process.env.BRAIN_DEV_SKIP_EXPORT_PROCESSOR !== "1" &&
        (record.batch.flushReason === "export" || hasAcceptedSuggestion);
      if (runLearningProcessor) {
        void (async () => {
          try {
            const { MockBrainLearningExtractionLlm, TelemetryProcessor } = await import(
              "@/lib/brain/telemetry-processor"
            );
            const proc = new TelemetryProcessor(new MockBrainLearningExtractionLlm(), defaultBrainService);
            const { stored } = await proc.processStreamEvent({
              projectId: record.projectId,
              workspaceId: body.workspaceId?.trim() || undefined,
              nodeId: record.nodeId,
              receivedAt: new Date().toISOString(),
              batches: [record.batch],
            });
            brainDevLog("api/telemetry", "processor_dev_export_followup", { stored, batchId: record.batch.batchId });
          } catch (err) {
            console.warn("[brain/telemetry] processor dev follow-up failed:", err);
          }
        })();
      }
      return NextResponse.json({
        ok: true,
        ephemeralKey: { pk: record.pk, sk: record.sk },
        ttlEpochSec: record.ttlEpochSec,
        batchId: record.batch.batchId,
      });
    }
    return NextResponse.json({ ok: true, duplicate: true, batchId: result.batchId });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[brain/telemetry]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
