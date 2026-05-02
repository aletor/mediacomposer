import type { VideoEditorTrackKind } from "./video-editor-types";
import type { FoldderSubtitleDocument, RenderSubtitleMode, SubtitleStyle } from "./subtitles-types";

export type VideoEditorRenderSettings = {
  width: number;
  height: number;
  fps: 24 | 25 | 30;
  format: "mp4";
  videoCodec: "h264";
  audioCodec: "aac";
  quality: "preview" | "high";
  backgroundColor: "black";
};

export type VideoEditorRenderClip = {
  id: string;
  assetId: string;
  url?: string;
  s3Key?: string;
  mediaType: "image" | "video" | "audio";
  track: VideoEditorTrackKind;
  startTime: number;
  durationSeconds: number;
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  fitMode?: "fit" | "fill" | "crop_center";
  title?: string;
  metadata?: unknown;
};

export type VideoEditorRenderManifest = {
  editorNodeId: string;
  settings: VideoEditorRenderSettings;
  durationSeconds: number;
  tracks: Record<VideoEditorTrackKind, VideoEditorRenderClip[]>;
  subtitleTracks?: Array<{
    id: string;
    enabled: boolean;
    mode: RenderSubtitleMode;
    burnIn: boolean;
    documentKey?: string;
    document?: FoldderSubtitleDocument;
    exportSrt?: boolean;
    exportVtt?: boolean;
    exportAss?: boolean;
    style: SubtitleStyle;
  }>;
  metadata?: {
    sourceMediaListId?: string;
    projectTitle?: string;
    createdAt: string;
  };
};

export type VideoEditorRenderManifestResult = {
  ok: boolean;
  manifest?: VideoEditorRenderManifest;
  errors: string[];
  warnings: string[];
  includedClips: number;
  ignoredClips: number;
};
