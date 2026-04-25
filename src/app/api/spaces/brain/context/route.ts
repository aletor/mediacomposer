import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BrainValidationError, defaultBrainService } from "@/lib/brain/brain-service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? "";
    const workspaceId = searchParams.get("workspaceId") ?? "";
    const snapshot = await defaultBrainService.getBrainContext(projectId, workspaceId);
    return NextResponse.json(snapshot);
  } catch (e) {
    if (e instanceof BrainValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[brain/context]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
