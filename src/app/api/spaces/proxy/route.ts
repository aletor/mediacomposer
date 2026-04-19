import { NextRequest, NextResponse } from "next/server";

/** Muchos CDNs (p. ej. pinimg) devuelven 403 si el fetch parece un bot sin User-Agent de navegador. */
const UPSTREAM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function proxyImage(imageUrl: string): Promise<Response> {
  let response: Response;
  try {
    let host = "";
    try {
      host = new URL(imageUrl).hostname.toLowerCase();
    } catch {
      /* invalid URL handled below */
    }
    const headers: Record<string, string> = {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": UPSTREAM_UA,
    };
    if (host.includes("pinimg.com") || host.includes("pinterest.com")) {
      headers.Referer = "https://www.pinterest.com/";
    }

    response = await fetch(imageUrl, {
      redirect: "follow",
      cache: "no-store",
      headers,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `fetch failed: ${msg}` }, { status: 502 });
  }

  if (!response.ok) {
    const snippet = await response.text().catch(() => "");
    return NextResponse.json(
      {
        error: `upstream ${response.status} ${response.statusText}`,
        upstreamStatus: response.status,
        bodySnippet: snippet.slice(0, 240),
      },
      { status: 502 },
    );
  }

  const blob = await response.blob();
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return new Response(blob, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  return proxyImage(imageUrl);
}

/** Prefer POST: presigned S3 URLs exceed safe query-string limits for GET. */
export async function POST(req: NextRequest) {
  let imageUrl: string;
  try {
    const body = (await req.json()) as { url?: unknown };
    imageUrl = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!imageUrl) {
    return NextResponse.json({ error: "url is required in body" }, { status: 400 });
  }

  return proxyImage(imageUrl);
}
