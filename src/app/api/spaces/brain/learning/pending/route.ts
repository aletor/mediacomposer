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
    const items = await defaultBrainService.listPendingLearnings(projectId);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    console.error("[brain/learning/pending]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Solo desarrollo: limpia pendientes del proyecto (`mode=all|orphan|visual_reference`). */
export async function DELETE(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "development" && process.env.BRAIN_DEV_TOOLS !== "1") {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? "";
    const modeRaw = (searchParams.get("mode") ?? "all").trim().toLowerCase();
    const mode =
      modeRaw === "orphan" || modeRaw === "visual_reference" ? (modeRaw as "orphan" | "visual_reference") : "all";
    const { removed } = defaultBrainService.devClearPendingLearnings(projectId, mode);
    return NextResponse.json({ ok: true, removed, mode });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      const status = e.code === "DEV_ONLY" ? 403 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("[brain/learning/pending DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
