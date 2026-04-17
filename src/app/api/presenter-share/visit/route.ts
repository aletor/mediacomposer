import { NextResponse } from "next/server";
import { readPresenterSharesSync, withPresenterShares, writePresenterSharesSync } from "@/lib/presenter-share-db";

/** POST { token } — incrementa visitas si el enlace existe y la analítica está activada (o siempre cuenta vista simple). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    let visits = 0;
    await withPresenterShares(async (rows) => {
      const i = rows.findIndex((r) => r.token === token);
      if (i === -1) return;
      rows[i] = { ...rows[i], visits: rows[i].visits + 1 };
      visits = rows[i].visits;
      writePresenterSharesSync(rows);
    });

    return NextResponse.json({ ok: true, visits });
  } catch {
    return NextResponse.json({ error: "visit failed" }, { status: 500 });
  }
}

/** HEAD para comprobar existencia sin payload (opcional). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ exists: false }, { status: 400 });
  const row = readPresenterSharesSync().find((r) => r.token === token);
  return NextResponse.json({ exists: !!row });
}
