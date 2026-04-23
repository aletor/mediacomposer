import { NextRequest, NextResponse } from "next/server";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";
import { resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { ApiServiceDisabledError, assertApiServiceEnabled } from "@/lib/api-usage-controls";

export async function POST(req: NextRequest) {
  console.log("[Gemini REST] Request received");
  try {
    await assertApiServiceEnabled("gemini-nano");
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const body = await req.json();
    const result = await geminiImageGenerate(body, undefined, {
      usageUserEmail,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ApiServiceDisabledError) {
      return NextResponse.json(
        { error: `API bloqueada en admin: ${error.label}` },
        { status: 423 },
      );
    }
    if (error instanceof GeminiGenerateError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gemini REST] Exception:", message);
    return NextResponse.json({ error: `Server Exception: ${message}` }, { status: 500 });
  }
}
