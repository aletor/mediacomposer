import { NextResponse } from 'next/server';
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { uploadToS3, getPresignedUrl } from '@/lib/s3-utils';

export async function POST(req: Request) {
  try {
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'video/mp4';
    
    console.log(`[Runway Upload] Uploading ${file.name} (${contentType})...`);

    // Upload to S3
    const s3Key = await uploadToS3(file.name, buffer, contentType);
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-knowledge",
      route: "/api/runway/upload",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: buffer.length,
      metadata: { key: s3Key, contentType },
    });

    // Get a URL that Runway can access
    const url = await getPresignedUrl(s3Key);

    return NextResponse.json({ url, s3Key });
  } catch (error: any) {
    console.error("[Runway Upload Error]:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}
