export function sanitizeDownloadFilename(name: string, fallback = "download"): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return "";
  if (contentType.includes("video/mp4")) return ".mp4";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("audio/mpeg")) return ".mp3";
  if (contentType.includes("audio/wav")) return ".wav";
  if (contentType.includes("application/pdf")) return ".pdf";
  if (contentType.includes("application/json")) return ".json";
  return "";
}

function ensureExtension(filename: string, contentType: string | null, url?: string): string {
  if (/\.[a-z0-9]{2,8}$/i.test(filename)) return filename;
  const fromType = extensionFromContentType(contentType);
  if (fromType) return `${filename}${fromType}`;
  const fromUrl = url?.split("?")[0]?.match(/\.([a-z0-9]{2,8})$/i)?.[0];
  return fromUrl ? `${filename}${fromUrl}` : filename;
}

function clickDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function forceDownloadUrl(url: string, filename: string): Promise<void> {
  const safeName = sanitizeDownloadFilename(filename);
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`download_failed_${response.status}`);
    const contentType = response.headers.get("content-type");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      clickDownload(objectUrl, ensureExtension(safeName, contentType, url));
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  } catch {
    // Server-provided Content-Disposition still gives the browser a chance to download
    // instead of opening the URL if CORS blocks blob fetching.
    clickDownload(url, safeName);
  }
}

export function downloadS3Object(key: string, filename: string): void {
  const params = new URLSearchParams({
    key,
    filename: sanitizeDownloadFilename(filename),
  });
  clickDownload(`/api/spaces/s3-download?${params.toString()}`, sanitizeDownloadFilename(filename));
}
