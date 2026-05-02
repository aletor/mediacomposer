export type RenderSubtitleMode = "lines" | "word-by-word" | "karaoke";

export type SubtitleDocumentStatus = "draft" | "transcribing" | "synced" | "edited" | "ready" | "error";

export type SubtitleWord = {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  emphasis?: "none" | "strong" | "highlight" | "beat";
};

export type SubtitleSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: SubtitleWord[];
  locked?: boolean;
};

export type SubtitleStyle = {
  preset: "minimal" | "creator" | "cinematic" | "documentary" | "corporate" | "karaoke";
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  activeColor?: string;
  background?: {
    enabled: boolean;
    color: string;
    opacity: number;
    radius: number;
    padding: number;
  };
  position: {
    x: number;
    y: number;
    anchor: "bottom" | "center" | "top";
  };
  animation?: {
    type: "none" | "fade" | "pop" | "karaoke" | "word-scale" | "underline";
    intensity: number;
  };
};

export type FoldderSubtitleDocument = {
  id: string;
  sourceAssetId: string;
  timelineId?: string;
  language: string;
  mode: RenderSubtitleMode;
  status: SubtitleDocumentStatus;
  durationSeconds?: number;
  segments: SubtitleSegment[];
  style: SubtitleStyle;
  exports?: {
    srtKey?: string;
    vttKey?: string;
    assKey?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type VideoEditorSubtitleTrack = {
  id: string;
  enabled: boolean;
  mode: RenderSubtitleMode;
  burnIn: boolean;
  exportSrt: boolean;
  exportVtt: boolean;
  exportAss: boolean;
  documentKey?: string;
  document: FoldderSubtitleDocument;
  style: SubtitleStyle;
};

export function createDefaultSubtitleStyle(preset: SubtitleStyle["preset"] = "creator"): SubtitleStyle {
  const base: SubtitleStyle = {
    preset,
    fontFamily: "Arial",
    fontSize: preset === "cinematic" ? 48 : 54,
    fontWeight: preset === "minimal" ? 600 : 800,
    color: "#ffffff",
    activeColor: "#ffe66d",
    background: {
      enabled: preset !== "minimal",
      color: "#000000",
      opacity: preset === "cinematic" ? 0.42 : 0.58,
      radius: 18,
      padding: 18,
    },
    position: {
      x: 50,
      y: preset === "cinematic" ? 86 : 82,
      anchor: "bottom",
    },
    animation: {
      type: preset === "karaoke" ? "karaoke" : "none",
      intensity: 0.45,
    },
  };
  if (preset === "documentary") return { ...base, fontSize: 42, fontWeight: 650, background: { ...base.background!, opacity: 0.36 } };
  if (preset === "corporate") return { ...base, fontSize: 44, fontWeight: 700, background: { ...base.background!, opacity: 0.5, radius: 10 } };
  if (preset === "minimal") return { ...base, background: { ...base.background!, enabled: false } };
  return base;
}
