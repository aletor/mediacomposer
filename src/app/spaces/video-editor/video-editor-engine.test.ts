import { describe, expect, it } from "vitest";

import type { MediaListOutput } from "../media-list-output";
import {
  approveTimelineAudioVariation,
  buildInitialVideoEditorTracks,
  buildVideoEditorRenderManifest,
  createAudioRequest,
  getActiveVisualClipAtTime,
  ingestMediaListToVideoEditor,
  moveVideoEditorClip,
  resizeVideoEditorClip,
  trimVideoEditorClipStart,
} from "./video-editor-engine";
import { createEmptyVideoEditorData } from "./video-editor-types";
import { composeSegmentsFromWords } from "./subtitle-utils";
import { createDefaultSubtitleStyle, type VideoEditorSubtitleTrack } from "./subtitles-types";

function mediaList(items: MediaListOutput["items"]): MediaListOutput {
  return {
    kind: "media_list",
    sourceNodeId: "cine_1",
    sourceNodeType: "cine",
    title: "Cine",
    status: "frames_ready",
    items,
    metadata: {
      cineNodeId: "cine_1",
      generatedAt: "2026-05-01T00:00:00.000Z",
    },
  };
}

describe("video editor engine", () => {
  it("prioritizes scene videos over frames from the same scene", () => {
    const tracks = buildInitialVideoEditorTracks(mediaList([
      { id: "frame_1", order: 1, title: "Frame", mediaType: "image", role: "storyboard_frame", assetId: "asset://frame", sceneId: "scene_1", sceneOrder: 1, status: "generated" },
      { id: "video_1", order: 2, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", sceneId: "scene_1", sceneOrder: 1, status: "generated", durationSeconds: 8 },
    ]));

    expect(tracks.video).toHaveLength(1);
    expect(tracks.video[0]?.mediaType).toBe("video");
    expect(tracks.video[0]?.assetId).toBe("asset://video");
  });

  it("turns images into still clips and ignores placeholders", () => {
    const tracks = buildInitialVideoEditorTracks(mediaList([
      { id: "image_1", order: 1, title: "Still", mediaType: "image", role: "storyboard_frame", assetId: "asset://still", status: "generated" },
      { id: "pending", order: 2, title: "Pendiente", mediaType: "placeholder", role: "storyboard_placeholder", status: "pending" },
    ]));

    expect(tracks.video).toHaveLength(1);
    expect(tracks.video[0]?.durationSeconds).toBe(4);
    expect(tracks.video[0]?.title).toBe("Still");
  });

  it("refreshes media without duplicating existing source clips", () => {
    const list = mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated" },
    ]);
    const first = ingestMediaListToVideoEditor(list, createEmptyVideoEditorData());
    const second = ingestMediaListToVideoEditor(list, first);

    expect(first.tracks.video).toHaveLength(1);
    expect(second.tracks.video).toHaveLength(1);
  });

  it("creates an approved audio clip from an approved variation", () => {
    const data = createEmptyVideoEditorData();
    const request = {
      ...createAudioRequest({
        type: "sfx",
        playheadTime: 12,
        durationSeconds: 2,
        prompt: "Puffy ladra dos veces",
        variations: 2,
      }),
      status: "generated" as const,
      generatedAssetIds: ["asset://sfx-1", "asset://sfx-2"],
    };
    const next = approveTimelineAudioVariation({ ...data, audioRequests: [request] }, request.id, "asset://sfx-1", 0);

    expect(next.audioRequests[0]?.status).toBe("approved");
    expect(next.tracks.sfx).toHaveLength(1);
    expect(next.tracks.sfx[0]?.startTime).toBe(12);
    expect(next.tracks.sfx[0]?.assetId).toBe("asset://sfx-1");
  });

  it("finds the active visual clip at the playhead", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Still A", mediaType: "image", role: "storyboard_frame", assetId: "asset://a", status: "generated", durationSeconds: 3 },
      { id: "image_2", order: 2, title: "Still B", mediaType: "image", role: "storyboard_frame", assetId: "asset://b", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());

    expect(getActiveVisualClipAtTime(data, 1)?.title).toBe("Still A");
    expect(getActiveVisualClipAtTime(data, 3.2)?.title).toBe("Still B");
    expect(getActiveVisualClipAtTime(data, 8)).toBeUndefined();
  });

  it("keeps video clips from overlapping when moved or resized", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "image_1", order: 1, title: "Still A", mediaType: "image", role: "storyboard_frame", assetId: "asset://a", status: "generated", durationSeconds: 3 },
      { id: "image_2", order: 2, title: "Still B", mediaType: "image", role: "storyboard_frame", assetId: "asset://b", status: "generated", durationSeconds: 4 },
    ]), createEmptyVideoEditorData());

    const moved = moveVideoEditorClip(data, data.tracks.video[1]?.id ?? "", 1);
    expect(moved.tracks.video[1]?.startTime).toBeGreaterThanOrEqual(3);

    const resized = resizeVideoEditorClip(data, data.tracks.video[0]?.id ?? "", 10);
    expect(resized.tracks.video[0]?.durationSeconds).toBe(3);
  });

  it("trims a clip from the start while keeping its end fixed", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "asset://video", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const clipId = data.tracks.video[0]?.id ?? "";

    const trimmed = trimVideoEditorClipStart(data, clipId, 2);

    expect(trimmed.tracks.video[0]?.startTime).toBe(2);
    expect(trimmed.tracks.video[0]?.durationSeconds).toBe(6);
    expect(trimmed.tracks.video[0]?.trimStart).toBe(2);
  });

  it("builds a render manifest and preserves trim and volume", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "knowledge-files/video.mp4", status: "generated", durationSeconds: 8 },
      { id: "audio_1", order: 2, title: "Music", mediaType: "audio", role: "music", assetId: "knowledge-files/music.m4a", status: "generated", durationSeconds: 8 },
      { id: "pending", order: 3, title: "Pending", mediaType: "placeholder", role: "storyboard_placeholder", status: "pending" },
    ]), createEmptyVideoEditorData());
    const videoId = data.tracks.video[0]?.id ?? "";
    const audioId = data.tracks.audio[0]?.id ?? "";
    const patched = {
      ...data,
      tracks: {
        ...data.tracks,
        video: data.tracks.video.map((clip) => clip.id === videoId ? { ...clip, trimStart: 1 } : clip),
        audio: data.tracks.audio.map((clip) => clip.id === audioId ? { ...clip, volume: 0.4, fadeInSeconds: 1 } : clip),
      },
    };

    const result = buildVideoEditorRenderManifest(patched, "editor_1");

    expect(result.ok).toBe(true);
    expect(result.manifest?.tracks.video[0]?.trimStart).toBe(1);
    expect(result.manifest?.tracks.audio[0]?.volume).toBe(0.4);
    expect(result.manifest?.durationSeconds).toBe(8);
    expect(result.ignoredClips).toBe(0);
  });

  it("rejects render manifests without visual clips", () => {
    const result = buildVideoEditorRenderManifest(createEmptyVideoEditorData(), "editor_1");

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("No hay clips visuales");
  });

  it("composes word timestamps into readable subtitle segments", () => {
    const segments = composeSegmentsFromWords([
      { id: "w1", text: "Hola", start: 0, end: 0.3 },
      { id: "w2", text: "Puffy.", start: 0.32, end: 0.7 },
      { id: "w3", text: "Entramos", start: 1.4, end: 1.8 },
      { id: "w4", text: "al", start: 1.82, end: 2 },
      { id: "w5", text: "bosque", start: 2.02, end: 2.4 },
    ], { respectPauses: true, maxCharsPerLine: 30 });

    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe("Hola Puffy.");
    expect(segments[1]?.text).toBe("Entramos al bosque");
  });

  it("adds enabled subtitles to the render manifest", () => {
    const data = ingestMediaListToVideoEditor(mediaList([
      { id: "video_1", order: 1, title: "Video", mediaType: "video", role: "scene_video", assetId: "knowledge-files/video.mp4", status: "generated", durationSeconds: 8 },
    ]), createEmptyVideoEditorData());
    const style = createDefaultSubtitleStyle("creator");
    const subtitleTrack: VideoEditorSubtitleTrack = {
      id: "sub_track_1",
      enabled: true,
      mode: "lines",
      burnIn: true,
      exportSrt: true,
      exportVtt: true,
      exportAss: true,
      style,
      document: {
        id: "sub_doc_1",
        sourceAssetId: "knowledge-files/video.mp4",
        language: "es",
        mode: "lines",
        status: "synced",
        durationSeconds: 8,
        style,
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
        segments: [
          {
            id: "seg_1",
            start: 0,
            end: 2,
            text: "Hola bosque",
            words: [
              { id: "w1", text: "Hola", start: 0, end: 0.6 },
              { id: "w2", text: "bosque", start: 0.7, end: 1.2 },
            ],
          },
        ],
      },
    };

    const result = buildVideoEditorRenderManifest({ ...data, subtitleTracks: [subtitleTrack] }, "editor_1");

    expect(result.ok).toBe(true);
    expect(result.manifest?.subtitleTracks).toHaveLength(1);
    expect(result.manifest?.subtitleTracks?.[0]?.burnIn).toBe(true);
    expect(result.manifest?.subtitleTracks?.[0]?.document?.segments[0]?.text).toBe("Hola bosque");
  });
});
