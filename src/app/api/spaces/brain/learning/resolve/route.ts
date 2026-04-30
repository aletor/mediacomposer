import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { LearningResolutionAction } from "@/lib/brain/learning-candidate-schema";
import { BrainValidationError, defaultBrainService } from "@/lib/brain/brain-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as { learningId?: string; action?: LearningResolutionAction; brandLocked?: boolean };
    const learningId = body.learningId ?? "";
    const action = body.action;
    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }
    const result = await defaultBrainService.resolvePendingLearning(learningId, action, {
      updatedBy: session.user?.email ?? undefined,
      brandLocked: body.brandLocked === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BrainValidationError) {
      const status = e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("[brain/learning/resolve]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
