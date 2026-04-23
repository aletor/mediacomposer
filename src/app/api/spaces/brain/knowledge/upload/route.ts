import { NextRequest, NextResponse } from "next/server";
import { uploadToS3 } from "@/lib/s3-utils";
import { v4 as uuidv4 } from "uuid";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set(["pdf", "docx", "txt", "md", "rtf", "html", "htm", "jpg", "jpeg", "png", "webp"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/rtf",
  "text/html",
  "application/xhtml+xml",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ext === "jpeg" ? "jpg" : ext;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];
    const scopeRaw = String(formData.get("scope") || "core");
    const contextKindRaw = String(formData.get("contextKind") || "");
    const scope: "core" | "context" = scopeRaw === "context" ? "context" : "core";
    const contextKind =
      contextKindRaw === "competencia" ||
      contextKindRaw === "mercado" ||
      contextKindRaw === "referencia" ||
      contextKindRaw === "general"
        ? contextKindRaw
        : undefined;

    if (!files || files.length === 0) {
      return NextResponse.json({
        message: "No files uploaded.",
        documents: [],
        rejected: [],
      });
    }

    const uploadedDocs = [];
    const rejected: Array<{ name: string; reason: string }> = [];
    for (const file of files) {
      const ext = getExt(file.name);
      const mime = (file.type || "application/octet-stream").toLowerCase();
      const isImage = mime.startsWith("image/") || ["jpg", "png", "webp"].includes(ext);
      const isHtml = ext === "html" || ext === "htm";

      if (
        !ALLOWED_EXT.has(ext) ||
        (!ALLOWED_MIME.has(mime) && !mime.startsWith("text/") && !isImage && !isHtml)
      ) {
        rejected.push({ name: file.name, reason: "unsupported_type" });
        continue;
      }

      if (file.size > MAX_FILE_BYTES) {
        rejected.push({ name: file.name, reason: "file_too_large" });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const s3Key = await uploadToS3(file.name, buffer, mime);
      const format = isImage ? "image" : ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : isHtml ? "html" : "txt";

      uploadedDocs.push({
        id: uuidv4(),
        name: file.name,
        size: file.size,
        mime,
        scope,
        contextKind,
        s3Path: s3Key,
        type: isImage ? "image" : "document",
        format,
        status: "Subido",
        uploadedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      message:
        uploadedDocs.length > 0
          ? `Successfully uploaded ${uploadedDocs.length} file(s)${
              rejected.length ? ` · ${rejected.length} skipped` : ""
            }`
          : `No compatible files were uploaded (${rejected.length} skipped).`,
      documents: uploadedDocs,
      rejected,
    });
  } catch (error) {
    console.error("[brain/knowledge/upload]", error);
    return NextResponse.json({ error: "Failed to upload file(s)." }, { status: 500 });
  }
}
