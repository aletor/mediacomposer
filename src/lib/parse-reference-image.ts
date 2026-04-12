/**
 * Convierte referencias de imagen (data URL o http(s)) al formato inline_data de Gemini.
 * Soporta `data:image/png;charset=UTF-8;base64,...` (el split naive `;base64,` rompía el mime).
 */

export async function parseReferenceImageForGemini(
  image: string
): Promise<{ data: string; mimeType: string } | null> {
  if (!image || typeof image !== "string") return null;

  if (image.startsWith("data:")) {
    const marker = ";base64,";
    const idx = image.indexOf(marker);
    if (idx === -1) return null;
    const meta = image.slice(5, idx);
    const mimeType = (meta.split(";")[0] || "image/png").trim();
    const data = image.slice(idx + marker.length);
    if (!data) return null;
    return { data, mimeType };
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    try {
      const res = await fetch(image, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
      const mimeType =
        headerMime ||
        (image.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
      return {
        data: Buffer.from(buffer).toString("base64"),
        mimeType,
      };
    } catch {
      return null;
    }
  }

  return null;
}
