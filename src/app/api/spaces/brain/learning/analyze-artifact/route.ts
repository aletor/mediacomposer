import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BrainValidationError, defaultBrainService } from "@/lib/brain/brain-service";
import type { ArtifactPayload } from "@/lib/brain/brain-artifact-analysis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as {
      projectId?: string;
      workspaceId?: string;
      nodeId?: string;
      artifactPayload?: ArtifactPayload;
    };
    const projectId = body.projectId ?? "";
    const artifactPayload = body.artifactPayload;
    if (!artifactPayload || typeof artifactPayload !== "object") {
      return NextResponse.json({ error: "artifactPayload required" }, { status: 400 });
    }
    const result = await defaultBrainService.analyzeExportedArtifact(projectId, artifactPayload, {
      workspaceId: body.workspaceId,
      nodeId: body.nodeId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[brain/learning/analyze-artifact]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
