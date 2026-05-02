import type { MediaListItem, MediaListOutput } from "../media-list-output";
import type { VideoEditorRenderManifest, VideoEditorRenderManifestResult } from "./video-editor-render-types";
import {
  createEmptyVideoEditorData,
  createDefaultVideoEditorRenderState,
  VIDEO_EDITOR_TRACK_ORDER,
  type TimelineAudioRequest,
  type VideoEditorClip,
  type VideoEditorNodeData,
  type VideoEditorTrackKind,
} from "./video-editor-types";

export function mediaListFingerprint(mediaList: MediaListOutput | null | undefined): string {
  if (!mediaList) return "";
  return [
    mediaList.sourceNodeId,
    mediaList.status,
    mediaList.items.length,
    mediaList.items.map((item) => `${item.id}:${item.assetId || item.url || ""}:${item.status || ""}:${item.order}`).join("|"),
  ].join("::");
}

export function normalizeVideoEditorData(raw: unknown): VideoEditorNodeData {
  const base = createEmptyVideoEditorData();
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Partial<VideoEditorNodeData>;
  const tracksInput = input.tracks ?? base.tracks;
  const tracks = VIDEO_EDITOR_TRACK_ORDER.reduce((acc, track) => {
    acc[track] = Array.isArray(tracksInput[track]) ? tracksInput[track] as VideoEditorClip[] : [];
    return acc;
  }, {} as VideoEditorNodeData["tracks"]);
  const data: VideoEditorNodeData = {
    ...base,
    ...input,
    tracks,
    playheadTime: Number.isFinite(Number(input.playheadTime)) ? Number(input.playheadTime) : 0,
    timelineZoom: Number.isFinite(Number(input.timelineZoom)) ? Math.min(80, Math.max(8, Number(input.timelineZoom))) : base.timelineZoom,
    totalDurationSeconds: Number.isFinite(Number(input.totalDurationSeconds)) ? Number(input.totalDurationSeconds) : calculateTimelineDuration(tracks),
    audioRequests: Array.isArray(input.audioRequests) ? input.audioRequests : [],
    subtitleTracks: Array.isArray(input.subtitleTracks) ? input.subtitleTracks : [],
    selectedSubtitleSegmentId: typeof input.selectedSubtitleSegmentId === "string" ? input.selectedSubtitleSegmentId : undefined,
    status: input.status ?? "empty",
    render: {
      ...createDefaultVideoEditorRenderState(),
      ...(input.render ?? {}),
      settings: {
        ...createDefaultVideoEditorRenderState().settings,
        ...(input.render?.settings ?? {}),
      },
    },
  };
  return {
    ...data,
    totalDurationSeconds: calculateTimelineDuration(data.tracks),
  };
}

export function buildVideoEditorRenderManifest(
  data: VideoEditorNodeData,
  editorNodeId: string,
): VideoEditorRenderManifestResult {
  const normalized = normalizeVideoEditorData(data);
  const renderState = normalized.render ?? createDefaultVideoEditorRenderState();
  const settings = renderState.settings ?? createDefaultVideoEditorRenderState().settings;
  const errors: string[] = [];
  const warnings: string[] = [];
  let ignoredClips = 0;
  const tracks = VIDEO_EDITOR_TRACK_ORDER.reduce((acc, track) => {
    acc[track] = normalized.tracks[track]
      .filter((clip) => {
        const keep = Boolean(clip.assetId || clip.url) && (clip.mediaType === "image" || clip.mediaType === "video" || clip.mediaType === "audio");
        if (!keep) ignoredClips++;
        return keep;
      })
      .map((clip) => ({
        id: clip.id,
        assetId: clip.assetId || clip.url || "",
        url: clip.url,
        s3Key: clip.s3Key,
        mediaType: clip.mediaType,
        track,
        startTime: Math.max(0, clip.startTime),
        durationSeconds: Math.max(0.1, clip.durationSeconds),
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        volume: clip.mute ? 0 : clip.volume,
        fadeInSeconds: clip.fadeInSeconds,
        fadeOutSeconds: clip.fadeOutSeconds,
        fitMode: clip.framing ?? "fill",
        title: clip.title,
        metadata: clip.metadata,
      }))
      .sort((a, b) => a.startTime - b.startTime);
    return acc;
  }, {} as VideoEditorRenderManifest["tracks"]);
  const visualClips = tracks.video.filter((clip) => clip.mediaType === "image" || clip.mediaType === "video");
  if (!visualClips.length) errors.push("No hay clips visuales en la pista Video.");
  if (normalized.totalDurationSeconds <= 0) errors.push("La duración del timeline es 0.");
  for (let i = 1; i < visualClips.length; i++) {
    const previous = visualClips[i - 1];
    const current = visualClips[i];
    if (previous.startTime + previous.durationSeconds > current.startTime + 0.01) {
      warnings.push("Hay clips visuales solapados. Render V1 usará el orden temporal simple.");
      break;
    }
  }
  const includedClips = VIDEO_EDITOR_TRACK_ORDER.reduce((count, track) => count + tracks[track].length, 0);
  const subtitleTracks = (normalized.subtitleTracks ?? [])
    .filter((track) => track.enabled && track.document?.segments?.length)
    .map((track) => ({
      id: track.id,
      enabled: track.enabled,
      mode: track.mode,
      burnIn: track.burnIn,
      documentKey: track.documentKey,
      document: track.document,
      exportSrt: track.exportSrt,
      exportVtt: track.exportVtt,
      exportAss: track.exportAss,
      style: track.style,
    }));
  const manifest = {
    editorNodeId,
    settings: {
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      format: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      quality: settings.quality,
      backgroundColor: "black" as const,
    },
    durationSeconds: calculateTimelineDuration(normalized.tracks),
    tracks,
    subtitleTracks,
    metadata: {
      sourceMediaListId: normalized.sourceMediaList?.sourceNodeId,
      projectTitle: normalized.sourceMediaList?.title,
      createdAt: new Date().toISOString(),
    },
  };
  return {
    ok: errors.length === 0,
    manifest,
    errors,
    warnings,
    includedClips,
    ignoredClips,
  };
}

function itemSortValue(item: MediaListItem): number {
  return (item.sceneOrder ?? item.order ?? 0) * 100 + (item.frameRole === "end" ? 2 : item.frameRole === "start" ? 1 : 0);
}

function shouldSkipTimelineItem(item: MediaListItem, sceneIdsWithVideo: Set<string>): boolean {
  if (item.mediaType === "placeholder") return true;
  if (!item.assetId && !item.url) return true;
  if (item.mediaType !== "image" && item.mediaType !== "video" && item.mediaType !== "audio") return true;
  return item.mediaType === "image" && Boolean(item.sceneId && sceneIdsWithVideo.has(item.sceneId));
}

function trackForMediaItem(item: MediaListItem): VideoEditorTrackKind {
  if (item.mediaType === "audio") return "audio";
  return "video";
}

export function clipFromMediaListItem(item: MediaListItem, startTime: number): VideoEditorClip {
  const durationSeconds = item.durationSeconds ?? (item.mediaType === "image" ? 4 : 5);
  return {
    id: `clip_${item.id}`,
    sourceItemId: item.id,
    assetId: item.assetId || item.url,
    url: item.url,
    s3Key: item.s3Key,
    mediaType: item.mediaType === "audio" ? "audio" : item.mediaType === "video" ? "video" : "image",
    track: trackForMediaItem(item),
    title: item.title,
    startTime,
    durationSeconds,
    volume: item.mediaType === "audio" ? 1 : undefined,
    fadeInSeconds: item.mediaType === "audio" ? 0 : undefined,
    fadeOutSeconds: item.mediaType === "audio" ? 0 : undefined,
    mute: false,
    framing: item.mediaType === "image" ? "fill" : undefined,
    motion: item.mediaType === "image" ? "none" : undefined,
    sceneId: item.sceneId,
    sceneOrder: item.sceneOrder,
    metadata: item.metadata,
    status: item.status === "error" ? "error" : item.status === "approved" ? "approved" : "ready",
  };
}

export function buildInitialVideoEditorTracks(mediaList: MediaListOutput): VideoEditorNodeData["tracks"] {
  const ordered = [...mediaList.items].sort((a, b) => itemSortValue(a) - itemSortValue(b));
  const sceneIdsWithVideo = new Set(
    ordered
      .filter((item) => item.mediaType === "video" && Boolean(item.assetId || item.url) && item.sceneId)
      .map((item) => item.sceneId as string),
  );
  const tracks = createEmptyVideoEditorData().tracks;
  let videoStart = 0;
  let audioStart = 0;
  ordered.forEach((item) => {
    if (shouldSkipTimelineItem(item, sceneIdsWithVideo)) return;
    const track = trackForMediaItem(item);
    const start = track === "video" ? videoStart : audioStart;
    const clip = clipFromMediaListItem(item, start);
    tracks[track] = [...tracks[track], clip];
    if (track === "video") videoStart += clip.durationSeconds;
    else audioStart += clip.durationSeconds;
  });
  return tracks;
}

export function calculateTimelineDuration(tracks: VideoEditorNodeData["tracks"]): number {
  return VIDEO_EDITOR_TRACK_ORDER.reduce((max, track) => {
    const trackMax = (tracks[track] ?? []).reduce((innerMax, clip) => Math.max(innerMax, clip.startTime + clip.durationSeconds), 0);
    return Math.max(max, trackMax);
  }, 0);
}

export function clampVideoEditorTime(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function getActiveVisualClipAtTime(data: VideoEditorNodeData, time: number): VideoEditorClip | undefined {
  const currentTime = Math.max(0, time);
  return [...data.tracks.video]
    .sort((a, b) => a.startTime - b.startTime)
    .find((clip) => (
      (clip.mediaType === "video" || clip.mediaType === "image")
      && clip.startTime <= currentTime
      && currentTime < clip.startTime + Math.max(0.01, clip.durationSeconds)
    ));
}

export function getActiveAudioClipsAtTime(data: VideoEditorNodeData, time: number): VideoEditorClip[] {
  const currentTime = Math.max(0, time);
  return VIDEO_EDITOR_TRACK_ORDER
    .filter((track) => track !== "video")
    .flatMap((track) => data.tracks[track])
    .filter((clip) => clip.mediaType === "audio" && clip.startTime <= currentTime && currentTime < clip.startTime + Math.max(0.01, clip.durationSeconds));
}

function avoidVideoOverlap(clips: VideoEditorClip[], movingClip: VideoEditorClip, desiredStart: number, desiredDuration = movingClip.durationSeconds): number {
  const ordered = clips
    .filter((clip) => clip.id !== movingClip.id)
    .sort((a, b) => a.startTime - b.startTime);
  let start = Math.max(0, desiredStart);
  for (const clip of ordered) {
    const overlaps = start < clip.startTime + clip.durationSeconds && start + desiredDuration > clip.startTime;
    if (!overlaps) continue;
    start = desiredStart < clip.startTime ? Math.max(0, clip.startTime - desiredDuration) : clip.startTime + clip.durationSeconds;
  }
  return Math.max(0, start);
}

export function moveVideoEditorClip(data: VideoEditorNodeData, clipId: string, desiredStartTime: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked) return clip;
      const startTime = track === "video" ? avoidVideoOverlap(data.tracks.video, clip, desiredStartTime) : Math.max(0, desiredStartTime);
      return { ...clip, startTime };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function resizeVideoEditorClip(data: VideoEditorNodeData, clipId: string, desiredDurationSeconds: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked) return clip;
      let durationSeconds = Math.max(0.1, desiredDurationSeconds);
      if (track === "video") {
        const next = data.tracks.video
          .filter((item) => item.id !== clip.id && item.startTime >= clip.startTime)
          .sort((a, b) => a.startTime - b.startTime)[0];
        if (next) durationSeconds = Math.min(durationSeconds, Math.max(0.1, next.startTime - clip.startTime));
      }
      return { ...clip, durationSeconds };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function trimVideoEditorClipStart(data: VideoEditorNodeData, clipId: string, desiredStartTime: number): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    tracks[track] = tracks[track].map((clip) => {
      if (clip.id !== clipId || clip.locked) return clip;
      const originalEnd = clip.startTime + clip.durationSeconds;
      const previous = track === "video"
        ? data.tracks.video
          .filter((item) => item.id !== clip.id && item.startTime + item.durationSeconds <= clip.startTime + 0.01)
          .sort((a, b) => (b.startTime + b.durationSeconds) - (a.startTime + a.durationSeconds))[0]
        : undefined;
      const minStart = previous ? previous.startTime + previous.durationSeconds : 0;
      const nextStart = Math.min(originalEnd - 0.1, Math.max(minStart, desiredStartTime));
      const startDelta = nextStart - clip.startTime;
      const trimStart = clip.mediaType === "video" ? Math.max(0, (clip.trimStart ?? 0) + startDelta) : clip.trimStart;
      return {
        ...clip,
        startTime: nextStart,
        durationSeconds: Math.max(0.1, originalEnd - nextStart),
        trimStart,
      };
    });
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function ingestMediaListToVideoEditor(mediaList: MediaListOutput, existing?: VideoEditorNodeData): VideoEditorNodeData {
  const current = normalizeVideoEditorData(existing);
  const freshTracks = buildInitialVideoEditorTracks(mediaList);
  const existingSourceIds = new Set(
    VIDEO_EDITOR_TRACK_ORDER.flatMap((track) => current.tracks[track].map((clip) => clip.sourceItemId).filter(Boolean) as string[]),
  );
  const mergedTracks = { ...current.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    const additions = freshTracks[track].filter((clip) => !clip.sourceItemId || !existingSourceIds.has(clip.sourceItemId));
    mergedTracks[track] = [...mergedTracks[track], ...additions];
  });
  const next: VideoEditorNodeData = {
    ...current,
    sourceMediaList: mediaList,
    sourceMediaListFingerprint: mediaListFingerprint(mediaList),
    tracks: mergedTracks,
    status: "media_loaded",
  };
  return {
    ...next,
    totalDurationSeconds: calculateTimelineDuration(next.tracks),
  };
}

export function patchVideoEditorClip(data: VideoEditorNodeData, clipId: string, patch: Partial<VideoEditorClip>): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  if (patch.track && VIDEO_EDITOR_TRACK_ORDER.includes(patch.track)) {
    const originalTrack = VIDEO_EDITOR_TRACK_ORDER.find((track) => tracks[track].some((clip) => clip.id === clipId));
    const originalClip = originalTrack ? tracks[originalTrack].find((clip) => clip.id === clipId) : undefined;
    if (originalClip) {
      VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
        tracks[track] = tracks[track].filter((clip) => clip.id !== clipId);
      });
      const nextClip = { ...originalClip, ...patch, track: patch.track };
      tracks[patch.track] = [...tracks[patch.track], nextClip];
      return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
    }
  }
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    tracks[track] = tracks[track].map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip);
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function removeVideoEditorClip(data: VideoEditorNodeData, clipId: string): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    tracks[track] = tracks[track].filter((clip) => clip.id !== clipId);
  });
  return { ...data, tracks, selectedClipId: data.selectedClipId === clipId ? undefined : data.selectedClipId, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function duplicateVideoEditorClip(data: VideoEditorNodeData, clipId: string): VideoEditorNodeData {
  const tracks = { ...data.tracks };
  VIDEO_EDITOR_TRACK_ORDER.forEach((track) => {
    const clip = tracks[track].find((item) => item.id === clipId);
    if (!clip) return;
    tracks[track] = [...tracks[track], { ...clip, id: `clip_dup_${Date.now()}`, startTime: clip.startTime + clip.durationSeconds }];
  });
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function addMediaListItemToTimeline(data: VideoEditorNodeData, item: MediaListItem): VideoEditorNodeData {
  if (item.mediaType === "placeholder" || (!item.assetId && !item.url)) return data;
  const track = trackForMediaItem(item);
  const startTime = track === "video" ? calculateTimelineDuration({ ...createEmptyVideoEditorData().tracks, video: data.tracks.video }) : data.playheadTime;
  const clip = clipFromMediaListItem(item, startTime);
  const tracks = { ...data.tracks, [track]: [...data.tracks[track], { ...clip, id: `${clip.id}_${Date.now()}` }] };
  return { ...data, tracks, totalDurationSeconds: calculateTimelineDuration(tracks), status: "editing" };
}

export function createAudioRequest(args: {
  type: TimelineAudioRequest["type"];
  playheadTime: number;
  durationSeconds: number;
  prompt: string;
  mood?: string;
  intensity?: TimelineAudioRequest["intensity"];
  energy?: TimelineAudioRequest["energy"];
  variations: number;
  sourceNodeId?: string;
  sourceMediaListId?: string;
}): TimelineAudioRequest {
  return {
    id: `audio_request_${Date.now()}`,
    type: args.type,
    startTime: args.playheadTime,
    durationSeconds: args.durationSeconds,
    prompt: args.prompt,
    mood: args.mood,
    intensity: args.intensity,
    energy: args.energy,
    variations: args.variations,
    status: "draft",
    metadata: {
      generatedFrom: "video-editor",
      sourceNodeId: args.sourceNodeId,
      sourceMediaListId: args.sourceMediaListId,
      createdAt: new Date().toISOString(),
    },
  };
}

function trackForAudioRequest(type: TimelineAudioRequest["type"]): VideoEditorTrackKind {
  if (type === "music") return "music";
  if (type === "ambience") return "ambience";
  if (type === "voiceover") return "voiceover";
  return "sfx";
}

export function approveTimelineAudioVariation(data: VideoEditorNodeData, requestId: string, assetId: string, variationIndex: number): VideoEditorNodeData {
  const request = data.audioRequests.find((item) => item.id === requestId);
  if (!request) return data;
  const approvedRequest: TimelineAudioRequest = {
    ...request,
    status: "approved",
    approvedAssetId: assetId,
    selectedVariationIndex: variationIndex,
  };
  const track = trackForAudioRequest(request.type);
  const clip: VideoEditorClip = {
    id: `clip_${request.id}_${variationIndex}`,
    assetId,
    mediaType: "audio",
    track,
    title: request.prompt.slice(0, 64) || request.type,
    startTime: request.startTime,
    durationSeconds: request.durationSeconds,
    volume: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    mute: false,
    metadata: request.metadata,
    status: "approved",
  };
  const tracks = { ...data.tracks, [track]: [...data.tracks[track], clip] };
  return {
    ...data,
    tracks,
    audioRequests: data.audioRequests.map((item) => item.id === requestId ? approvedRequest : item),
    totalDurationSeconds: calculateTimelineDuration(tracks),
    status: "editing",
  };
}

export function buildVideoEditorMediaListOutput(data: VideoEditorNodeData): MediaListOutput {
  const clips = VIDEO_EDITOR_TRACK_ORDER.flatMap((track) => data.tracks[track]);
  return {
    kind: "media_list",
    sourceNodeId: "video-editor",
    sourceNodeType: "video_editor",
    title: data.label || "Video Editor",
    status: clips.length ? "frames_ready" : "empty",
    items: clips.map((clip, index) => ({
      id: clip.id,
      order: index + 1,
      title: clip.title,
      mediaType: clip.mediaType,
      role: clip.track,
      assetId: clip.assetId,
      url: clip.url,
      s3Key: clip.s3Key,
      durationSeconds: clip.durationSeconds,
      sceneId: clip.sceneId,
      sceneOrder: clip.sceneOrder,
      status: clip.status === "approved" ? "approved" : clip.status === "error" ? "error" : "generated",
      metadata: {
        ...(clip.metadata && typeof clip.metadata === "object" ? clip.metadata as Record<string, unknown> : {}),
        track: clip.track,
        startTime: clip.startTime,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        volume: clip.volume,
        fadeInSeconds: clip.fadeInSeconds,
        fadeOutSeconds: clip.fadeOutSeconds,
      },
    })),
    metadata: {
      cineNodeId: "",
      generatedAt: new Date().toISOString(),
      totalFrames: clips.length,
    },
  };
}
