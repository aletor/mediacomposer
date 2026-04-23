import { NextRequest, NextResponse } from "next/server";
import { getPresignedUrl } from "@/lib/s3-utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "S3 Key is required" }, { status: 400 });
    const url = await getPresignedUrl(key);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[brain/knowledge/view]", error);
    return NextResponse.json({ error: "Failed to generate view URL." }, { status: 500 });
  }
}

