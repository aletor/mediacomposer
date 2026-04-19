/**
 * Extrae URL de imagen desde respuestas Pin / SummaryPin de la API v5 de Pinterest.
 */

type ImageDetails = { url?: string; width?: number; height?: number };

function scoreImageKey(key: string): number {
  const nums = key.match(/\d+/g);
  if (!nums) return 0;
  return nums.reduce((a, b) => a + parseInt(b, 10), 0);
}

/** Prioriza resoluciones altas (p. ej. 1200x, 600x, 400x300). */
export function extractBestPinterestImageUrl(pin: Record<string, unknown>): string | null {
  const media = pin.media as Record<string, unknown> | undefined;
  if (!media) return null;

  const mt = media.media_type as string | undefined;
  if (mt === "image" || !mt) {
    const images = media.images as Record<string, ImageDetails> | undefined;
    if (images && typeof images === "object") {
      let bestUrl = "";
      let bestScore = -1;
      for (const [k, v] of Object.entries(images)) {
        const url = v?.url;
        if (typeof url !== "string" || !url.startsWith("http")) continue;
        const sc = scoreImageKey(k);
        if (sc > bestScore) {
          bestScore = sc;
          bestUrl = url;
        }
      }
      if (bestUrl) return bestUrl;
    }
  }

  /** Algunos payloads exponen cover directo */
  const cover = pin.image_cover_url;
  if (typeof cover === "string" && cover.startsWith("http")) return cover;

  return null;
}
