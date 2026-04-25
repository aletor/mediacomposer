import { NextRequest, NextResponse } from "next/server";
import { recordApiUsage, resolveUsageUserEmailFromRequest } from "@/lib/api-usage";
import { uploadToS3 } from "@/lib/s3-utils";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import * as cheerio from "cheerio";

export async function POST(req: NextRequest) {
  try {
    const usageUserEmail = await resolveUsageUserEmailFromRequest(req);
    const { url, scope: scopeRaw, contextKind: contextKindRaw } = (await req.json()) as {
      url?: string;
      scope?: "core" | "context";
      contextKind?: "competencia" | "mercado" | "referencia" | "general";
    };
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
    const scope: "core" | "context" = scopeRaw === "context" ? "context" : "core";
    const contextKind =
      contextKindRaw === "competencia" ||
      contextKindRaw === "mercado" ||
      contextKindRaw === "referencia" ||
      contextKindRaw === "general"
        ? contextKindRaw
        : undefined;

    const normalized = url.includes("://") ? url.trim() : `https://${url.trim()}`;
    const response = await axios.get(normalized, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
      timeout: 15_000,
    });

    const $ = cheerio.load(response.data);
    $("script, style, nav, footer, header, noscript").remove();
    const title = $("title").text() || normalized.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    if (bodyText.length < 50) {
      return NextResponse.json(
        { error: "Could not extract enough content from the URL." },
        { status: 400 },
      );
    }

    const filename = `URL-${Date.now()}.txt`;
    const textBuf = Buffer.from(bodyText, "utf-8");
    const s3Key = await uploadToS3(filename, textBuf, "text/plain");
    await recordApiUsage({
      provider: "aws",
      userEmail: usageUserEmail,
      serviceId: "s3-knowledge",
      route: "/api/spaces/brain/knowledge/url",
      operation: "put_object",
      costIsKnown: false,
      costUsd: 0,
      bytes: textBuf.length,
      metadata: { key: s3Key, source: "url_extract" },
    });
    const docRecord = {
      id: uuidv4(),
      name: `[URL] ${title}`,
      size: textBuf.length,
      mime: "text/plain",
      scope,
      contextKind,
      s3Path: s3Key,
      type: "document",
      format: "url",
      status: "Subido",
      uploadedAt: new Date().toISOString(),
      originalSourceUrl: normalized,
    };

    return NextResponse.json({
      message: "URL added successfully",
      document: docRecord,
    });
  } catch (error) {
    console.error("[brain/knowledge/url]", error);
    return NextResponse.json({ error: "Failed to extract content from URL." }, { status: 500 });
  }
}
