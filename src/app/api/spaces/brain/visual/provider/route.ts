import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDefaultBrainVisionProvider } from "@/lib/brain/brain-vision-providers-impl";

export const runtime = "nodejs";

/**
 * Indica qué proveedor de visión usaría el servidor ahora (según env), sin analizar imágenes ni exponer claves.
 * La capa guardada en `metadata.assets` puede seguir marcada como mock hasta «Reanalizar imágenes».
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = createDefaultBrainVisionProvider();
  return NextResponse.json({ providerId: provider.id });
}
