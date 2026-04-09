import { NextRequest, NextResponse } from "next/server";
import { geminiImageGenerate, GeminiGenerateError } from "@/lib/gemini-image-generate";

export async function POST(req: NextRequest) {
  console.log("[Gemini REST] Request received");
  try {
    const body = await req.json();
    const result = await geminiImageGenerate(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
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
