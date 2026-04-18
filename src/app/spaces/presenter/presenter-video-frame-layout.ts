import type { ContentAlignment, ImageFittingMode } from "../indesign/image-frame-model";
import type { PresenterImageVideoRel } from "./presenter-image-video-types";

/** Mismos límites que en el overlay: reframe amplio con mínimo de tamaño. */
export function clampRel(r: PresenterImageVideoRel): PresenterImageVideoRel {
  const minS = 0.04;
  const maxWh = 16;
  const maxOff = 12;
  let { x, y, w, h } = r;
  w = Math.max(minS, Math.min(maxWh, w));
  h = Math.max(minS, Math.min(maxWh, h));
  x = Math.max(-maxOff, Math.min(maxOff, x));
  y = Math.max(-maxOff, Math.min(maxOff, y));
  return { x, y, w, h };
}

/** `object-position` CSS para alinear el recorte (sobre todo con object-cover). */
export function contentAlignmentToObjectPosition(align: ContentAlignment | undefined): string {
  const a = align ?? "center";
  const map: Record<ContentAlignment, string> = {
    "top-left": "0% 0%",
    "top-center": "50% 0%",
    "top-right": "100% 0%",
    "middle-left": "0% 50%",
    center: "50% 50%",
    "middle-right": "100% 50%",
    "bottom-left": "0% 100%",
    "bottom-center": "50% 100%",
    "bottom-right": "100% 100%",
  };
  return map[a] ?? "50% 50%";
}

/** Clases Tailwind para `object-fit` según modo (misma semántica que marco de imagen Designer). */
export function presenterFittingModeToObjectFitClass(mode: ImageFittingMode | undefined): string {
  const m = mode ?? "fill-proportional";
  switch (m) {
    case "fit-proportional":
    case "center-content":
    case "frame-to-content":
      return "object-contain";
    case "fill-proportional":
      return "object-cover";
    case "fit-stretch":
    case "fill-stretch":
      return "object-fill";
    default:
      return "object-cover";
  }
}

/**
 * Marco del vídeo encajado a la proporción del vídeo dentro del rect 0–1 de la imagen (modo «caja al contenido»).
 */
export function relFrameToContent(
  videoWidth: number,
  videoHeight: number,
  imageWidth: number,
  imageHeight: number,
): PresenterImageVideoRel {
  const vw = Math.max(1e-9, videoWidth);
  const vh = Math.max(1e-9, videoHeight);
  const iw = Math.max(1e-9, imageWidth);
  const ih = Math.max(1e-9, imageHeight);
  const Av = vw / vh;
  const Aimg = iw / ih;
  const R = Av / Aimg;
  let wr: number;
  let hr: number;
  if (R >= 1) {
    wr = 1;
    hr = 1 / R;
  } else {
    hr = 1;
    wr = R;
  }
  const x = (1 - wr) / 2;
  const y = (1 - hr) / 2;
  return clampRel({ x, y, w: wr, h: hr });
}

export function loadVideoDimensions(videoUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const done = () => {
      v.removeEventListener("loadedmetadata", onOk);
      v.removeEventListener("error", onErr);
    };
    const onOk = () => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      done();
      if (w > 0 && h > 0) resolve({ width: w, height: h });
      else reject(new Error("sin dimensiones de vídeo"));
    };
    const onErr = () => {
      done();
      reject(new Error("no se pudo cargar el vídeo"));
    };
    v.addEventListener("loadedmetadata", onOk);
    v.addEventListener("error", onErr);
    v.src = videoUrl;
  });
}
