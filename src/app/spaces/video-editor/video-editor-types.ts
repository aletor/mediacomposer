import type { MediaListOutput } from "../media-list-output";
import type { VideoEditorSubtitleTrack } from "./subtitles-types";

export type VideoEditorTrackKind = "video" | "audio" | "music" | "sfx" | "ambience" | "voiceover";

export type VideoEditorRenderSettings = {
  resolution: "720p" | "1080p";
  width: number;
  height: number;
  fps: 24 | 25 | 30;
  format: "mp4";
  videoCodec: "h264";
  audioCodec: "aac";
  quality: "preview" | "high";
};

export type VideoEditorRenderState = {
  status: "idle" | "preparing" | "rendering" | "uploading" | "ready" | "error";
  renderId?: string;
  outputAssetId?: string;
  outputUrl?: string;
  s3Key?: string;
  progress?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  settings: VideoEditorRenderSettings;
};

export type VideoEditorClip = {
  id: string;
  sourceItemId?: string;
  assetId?: string;
  url?: string;
  s3Key?: string;
  mediaType: "image" | "video" | "audio";
  track: VideoEditorTrackKind;
  title: string;
  startTime: number;
  durationSeconds: number;
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  locked?: boolean;
  mute?: boolean;
  framing?: "fit" | "fill" | "crop_center";
  motion?: "none" | "slow_zoom_in" | "slow_zoom_out" | "pan_left" | "pan_right";
  sceneId?: string;
  sceneOrder?: number;
  metadata?: unknown;
  status?: "ready" | "pending" | "generated" | "approved" | "error";
};

export type TimelineAudioRequest = {
  id: string;
  type: "sfx" | "music" | "ambience" | "voiceover";
  startTime: number;
  durationSeconds: number;
  prompt: string;
  mood?: string;
  intensity?: "low" | "medium" | "high";
  energy?: "low" | "medium" | "high";
  variations: number;
  status: "draft" | "generating" | "generated" | "approved" | "error";
  generatedAssetIds?: string[];
  approvedAssetId?: string;
  selectedVariationIndex?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: {
    generatedFrom: "video-editor";
    sourceNodeId?: string;
    sourceMediaListId?: string;
    createdAt?: string;
  };
};

export type VideoEditorNodeData = {
  label?: string;
  sourceMediaList?: MediaListOutput;
  sourceMediaListFingerprint?: string;
  tracks: Record<VideoEditorTrackKind, VideoEditorClip[]>;
  selectedClipId?: string;
  playheadTime: number;
  timelineZoom?: number;
  totalDurationSeconds: number;
  audioRequests: TimelineAudioRequest[];
  subtitleTracks?: VideoEditorSubtitleTrack[];
  selectedSubtitleSegmentId?: string;
  status: "empty" | "media_loaded" | "editing" | "generating_audio" | "ready";
  render?: VideoEditorRenderState;
};

export const VIDEO_EDITOR_TRACK_LABELS: Record<VideoEditorTrackKind, string> = {
  video: "Video",
  audio: "Audio original",
  music: "Música",
  sfx: "SFX / Ruidos",
  ambience: "Ambiente",
  voiceover: "Voz en off",
};

export const VIDEO_EDITOR_TRACK_ORDER: VideoEditorTrackKind[] = [
  "video",
  "audio",
  "sfx",
  "music",
  "ambience",
  "voiceover",
];

export function createEmptyVideoEditorData(): VideoEditorNodeData {
  return {
    label: "Video Editor",
    tracks: {
      video: [],
      audio: [],
      music: [],
      sfx: [],
      ambience: [],
      voiceover: [],
    },
    playheadTime: 0,
    timelineZoom: 18,
    totalDurationSeconds: 0,
    audioRequests: [],
    subtitleTracks: [],
    status: "empty",
    render: createDefaultVideoEditorRenderState(),
  };
}

export function createDefaultVideoEditorRenderState(): VideoEditorRenderState {
  return {
    status: "idle",
    settings: {
      resolution: "1080p",
      width: 1920,
      height: 1080,
      fps: 25,
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      quality: "high",
    },
  };
}
