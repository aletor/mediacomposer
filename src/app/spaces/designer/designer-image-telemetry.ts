import { brainDevLog } from "@/lib/brain/brain-dev-log";
import type { TelemetryImageSource } from "@/lib/brain/brain-models";
import type { TelemetryEvent } from "@/lib/brain/brain-telemetry";

const MAX_ASSET_REF = 512;

export type DesignerImageTelemetryTrack = (event: Omit<TelemetryEvent, "ts"> & { ts?: string }) => void;

/** Recorta refs largas / data URLs para telemetría (compartido con Photoroom y otros nodos visuales). */
export function clipTelemetryAssetRef(ref: string | undefined): string | undefined {
  if (!ref || typeof ref !== "string") return undefined;
  const t = ref.trim();
  if (!t) return undefined;
  if (t.startsWith("data:") && t.length > 96) return `data:${t.slice(5, 40)}…(${t.length} chars)`;
  return t.length > MAX_ASSET_REF ? t.slice(0, MAX_ASSET_REF) : t;
}

type ImageTelemetryBase = {
  source: TelemetryImageSource;
  pageId?: string | null;
  frameId?: string | null;
  assetId?: string;
  assetRef?: string;
  fileName?: string;
  mimeType?: string;
  imageWidth: number;
  imageHeight: number;
};

/** Usuario sube fichero (disco o flujo equivalente con File). */
export function trackDesignerImageImported(track: DesignerImageTelemetryTrack, base: ImageTelemetryBase): void {
  track({
    kind: "IMAGE_IMPORTED",
    source: base.source,
    pageId: base.pageId ?? undefined,
    frameId: base.frameId ?? undefined,
    assetId: base.assetId,
    assetRef: clipTelemetryAssetRef(base.assetRef),
    fileName: base.fileName,
    mimeType: base.mimeType,
    imageWidth: base.imageWidth,
    imageHeight: base.imageHeight,
  });
  brainDevLog("designer-telemetry", "image_imported", {
    source: base.source,
    pageId: base.pageId ?? null,
    frameId: base.frameId ?? null,
    assetId: base.assetId ?? null,
    fileName: base.fileName ?? null,
    w: base.imageWidth,
    h: base.imageHeight,
  });
}

/** Imagen queda en marco u objeto imagen del documento. */
export function trackDesignerImageUsed(track: DesignerImageTelemetryTrack, base: ImageTelemetryBase): void {
  track({
    kind: "IMAGE_USED",
    source: base.source,
    pageId: base.pageId ?? undefined,
    frameId: base.frameId ?? undefined,
    assetId: base.assetId,
    assetRef: clipTelemetryAssetRef(base.assetRef),
    fileName: base.fileName,
    mimeType: base.mimeType,
    imageWidth: base.imageWidth,
    imageHeight: base.imageHeight,
  });
  brainDevLog("designer-telemetry", "image_used", {
    source: base.source,
    pageId: base.pageId ?? null,
    frameId: base.frameId ?? null,
    assetId: base.assetId ?? null,
    fileName: base.fileName ?? null,
    w: base.imageWidth,
    h: base.imageHeight,
  });
}

export function logDesignerExportImagesSummary(extra: Record<string, unknown>): void {
  brainDevLog("designer-telemetry", "export_images_summary", extra);
}
