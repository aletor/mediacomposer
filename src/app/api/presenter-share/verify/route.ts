import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { findShareByToken } from "@/lib/presenter-share-db";

function safeCompare(expected: string, received: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { passcode?: string; token?: string };
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const passcode = typeof body?.passcode === "string" ? body.passcode : "";

    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const row = await findShareByToken(token);
    if (!row) {
      return NextResponse.json({ error: "share not found" }, { status: 404 });
    }

    if (!row.options.requirePasscode) {
      return NextResponse.json({ ok: true });
    }

    const expectedPasscode = row.options.passcodePlain?.trim() || "";
    if (!expectedPasscode) {
      return NextResponse.json({ ok: true });
    }

    if (!safeCompare(expectedPasscode, passcode)) {
      return NextResponse.json({ error: "invalid passcode" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "verification failed" }, { status: 500 });
  }
}
