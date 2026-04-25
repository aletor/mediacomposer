import type { TelemetryEventKind } from "./brain-telemetry";

function part(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

/** Orden de importancia en la línea resumida (menor = más relevante). */
function summaryPriority(kind: TelemetryEventKind): number {
  const map: Partial<Record<TelemetryEventKind, number>> = {
    CONTENT_EXPORTED: 10,
    MANUAL_OVERRIDE: 20,
    TEXT_FINALIZED: 21,
    SUGGESTION_ACCEPTED: 30,
    IMAGE_IMPORTED: 40,
    IMAGE_USED: 41,
    IMAGE_EDITED: 42,
    IMAGE_EXPORTED: 43,
    IMAGE_GENERATED: 44,
    VIDEO_FRAME_USED: 45,
    VIDEO_POSTER_USED: 46,
    VISUAL_ASSET_USED: 47,
    BACKGROUND_REMOVED: 48,
    MASK_USED: 49,
    LAYER_USED: 50,
    LOGO_CREATED: 51,
    LOGO_EDITED: 52,
    COLOR_USED: 55,
    STYLE_APPLIED: 56,
    TYPOGRAPHY_USED: 57,
    LAYOUT_FINALIZED: 58,
    ASSET_USED: 59,
    PROMPT_ACCEPTED: 62,
    PROMPT_USED: 63,
    SUGGESTION_IGNORED: 60,
    DRIFT_FROM_BRAND: 70,
    PROJECT_SPECIFIC_SIGNAL: 71,
    SUGGESTION_SHOWN: 90,
  };
  return map[kind] ?? 85;
}

function formatKindPhrase(kind: TelemetryEventKind, n: number): string {
  switch (kind) {
    case "CONTENT_EXPORTED":
      return part(n, "exportación", "exportaciones");
    case "MANUAL_OVERRIDE":
      return part(n, "texto manual", "textos manuales");
    case "TEXT_FINALIZED":
      return part(n, "texto final", "textos finales");
    case "SUGGESTION_ACCEPTED":
      return part(n, "sugerencia aceptada", "sugerencias aceptadas");
    case "SUGGESTION_SHOWN":
      return part(n, "sugerencia mostrada", "sugerencias mostradas");
    case "SUGGESTION_IGNORED":
      return part(n, "sugerencia descartada", "sugerencias descartadas");
    case "IMAGE_USED":
      return part(n, "imagen usada", "imágenes usadas");
    case "IMAGE_IMPORTED":
      return part(n, "imagen importada", "imágenes importadas");
    case "IMAGE_EDITED":
      return part(n, "imagen editada", "imágenes editadas");
    case "IMAGE_EXPORTED":
      return part(n, "imagen exportada", "imágenes exportadas");
    case "IMAGE_GENERATED":
      return part(n, "imagen generada", "imágenes generadas");
    case "VISUAL_ASSET_USED":
      return part(n, "asset visual usado", "assets visuales usados");
    case "VIDEO_FRAME_USED":
      return part(n, "frame de vídeo usado", "frames de vídeo usados");
    case "VIDEO_POSTER_USED":
      return part(n, "póster de vídeo usado", "pósters de vídeo usados");
    case "BACKGROUND_REMOVED":
      return part(n, "fondo eliminado", "fondos eliminados");
    case "MASK_USED":
      return part(n, "máscara usada", "máscaras usadas");
    case "LAYER_USED":
      return part(n, "capa usada", "capas usadas");
    case "LOGO_CREATED":
      return part(n, "logo creado", "logos creados");
    case "LOGO_EDITED":
      return part(n, "logo editado", "logos editados");
    case "COLOR_USED":
      return part(n, "color usado", "colores usados");
    case "STYLE_APPLIED":
      return part(n, "estilo aplicado", "estilos aplicados");
    case "TYPOGRAPHY_USED":
      return part(n, "tipografía usada", "tipografías usadas");
    case "LAYOUT_FINALIZED":
      return part(n, "layout final", "layouts finales");
    case "ASSET_USED":
      return part(n, "recurso gráfico usado", "recursos gráficos usados");
    case "PROMPT_ACCEPTED":
      return part(n, "prompt aceptado", "prompts aceptados");
    case "PROMPT_USED":
      return part(n, "prompt usado", "prompts usados");
    case "DRIFT_FROM_BRAND":
      return part(n, "alerta de marca", "alertas de marca");
    case "PROJECT_SPECIFIC_SIGNAL":
      return part(n, "señal de proyecto", "señales de proyecto");
    default:
      return part(n, "señal de lienzo", "señales de lienzo");
  }
}

/**
 * Construye una línea legible a partir de conteos por tipo de evento (sin enums en UI).
 * Orden por importancia creativa, no por frecuencia. Máximo `maxParts` frases; el resto va en "+N más".
 * Devuelve null si no hay eventos (el caller suele sustituir por "Sin señales recientes").
 */
export function telemetryCountsToSummaryLine(
  counts: Partial<Record<TelemetryEventKind, number>>,
  maxParts = 3,
): string | null {
  const pairs = (Object.entries(counts) as [TelemetryEventKind, number][])
    .filter(([, n]) => typeof n === "number" && n > 0);

  if (!pairs.length) return null;

  pairs.sort((a, b) => {
    const pa = summaryPriority(a[0]);
    const pb = summaryPriority(b[0]);
    if (pa !== pb) return pa - pb;
    return b[1] - a[1];
  });

  const shown = pairs.slice(0, maxParts);
  const hiddenKinds = pairs.length - shown.length;
  const fragments = shown.map(([k, n]) => formatKindPhrase(k, n));
  if (hiddenKinds > 0) {
    fragments.push(`+${hiddenKinds} más`);
  }
  return fragments.join(" · ");
}
