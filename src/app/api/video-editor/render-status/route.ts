import { NextResponse } from "next/server";

import { getVideoEditorRenderStatus, markVideoEditorRenderUsageRecorded } from "@/lib/video-editor/video-editor-fargate-render";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const renderId = url.searchParams.get("renderId")?.trim();
    if (!renderId) {
      return NextResponse.json({ status: "error", error: "renderId required" }, { status: 400 });
    }
    const status = await getVideoEditorRenderStatus(renderId);
    if (!status) {
      return NextResponse.json({ renderId, status: "preparing", progress: 0 });
    }
    const finalStatus = status.status === "ready" || status.status === "error"
      ? await markVideoEditorRenderUsageRecorded(status)
      : status;
    return NextResponse.json(finalStatus);
  } catch (error) {
    const message = error instanceof Error ? error.message : "render_status_failed";
    console.error("[video-editor-render-status]", error);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
