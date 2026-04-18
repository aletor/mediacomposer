/** Evento global: `page.tsx` crea Prompt + URL Image + Video Generator (prompt + first frame) y abre Studio. */
export const FOLDDER_OPEN_GEMINI_VIDEO_WITH_IMAGE_EVENT = "foldder-open-gemini-video-with-image";

export type FoldderOpenGeminiVideoDetail = {
  imageUrl: string;
  /** Prompt listo para el nodo (mejorado vía /api/openai/enhance). */
  videoPrompt: string;
};

/**
 * Videos superpuestos a imágenes en el Presenter (persistidos en el nodo Presenter, no en Designer).
 */
export type PresenterImageVideoRel = {
  /** 0–1 respecto al marco de la imagen */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PresenterImageVideoPlacement = {
  id: string;
  pageId: string;
  /** Objeto Freehand `image`, marco `imageFrame` o booleanGroup con imagen cacheada */
  imageObjectId: string;
  videoUrl: string;
  s3Key?: string;
  /** Área del video dentro del rectángulo de la imagen (por defecto todo el marco) */
  rel: PresenterImageVideoRel;
};

export const DEFAULT_PRESENTER_VIDEO_REL: PresenterImageVideoRel = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

/** Props para `DesignerPageCanvasView` / `PresenterSlideStage` (vídeo en lienzo). */
export type PresenterImageVideoCanvasBinding = {
  pageId: string;
  placements: PresenterImageVideoPlacement[];
  uiMode: "edit" | "playback";
  uploadingKey: string | null;
  onUploadBusy: (key: string | null) => void;
  onUpsert: (p: PresenterImageVideoPlacement) => void;
  onPatch: (id: string, patch: Partial<Pick<PresenterImageVideoPlacement, "rel">>) => void;
  onRemove: (id: string) => void;
};
