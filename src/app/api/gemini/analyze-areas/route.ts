import { NextRequest, NextResponse } from "next/server";
import { parseGeminiUsageMetadata, recordApiUsage } from "@/lib/api-usage";
import sharp from "sharp";

// Cheapest Gemini model with vision capability (text output only)
const VISION_MODEL = "gemini-2.5-flash";

interface AreaChange {
  color: string;
  description: string;
  posX?: number | null;
  posY?: number | null;
  paintData?: string | null;         // data:image/png;base64,...
  assignedColorHex?: string;         // e.g. "#ff0000"
  referenceImageData?: string | null; // data URL of visual reference uploaded by user
  /** Si true: el cambio afecta a toda la escena (sin máscara / sin trazo). */
  isGlobal?: boolean;
}

async function parseImage(image: string): Promise<{ data: string; mimeType: string } | null> {
  if (!image) return null;
  if (image.startsWith("data:")) {
    const [meta, data] = image.split(";base64,");
    return { data, mimeType: meta.split(":")[1] };
  }
  if (image.startsWith("http")) {
    try {
      const res = await fetch(image, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) { console.warn("[analyze-areas] Failed to fetch image:", res.status); return null; }
      const buffer = await res.arrayBuffer();
      const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
      const mimeType =
        headerMime ||
        (image.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType,
      };
    } catch (e: any) {
      console.warn("[analyze-areas] Error fetching image URL:", e.message);
      return null;
    }
  }
  return null;
}

// Server-side composite using sharp: base image + colored paint stroke overlays
async function buildMarkedImageWithSharp(
  baseData: string,
  baseType: string,
  changes: AreaChange[]
): Promise<string | null> {
  try {
    const baseBuffer = Buffer.from(baseData, "base64");
    const baseMeta = await sharp(baseBuffer).metadata();
    const W = baseMeta.width || 1280;
    const H = baseMeta.height || 720;

    // Start with the base image (converted to PNG for compositing)
    let composite = sharp(baseBuffer).ensureAlpha();

    const overlays: sharp.OverlayOptions[] = [];

    for (const change of changes) {
      if (!change.paintData || !change.assignedColorHex) continue;
      try {
        const [, b64] = change.paintData.split(";base64,");
        const strokeBuffer = Buffer.from(b64, "base64");

        // Get stroke as raw RGBA pixels, resize to match base
        const { data: raw, info } = await sharp(strokeBuffer)
          .resize(W, H, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const hex = change.assignedColorHex.replace("#", "");
        const cr = parseInt(hex.slice(0, 2), 16);
        const cg = parseInt(hex.slice(2, 4), 16);
        const cb = parseInt(hex.slice(4, 6), 16);

        // Tint: replace non-transparent pixels with the assigned color
        for (let i = 0; i < raw.length; i += 4) {
          if (raw[i + 3] > 30) {
            raw[i] = cr; raw[i + 1] = cg; raw[i + 2] = cb;
            raw[i + 3] = Math.min(220, raw[i + 3] * 3);
          }
        }

        // Convert raw back to PNG overlay
        const overlayBuf = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
          .png()
          .toBuffer();

        overlays.push({ input: overlayBuf, top: 0, left: 0 });
      } catch (e) {
        console.warn("[analyze-areas] Failed to process stroke for", change.color, e);
      }
    }

    if (overlays.length === 0) return null;

    // PNG lossless — avoid JPEG recompression drift between Studio iterations
    const resultBuffer = await composite
      .composite(overlays)
      .png({ compressionLevel: 6, adaptiveFiltering: true })
      .toBuffer();
    console.log("[analyze-areas] Marked image built (PNG lossless), size:", resultBuffer.length);
    return resultBuffer.toString("base64");
  } catch (e: any) {
    console.warn("[analyze-areas] Sharp compositing failed:", e.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { baseImage, colorMapImage, changes } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    if (!changes?.length) return NextResponse.json({ error: "No changes provided" }, { status: 400 });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${apiKey}`;

    const parts: any[] = [];
    const typedChanges = changes as AreaChange[];
    const zoneChanges = typedChanges.filter((c) => !c.isGlobal);
    const globalChanges = typedChanges.filter((c) => c.isGlobal);
    const globalOnly = typedChanges.length > 0 && globalChanges.length === typedChanges.length;
    const hasZones = zoneChanges.length > 0;

    // 1. Base image
    const parsedBase = baseImage ? await parseImage(baseImage) : null;
    if (parsedBase) {
      parts.push({ inline_data: { mime_type: parsedBase.mimeType, data: parsedBase.data } });
    }

    // 2. Marked image / map — solo para cambios por zona (trazos). Los globales no llevan máscara.
    let useMarked = false;
    let markedImgData: string | null = null;
    if (parsedBase && hasZones) {
      markedImgData = await buildMarkedImageWithSharp(
        parsedBase.data,
        parsedBase.mimeType,
        zoneChanges as AreaChange[]
      );
      if (markedImgData) {
        parts.push({ inline_data: { mime_type: "image/png", data: markedImgData } });
        useMarked = true;
        console.log("[analyze-areas] Using marked image approach (zones)");
      }
    }

    // Fallback si hay zonas pero sharp falló: mapa de color del cliente (no duplicar base en modo solo-global)
    if (!useMarked && hasZones && colorMapImage) {
      const parsedMap = await parseImage(colorMapImage);
      if (parsedMap) {
        parts.push({ inline_data: { mime_type: parsedMap.mimeType, data: parsedMap.data } });
        console.log("[analyze-areas] Using color map fallback");
      }
    }

    // 3. Prompt
    const hasAnyRef = typedChanges.some((c) => c.referenceImageData);

    let systemPrompt: string;

    if (globalOnly) {
      const changeList = globalChanges
        .map((c) => `- ${c.description.trim()}`)
        .join("\n");
      systemPrompt = `Eres un asistente experto en prompts para edición de imágenes con IA.

Se te proporciona UNA sola imagen: la escena original (REFERENCIA 1).

Cambios solicitados — aplican a TODA la imagen (iluminación, hora del día, atmósfera, color general, cielo, ambiente):
${changeList}

Tu tarea:
1. Redacta UN único prompt de edición claro y detallado para un modelo de imagen. Describe cómo debe verse la escena final (p. ej. escena nocturna, luz de luna, farolas, sombras profundas, ventanas iluminadas, etc.).
2. Si el usuario pide "de noche", "atardecer", etc., sé explícito sobre la luz, las fuentes de luz, el cielo y el balance de color; no te limites a una frase vaga.
3. Mantén la composición y los sujetos reconocibles salvo que el cambio global los altere de forma inevitable (p. ej. siluetas de noche).

Devuelve SOLO el prompt, sin texto adicional.`;
    } else {
      const changeList = typedChanges
        .map((c) => {
          if (c.isGlobal) {
            return `- CAMBIO GLOBAL (toda la escena): ${c.description.trim()}`;
          }
          const pos =
            c.posX != null && c.posY != null
              ? ` (posición en el encuadre: ${c.posX}% desde el borde IZQUIERDO de la imagen, ${c.posY}% desde arriba; usar esto para izq./der. del PLANO, no anatomía del sujeto)`
              : "";
          const refNote = c.referenceImageData
            ? ` [TIENE REFERENCIA VISUAL: celda ${c.color.toUpperCase()} en la IMAGEN 3 (grid de referencias)]`
            : "";
          return `- Área / trazo ${c.color}${pos}: ${c.description}${refNote}`;
        })
        .join("\n");

      const imagenDesc = useMarked
        ? "- IMAGEN 2: la imagen original con trazos de pintura en colores sólidos superpuestos. Los trazos indican EXACTAMENTE los elementos que el usuario quiere modificar."
        : hasZones
          ? "- IMAGEN 2: mapa abstracto de colores sobre fondo negro. Las manchas de color indican las áreas seleccionadas."
          : "";

      const imagen3Desc = hasAnyRef
        ? "\n- IMAGEN 3: grid de referencias visuales. Cada celda tiene una cabecera del color del cambio y la imagen de referencia visual que el usuario quiere usar como guía de estilo."
        : "";

      const referenceOutputLine = hasAnyRef
        ? "\nREFERENCIA 3: grid de referencias visuales — cada celda etiquetada con el color del cambio."
        : "";

      const imageCountHint = hasAnyRef ? "tres" : hasZones ? "dos" : "una";
      const imageList =
        hasZones && hasAnyRef
          ? `- IMAGEN 1: la imagen original/base
${imagenDesc}${imagen3Desc}`
          : hasZones
            ? `- IMAGEN 1: la imagen original/base
${imagenDesc}`
            : `- IMAGEN 1: la imagen original/base`;

      systemPrompt = `Eres un asistente experto en prompts para generación de imágenes con IA.

Se te proporcionan ${imageCountHint} imágenes:
${imageList}

Cambios solicitados:
${changeList}

PRIORIDAD (zonas con trazo / mapa de color):
- La IMAGEN 2 es la fuente de verdad de DÓNDE editar. El modelo de imagen final debe usar REF 2 para alinear el cambio en el espacio; ninguna frase puede contradecir la posición del trazo o mancha de color.
- Izquierda y derecha: en fotos y retratos usa SIEMPRE el marco de la imagen (vista de frente): "lado izquierdo del encuadre", "tercio derecho del cuadro", o los porcentajes de la lista. NO uses "ojo izquierdo/derecho del sujeto" ni anatomía ambigua si choca con el trazo. Si el usuario escribió "ojo izquierdo" pero el trazo cae en el otro lado del rostro, prioriza el TRAZO y describe la zona como posición en el encuadre (p. ej. "el ojo que queda en el lado izquierdo de la foto").

Tu tarea:
1. Para cada cambio que NO sea global, identifica el elemento bajo el trazo ${useMarked ? "en la IMAGEN 2" : "del mapa en la IMAGEN 2"} y redacta la instrucción enlazando "zona del color [nombre] en REF 2" + posición en el plano (usa los % de la lista cuando existan).
2. Para cada CAMBIO GLOBAL, integra la instrucción como afectación a toda la escena (luz, ambiente, hora del día), sin limitarla a una máscara.
3. En zonas, sé específico respecto al PLANO (encuadre), no solo anatomía del personaje.
4. Si un cambio tiene REFERENCIA VISUAL (nota [TIENE REFERENCIA VISUAL] en la lista), añade: "siguiendo el estilo visual de la celda [COLOR] de la REFERENCIA 3".
5. Genera el prompt con este formato exacto:

REFERENCIA 1: imagen base. Mantén todo lo que no se indica cambiar, conservando composición donde aplique.
REFERENCIA 2: zonas marcadas en color — respetar la posición espacial de cada trazo al aplicar el cambio.${referenceOutputLine}

[Para zonas: primero ancla: "En la zona del trazo [color] en REF 2 (posición en el encuadre / % de la lista)" y luego la acción. Si el lenguaje natural del usuario y el trazo discrepan en izquierda/derecha, manda la versión alineada al trazo.]
[Para globales: párrafos sobre iluminación/atmósfera de toda la escena.]

CRÍTICO: El trazo señala el sitio exacto. Si descripción y trazo discrepan, gana el trazo y el encuadre.

Devuelve SOLO el prompt, sin texto adicional.`;
    }


    parts.push({ text: systemPrompt });

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.15 },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("[analyze-areas] Gemini status:", response.status, "| marked:", useMarked);
    if (data.error) {
      console.error("[analyze-areas] Gemini error:", JSON.stringify(data.error));
      return NextResponse.json({ error: data.error.message || "Gemini error" }, { status: 500 });
    }

    const text = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "";
    if (!text) return NextResponse.json({ error: "No text response from AI" }, { status: 500 });

    const usage = parseGeminiUsageMetadata(data);
    if (usage) {
      await recordApiUsage({
        provider: "gemini",
        serviceId: "gemini-analyze",
        route: "/api/gemini/analyze-areas",
        model: VISION_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
    } else {
      await recordApiUsage({
        provider: "gemini",
        serviceId: "gemini-analyze",
        route: "/api/gemini/analyze-areas",
        model: VISION_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0.02,
        note: "analyze-areas sin usageMetadata (estimado)",
      });
    }

    return NextResponse.json({
      prompt: text.trim(),
      // Return the marked image so the client uses it as REFERENCIA 2 in generation
      markedImageData: useMarked && markedImgData ? markedImgData : null,
      markedImageMime: useMarked && markedImgData ? "image/png" : null,
    });

  } catch (error: any) {
    console.error("[analyze-areas] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
