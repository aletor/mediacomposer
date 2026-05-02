"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Position, type NodeProps, useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { Captions, Clock, Copy, Download, File, Film, ImageIcon, Layers, Music, Pause, Play, RefreshCw, SkipBack, SkipForward, StepBack, StepForward, Trash2, Video, Volume2, X } from "lucide-react";

import { downloadS3Object, forceDownloadUrl } from "@/lib/browser-download";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";
import { ScrubNumberInput } from "../ScrubNumberInput";
import { FoldderDataHandle } from "../FoldderDataHandle";
import { readMediaListFromNode } from "../media-list-consumers";
import type { MediaListItem, MediaListOutput } from "../media-list-output";
import { generateTimelineAudio } from "./video-editor-audio-generation-service";
import {
  addMediaListItemToTimeline,
  approveTimelineAudioVariation,
  buildVideoEditorRenderManifest,
  calculateTimelineDuration,
  clampVideoEditorTime,
  createAudioRequest,
  duplicateVideoEditorClip,
  getActiveAudioClipsAtTime,
  getActiveVisualClipAtTime,
  ingestMediaListToVideoEditor,
  moveVideoEditorClip,
  normalizeVideoEditorData,
  patchVideoEditorClip,
  removeVideoEditorClip,
  resizeVideoEditorClip,
  trimVideoEditorClipStart,
} from "./video-editor-engine";
import {
  VIDEO_EDITOR_TRACK_LABELS,
  VIDEO_EDITOR_TRACK_ORDER,
  createDefaultVideoEditorRenderState,
  type TimelineAudioRequest,
  type VideoEditorClip,
  type VideoEditorNodeData,
  type VideoEditorRenderState,
} from "./video-editor-types";
import type { VideoEditorRenderManifestResult } from "./video-editor-render-types";
import { createDefaultSubtitleStyle, type FoldderSubtitleDocument, type RenderSubtitleMode, type SubtitleStyle, type VideoEditorSubtitleTrack } from "./subtitles-types";
import {
  createSubtitleDocumentFromText,
  exportSubtitleDocumentToAss,
  exportSubtitleDocumentToSrt,
  exportSubtitleDocumentToVtt,
} from "./subtitle-utils";

const VIDEO_EDITOR_URL_TTL_MS = 50 * 60 * 1000;
const videoEditorPresignedUrlCache = new globalThis.Map<string, { url: string; expiresAt: number }>();
const videoEditorPresignInFlight = new globalThis.Map<string, Promise<string | null>>();

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(secs).padStart(2, "0")}.${tenths}`;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
}

function resolveS3Key(src?: string, s3Key?: string): string | undefined {
  if (s3Key?.trim()) return s3Key.trim();
  return src ? tryExtractKnowledgeFilesKeyFromUrl(src) || undefined : undefined;
}

async function presignVideoEditorS3Key(key: string): Promise<string | null> {
  const cached = videoEditorPresignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = videoEditorPresignInFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const res = await fetch("/api/spaces/s3-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) return null;
      const payload = (await res.json()) as { urls?: Record<string, string> };
      const url = payload.urls?.[key];
      if (!url) return null;
      videoEditorPresignedUrlCache.set(key, { url, expiresAt: Date.now() + VIDEO_EDITOR_URL_TTL_MS });
      return url;
    } catch {
      return null;
    } finally {
      videoEditorPresignInFlight.delete(key);
    }
  })();
  videoEditorPresignInFlight.set(key, promise);
  return promise;
}

function useVideoEditorAssetUrl(src?: string, s3Key?: string): string | undefined {
  const [resolved, setResolved] = useState<{ cacheKey: string; url: string } | null>(null);
  const key = resolveS3Key(src, s3Key);
  const cacheKey = `${src || ""}\u0001${key || ""}`;
  useEffect(() => {
    let cancelled = false;
    if (!key) return () => {
      cancelled = true;
    };
    void (async () => {
      const fresh = await presignVideoEditorS3Key(key);
      if (!cancelled && fresh) setResolved({ cacheKey, url: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, key]);
  return key ? (resolved?.cacheKey === cacheKey ? resolved.url : undefined) : src;
}

function useConnectedMediaList(nodeId: string): MediaListOutput | null {
  const edges = useEdges();
  const nodes = useNodes();
  return useMemo(() => {
    const edge = edges.find((item) => item.target === nodeId && (!item.targetHandle || item.targetHandle === "media_list"));
    const sourceNode = nodes.find((node) => node.id === edge?.source);
    return readMediaListFromNode(sourceNode);
  }, [edges, nodeId, nodes]);
}

function clipStats(data: VideoEditorNodeData) {
  const clips = VIDEO_EDITOR_TRACK_ORDER.flatMap((track) => data.tracks[track]);
  return {
    clips,
    videos: clips.filter((clip) => clip.mediaType === "video").length,
    images: clips.filter((clip) => clip.mediaType === "image").length,
    audio: clips.filter((clip) => clip.mediaType === "audio").length,
    duration: calculateTimelineDuration(data.tracks),
  };
}

function MediaPreview({ item, className }: { item: MediaListItem; className?: string }) {
  const url = useVideoEditorAssetUrl(item.url || item.assetId, item.s3Key);
  const baseClass = cx("flex h-full w-full items-center justify-center bg-slate-900 text-white/35", className);
  if (item.mediaType === "video" && url) return <video className={cx("h-full w-full object-cover", className)} src={url} muted playsInline preload="metadata" />;
  if (item.mediaType === "image" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cx("h-full w-full object-cover", className)} src={url} alt={item.title} />;
  }
  if (item.mediaType === "audio") return <div className={baseClass}><Music size={28} /></div>;
  if (item.mediaType === "placeholder") return <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300"><Layers size={28} /></div>;
  return <div className={baseClass}><File size={28} /></div>;
}

function ClipPreview({ clip, playheadTime, isPlaying }: { clip?: VideoEditorClip; playheadTime: number; isPlaying: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const url = useVideoEditorAssetUrl(clip?.url || clip?.assetId, clip?.s3Key);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || clip.mediaType !== "video") return;
    const targetTime = Math.max(0, (clip.trimStart ?? 0) + (playheadTime - clip.startTime));
    if (Math.abs(video.currentTime - targetTime) > 0.35) video.currentTime = targetTime;
    video.volume = clip.mute ? 0 : Math.max(0, Math.min(1, clip.volume ?? 1));
    if (isPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [clip, isPlaying, playheadTime]);
  if (!clip) {
    return <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-white/12 bg-black text-sm text-white/32">Sin clip visual en este punto.</div>;
  }
  if (clip.mediaType === "video" && url) return <video ref={videoRef} className="h-full w-full rounded-[28px] object-contain" src={url} muted={clip.mute ?? true} playsInline preload="auto" />;
  if (clip.mediaType === "image" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cx("h-full w-full rounded-[28px]", clip.framing === "fit" ? "object-contain" : "object-cover")} src={url} alt={clip.title} />;
  }
  if (clip.mediaType === "audio" && url) return <audio className="w-full" src={url} controls />;
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04] text-white/36">
      {clip.mediaType === "audio" ? <Music size={34} /> : clip.mediaType === "video" ? <Video size={34} /> : <ImageIcon size={34} />}
      <div className="mt-3 text-sm">{clip.title}</div>
    </div>
  );
}

function TimelineAudioPlayer({ clip, playheadTime, isPlaying }: { clip: VideoEditorClip; playheadTime: number; isPlaying: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const url = useVideoEditorAssetUrl(clip.url || clip.assetId, clip.s3Key);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    const targetTime = Math.max(0, (clip.trimStart ?? 0) + (playheadTime - clip.startTime));
    if (Math.abs(audio.currentTime - targetTime) > 0.35) audio.currentTime = targetTime;
    audio.volume = clip.mute ? 0 : Math.max(0, Math.min(1, clip.volume ?? 1));
    if (isPlaying && !clip.mute) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [clip, isPlaying, playheadTime, url]);
  if (!url) return null;
  return <audio ref={audioRef} src={url} preload="auto" />;
}

function NumberInput({
  value,
  onChange,
  min = 0,
  step = 0.5,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  const clamp = useCallback((next: number) => Math.max(min, Number.isFinite(next) ? next : min), [min]);
  const round = useCallback((next: number) => Math.round(next / step) * step, [step]);
  return (
    <ScrubNumberInput
      min={min}
      step={step}
      value={Number.isFinite(value) ? value! : 0}
      onKeyboardCommit={(next) => onChange(clamp(next))}
      onScrubLive={(next) => onChange(clamp(next))}
      onScrubEnd={() => undefined}
      roundFn={round}
      title="Arrastra horizontalmente para ajustar. Mayús = x10."
      className="w-full cursor-ew-resize rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none"
    />
  );
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function activeSubtitleSegment(document: FoldderSubtitleDocument | undefined, time: number) {
  return document?.segments.find((segment) => segment.start <= time && time < segment.end);
}

function subtitleStyleToCss(style: SubtitleStyle): React.CSSProperties {
  const background = style.background;
  return {
    left: `${style.position.x}%`,
    top: `${style.position.y}%`,
    transform: "translate(-50%, -100%)",
    fontFamily: style.fontFamily || "Arial",
    fontSize: `clamp(18px, ${(style.fontSize || 54) / 18}vw, ${style.fontSize || 54}px)`,
    fontWeight: style.fontWeight || 800,
    color: style.color || "#fff",
    backgroundColor: background?.enabled ? `rgba(0,0,0,${background.opacity ?? 0.55})` : "transparent",
    borderRadius: background?.enabled ? background.radius ?? 18 : 0,
    padding: background?.enabled ? `${Math.max(4, (background.padding ?? 18) / 2)}px ${background.padding ?? 18}px` : 0,
    textShadow: "0 2px 18px rgba(0,0,0,.7)",
  };
}

function SubtitlePreviewOverlay({
  track,
  currentTime,
}: {
  track?: VideoEditorSubtitleTrack;
  currentTime: number;
}) {
  if (!track?.enabled) return null;
  const segment = activeSubtitleSegment(track.document, currentTime);
  if (!segment) return null;
  const style = track.style || track.document.style || createDefaultSubtitleStyle("creator");
  const activeWord = segment.words.find((word) => word.start <= currentTime && currentTime < word.end);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute max-w-[82%] text-center leading-[1.08] tracking-[-0.02em]" style={subtitleStyleToCss(style)}>
        {track.mode === "lines" ? segment.text : segment.words.map((word) => (
          <span key={word.id} className={word.id === activeWord?.id ? "text-yellow-200" : undefined}>
            {word.text}{" "}
          </span>
        ))}
      </div>
    </div>
  );
}

function createSubtitleTrackFromText(args: {
  text: string;
  durationSeconds: number;
  mode: RenderSubtitleMode;
  preset: SubtitleStyle["preset"];
  timelineId: string;
}): VideoEditorSubtitleTrack {
  const style = createDefaultSubtitleStyle(args.preset);
  const document = createSubtitleDocumentFromText({
    text: args.text,
    durationSeconds: args.durationSeconds,
    timelineId: args.timelineId,
    mode: args.mode,
    style,
  });
  return {
    id: `subtitle_track_${Math.random().toString(36).slice(2, 10)}`,
    enabled: true,
    mode: args.mode,
    burnIn: true,
    exportSrt: true,
    exportVtt: true,
    exportAss: true,
    document,
    style,
  };
}

function AudioRequestModal({
  type,
  playheadTime,
  sourceNodeId,
  sourceMediaListId,
  onClose,
  onCreate,
}: {
  type: TimelineAudioRequest["type"];
  playheadTime: number;
  sourceNodeId?: string;
  sourceMediaListId?: string;
  onClose: () => void;
  onCreate: (request: TimelineAudioRequest) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(type === "sfx" ? 2 : 12);
  const [mood, setMood] = useState("");
  const [intensity, setIntensity] = useState<TimelineAudioRequest["intensity"]>("medium");
  const [energy, setEnergy] = useState<TimelineAudioRequest["energy"]>("medium");
  const [variations, setVariations] = useState(2);
  const title = type === "sfx" ? "Añadir ruido / SFX" : type === "music" ? "Añadir música" : type === "ambience" ? "Añadir ambiente" : "Añadir voz en off";
  return createPortal(
    <div className="fixed inset-0 z-[100120] flex items-center justify-center bg-black/70 p-5">
      <div className="w-full max-w-xl rounded-[28px] border border-white/12 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/42">Audio prompt · {playheadTime.toFixed(1)}s</div>
            <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 p-2 text-white/55"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-3">
          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Descripción</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="Puffy ladra dos veces, eco suave en el bosque..." className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Duración</span><NumberInput value={duration} onChange={setDuration} min={0.5} /></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Intensidad</span><select value={intensity} onChange={(event) => setIntensity(event.target.value as TimelineAudioRequest["intensity"])} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
            <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Variaciones</span><select value={variations} onChange={(event) => setVariations(Number(event.target.value))} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
          </div>
          {type === "music" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Mood</span><input value={mood} onChange={(event) => setMood(event.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none" /></label>
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Energía</span><select value={energy} onChange={(event) => setEnergy(event.target.value as TimelineAudioRequest["energy"])} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!prompt.trim()}
            onClick={() => {
              onCreate(createAudioRequest({
                type,
                playheadTime,
                durationSeconds: duration,
                prompt,
                mood,
                intensity,
                energy,
                variations,
                sourceNodeId,
                sourceMediaListId,
              }));
              onClose();
            }}
            className="rounded-2xl bg-cyan-300/18 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-cyan-50 disabled:opacity-40"
          >
            Generar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RenderConfirmModal({
  result,
  onClose,
  onConfirm,
}: {
  result: VideoEditorRenderManifestResult;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const manifest = result.manifest;
  return createPortal(
    <div className="fixed inset-0 z-[100140] flex items-center justify-center bg-black/70 p-5">
      <div className="w-full max-w-2xl rounded-[30px] border border-white/12 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/42">Render V1</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.05em]">Renderizar vídeo</h3>
            <p className="mt-2 text-sm text-white/46">Se generará un MP4 H.264/AAC con FFmpeg en backend. Si hay subtítulos activos con burn-in, se quemarán en el vídeo final.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 p-2 text-white/55"><X size={18} /></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Duración</div>
            <div className="mt-1 text-lg font-black">{formatTime(manifest?.durationSeconds ?? 0)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Formato</div>
            <div className="mt-1 text-lg font-black">{manifest?.settings.width}×{manifest?.settings.height}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">FPS</div>
            <div className="mt-1 text-lg font-black">{manifest?.settings.fps ?? 25}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Clips</div>
            <div className="mt-1 text-lg font-black">{result.includedClips}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/34">Subtítulos</div>
            <div className="mt-1 text-lg font-black">{manifest?.subtitleTracks?.length ?? 0}</div>
          </div>
        </div>
        {result.warnings.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-300/10 p-3 text-sm text-amber-50/78">
            {result.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
        {result.errors.length ? (
          <div className="mt-4 rounded-2xl border border-rose-200/15 bg-rose-300/10 p-3 text-sm text-rose-50/78">
            {result.errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-white/58">Cancelar</button>
          <button type="button" disabled={!result.ok} onClick={onConfirm} className="rounded-2xl bg-cyan-300/18 px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-cyan-50 disabled:opacity-40">Confirmar render</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RenderReadyModal({
  url,
  s3Key,
  onClose,
}: {
  url: string;
  s3Key?: string;
  onClose: () => void;
}) {
  const downloadRender = useCallback(async () => {
    if (s3Key) {
      downloadS3Object(s3Key, "foldder-video-render.mp4");
      return;
    }
    await forceDownloadUrl(url, "foldder-video-render.mp4");
  }, [s3Key, url]);
  return createPortal(
    <div className="fixed inset-0 z-[100320] flex items-center justify-center bg-black/78 p-5 backdrop-blur-md">
      <div className="relative z-[1] flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[34px] border border-white/14 bg-[#070b12] text-white shadow-[0_30px_110px_rgba(0,0,0,0.72)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/46">Render final</div>
            <h3 className="mt-1 text-2xl font-black tracking-[-0.05em]">MP4 listo</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-white/[0.055] p-2 text-white/64 hover:bg-white/[0.09]">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <video className="max-h-[62dvh] w-full rounded-[28px] bg-black object-contain" src={url} controls playsInline preload="metadata" />
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/72 hover:bg-white/[0.09]">
              Ver render
            </a>
            <button type="button" onClick={() => void downloadRender()} className="rounded-2xl bg-cyan-300/18 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-50 hover:bg-cyan-300/24">
              Descargar MP4
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function VideoEditorStudio({
  nodeId,
  data,
  sourceMediaList,
  onChange,
  onClose,
}: {
  nodeId: string;
  data: VideoEditorNodeData;
  sourceMediaList: MediaListOutput | null;
  onChange: (next: VideoEditorNodeData) => void;
  onClose: () => void;
}) {
  const studioRootRef = useRef<HTMLDivElement | null>(null);
  const [audioModalType, setAudioModalType] = useState<TimelineAudioRequest["type"] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [livePlayhead, setLivePlayhead] = useState(data.playheadTime);
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image" | "audio" | "pending">("all");
  const [subtitleDraft, setSubtitleDraft] = useState("");
  const [subtitleMode, setSubtitleMode] = useState<RenderSubtitleMode>("lines");
  const [subtitlePreset, setSubtitlePreset] = useState<SubtitleStyle["preset"]>("creator");
  const [subtitleTranscribing, setSubtitleTranscribing] = useState(false);
  const [subtitleTranscriptionError, setSubtitleTranscriptionError] = useState<string | null>(null);
  const [renderConfirmation, setRenderConfirmation] = useState<VideoEditorRenderManifestResult | null>(null);
  const [showRenderReadyModal, setShowRenderReadyModal] = useState(false);
  const [dragState, setDragState] = useState<{
    clipId: string;
    mode: "move" | "resize-start" | "resize-end";
    startX: number;
    startTime: number;
    durationSeconds: number;
  } | null>(null);
  const selectedClip = VIDEO_EDITOR_TRACK_ORDER.flatMap((track) => data.tracks[track]).find((clip) => clip.id === data.selectedClipId);
  const activeVisualClip = getActiveVisualClipAtTime(data, livePlayhead);
  const activeAudioClips = getActiveAudioClipsAtTime(data, livePlayhead);
  const primarySubtitleTrack = (data.subtitleTracks ?? [])[0];
  const activeSubtitleTrack = primarySubtitleTrack?.enabled ? primarySubtitleTrack : undefined;
  const selectedSubtitleSegment = primarySubtitleTrack?.document.segments.find((segment) => segment.id === data.selectedSubtitleSegmentId);
  const placeholders = sourceMediaList?.items.filter((item) => item.mediaType === "placeholder") ?? [];
  const timelineScale = data.timelineZoom ?? 18;
  const timelineDuration = Math.max(1, data.totalDurationSeconds);
  const renderState = data.render ?? createDefaultVideoEditorRenderState();
  const renderPreviewUrl = useVideoEditorAssetUrl(renderState.outputUrl || renderState.outputAssetId, renderState.s3Key);
  const renderReadyUrl = renderPreviewUrl || renderState.outputUrl;
  const renderReadyKey = renderState.outputAssetId || renderState.s3Key || renderState.outputUrl || "";
  const lastAnnouncedRenderKeyRef = useRef(renderState.status === "ready" ? renderReadyKey : "");
  const previousRenderStatusRef = useRef(renderState.status);
  const subtitleTranscriptionSource = useMemo(() => {
    const clipCandidates = [
      selectedClip?.mediaType === "video" || selectedClip?.mediaType === "audio" ? selectedClip : undefined,
      activeVisualClip?.mediaType === "video" ? activeVisualClip : undefined,
      ...VIDEO_EDITOR_TRACK_ORDER.flatMap((track) => data.tracks[track]).filter((clip) => clip.mediaType === "audio" || clip.mediaType === "video"),
    ].filter((clip): clip is VideoEditorClip => Boolean(clip?.assetId || clip?.url || clip?.s3Key));
    const clip = clipCandidates[0];
    if (clip) {
      return {
        title: clip.title,
        sourceAssetId: clip.assetId,
        sourceUrl: clip.url,
        s3Key: clip.s3Key || (clip.url ? tryExtractKnowledgeFilesKeyFromUrl(clip.url) ?? undefined : undefined),
        durationSeconds: clip.durationSeconds,
      };
    }
    if (renderState.status === "ready" && (renderState.outputAssetId || renderReadyUrl || renderState.s3Key)) {
      return {
        title: "Render final",
        sourceAssetId: renderState.outputAssetId,
        sourceUrl: renderReadyUrl,
        s3Key: renderState.s3Key,
        durationSeconds: data.totalDurationSeconds,
      };
    }
    return null;
  }, [activeVisualClip, data.totalDurationSeconds, data.tracks, renderReadyUrl, renderState.outputAssetId, renderState.s3Key, renderState.status, selectedClip]);
  const filteredMediaItems = (sourceMediaList?.items ?? []).filter((item) => {
    if (mediaFilter === "all") return true;
    if (mediaFilter === "pending") return item.mediaType === "placeholder" || item.status === "missing" || item.status === "pending";
    return item.mediaType === mediaFilter;
  });

  const commit = useCallback((next: VideoEditorNodeData) => {
    onChange({ ...next, totalDurationSeconds: calculateTimelineDuration(next.tracks) });
  }, [onChange]);

  const deleteSelectedClip = useCallback(() => {
    if (!data.selectedClipId) return;
    commit(removeVideoEditorClip(data, data.selectedClipId));
  }, [commit, data]);

  const setPlayhead = useCallback((time: number) => {
    const nextTime = clampVideoEditorTime(time, 0, Math.max(0, data.totalDurationSeconds));
    setLivePlayhead(nextTime);
    commit({ ...data, playheadTime: nextTime, status: "editing" });
  }, [commit, data]);

  const closeStudio = useCallback(() => {
    commit({ ...data, playheadTime: livePlayhead });
    onClose();
  }, [commit, data, livePlayhead, onClose]);

  useEffect(() => {
    studioRootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = (now - last) / 1000;
      last = now;
      setLivePlayhead((current) => {
        const next = clampVideoEditorTime(current + deltaSeconds, 0, timelineDuration);
        if (next >= timelineDuration) {
          setIsPlaying(false);
          return timelineDuration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, timelineDuration]);

  useEffect(() => {
    if (!dragState) return undefined;
    const onMove = (event: PointerEvent) => {
      const delta = (event.clientX - dragState.startX) / timelineScale;
      const next = dragState.mode === "move"
        ? moveVideoEditorClip(data, dragState.clipId, dragState.startTime + delta)
        : dragState.mode === "resize-start"
          ? trimVideoEditorClipStart(data, dragState.clipId, dragState.startTime + delta)
          : resizeVideoEditorClip(data, dragState.clipId, dragState.durationSeconds + delta);
      commit(next);
    };
    const onUp = () => setDragState(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [commit, data, dragState, timelineScale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }
      event.stopImmediatePropagation();
      if (event.code === "Space") {
        event.preventDefault();
        if (isPlaying) commit({ ...data, playheadTime: livePlayhead });
        setIsPlaying((current) => !current);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlayhead(livePlayhead - 0.5);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlayhead(livePlayhead + 0.5);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedClip();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [commit, data, deleteSelectedClip, isPlaying, livePlayhead, setPlayhead]);

  const refreshMedia = useCallback(() => {
    if (!sourceMediaList) return;
    commit(ingestMediaListToVideoEditor(sourceMediaList, data));
  }, [commit, data, sourceMediaList]);

  const createSubtitles = useCallback(() => {
    if (!subtitleDraft.trim()) return;
    const track = createSubtitleTrackFromText({
      text: subtitleDraft,
      durationSeconds: data.totalDurationSeconds || 8,
      mode: subtitleMode,
      preset: subtitlePreset,
      timelineId: nodeId,
    });
    commit({
      ...data,
      subtitleTracks: [track, ...(data.subtitleTracks ?? []).filter((item) => item.id !== track.id)],
      selectedSubtitleSegmentId: track.document.segments[0]?.id,
      status: "editing",
    });
  }, [commit, data, nodeId, subtitleDraft, subtitleMode, subtitlePreset]);

  const generateSubtitlesFromMedia = useCallback(async () => {
    if (!subtitleTranscriptionSource) {
      setSubtitleTranscriptionError("No hay vídeo o audio disponible para transcribir.");
      return;
    }
    setSubtitleTranscribing(true);
    setSubtitleTranscriptionError(null);
    try {
      const response = await fetch("/api/video-editor/subtitles/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAssetId: subtitleTranscriptionSource.sourceAssetId,
          sourceUrl: subtitleTranscriptionSource.sourceUrl,
          s3Key: subtitleTranscriptionSource.s3Key,
          durationSeconds: subtitleTranscriptionSource.durationSeconds || data.totalDurationSeconds || 8,
          mode: subtitleMode,
          timelineId: nodeId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; document?: FoldderSubtitleDocument; documentKey?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.document) {
        throw new Error(payload.error || "No se pudieron generar subtítulos.");
      }
      const style = createDefaultSubtitleStyle(subtitlePreset);
      const document: FoldderSubtitleDocument = {
        ...payload.document,
        mode: subtitleMode,
        style,
        updatedAt: new Date().toISOString(),
      };
      const track: VideoEditorSubtitleTrack = {
        id: primarySubtitleTrack?.id || `subtitle_track_${Date.now()}`,
        enabled: true,
        mode: subtitleMode,
        burnIn: true,
        exportSrt: true,
        exportVtt: true,
        exportAss: true,
        documentKey: payload.documentKey,
        document,
        style,
      };
      commit({
        ...data,
        subtitleTracks: [track, ...(data.subtitleTracks ?? []).filter((item) => item.id !== track.id)],
        selectedSubtitleSegmentId: document.segments[0]?.id,
        status: "editing",
      });
    } catch (error) {
      setSubtitleTranscriptionError(error instanceof Error ? error.message : "subtitle_transcription_failed");
    } finally {
      setSubtitleTranscribing(false);
    }
  }, [commit, data, nodeId, primarySubtitleTrack?.id, subtitleMode, subtitlePreset, subtitleTranscriptionSource]);

  const patchSubtitleTrack = useCallback((trackId: string, patch: Partial<VideoEditorSubtitleTrack>) => {
    commit({
      ...data,
      subtitleTracks: (data.subtitleTracks ?? []).map((track) => track.id === trackId ? { ...track, ...patch } : track),
      status: "editing",
    });
  }, [commit, data]);

  const patchSubtitleSegment = useCallback((trackId: string, segmentId: string, patch: Partial<FoldderSubtitleDocument["segments"][number]>) => {
    commit({
      ...data,
      subtitleTracks: (data.subtitleTracks ?? []).map((track) => {
        if (track.id !== trackId) return track;
        const now = new Date().toISOString();
        const document = {
          ...track.document,
          status: "edited" as const,
          updatedAt: now,
          segments: track.document.segments.map((segment) => {
            if (segment.id !== segmentId) return segment;
            const next = { ...segment, ...patch };
            const words = next.text.split(/\s+/).filter(Boolean);
            return {
              ...next,
              words: words.map((word, index) => {
                const step = (next.end - next.start) / Math.max(1, words.length);
                return { id: `${segmentId}_w_${index}`, text: word, start: next.start + index * step, end: next.start + (index + 1) * step, emphasis: "none" as const };
              }),
            };
          }),
        };
        return { ...track, document };
      }),
      status: "editing",
    });
  }, [commit, data]);

  const addAudioRequest = useCallback(async (request: TimelineAudioRequest) => {
    const generatingData = { ...data, status: "generating_audio" as const, audioRequests: [...data.audioRequests, { ...request, status: "generating" as const }] };
    commit(generatingData);
    const result = await generateTimelineAudio(request);
    if (result.ok) {
      commit({
        ...generatingData,
        status: "editing",
        audioRequests: generatingData.audioRequests.map((item) => item.id === request.id ? { ...item, status: "generated", generatedAssetIds: result.generatedAssetIds } : item),
      });
    } else {
      commit({
        ...generatingData,
        status: "editing",
        audioRequests: generatingData.audioRequests.map((item) => item.id === request.id ? { ...item, status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage } : item),
      });
    }
  }, [commit, data]);

  const openRenderConfirmation = useCallback(() => {
    setRenderConfirmation(buildVideoEditorRenderManifest(data, nodeId));
  }, [data, nodeId]);

  const runRender = useCallback(async () => {
    const manifest = renderConfirmation?.manifest;
    if (!manifest) return;
    setRenderConfirmation(null);
    const startedAt = new Date().toISOString();
    commit({
      ...data,
      render: {
        ...renderState,
        status: "preparing",
        progress: 0,
        error: undefined,
        startedAt,
        finishedAt: undefined,
      },
    });
    try {
      const renderingState = {
        ...data,
        render: {
          ...renderState,
          status: "rendering" as const,
          progress: 35,
          error: undefined,
          startedAt,
        },
      };
      commit(renderingState);
      const response = await fetch("/api/video-editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        renderId?: string;
        status?: string;
        outputAssetId?: string;
        outputUrl?: string;
        s3Key?: string;
        error?: string;
      };
      if (!response.ok || payload.status === "error") {
        throw new Error(payload.error || "No se pudo renderizar el vídeo.");
      }
      commit({
        ...renderingState,
        render: {
          ...renderState,
          status: payload.status === "ready" ? "ready" : "rendering",
          progress: payload.status === "ready" ? 100 : 10,
          renderId: payload.renderId,
          outputAssetId: payload.outputAssetId,
          outputUrl: payload.outputUrl,
          s3Key: payload.s3Key,
          startedAt,
          finishedAt: payload.status === "ready" ? new Date().toISOString() : undefined,
        },
      });
    } catch (error) {
      commit({
        ...data,
        render: {
          ...renderState,
          status: "error",
          progress: 0,
          error: error instanceof Error ? error.message : "render_failed",
          startedAt,
          finishedAt: new Date().toISOString(),
        },
      });
    }
  }, [commit, data, renderConfirmation?.manifest, renderState]);

  useEffect(() => {
    const renderId = renderState.renderId;
    if (!renderId || !["preparing", "rendering", "uploading"].includes(renderState.status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/video-editor/render-status?renderId=${encodeURIComponent(renderId)}`);
        const payload = (await response.json().catch(() => ({}))) as {
          status?: VideoEditorRenderState["status"];
          progress?: number;
          outputAssetId?: string;
          outputUrl?: string;
          s3Key?: string;
          error?: string;
          finishedAt?: string;
        };
        if (cancelled || !payload.status) return;
        commit({
          ...data,
          render: {
            ...renderState,
            status: payload.status,
            progress: payload.progress ?? renderState.progress,
            outputAssetId: payload.outputAssetId ?? renderState.outputAssetId,
            outputUrl: payload.outputUrl ?? renderState.outputUrl,
            s3Key: payload.s3Key ?? renderState.s3Key,
            error: payload.error,
            finishedAt: payload.finishedAt ?? (payload.status === "ready" || payload.status === "error" ? new Date().toISOString() : renderState.finishedAt),
          },
        });
      } catch (error) {
        if (cancelled) return;
        commit({
          ...data,
          render: {
            ...renderState,
            status: "error",
            error: error instanceof Error ? error.message : "render_status_failed",
            finishedAt: new Date().toISOString(),
          },
        });
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [commit, data, renderState]);

  useEffect(() => {
    const previousStatus = previousRenderStatusRef.current;
    previousRenderStatusRef.current = renderState.status;
    if (renderState.status !== "ready" || previousStatus === "ready" || !renderReadyKey) return;
    if (lastAnnouncedRenderKeyRef.current === renderReadyKey) return;
    lastAnnouncedRenderKeyRef.current = renderReadyKey;
    setShowRenderReadyModal(true);
  }, [renderReadyKey, renderState.status]);

  return createPortal(
    <div ref={studioRootRef} tabIndex={-1} data-foldder-studio-canvas="video-editor" className="fixed inset-0 z-[100070] bg-slate-950/88 p-4 text-white backdrop-blur-md outline-none">
      <div className="mx-auto grid h-full max-w-[1720px] grid-rows-[auto_1fr] overflow-hidden rounded-[34px] border border-white/12 bg-[#070b12] shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/42">Video Editor</div>
            <h2 className="text-2xl font-black tracking-[-0.05em]">Timeline editable</h2>
            <p className="mt-1 text-sm text-white/42">{sourceMediaList ? `Media list desde ${sourceMediaList.sourceNodeType} · ${sourceMediaList.items.length} items` : "Sin medios conectados"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openRenderConfirmation}
              disabled={renderState.status === "preparing" || renderState.status === "rendering" || renderState.status === "uploading"}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300/18 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-50 disabled:opacity-45"
            >
              <Film size={14} />
              {renderState.status === "ready" ? "Renderizar de nuevo" : renderState.status === "error" ? "Reintentar render" : renderState.status === "preparing" || renderState.status === "rendering" || renderState.status === "uploading" ? "Renderizando..." : "Render"}
            </button>
            <button type="button" onClick={refreshMedia} disabled={!sourceMediaList} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/68 disabled:opacity-35"><RefreshCw size={14} />Actualizar medios</button>
            <button type="button" onClick={closeStudio} className="rounded-2xl border border-white/10 p-2 text-white/55"><X size={18} /></button>
          </div>
        </header>

        <main className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)_320px] grid-rows-[minmax(0,1fr)_260px] gap-3 p-3">
          <aside className="min-h-0 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035]">
            <div className="border-b border-white/10 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/36">Medios recibidos</div>
              <div className="mt-1 text-sm text-white/58">{sourceMediaList?.items.length ?? 0} items · {placeholders.length} pendientes</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  ["all", "Todos"],
                  ["video", "Vídeos"],
                  ["image", "Imágenes"],
                  ["audio", "Audio"],
                  ["pending", "Pendientes"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMediaFilter(value as typeof mediaFilter)}
                    className={cx("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]", mediaFilter === value ? "border-cyan-200/45 bg-cyan-300/14 text-cyan-50" : "border-white/10 text-white/40")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-full space-y-2 overflow-auto p-3">
              {filteredMediaItems.map((item) => {
                const disabled = item.mediaType === "placeholder" || (!item.assetId && !item.url);
                const alreadyInTimeline = VIDEO_EDITOR_TRACK_ORDER.some((track) => data.tracks[track].some((clip) => clip.sourceItemId === item.id));
                return (
                  <div key={item.id} className={cx("grid grid-cols-[62px_1fr] gap-3 rounded-2xl border p-2", disabled ? "border-white/8 bg-white/[0.025] opacity-55" : "border-white/10 bg-white/[0.045]")}>
                    <div className="h-14 overflow-hidden rounded-xl"><MediaPreview item={item} /></div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{item.title}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/34">{item.mediaType}{item.sceneOrder ? ` · Escena ${item.sceneOrder}` : ""}</div>
                      <button type="button" disabled={disabled} onClick={() => commit(addMediaListItemToTimeline(data, item))} className="mt-2 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/58 disabled:text-white/20">{alreadyInTimeline ? "Añadir otra vez" : "Añadir"}</button>
                    </div>
                  </div>
                );
              })}
              {!sourceMediaList ? <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/35">Conecta una media_list para cargar medios.</div> : null}
            </div>
          </aside>

          <section className="min-h-0 rounded-[28px] border border-white/10 bg-black/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Preview</div>
                <div className="mt-1 text-sm font-semibold text-white/62">{activeVisualClip?.title ?? "Negro / sin visual activo"}</div>
              </div>
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-xs text-white/58">
                <Clock size={13} />
                <input type="number" step={0.1} value={livePlayhead.toFixed(1)} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-20 bg-transparent outline-none" />
              </label>
            </div>
            <div className="relative h-[calc(100%-112px)] min-h-[228px] overflow-hidden rounded-[28px]">
              <ClipPreview clip={activeVisualClip} playheadTime={livePlayhead} isPlaying={isPlaying} />
              <SubtitlePreviewOverlay track={activeSubtitleTrack} currentTime={livePlayhead} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPlayhead(0)} className="rounded-full border border-white/10 p-2 text-white/55"><SkipBack size={15} /></button>
                <button type="button" onClick={() => setPlayhead(livePlayhead - 1)} className="rounded-full border border-white/10 p-2 text-white/55"><StepBack size={15} /></button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) commit({ ...data, playheadTime: livePlayhead });
                    setIsPlaying(!isPlaying);
                  }}
                  className="rounded-full bg-cyan-300/18 p-3 text-cyan-50"
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button type="button" onClick={() => setPlayhead(livePlayhead + 1)} className="rounded-full border border-white/10 p-2 text-white/55"><StepForward size={15} /></button>
                <button type="button" onClick={() => setPlayhead(data.totalDurationSeconds)} className="rounded-full border border-white/10 p-2 text-white/55"><SkipForward size={15} /></button>
              </div>
              <div className="text-xs font-bold tabular-nums text-white/52">{formatTime(livePlayhead)} / {formatTime(data.totalDurationSeconds)}</div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/34">
                <Volume2 size={13} />
                {activeAudioClips.length ? `${activeAudioClips.length} audio activo` : "sin audio activo"}
              </div>
            </div>
            {activeAudioClips.map((clip) => (
              <TimelineAudioPlayer key={clip.id} clip={clip} playheadTime={livePlayhead} isPlaying={isPlaying} />
            ))}
            {renderState.status !== "idle" ? (
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/34">Render final</div>
                    <div className={cx("mt-1 text-sm font-bold", renderState.status === "error" ? "text-rose-100/80" : "text-white/68")}>
                      {renderState.status === "ready" ? "MP4 listo" : renderState.status === "error" ? renderState.error || "Error de render" : "Renderizando timeline..."}
                    </div>
                  </div>
                  {renderState.status === "ready" && (renderPreviewUrl || renderState.outputUrl) ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setShowRenderReadyModal(true)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white/64">Ver render</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (renderState.s3Key) {
                            downloadS3Object(renderState.s3Key, "foldder-video-render.mp4");
                            return;
                          }
                          void forceDownloadUrl(renderPreviewUrl || renderState.outputUrl || "", "foldder-video-render.mp4");
                        }}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white/64"
                      >
                        Descargar MP4
                      </button>
                    </div>
                  ) : null}
                </div>
                {renderState.status !== "ready" && renderState.status !== "error" ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-200" style={{ width: `${Math.max(10, renderState.progress ?? 35)}%` }} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="min-h-0 overflow-auto rounded-[28px] border border-white/10 bg-white/[0.035] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/36">Propiedades</div>
            <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/45"><Captions size={13} /> Subtitles</div>
                  <p className="mt-1 text-xs text-white/42">Transcribe vídeo/audio o pega SRT/VTT para crear una pista editable.</p>
                </div>
                {primarySubtitleTrack ? (
                  <label className="flex items-center gap-2 rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/50">
                    <input type="checkbox" checked={primarySubtitleTrack.enabled} onChange={(event) => patchSubtitleTrack(primarySubtitleTrack.id, { enabled: event.target.checked })} />
                    ON
                  </label>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">Fuente de transcripción</div>
                    <div className="mt-0.5 truncate text-xs text-white/62">{subtitleTranscriptionSource?.title || "Selecciona un clip de vídeo/audio o renderiza el timeline"}</div>
                  </div>
                  <button
                    type="button"
                    disabled={subtitleTranscribing || !subtitleTranscriptionSource}
                    onClick={() => void generateSubtitlesFromMedia()}
                    className="shrink-0 rounded-2xl bg-cyan-300/18 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-50 disabled:opacity-35"
                  >
                    {subtitleTranscribing ? "Transcribiendo..." : primarySubtitleTrack ? "Regenerar" : "Generar"}
                  </button>
                </div>
                {subtitleTranscriptionError ? (
                  <p className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-2 py-1.5 text-[11px] text-rose-100/80">{subtitleTranscriptionError}</p>
                ) : null}
              </div>
              {!primarySubtitleTrack ? (
                <div className="mt-3 grid gap-2">
                  <textarea
                    value={subtitleDraft}
                    onChange={(event) => setSubtitleDraft(event.target.value)}
                    rows={5}
                    placeholder={"1\n00:00:00,000 --> 00:00:02,400\nHola, bienvenidos a Foldder.\n\nO pega texto normal, una frase por línea."}
                    className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs leading-relaxed outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={subtitleMode} onChange={(event) => setSubtitleMode(event.target.value as RenderSubtitleMode)} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs outline-none">
                      <option value="lines">Lines</option>
                      <option value="word-by-word">Word by word</option>
                      <option value="karaoke">Karaoke</option>
                    </select>
                    <select value={subtitlePreset} onChange={(event) => setSubtitlePreset(event.target.value as SubtitleStyle["preset"])} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs outline-none">
                      <option value="minimal">Minimal</option>
                      <option value="creator">Creator</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="documentary">Documentary</option>
                      <option value="corporate">Corporate</option>
                      <option value="karaoke">Karaoke</option>
                    </select>
                  </div>
                  <button type="button" disabled={!subtitleDraft.trim()} onClick={createSubtitles} className="rounded-2xl bg-cyan-300/18 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-50 disabled:opacity-40">Crear subtítulos</button>
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
                    <input type="checkbox" checked={primarySubtitleTrack.burnIn} onChange={(event) => patchSubtitleTrack(primarySubtitleTrack.id, { burnIn: event.target.checked })} />
                      Burn into final video
                    </label>
                    <select
                      value={primarySubtitleTrack.mode}
                      onChange={(event) => patchSubtitleTrack(primarySubtitleTrack.id, { mode: event.target.value as RenderSubtitleMode, document: { ...primarySubtitleTrack.document, mode: event.target.value as RenderSubtitleMode } })}
                      className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs outline-none"
                    >
                      <option value="lines">Lines</option>
                      <option value="word-by-word">Word by word</option>
                      <option value="karaoke">Karaoke</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button type="button" onClick={() => downloadTextFile("foldder-subtitles.srt", exportSubtitleDocumentToSrt(primarySubtitleTrack.document), "text/plain;charset=utf-8")} className="rounded-full border border-white/10 px-2 py-1.5 text-[10px] font-black text-white/58"><Download size={11} className="inline" /> SRT</button>
                    <button type="button" onClick={() => downloadTextFile("foldder-subtitles.vtt", exportSubtitleDocumentToVtt(primarySubtitleTrack.document), "text/vtt;charset=utf-8")} className="rounded-full border border-white/10 px-2 py-1.5 text-[10px] font-black text-white/58"><Download size={11} className="inline" /> VTT</button>
                    <button type="button" onClick={() => downloadTextFile("foldder-subtitles.ass", exportSubtitleDocumentToAss(primarySubtitleTrack.document), "text/plain;charset=utf-8")} className="rounded-full border border-white/10 px-2 py-1.5 text-[10px] font-black text-white/58"><Download size={11} className="inline" /> ASS</button>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {primarySubtitleTrack.document.segments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => commit({ ...data, selectedSubtitleSegmentId: segment.id })}
                        className={cx("w-full rounded-2xl border p-2 text-left text-xs", data.selectedSubtitleSegmentId === segment.id ? "border-cyan-200/50 bg-cyan-300/12" : "border-white/10 bg-white/[0.035]")}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/34">
                          <span>{formatTime(segment.start)} → {formatTime(segment.end)}</span>
                          <span>{segment.words.length} palabras</span>
                        </div>
                        <div className="line-clamp-2 text-white/68">{segment.text}</div>
                      </button>
                    ))}
                  </div>
                  {selectedSubtitleSegment ? (
                    <div className="rounded-2xl border border-cyan-200/12 bg-cyan-300/[0.055] p-2">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100/45">Editar segmento</div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumberInput value={selectedSubtitleSegment.start} onChange={(value) => patchSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id, { start: value })} step={0.1} />
                        <NumberInput value={selectedSubtitleSegment.end} onChange={(value) => patchSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id, { end: value })} step={0.1} />
                      </div>
                      <textarea value={selectedSubtitleSegment.text} onChange={(event) => patchSubtitleSegment(primarySubtitleTrack.id, selectedSubtitleSegment.id, { text: event.target.value })} rows={3} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs outline-none" />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            {selectedClip ? (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1"><span className="text-xs text-white/40">Título</span><input value={selectedClip.title} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { title: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-white/40">Pista</span>
                    <select
                      value={selectedClip.track}
                      onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { track: event.target.value as VideoEditorClip["track"] }))}
                      className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none"
                    >
                      {VIDEO_EDITOR_TRACK_ORDER.map((track) => <option key={track} value={track}>{VIDEO_EDITOR_TRACK_LABELS[track]}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55">
                    <input type="checkbox" checked={Boolean(selectedClip.locked)} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { locked: event.target.checked }))} />
                    Bloquear clip
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1"><span className="text-xs text-white/40">Inicio</span><NumberInput value={selectedClip.startTime} onChange={(value) => commit(moveVideoEditorClip(data, selectedClip.id, value))} /></label>
                  <label className="grid gap-1"><span className="text-xs text-white/40">Duración</span><NumberInput value={selectedClip.durationSeconds} onChange={(value) => commit(resizeVideoEditorClip(data, selectedClip.id, value))} min={0.1} /></label>
                </div>
                {selectedClip.mediaType === "video" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1"><span className="text-xs text-white/40">Trim inicio</span><NumberInput value={selectedClip.trimStart ?? 0} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { trimStart: value }))} /></label>
                      <label className="grid gap-1"><span className="text-xs text-white/40">Trim final</span><NumberInput value={selectedClip.trimEnd ?? 0} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { trimEnd: value }))} /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1"><span className="text-xs text-white/40">Volumen</span><NumberInput value={selectedClip.volume ?? 1} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { volume: value }))} step={0.1} /></label>
                      <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55"><input type="checkbox" checked={Boolean(selectedClip.mute)} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { mute: event.target.checked }))} /> Silenciar</label>
                    </div>
                  </>
                ) : null}
                {selectedClip.mediaType === "image" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span className="text-xs text-white/40">Encuadre</span>
                      <select value={selectedClip.framing ?? "fill"} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { framing: event.target.value as VideoEditorClip["framing"] }))} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none">
                        <option value="fit">Fit</option>
                        <option value="fill">Fill</option>
                        <option value="crop_center">Crop center</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs text-white/40">Movimiento futuro</span>
                      <select value={selectedClip.motion ?? "none"} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { motion: event.target.value as VideoEditorClip["motion"] }))} className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm outline-none">
                        <option value="none">Ninguno</option>
                        <option value="slow_zoom_in">Slow zoom in</option>
                        <option value="slow_zoom_out">Slow zoom out</option>
                        <option value="pan_left">Pan left</option>
                        <option value="pan_right">Pan right</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                {selectedClip.mediaType === "audio" ? (
                  <>
                    <label className="grid gap-1"><span className="text-xs text-white/40">Volumen</span><NumberInput value={selectedClip.volume ?? 1} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { volume: value }))} step={0.1} /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1"><span className="text-xs text-white/40">Fade in</span><NumberInput value={selectedClip.fadeInSeconds ?? 0} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { fadeInSeconds: value }))} /></label>
                      <label className="grid gap-1"><span className="text-xs text-white/40">Fade out</span><NumberInput value={selectedClip.fadeOutSeconds ?? 0} onChange={(value) => commit(patchVideoEditorClip(data, selectedClip.id, { fadeOutSeconds: value }))} /></label>
                    </div>
                    <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55"><input type="checkbox" checked={Boolean(selectedClip.mute)} onChange={(event) => commit(patchVideoEditorClip(data, selectedClip.id, { mute: event.target.checked }))} /> Silenciar</label>
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => commit(duplicateVideoEditorClip(data, selectedClip.id))} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/58"><Copy size={13} className="inline" /> Duplicar</button>
                  <button type="button" onClick={() => commit(removeVideoEditorClip(data, selectedClip.id))} className="rounded-full border border-rose-200/15 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-rose-100/75"><Trash2 size={13} className="inline" /> Eliminar</button>
                </div>
                <details className="rounded-2xl border border-white/10 bg-black/22 p-3">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.12em] text-white/40">Metadata Cine</summary>
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-white/58">{JSON.stringify(selectedClip.metadata ?? {}, null, 2)}</pre>
                </details>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-white/38">Selecciona un clip del timeline para editar duración, trim, volumen o metadata.</p>
            )}
          </aside>

          <section className="col-span-3 min-h-0 rounded-[28px] border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/36">Timeline · {formatTime(data.totalDurationSeconds)}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => commit({ ...data, timelineZoom: Math.max(8, timelineScale - 4) })} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/62">Zoom -</button>
                <button type="button" onClick={() => commit({ ...data, timelineZoom: 18 })} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/62">Fit</button>
                <button type="button" onClick={() => commit({ ...data, timelineZoom: Math.min(80, timelineScale + 4) })} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/62">Zoom +</button>
                <button type="button" onClick={() => setAudioModalType("sfx")} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/62">+ Ruido / SFX</button>
                <button type="button" onClick={() => setAudioModalType("music")} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/62">+ Música</button>
                <button type="button" onClick={() => setAudioModalType("ambience")} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/62">+ Ambiente</button>
                <button type="button" onClick={() => setAudioModalType("voiceover")} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/30">+ Voz en off</button>
              </div>
            </div>
            <div className="space-y-2 overflow-auto">
              <div className="grid grid-cols-[128px_1fr] items-stretch gap-2">
                <div className="rounded-2xl border border-white/10 bg-black/24 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/32">Regla</div>
                <div
                  className="relative h-9 overflow-x-auto rounded-2xl border border-white/10 bg-black/18"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPlayhead((event.clientX - rect.left + event.currentTarget.scrollLeft) / timelineScale);
                  }}
                >
                  <div className="relative h-full min-w-full" style={{ width: Math.max(900, timelineDuration * timelineScale + 80) }}>
                    {Array.from({ length: Math.ceil(timelineDuration) + 1 }).map((_, second) => (
                      <div key={second} className="absolute top-0 h-full border-l border-white/10" style={{ left: second * timelineScale }}>
                        <span className="ml-1 text-[10px] tabular-nums text-white/32">{second}s</span>
                      </div>
                    ))}
                    <div className="absolute top-0 h-full w-px bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.85)]" style={{ left: livePlayhead * timelineScale }} />
                  </div>
                </div>
              </div>
              {VIDEO_EDITOR_TRACK_ORDER.map((track) => (
                <div key={track} className="grid grid-cols-[128px_1fr] items-stretch gap-2">
                  <div className="flex items-center rounded-2xl border border-white/10 bg-black/24 px-3 text-xs font-black uppercase tracking-[0.1em] text-white/45">{VIDEO_EDITOR_TRACK_LABELS[track]}</div>
                  <div
                    className="relative min-h-[42px] overflow-x-auto rounded-2xl border border-white/10 bg-black/18"
                    onClick={(event) => {
                      if (event.target !== event.currentTarget) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      setPlayhead((event.clientX - rect.left + event.currentTarget.scrollLeft) / timelineScale);
                    }}
                  >
                    <div className="relative h-full min-w-full" style={{ width: Math.max(900, data.totalDurationSeconds * timelineScale + 80) }}>
                      <div className="absolute top-0 z-20 h-full w-px bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.85)]" style={{ left: livePlayhead * timelineScale }} />
                      {data.tracks[track].map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDragState({
                              clipId: clip.id,
                              mode: "move",
                              startX: event.clientX,
                              startTime: clip.startTime,
                              durationSeconds: clip.durationSeconds,
                            });
                          }}
                          onClick={() => commit({ ...data, selectedClipId: clip.id, status: "editing" })}
                          className={cx("absolute top-1 flex h-10 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-bold transition", clip.locked ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing", data.selectedClipId === clip.id ? "border-cyan-200/60 bg-cyan-300/18 text-cyan-50" : "border-white/10 bg-white/[0.07] text-white/66")}
                          style={{ left: clip.startTime * timelineScale, width: Math.max(88, clip.durationSeconds * timelineScale) }}
                        >
                          <span className="truncate">{clip.title}</span>
                          <span className="text-[10px] opacity-50">{clip.durationSeconds}s</span>
                          <span
                            role="presentation"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setDragState({
                                clipId: clip.id,
                                mode: "resize-start",
                                startX: event.clientX,
                                startTime: clip.startTime,
                                durationSeconds: clip.durationSeconds,
                              });
                            }}
                            className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l-xl bg-white/10 hover:bg-cyan-200/30"
                            title="Arrastra para recortar desde el inicio"
                          />
                          <span
                            role="presentation"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setDragState({
                                clipId: clip.id,
                                mode: "resize-end",
                                startX: event.clientX,
                                startTime: clip.startTime,
                                durationSeconds: clip.durationSeconds,
                              });
                            }}
                            className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r-xl bg-white/10 hover:bg-cyan-200/30"
                            title="Arrastra para recortar desde el final"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[128px_1fr] items-stretch gap-2">
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/24 px-3 text-xs font-black uppercase tracking-[0.1em] text-white/45">
                  <Captions size={13} /> Subtitles
                </div>
                <div className="relative min-h-[42px] overflow-x-auto rounded-2xl border border-white/10 bg-black/18">
                  <div className="relative h-full min-w-full" style={{ width: Math.max(900, data.totalDurationSeconds * timelineScale + 80) }}>
                    <div className="absolute top-0 z-20 h-full w-px bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.85)]" style={{ left: livePlayhead * timelineScale }} />
                    {primarySubtitleTrack?.document.segments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => commit({ ...data, selectedSubtitleSegmentId: segment.id, status: "editing" })}
                        className={cx("absolute top-1 flex h-10 items-center rounded-xl border px-3 text-left text-xs font-bold", data.selectedSubtitleSegmentId === segment.id ? "border-yellow-200/70 bg-yellow-300/18 text-yellow-50" : "border-white/10 bg-white/[0.055] text-white/58")}
                        style={{ left: segment.start * timelineScale, width: Math.max(80, (segment.end - segment.start) * timelineScale) }}
                      >
                        <span className="truncate">{segment.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {data.audioRequests.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {data.audioRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-white/10 bg-black/18 p-3 text-xs">
                    <div className="font-black uppercase tracking-[0.12em] text-white/50">{request.type} · {request.status}</div>
                    <p className="mt-1 line-clamp-2 text-white/54">{request.prompt}</p>
                    {request.errorMessage ? <p className="mt-2 text-amber-100/70">{request.errorCode}: {request.errorMessage}</p> : null}
                    {request.generatedAssetIds?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {request.generatedAssetIds.map((assetId, index) => (
                          <button key={assetId} type="button" onClick={() => commit(approveTimelineAudioVariation(data, request.id, assetId, index))} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/60">Usar {index + 1}</button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </main>
      </div>
      {audioModalType ? (
        <AudioRequestModal
          type={audioModalType}
          playheadTime={livePlayhead}
          sourceNodeId={sourceMediaList?.sourceNodeId}
          sourceMediaListId={sourceMediaList?.sourceNodeId}
          onClose={() => setAudioModalType(null)}
          onCreate={(request) => void addAudioRequest(request)}
        />
      ) : null}
      {renderConfirmation ? (
        <RenderConfirmModal
          result={renderConfirmation}
          onClose={() => setRenderConfirmation(null)}
          onConfirm={() => void runRender()}
        />
      ) : null}
      {showRenderReadyModal && renderState.status === "ready" && renderReadyUrl ? (
        <RenderReadyModal url={renderReadyUrl} s3Key={renderState.s3Key} onClose={() => setShowRenderReadyModal(false)} />
      ) : null}
    </div>,
    document.body,
  );
}

export const VideoEditorNode = memo(function VideoEditorNode({ id, data, selected }: NodeProps) {
  const sourceMediaList = useConnectedMediaList(id);
  const { setNodes } = useReactFlow();
  const nodeData = normalizeVideoEditorData(data);
  const effectiveData = sourceMediaList && !nodeData.tracks.video.length && !nodeData.tracks.audio.length && nodeData.status === "empty"
    ? ingestMediaListToVideoEditor(sourceMediaList, nodeData)
    : nodeData;
  const stats = clipStats(effectiveData);
  const [studioOpen, setStudioOpen] = useState(false);

  const commit = useCallback((next: VideoEditorNodeData) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...next,
              },
            }
          : node,
      ),
    );
  }, [id, setNodes]);

  const label = String((data as { label?: unknown }).label || "Video Editor");
  return (
    <div className={cx("relative w-[340px] rounded-[30px] border bg-[#111827]/94 p-4 text-white shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl", selected ? "border-cyan-300/55" : "border-white/12")}>
      <FoldderDataHandle type="target" position={Position.Left} id="media_list" dataType="generic" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/45">Video Editor</div>
          <h3 className="mt-1 text-lg font-black tracking-[-0.04em]">{label}</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-50">
          <Film size={18} />
        </div>
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.055] p-4">
        {sourceMediaList ? (
          <>
            <div className="text-3xl font-black tracking-[-0.06em]">{stats.clips.length} clips</div>
            <div className="mt-2 text-sm font-semibold text-white/58">{stats.duration.toFixed(0)}s · {stats.videos} vídeos · {stats.images} imágenes · {stats.audio} audios</div>
          </>
        ) : (
          <>
            <div className="text-lg font-black tracking-[-0.04em]">Sin medios conectados</div>
            <div className="mt-1 text-sm text-white/42">Conecta una media_list</div>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="rounded-full bg-white/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/46">{effectiveData.status}</span>
        <button type="button" onClick={() => setStudioOpen(true)} className="rounded-2xl bg-cyan-300/18 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-50">Abrir</button>
      </div>
      {studioOpen ? <VideoEditorStudio nodeId={id} data={effectiveData} sourceMediaList={sourceMediaList} onChange={commit} onClose={() => setStudioOpen(false)} /> : null}
    </div>
  );
});
