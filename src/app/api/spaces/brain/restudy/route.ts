import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runBrainRestudyPipeline, type BrainRestudyOptionsInput } from "@/lib/brain/brain-restudy-pipeline";

export const runtime = "nodejs";

/**
 * Re-estudio completo del Brain (solo desarrollo o `BRAIN_DEV_TOOLS=1` en servidor).
 * El cliente debe enviar `metadata.assets` actuales; la respuesta incluye `nextAssets` fusionados.
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "development" && process.env.BRAIN_DEV_TOOLS !== "1") {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as {
      projectId?: string;
      assets?: unknown;
      workspaceId?: string;
      options?: BrainRestudyOptionsInput;
    };
    const projectId = body.projectId?.trim() ?? "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    if (body.assets === undefined) {
      return NextResponse.json(
        { error: "assets required (enviar metadata.assets del proyecto en el body)" },
        { status: 400 },
      );
    }
    const origin = new URL(req.url).origin;
    const result = await runBrainRestudyPipeline({
      origin,
      cookieHeader: req.headers.get("cookie"),
      projectId,
      workspaceId: body.workspaceId ?? null,
      userEmail: session.user.email ?? "",
      assetsRaw: body.assets,
      options: body.options,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[brain/restudy]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
