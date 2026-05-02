import { NextResponse } from "next/server";

import type { VideoEditorRenderManifest } from "@/app/spaces/video-editor/video-editor-render-types";
import { resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { createVideoEditorFargateRenderJob } from "@/lib/video-editor/video-editor-fargate-render";

export const runtime = "nodejs";
export const maxDuration = 300;

function isRenderManifest(input: unknown): input is VideoEditorRenderManifest {
  if (!input || typeof input !== "object") return false;
  const row = input as Partial<VideoEditorRenderManifest>;
  return (
    typeof row.editorNodeId === "string"
    && typeof row.durationSeconds === "number"
    && Boolean(row.settings)
    && Boolean(row.tracks)
    && Array.isArray(row.tracks?.video)
  );
}

function validateManifest(manifest: VideoEditorRenderManifest): string | null {
  if (manifest.durationSeconds <= 0) return "Timeline duration must be greater than 0.";
  if (!manifest.tracks.video.some((clip) => clip.mediaType === "image" || clip.mediaType === "video")) {
    return "no_visual_clips";
  }
  if (!manifest.settings.width || !manifest.settings.height || !manifest.settings.fps) {
    return "Invalid render settings.";
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const manifest = body?.manifest;
    if (!isRenderManifest(manifest)) {
      return NextResponse.json({ renderId: "", status: "error", error: "Invalid render manifest." }, { status: 400 });
    }
    const validationError = validateManifest(manifest);
    if (validationError) {
      return NextResponse.json({ renderId: "", status: "error", error: validationError }, { status: 400 });
    }
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const result = await createVideoEditorFargateRenderJob(manifest, { userEmail: usageUserEmail });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "render_failed";
    console.error("[video-editor-render]", error);
    return NextResponse.json({ renderId: "", status: "error", error: message }, { status: 500 });
  }
}
