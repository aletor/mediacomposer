"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Clapperboard,
  Copy,
  Film,
  Layers,
  Lock,
  Map,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { StandardStudioShellHeader, type StandardStudioShellConfig } from "./StandardStudioShell";
import {
  CINE_MODE_LABELS,
  CINE_SHOT_LABELS,
  CINE_STATUS_LABELS,
  createEmptyCineNodeData,
  makeCineId,
  type CineAspectRatio,
  type CineBackground,
  type CineCharacter,
  type CineFrame,
  type CineImageStudioSession,
  type CineMode,
  type CineNodeData,
  type CineScene,
  type CineShot,
} from "./cine-types";
import {
  analyzeCineScript,
  analyzeCineScriptWithAI,
  applyCineAnalysisToData,
  applyCineImageStudioResult,
  buildCineBackgroundPrompt,
  buildCineCharacterPrompt,
  buildCineCharacterSheetNegativePrompt,
  buildCineCharacterSheetPrompt,
  buildCineFrameNegativePrompt,
  buildCineFramePrompt,
  buildCineLocationSheetNegativePrompt,
  buildCineLocationSheetPrompt,
  createCineFrameDraft,
  getCineFrameReferenceAssetIds,
  getCineCharacterSheetLayout,
  getEffectiveCharacterSheetAsset,
  getEffectiveCineBackgroundAsset,
  getEffectiveCineCharacterAsset,
  getEffectiveLocationSheetAsset,
  prepareSceneForVideo,
} from "./cine-engine";
import { StudioNodePortal } from "./studio-node/studio-node-architecture";
import { geminiGenerateWithServerProgress } from "@/lib/gemini-generate-stream-client";

type CineStudioTab = "script" | "cast" | "backgrounds" | "storyboard" | "output";
type CineAnalyzerMode = "ai" | "local";
type CineGeneratingTarget = string | null;

export type CineStudioProps = {
  nodeId: string;
  data: CineNodeData;
  onChange: (next: CineNodeData) => void;
  onClose: () => void;
  brainConnected?: boolean;
  sourceScriptText?: string;
  sourceScriptNodeId?: string;
  standardShell?: StandardStudioShellConfig | null;
  initialTab?: CineStudioTab;
  initialSceneId?: string;
  onOpenImageStudio?: (session: Omit<CineImageStudioSession, "nanoNodeId">) => void;
};

const aspectRatios: CineAspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "2.39:1"];
const cineModes = Object.keys(CINE_MODE_LABELS) as CineMode[];
const shotTypes = Object.keys(CINE_SHOT_LABELS) as CineShot["shotType"][];

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function updated(data: CineNodeData): CineNodeData {
  return {
    ...data,
    metadata: {
      ...data.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}

function nextStatus(data: CineNodeData): CineNodeData["status"] {
  if (data.scenes.some((scene) => scene.status === "ready_for_video")) return "ready_for_video";
  if (data.scenes.some((scene) => scene.frames.single || scene.frames.start || scene.frames.end)) return "frames_ready";
  if (data.scenes.length) return "storyboard_ready";
  if (data.backgrounds.length) return "backgrounds_ready";
  if (data.characters.length) return "characters_ready";
  if (data.detected) return "analyzed";
  if ((data.manualScript || data.sourceScript?.text || "").trim()) return "script_received";
  return "empty";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/40 focus:bg-white/[0.08]",
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full resize-y rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-cyan-300/40 focus:bg-white/[0.08]",
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-[#121722] px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/40",
        props.className,
      )}
    />
  );
}

function PillButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-200/25 bg-cyan-300/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-50 shadow-[0_12px_35px_rgba(34,211,238,0.10)] transition hover:bg-cyan-300/22 disabled:cursor-not-allowed disabled:opacity-40",
        props.className,
      )}
    />
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl", className)}>{children}</section>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function CineImagePreview({ src, label }: { src?: string; label: string }) {
  if (!src) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/22">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{label}</span>
        <span className="rounded-full border border-emerald-200/18 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-50/70">2K</span>
      </div>
      <img src={src} alt={label} className="aspect-video w-full object-cover" />
    </div>
  );
}

function useCineMutations(data: CineNodeData, onChange: (next: CineNodeData) => void, nodeId: string, brainConnected?: boolean) {
  const commit = (producer: (draft: CineNodeData) => CineNodeData) => {
    const next = producer(data);
    onChange(updated({ ...next, status: nextStatus(next) }));
  };

  return {
    commit,
    analyze(script: string) {
      const analysis = analyzeCineScript(script);
      onChange(updated(applyCineAnalysisToData({ ...data, manualScript: script }, analysis)));
    },
    createStoryboard(script: string) {
      const analysis = analyzeCineScript(script);
      onChange(updated({ ...applyCineAnalysisToData({ ...data, manualScript: script }, analysis), status: "storyboard_ready" }));
    },
    useConnectedScript(sourceText: string, sourceNodeId?: string) {
      commit((draft) => ({
        ...draft,
        sourceScript: { text: sourceText, nodeId: sourceNodeId, title: "Guion conectado" },
        manualScript: draft.manualScript || sourceText,
        metadata: { ...draft.metadata, sourceScriptNodeId: sourceNodeId },
      }));
    },
    patchCharacter(id: string, patch: Partial<CineCharacter>) {
      commit((draft) => ({ ...draft, characters: draft.characters.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    },
    patchBackground(id: string, patch: Partial<CineBackground>) {
      commit((draft) => ({ ...draft, backgrounds: draft.backgrounds.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    },
    patchScene(id: string, patch: Partial<CineScene>) {
      commit((draft) => ({ ...draft, scenes: draft.scenes.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    },
    addCharacter() {
      commit((draft) => ({
        ...draft,
        characters: [
          ...draft.characters,
          {
            id: makeCineId("cine_character"),
            name: `Personaje ${draft.characters.length + 1}`,
            role: "secondary",
            description: "",
            visualPrompt: "",
            lockedTraits: [],
            wardrobe: "",
            emotionalRange: [],
            notes: "",
            isLocked: false,
          },
        ],
      }));
    },
    addBackground() {
      commit((draft) => ({
        ...draft,
        backgrounds: [
          ...draft.backgrounds,
          {
            id: makeCineId("cine_background"),
            name: `Fondo ${draft.backgrounds.length + 1}`,
            type: "other",
            description: "",
            visualPrompt: "",
            lighting: "",
            palette: [],
            textures: [],
            lockedElements: [],
            notes: "",
            isLocked: false,
          },
        ],
      }));
    },
    duplicateCharacter(id: string) {
      const source = data.characters.find((item) => item.id === id);
      if (!source) return;
      commit((draft) => ({ ...draft, characters: [...draft.characters, { ...source, id: makeCineId("cine_character"), name: `${source.name} copia`, isLocked: false }] }));
    },
    duplicateBackground(id: string) {
      const source = data.backgrounds.find((item) => item.id === id);
      if (!source) return;
      commit((draft) => ({ ...draft, backgrounds: [...draft.backgrounds, { ...source, id: makeCineId("cine_background"), name: `${source.name} copia`, isLocked: false }] }));
    },
    removeCharacter(id: string) {
      commit((draft) => ({ ...draft, characters: draft.characters.filter((item) => item.id !== id), scenes: draft.scenes.map((scene) => ({ ...scene, characters: scene.characters.filter((characterId) => characterId !== id) })) }));
    },
    removeBackground(id: string) {
      commit((draft) => ({ ...draft, backgrounds: draft.backgrounds.filter((item) => item.id !== id), scenes: draft.scenes.map((scene) => scene.backgroundId === id ? { ...scene, backgroundId: undefined } : scene) }));
    },
    prepareFrame(sceneId: string, role: CineFrame["role"]) {
      const frame = createCineFrameDraft({ data, sceneId, frameRole: role, cineNodeId: nodeId, brainConnected });
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            frames: { ...scene.frames, [role]: frame },
            status: role === "single" ? "frame_generated" : "ready_to_generate",
          };
        }),
      }));
    },
    prepareAllSceneFrames(sceneId: string) {
      const scene = data.scenes.find((item) => item.id === sceneId);
      if (!scene) return;
      const roles: CineFrame["role"][] = scene.framesMode === "start_end" ? ["start", "end"] : ["single"];
      const frames = Object.fromEntries(roles.map((role) => [role, createCineFrameDraft({ data, sceneId, frameRole: role, cineNodeId: nodeId, brainConnected })]));
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.map((item) => item.id === sceneId ? { ...item, frames: { ...item.frames, ...frames }, status: roles.length > 1 ? "frames_generated" : "frame_generated" } : item),
      }));
    },
    prepareVideo(sceneId: string) {
      const video = prepareSceneForVideo(data, sceneId);
      commit((draft) => ({ ...draft, scenes: draft.scenes.map((scene) => scene.id === sceneId ? { ...scene, video, status: "ready_for_video" } : scene) }));
    },
    duplicateScene(sceneId: string) {
      const source = data.scenes.find((scene) => scene.id === sceneId);
      if (!source) return;
      commit((draft) => ({
        ...draft,
        scenes: [...draft.scenes, { ...source, id: makeCineId("cine_scene"), order: draft.scenes.length + 1, title: `${source.title} copia`, frames: {}, status: "draft" }],
      }));
    },
    removeScene(sceneId: string) {
      commit((draft) => ({
        ...draft,
        scenes: draft.scenes.filter((scene) => scene.id !== sceneId).map((scene, index) => ({ ...scene, order: index + 1 })),
      }));
    },
  };
}

export function CineStudio({ nodeId, data, onChange, onClose, brainConnected = false, sourceScriptText = "", sourceScriptNodeId, standardShell, initialTab, initialSceneId, onOpenImageStudio }: CineStudioProps) {
  const [activeTab, setActiveTab] = useState<CineStudioTab>(initialTab ?? "script");
  const [promptPreview, setPromptPreview] = useState<{ title: string; prompt: string; negativePrompt?: string; details?: Array<[string, string]> } | null>(null);
  const [analyzerMode, setAnalyzerMode] = useState<CineAnalyzerMode>("ai");
  const [analysisState, setAnalysisState] = useState<{
    status: "idle" | "running" | "done" | "fallback";
    message?: string;
  }>({ status: "idle" });
  const [generatingTarget, setGeneratingTarget] = useState<CineGeneratingTarget>(null);
  const [generationMessage, setGenerationMessage] = useState("");
  const safeData = data || createEmptyCineNodeData();
  const mutations = useCineMutations(safeData, onChange, nodeId, brainConnected);
  const script = safeData.manualScript || safeData.sourceScript?.text || sourceScriptText || "";
  const framesPrepared = safeData.scenes.reduce((count, scene) => count + [scene.frames.single, scene.frames.start, scene.frames.end].filter(Boolean).length, 0);
  const tabs: Array<{ id: CineStudioTab; label: string; icon: React.ReactNode }> = [
    { id: "script", label: "Guion", icon: <BookOpen size={14} /> },
    { id: "cast", label: "Reparto", icon: <Users size={14} /> },
    { id: "backgrounds", label: "Fondos", icon: <Map size={14} /> },
    { id: "storyboard", label: "Storyboard", icon: <Clapperboard size={14} /> },
    { id: "output", label: "Salida", icon: <Film size={14} /> },
  ];

  const exportPlan = useMemo(() => ({
    cineNodeId: nodeId,
    mode: safeData.mode,
    aspectRatio: safeData.visualDirection.aspectRatio,
    scenes: safeData.scenes.map((scene) => ({
      sceneId: scene.id,
      order: scene.order,
      title: scene.title,
      framesMode: scene.framesMode,
      video: scene.video,
      prompt: scene.video?.prompt,
    })),
  }), [nodeId, safeData.mode, safeData.scenes, safeData.visualDirection.aspectRatio]);
  const characterSheetAsset = getEffectiveCharacterSheetAsset(safeData);
  const locationSheetAsset = getEffectiveLocationSheetAsset(safeData);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, initialSceneId]);

  const openCharacterImageStudio = useCallback((character: CineCharacter, mode: "generate" | "edit") => {
    if (!onOpenImageStudio) return;
    const sourceAssetId = mode === "edit" ? getEffectiveCineCharacterAsset(character) : undefined;
    onOpenImageStudio({
      cineNodeId: nodeId,
      kind: "character",
      characterId: character.id,
      prompt: buildCineCharacterPrompt(safeData, character.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      returnTab: "reparto",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "character",
        cineNodeId: nodeId,
        characterId: character.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        createdAt: new Date().toISOString(),
      },
    });
  }, [brainConnected, nodeId, onOpenImageStudio, safeData]);

  const characterSession = useCallback((character: CineCharacter, mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sourceAssetId = mode === "edit" ? getEffectiveCineCharacterAsset(character) : undefined;
    return {
      cineNodeId: nodeId,
      kind: "character",
      characterId: character.id,
      prompt: buildCineCharacterPrompt(safeData, character.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      returnTab: "reparto",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "character",
        cineNodeId: nodeId,
        characterId: character.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        createdAt: new Date().toISOString(),
      },
    };
  }, [brainConnected, nodeId, safeData]);

  const openBackgroundImageStudio = useCallback((background: CineBackground, mode: "generate" | "edit") => {
    if (!onOpenImageStudio) return;
    const sourceAssetId = mode === "edit" ? getEffectiveCineBackgroundAsset(background) : undefined;
    onOpenImageStudio({
      cineNodeId: nodeId,
      kind: "background",
      backgroundId: background.id,
      prompt: buildCineBackgroundPrompt(safeData, background.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      returnTab: "fondos",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "background",
        cineNodeId: nodeId,
        backgroundId: background.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        createdAt: new Date().toISOString(),
      },
    });
  }, [brainConnected, nodeId, onOpenImageStudio, safeData]);

  const backgroundSession = useCallback((background: CineBackground, mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sourceAssetId = mode === "edit" ? getEffectiveCineBackgroundAsset(background) : undefined;
    return {
      cineNodeId: nodeId,
      kind: "background",
      backgroundId: background.id,
      prompt: buildCineBackgroundPrompt(safeData, background.id),
      negativePrompt: buildCineFrameNegativePrompt(),
      sourceAssetId,
      returnTab: "fondos",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "background",
        cineNodeId: nodeId,
        backgroundId: background.id,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: sourceAssetId ? [sourceAssetId] : [],
        createdAt: new Date().toISOString(),
      },
    };
  }, [brainConnected, nodeId, safeData]);

  const openFrameImageStudio = useCallback((scene: CineScene, frameRole: CineFrame["role"], mode: "generate" | "edit") => {
    if (!onOpenImageStudio) return;
    const frame = scene.frames[frameRole];
    const sourceAssetId = mode === "edit" ? frame?.editedImageAssetId || frame?.imageAssetId : undefined;
    onOpenImageStudio({
      cineNodeId: nodeId,
      kind: "frame",
      sceneId: scene.id,
      frameRole,
      prompt: frame?.prompt || buildCineFramePrompt({ data: safeData, sceneId: scene.id, frameRole, cineNodeId: nodeId, brainConnected }),
      negativePrompt: frame?.negativePrompt || buildCineFrameNegativePrompt(),
      sourceAssetId,
      returnTab: "storyboard",
      returnSceneId: scene.id,
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "scene-frame",
        cineNodeId: nodeId,
        sceneId: scene.id,
        frameRole,
        charactersUsed: scene.characters,
        backgroundUsed: scene.backgroundId,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: mode === "edit" && sourceAssetId ? [sourceAssetId] : getCineFrameReferenceAssetIds(safeData, scene.id),
        createdAt: new Date().toISOString(),
      },
    });
  }, [brainConnected, nodeId, onOpenImageStudio, safeData]);

  const frameSession = useCallback((scene: CineScene, frameRole: CineFrame["role"], mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const frame = scene.frames[frameRole];
    const sourceAssetId = mode === "edit" ? frame?.editedImageAssetId || frame?.imageAssetId : undefined;
    return {
      cineNodeId: nodeId,
      kind: "frame",
      sceneId: scene.id,
      frameRole,
      prompt: frame?.prompt || buildCineFramePrompt({ data: safeData, sceneId: scene.id, frameRole, cineNodeId: nodeId, brainConnected }),
      negativePrompt: frame?.negativePrompt || buildCineFrameNegativePrompt(),
      sourceAssetId,
      returnTab: "storyboard",
      returnSceneId: scene.id,
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "scene-frame",
        cineNodeId: nodeId,
        sceneId: scene.id,
        frameRole,
        charactersUsed: scene.characters,
        backgroundUsed: scene.backgroundId,
        sourceScriptNodeId: safeData.metadata?.sourceScriptNodeId,
        brainNodeId: brainConnected && safeData.visualDirection.useBrain ? safeData.metadata?.brainNodeId : undefined,
        visualCapsuleIds: safeData.visualDirection.visualCapsuleIds,
        referenceAssetIds: mode === "edit" && sourceAssetId ? [sourceAssetId] : getCineFrameReferenceAssetIds(safeData, scene.id),
        createdAt: new Date().toISOString(),
      },
    };
  }, [brainConnected, nodeId, safeData]);

  const characterSheetSession = useCallback((mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sheet = safeData.continuity?.characterSheet;
    const sourceAssetId = mode === "edit" ? getEffectiveCharacterSheetAsset(safeData) : undefined;
    const referenceAssetIds = mode === "edit" && sourceAssetId
      ? [sourceAssetId]
      : safeData.characters.map(getEffectiveCineCharacterAsset).filter((item): item is string => Boolean(item));
    return {
      cineNodeId: nodeId,
      kind: "character_sheet",
      prompt: buildCineCharacterSheetPrompt(safeData),
      negativePrompt: buildCineCharacterSheetNegativePrompt(),
      sourceAssetId,
      returnTab: "reparto",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "character-sheet",
        cineNodeId: nodeId,
        referenceAssetIds,
        createdAt: sheet?.createdAt || new Date().toISOString(),
      },
    };
  }, [nodeId, safeData]);

  const locationSheetSession = useCallback((mode: "generate" | "edit"): Omit<CineImageStudioSession, "nanoNodeId"> => {
    const sheet = safeData.continuity?.locationSheet;
    const sourceAssetId = mode === "edit" ? getEffectiveLocationSheetAsset(safeData) : undefined;
    const referenceAssetIds = mode === "edit" && sourceAssetId
      ? [sourceAssetId]
      : safeData.backgrounds.map(getEffectiveCineBackgroundAsset).filter((item): item is string => Boolean(item));
    return {
      cineNodeId: nodeId,
      kind: "location_sheet",
      prompt: buildCineLocationSheetPrompt(safeData),
      negativePrompt: buildCineLocationSheetNegativePrompt(),
      sourceAssetId,
      returnTab: "fondos",
      mode,
      metadata: {
        generatedFrom: "cine-node",
        cineAssetKind: "location-sheet",
        cineNodeId: nodeId,
        referenceAssetIds,
        createdAt: sheet?.createdAt || new Date().toISOString(),
      },
    };
  }, [nodeId, safeData]);

  const openSheetImageStudio = useCallback((session: Omit<CineImageStudioSession, "nanoNodeId">) => {
    if (!onOpenImageStudio || !session.sourceAssetId) return;
    onOpenImageStudio(session);
  }, [onOpenImageStudio]);

  const generateImageInCine = useCallback(async (session: Omit<CineImageStudioSession, "nanoNodeId">, targetKey: string) => {
    if (generatingTarget) return;
    setGeneratingTarget(targetKey);
    setGenerationMessage("Generando imagen 2K...");
    try {
      const referenceImages = Array.from(
        new Set([...(session.metadata?.referenceAssetIds ?? []), session.sourceAssetId].filter((item): item is string => Boolean(item))),
      );
      const result = await geminiGenerateWithServerProgress(
        {
          prompt: session.prompt,
          images: referenceImages,
          aspect_ratio: safeData.visualDirection.aspectRatio,
          resolution: "2k",
          model: "flash31",
          thinking: false,
        },
        (pct, stage) => setGenerationMessage(`${Math.max(1, Math.round(pct))}% · ${stage || "generando"}`),
      );
      const next = applyCineImageStudioResult(safeData, { ...session, nanoNodeId: "" }, {
        assetId: result.output,
        promptUsed: session.prompt,
        negativePromptUsed: session.negativePrompt,
        mode: "generate",
      });
      onChange(updated({ ...next, status: nextStatus(next) }));
      setGenerationMessage("Imagen generada en Cine.");
    } catch (error) {
      console.error("Cine image generation failed:", error);
      setGenerationMessage(error instanceof Error ? error.message : "No se pudo generar la imagen.");
    } finally {
      setGeneratingTarget(null);
    }
  }, [generatingTarget, onChange, safeData]);

  const runAnalysis = async () => {
    const source = script.trim();
    if (!source || analysisState.status === "running") return;
    setAnalysisState({
      status: "running",
      message: analyzerMode === "ai" ? "Analizando con IA..." : "Analizando con parser local...",
    });
    if (analyzerMode === "local") {
      const analysis = analyzeCineScript(source);
      onChange(updated(applyCineAnalysisToData({ ...safeData, manualScript: source }, analysis)));
      setAnalysisState({ status: "done", message: "Analizado con parser local." });
      return;
    }
    try {
      const analysis = await analyzeCineScriptWithAI(source, {
        mode: safeData.mode,
        visualDirection: safeData.visualDirection,
      });
      onChange(updated(applyCineAnalysisToData({ ...safeData, manualScript: source }, analysis)));
      setAnalysisState({ status: "done", message: "Analizado con IA." });
    } catch (error) {
      console.warn("Cine AI analyzer failed, using local parser:", error);
      const fallback = analyzeCineScript(source);
      onChange(updated(applyCineAnalysisToData({ ...safeData, manualScript: source }, fallback)));
      setAnalysisState({ status: "fallback", message: "La IA no respondió. He usado el parser local." });
    }
  };

  const shell = (
    <div className="fixed inset-0 z-[100090] flex flex-col bg-[#05070b] text-white">
      {standardShell ? <StandardStudioShellHeader shell={standardShell} /> : null}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[-10%] h-[30rem] w-[30rem] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[28%] h-[32rem] w-[32rem] rounded-full bg-amber-500/8 blur-3xl" />
      </div>
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-white/10 px-7 py-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.07] shadow-2xl">
          <Clapperboard size={22} className="text-cyan-100" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/60">Nodo Cine</div>
          <h1 className="truncate text-2xl font-semibold tracking-[-0.04em] text-white">Mesa de dirección audiovisual</h1>
        </div>
        <div className="ml-auto hidden grid-cols-4 gap-2 lg:grid">
          <Stat label="Escenas" value={safeData.scenes.length} />
          <Stat label="Reparto" value={safeData.characters.length} />
          <Stat label="Fondos" value={safeData.backgrounds.length} />
          <Stat label="Frames" value={framesPrepared} />
        </div>
        <div className="flex items-center gap-2">
          <span className={cx("rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em]", brainConnected ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.05] text-white/45")}>{brainConnected ? "Brain conectado" : "Sin Brain"}</span>
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-white/65 transition hover:bg-white/[0.12] hover:text-white">
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-white/10 p-5">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cx(
                  "mb-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.13em] transition last:mb-0",
                  activeTab === tab.id ? "bg-cyan-300/15 text-cyan-50 shadow-inner" : "text-white/48 hover:bg-white/[0.06] hover:text-white/80",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Estado</div>
            <div className="mt-2 text-sm font-semibold text-white">{CINE_STATUS_LABELS[safeData.status]}</div>
            <p className="mt-2 text-xs leading-relaxed text-white/42">Cine prepara continuidad, frames y salida. No modifica VideoNode ni Brain.</p>
            {generationMessage ? (
              <p className={cx("mt-3 rounded-2xl border px-3 py-2 text-xs leading-relaxed", generatingTarget ? "border-cyan-200/20 bg-cyan-300/10 text-cyan-50/75" : "border-white/10 bg-white/[0.04] text-white/50")}>
                {generationMessage}
              </p>
            ) : null}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-7">
          {activeTab === "script" ? (
            <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[1fr_360px]">
              <SectionCard>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.03em]">Guion</h2>
                    <p className="mt-1 text-sm text-white/45">Pega un texto o importa el guion conectado desde Guionista.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton disabled={!script.trim() || analysisState.status === "running"} onClick={() => void runAnalysis()}><Wand2 size={14} />{analysisState.status === "running" ? "Analizando..." : "Analizar guion"}</PrimaryButton>
                    <PillButton disabled={!script.trim()} onClick={() => mutations.createStoryboard(script)}><Clapperboard size={14} />Crear storyboard</PillButton>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-2">
                  <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                    <button
                      type="button"
                      onClick={() => setAnalyzerMode("ai")}
                      className={cx(
                        "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                        analyzerMode === "ai" ? "bg-cyan-300/18 text-cyan-50" : "text-white/45 hover:text-white/75",
                      )}
                    >
                      Analizar con IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalyzerMode("local")}
                      className={cx(
                        "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                        analyzerMode === "local" ? "bg-white/12 text-white" : "text-white/45 hover:text-white/75",
                      )}
                    >
                      Parser local
                    </button>
                  </div>
                  <p className={cx(
                    "text-xs",
                    analysisState.status === "fallback" ? "text-amber-100/75" : "text-white/42",
                  )}>
                    {analysisState.message || "Por defecto usa IA; si falla, cae al analizador local sin perder el guion."}
                  </p>
                </div>
                {sourceScriptText ? (
                  <div className="mb-4 rounded-2xl border border-cyan-200/15 bg-cyan-300/8 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm text-cyan-50/80">Guion conectado disponible</div>
                      <PillButton onClick={() => mutations.useConnectedScript(sourceScriptText, sourceScriptNodeId)}>Usar conectado</PillButton>
                    </div>
                  </div>
                ) : null}
                <TextArea
                  value={safeData.manualScript ?? ""}
                  onChange={(event) => mutations.commit((draft) => ({ ...draft, manualScript: event.target.value }))}
                  placeholder="Pega aqui el guion, texto narrativo o estructura de escenas..."
                  className="min-h-[360px]"
                />
              </SectionCard>
              <SectionCard>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">Dirección</h3>
                <div className="mt-4 grid gap-4">
                  <div><FieldLabel>Modo</FieldLabel><Select value={safeData.mode} onChange={(event) => mutations.commit((draft) => ({ ...draft, mode: event.target.value as CineMode }))}>{cineModes.map((mode) => <option key={mode} value={mode}>{CINE_MODE_LABELS[mode]}</option>)}</Select></div>
                  <div><FieldLabel>Aspect ratio</FieldLabel><Select value={safeData.visualDirection.aspectRatio} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, aspectRatio: event.target.value as CineAspectRatio } }))}>{aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</Select></div>
                  <div><FieldLabel>Realismo</FieldLabel><Select value={safeData.visualDirection.realismLevel} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, realismLevel: event.target.value as CineNodeData["visualDirection"]["realismLevel"] } }))}><option value="realistic">Realista</option><option value="stylized">Estilizado</option><option value="hybrid">Híbrido</option></Select></div>
                  <div><FieldLabel>Dirección visual general</FieldLabel><TextArea value={safeData.visualDirection.globalStylePrompt ?? ""} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, globalStylePrompt: event.target.value } }))} rows={4} placeholder="Luz, textura, cámara, tono visual..." /></div>
                  <div><FieldLabel>Estilo de cámara</FieldLabel><TextInput value={safeData.visualDirection.cameraStyle ?? ""} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, cameraStyle: event.target.value } }))} placeholder="Cámara en mano suave, ópticas naturales..." /></div>
                  <div><FieldLabel>Estilo de luz</FieldLabel><TextInput value={safeData.visualDirection.lightingStyle ?? ""} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, lightingStyle: event.target.value } }))} placeholder="Luz natural motivada, contraste suave..." /></div>
                  <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70"><span>Usar Brain conectado</span><input type="checkbox" checked={Boolean(safeData.visualDirection.useBrain)} onChange={(event) => mutations.commit((draft) => ({ ...draft, visualDirection: { ...draft.visualDirection, useBrain: event.target.checked } }))} /></label>
                </div>
              </SectionCard>
              {safeData.detected ? (
                <SectionCard className="xl:col-span-2">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Análisis</h3><PillButton onClick={() => setActiveTab("storyboard")}>Ver storyboard <ArrowRight size={13} /></PillButton></div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3"><Stat label="Tono" value={safeData.detected.tone || "-"} /><Stat label="Modo sugerido" value={safeData.detected.suggestedMode ? CINE_MODE_LABELS[safeData.detected.suggestedMode] : "-"} /><Stat label="Escenas" value={safeData.scenes.length} /></div>
                  <p className="mt-4 text-sm leading-relaxed text-white/55">{safeData.detected.summary}</p>
                </SectionCard>
              ) : null}
            </div>
          ) : null}

          {activeTab === "cast" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Reparto</h2><p className="mt-1 text-sm text-white/45">Continuidad visual de personajes.</p></div><PrimaryButton onClick={() => mutations.addCharacter()}><Plus size={14} />Añadir personaje</PrimaryButton></div>
              <SectionCard className="mb-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Hoja de continuidad de personajes</div>
                    <h3 className="mt-1 text-lg font-semibold">Identidad visual del reparto</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/48">Una referencia compuesta para mantener rostros, escala, vestuario y rasgos bloqueados entre escenas.</p>
                    <p className="mt-2 text-xs text-white/38">{safeData.characters.length} personajes incluidos · layout {getCineCharacterSheetLayout(safeData)}</p>
                  </div>
                  <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65">
                    <input type="checkbox" checked={Boolean(safeData.continuity?.useCharacterSheetForFrames)} onChange={(event) => mutations.commit((draft) => ({ ...draft, continuity: { ...draft.continuity, useCharacterSheetForFrames: event.target.checked } }))} />
                    Usar en frames
                  </label>
                </div>
                <CineImagePreview src={characterSheetAsset} label="Character continuity sheet" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <PillButton disabled={!safeData.characters.length || Boolean(generatingTarget)} onClick={() => void generateImageInCine(characterSheetSession("generate"), "character-sheet")}>
                    <Camera size={13} />{generatingTarget === "character-sheet" ? "Generando 2K..." : characterSheetAsset ? "Regenerar hoja" : "Crear hoja de continuidad"}
                  </PillButton>
                  <PillButton disabled={!onOpenImageStudio || !characterSheetAsset} onClick={() => openSheetImageStudio(characterSheetSession("edit"))}>Editar</PillButton>
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/38">{safeData.continuity?.characterSheet?.status ?? "sin hoja"}</span>
                </div>
              </SectionCard>
              <div className="grid gap-4 lg:grid-cols-2">
                {safeData.characters.map((character) => (
                  <SectionCard key={character.id}>
                    <div className="mb-4 flex items-center justify-between gap-3"><TextInput value={character.name} onChange={(event) => mutations.patchCharacter(character.id, { name: event.target.value })} className="text-base font-semibold" /><PillButton onClick={() => mutations.patchCharacter(character.id, { isLocked: !character.isLocked })}>{character.isLocked ? <Lock size={13} /> : <Unlock size={13} />}{character.isLocked ? "Bloqueado" : "Bloquear"}</PillButton></div>
                    <div className="grid gap-3"><div><FieldLabel>Rol</FieldLabel><Select value={character.role} onChange={(event) => mutations.patchCharacter(character.id, { role: event.target.value as CineCharacter["role"] })}><option value="protagonist">Protagonista</option><option value="secondary">Secundario</option><option value="extra">Extra</option><option value="object">Objeto</option></Select></div><div><FieldLabel>Descripción</FieldLabel><TextArea rows={3} value={character.description} onChange={(event) => mutations.patchCharacter(character.id, { description: event.target.value })} /></div><div><FieldLabel>Prompt visual</FieldLabel><TextArea rows={4} value={character.visualPrompt} onChange={(event) => mutations.patchCharacter(character.id, { visualPrompt: event.target.value })} /></div><div><FieldLabel>Rasgos bloqueados</FieldLabel><TextInput value={character.lockedTraits.join(", ")} onChange={(event) => mutations.patchCharacter(character.id, { lockedTraits: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="pelo, edad, vestuario, gesto..." /></div></div>
                    <CineImagePreview src={getEffectiveCineCharacterAsset(character)} label="Referencia de personaje" />
                    <div className="mt-4 flex flex-wrap gap-2"><PillButton disabled={Boolean(generatingTarget)} onClick={() => void generateImageInCine(characterSession(character, "generate"), `character:${character.id}`)}><Camera size={13} />{generatingTarget === `character:${character.id}` ? "Generando 2K..." : "Generar personaje"}</PillButton><PillButton disabled={!onOpenImageStudio || !getEffectiveCineCharacterAsset(character)} onClick={() => openCharacterImageStudio(character, "edit")}>Editar en Image Studio</PillButton><PillButton onClick={() => mutations.duplicateCharacter(character.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeCharacter(character.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "backgrounds" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Fondos</h2><p className="mt-1 text-sm text-white/45">Localizaciones reutilizables y bloqueables.</p></div><PrimaryButton onClick={() => mutations.addBackground()}><Plus size={14} />Añadir fondo</PrimaryButton></div>
              <SectionCard className="mb-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Hoja de continuidad de localizaciones</div>
                    <h3 className="mt-1 text-lg font-semibold">Coherencia visual de fondos</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/48">Una referencia compuesta para conservar arquitectura, luz, texturas y atmósfera entre escenas.</p>
                    <p className="mt-2 text-xs text-white/38">{safeData.backgrounds.length} fondos incluidos · layout {safeData.backgrounds.length <= 1 ? "single" : "grid"}</p>
                  </div>
                  <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65">
                    <input type="checkbox" checked={Boolean(safeData.continuity?.useLocationSheetForFrames)} onChange={(event) => mutations.commit((draft) => ({ ...draft, continuity: { ...draft.continuity, useLocationSheetForFrames: event.target.checked } }))} />
                    Usar en frames
                  </label>
                </div>
                <CineImagePreview src={locationSheetAsset} label="Location continuity sheet" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <PillButton disabled={!safeData.backgrounds.length || Boolean(generatingTarget)} onClick={() => void generateImageInCine(locationSheetSession("generate"), "location-sheet")}>
                    <Camera size={13} />{generatingTarget === "location-sheet" ? "Generando 2K..." : locationSheetAsset ? "Regenerar hoja" : "Crear hoja de localizaciones"}
                  </PillButton>
                  <PillButton disabled={!onOpenImageStudio || !locationSheetAsset} onClick={() => openSheetImageStudio(locationSheetSession("edit"))}>Editar</PillButton>
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/38">{safeData.continuity?.locationSheet?.status ?? "sin hoja"}</span>
                </div>
              </SectionCard>
              <div className="grid gap-4 lg:grid-cols-2">
                {safeData.backgrounds.map((background) => (
                  <SectionCard key={background.id}>
                    <div className="mb-4 flex items-center justify-between gap-3"><TextInput value={background.name} onChange={(event) => mutations.patchBackground(background.id, { name: event.target.value })} className="text-base font-semibold" /><PillButton onClick={() => mutations.patchBackground(background.id, { isLocked: !background.isLocked })}>{background.isLocked ? <Lock size={13} /> : <Unlock size={13} />}{background.isLocked ? "Bloqueado" : "Bloquear"}</PillButton></div>
                    <div className="grid gap-3"><div><FieldLabel>Tipo</FieldLabel><Select value={background.type ?? "other"} onChange={(event) => mutations.patchBackground(background.id, { type: event.target.value as CineBackground["type"] })}><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="natural">Natural</option><option value="urban">Urbano</option><option value="studio">Studio</option><option value="abstract">Abstracto</option><option value="other">Otro</option></Select></div><div><FieldLabel>Descripción</FieldLabel><TextArea rows={3} value={background.description} onChange={(event) => mutations.patchBackground(background.id, { description: event.target.value })} /></div><div><FieldLabel>Prompt visual</FieldLabel><TextArea rows={4} value={background.visualPrompt} onChange={(event) => mutations.patchBackground(background.id, { visualPrompt: event.target.value })} /></div><div><FieldLabel>Luz habitual</FieldLabel><TextInput value={background.lighting ?? ""} onChange={(event) => mutations.patchBackground(background.id, { lighting: event.target.value })} /></div><div><FieldLabel>Elementos bloqueados</FieldLabel><TextInput value={(background.lockedElements ?? []).join(", ")} onChange={(event) => mutations.patchBackground(background.id, { lockedElements: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div></div>
                    <CineImagePreview src={getEffectiveCineBackgroundAsset(background)} label="Referencia de fondo" />
                    <div className="mt-4 flex flex-wrap gap-2"><PillButton disabled={Boolean(generatingTarget)} onClick={() => void generateImageInCine(backgroundSession(background, "generate"), `background:${background.id}`)}><Camera size={13} />{generatingTarget === `background:${background.id}` ? "Generando 2K..." : "Generar fondo"}</PillButton><PillButton disabled={!onOpenImageStudio || !getEffectiveCineBackgroundAsset(background)} onClick={() => openBackgroundImageStudio(background, "edit")}>Editar en Image Studio</PillButton><PillButton onClick={() => mutations.duplicateBackground(background.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeBackground(background.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "storyboard" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Storyboard</h2><p className="mt-1 text-sm text-white/45">Escenas ordenadas, frames y prompts revisables.</p></div><PrimaryButton disabled={!script.trim()} onClick={() => mutations.createStoryboard(script)}><Sparkles size={14} />Generar storyboard completo</PrimaryButton></div>
              <div className="mb-5 grid gap-2 md:grid-cols-2">
                <div className={cx("rounded-2xl border px-4 py-3 text-xs leading-relaxed", characterSheetAsset && safeData.continuity?.useCharacterSheetForFrames ? "border-emerald-200/18 bg-emerald-300/10 text-emerald-50/72" : "border-amber-200/16 bg-amber-300/8 text-amber-50/68")}>
                  {characterSheetAsset && safeData.continuity?.useCharacterSheetForFrames ? "Usando hoja de personajes como referencia en frames." : "Recomendado: crea una hoja de continuidad de personajes antes de generar frames para mantener identidad entre escenas."}
                </div>
                <div className={cx("rounded-2xl border px-4 py-3 text-xs leading-relaxed", locationSheetAsset && safeData.continuity?.useLocationSheetForFrames ? "border-emerald-200/18 bg-emerald-300/10 text-emerald-50/72" : "border-amber-200/16 bg-amber-300/8 text-amber-50/68")}>
                  {locationSheetAsset && safeData.continuity?.useLocationSheetForFrames ? "Usando hoja de localizaciones como referencia en frames." : "Recomendado: crea una hoja de continuidad de localizaciones para mantener coherencia entre fondos."}
                </div>
              </div>
              <div className="grid gap-5">
                {safeData.scenes.map((scene) => (
                  <SectionCard key={scene.id}>
                    <div className="mb-4 flex flex-wrap items-center gap-3"><span className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">Escena {scene.order}</span><TextInput value={scene.title} onChange={(event) => mutations.patchScene(scene.id, { title: event.target.value })} className="min-w-[220px] flex-1 text-base font-semibold" /><PillButton onClick={() => mutations.duplicateScene(scene.id)}><Copy size={13} />Duplicar</PillButton><PillButton onClick={() => mutations.removeScene(scene.id)} className="text-rose-100"><Trash2 size={13} />Eliminar</PillButton></div>
                    <div className="grid gap-4 xl:grid-cols-[1fr_320px]"><div className="grid gap-3"><div><FieldLabel>Texto original</FieldLabel><TextArea rows={3} value={scene.sourceText} onChange={(event) => mutations.patchScene(scene.id, { sourceText: event.target.value })} /></div><div><FieldLabel>Resumen visual</FieldLabel><TextArea rows={3} value={scene.visualSummary} onChange={(event) => mutations.patchScene(scene.id, { visualSummary: event.target.value })} /></div>{(scene.voiceOver || scene.onScreenText?.length || scene.visualNotes || scene.sceneKind) ? <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/18 p-3 text-xs leading-relaxed text-white/58">{scene.sceneKind ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Tipo</span><p className="mt-1 text-white/70">{scene.sceneKind}</p></div> : null}{scene.voiceOver ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Voz en off</span><p className="mt-1 whitespace-pre-wrap text-white/70">{scene.voiceOver}</p></div> : null}{scene.onScreenText?.length ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Texto en pantalla</span><ul className="mt-1 list-disc space-y-1 pl-4 text-white/70">{scene.onScreenText.map((text, idx) => <li key={`${scene.id}_text_${idx}`}>{text}</li>)}</ul><p className="mt-2 rounded-xl border border-amber-200/15 bg-amber-300/10 px-3 py-2 text-[11px] leading-relaxed text-amber-50/70">El texto en pantalla se conservará como overlay. No se recomienda quemarlo dentro del frame generado.</p></div> : null}{scene.visualNotes ? <div><span className="font-semibold uppercase tracking-wide text-white/35">Notas visuales</span><p className="mt-1 whitespace-pre-wrap text-white/70">{scene.visualNotes}</p></div> : null}</div> : null}<div><FieldLabel>Personajes</FieldLabel><div className="mt-2 flex flex-wrap gap-2">{safeData.characters.length ? safeData.characters.map((character) => { const active = scene.characters.includes(character.id); return <button key={character.id} type="button" onClick={() => mutations.patchScene(scene.id, { characters: active ? scene.characters.filter((id) => id !== character.id) : [...scene.characters, character.id] })} className={cx("rounded-full border px-3 py-1.5 text-[11px] font-semibold transition", active ? "border-cyan-200/35 bg-cyan-300/16 text-cyan-50" : "border-white/10 bg-white/[0.04] text-white/48 hover:text-white/80")}>{character.name}</button>; }) : <span className="text-xs text-white/35">Sin personajes detectados todavía.</span>}</div></div><div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Fondo</FieldLabel><Select value={scene.backgroundId ?? ""} onChange={(event) => mutations.patchScene(scene.id, { backgroundId: event.target.value || undefined })}><option value="">Sin fondo</option>{safeData.backgrounds.map((background) => <option key={background.id} value={background.id}>{background.name}</option>)}</Select></div><div><FieldLabel>Tipo de plano</FieldLabel><Select value={scene.shot.shotType} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, shotType: event.target.value as CineShot["shotType"] } })}>{shotTypes.map((shot) => <option key={shot} value={shot}>{CINE_SHOT_LABELS[shot]}</option>)}</Select></div></div><div className="grid gap-3 md:grid-cols-3"><div><FieldLabel>Cámara</FieldLabel><TextInput value={scene.shot.cameraMovement ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, cameraMovement: event.target.value } })} /></div><div><FieldLabel>Luz</FieldLabel><TextInput value={scene.shot.lighting ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, lighting: event.target.value } })} /></div><div><FieldLabel>Duración</FieldLabel><TextInput type="number" value={scene.shot.durationSeconds ?? scene.durationSeconds ?? 5} onChange={(event) => mutations.patchScene(scene.id, { durationSeconds: Number(event.target.value) || 5, shot: { ...scene.shot, durationSeconds: Number(event.target.value) || 5 } })} /></div></div><div className="grid gap-3 md:grid-cols-2"><div><FieldLabel>Mood</FieldLabel><TextInput value={scene.shot.mood ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, mood: event.target.value } })} /></div><div><FieldLabel>Acción</FieldLabel><TextInput value={scene.shot.action ?? ""} onChange={(event) => mutations.patchScene(scene.id, { shot: { ...scene.shot, action: event.target.value } })} /></div></div></div>
                      <div className="rounded-[24px] border border-white/10 bg-black/20 p-3">
                        <FieldLabel>Frames</FieldLabel>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <PillButton onClick={() => mutations.patchScene(scene.id, { framesMode: "single" })} className={scene.framesMode === "single" ? "bg-cyan-300/18 text-cyan-50" : ""}>1 frame</PillButton>
                          <PillButton onClick={() => mutations.patchScene(scene.id, { framesMode: "start_end" })} className={scene.framesMode === "start_end" ? "bg-cyan-300/18 text-cyan-50" : ""}>Inicio + final</PillButton>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {(scene.framesMode === "start_end" ? (["start", "end"] as CineFrame["role"][]) : (["single"] as CineFrame["role"][])).map((role) => {
                            const frame = scene.frames[role];
                            const label = role === "single" ? "Frame único" : role === "start" ? "Frame inicial" : "Frame final";
                            const imageSrc = frame?.editedImageAssetId || frame?.imageAssetId;
                            const targetKey = `frame:${scene.id}:${role}`;
                            return (
                              <div key={role} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-white/75">{label}</span>
                                  <span className="text-[10px] uppercase tracking-wide text-white/35">{frame?.status ?? "vacío"}</span>
                                </div>
                                <CineImagePreview src={imageSrc} label={label} />
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <PillButton onClick={() => mutations.prepareFrame(scene.id, role)}>Construir prompt</PillButton>
                                  <PillButton disabled={Boolean(generatingTarget)} onClick={() => void generateImageInCine(frameSession(scene, role, "generate"), targetKey)}><Camera size={13} />{generatingTarget === targetKey ? "Generando 2K..." : "Generar"}</PillButton>
                                  <PillButton disabled={!frame?.prompt} onClick={() => frame?.prompt && setPromptPreview({ title: `${scene.title} · ${label}`, prompt: frame.prompt, negativePrompt: frame.negativePrompt, details: [["Personajes", scene.characters.map((characterId) => safeData.characters.find((character) => character.id === characterId)?.name).filter(Boolean).join(", ") || "-"], ["Fondo", safeData.backgrounds.find((background) => background.id === scene.backgroundId)?.name || "-"], ["Visual notes", scene.visualNotes || "-"], ["Voice over", scene.voiceOver || "-"], ["Scene kind", scene.sceneKind || "-"], ["On-screen text", scene.onScreenText?.length ? `${scene.onScreenText.join(" / ")} (overlay externo, excluido de la imagen)` : "-"]] })}>Ver prompt</PillButton>
                                  <PillButton disabled={!onOpenImageStudio || !imageSrc} onClick={() => openFrameImageStudio(scene, role, "edit")}>Editar</PillButton>
                                  <PillButton disabled={!frame} onClick={() => frame && mutations.patchScene(scene.id, { frames: { ...scene.frames, [role]: { ...frame, status: "approved" } } })}><Check size={13} />Aprobar prompt</PillButton>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <PrimaryButton className="mt-3 w-full" onClick={() => mutations.prepareAllSceneFrames(scene.id)}>Construir prompts de escena</PrimaryButton>
                        <PillButton className="mt-2 w-full" onClick={() => mutations.prepareVideo(scene.id)}>Preparar para vídeo</PillButton>
                      </div>
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "output" ? (
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Salida</h2><p className="mt-1 text-sm text-white/45">Plan de escenas listo para vídeo. Exportación JSON inicial.</p></div><PrimaryButton onClick={() => void navigator.clipboard?.writeText(JSON.stringify(exportPlan, null, 2))}><Layers size={14} />Copiar plan JSON</PrimaryButton></div>
              <div className="grid gap-4">
                {safeData.scenes.map((scene) => (
                  <SectionCard key={scene.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/50">Escena {scene.order}</div><h3 className="mt-1 text-lg font-semibold">{scene.title}</h3></div><PillButton onClick={() => mutations.prepareVideo(scene.id)}>Preparar vídeo</PillButton></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3"><Stat label="Modo" value={scene.framesMode === "start_end" ? "Start/end" : "Image to video"} /><Stat label="Duración" value={`${scene.durationSeconds ?? scene.shot.durationSeconds ?? 5}s`} /><Stat label="Estado" value={scene.video?.status ?? "idle"} /></div>
                    {scene.video?.prompt ? <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-relaxed text-white/62">{scene.video.prompt}</pre> : null}
                  </SectionCard>
                ))}
              </div>
            </div>
          ) : null}
        </main>
      </div>
      {promptPreview ? (
        <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/12 bg-[#0b1018] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Prompt de frame</div><h3 className="mt-1 text-lg font-semibold">{promptPreview.title}</h3></div><button type="button" onClick={() => setPromptPreview(null)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-2 text-white/65 hover:bg-white/[0.12]"><X size={18} /></button></div>
            <div className="max-h-[60vh] overflow-auto p-5">
              {promptPreview.details?.length ? (
                <div className="mb-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white/60">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Datos usados</div>
                  {promptPreview.details.map(([label, value]) => (
                    <div key={label} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                      <span className="font-semibold text-white/45">{label}</span>
                      <span className="whitespace-pre-wrap text-white/72">{value}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Prompt final de imagen</div>
              <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/24 p-4 text-sm leading-relaxed text-white/72">{promptPreview.prompt}</pre>
              {promptPreview.negativePrompt ? (
                <>
                  <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Negative prompt</div>
                  <pre className="whitespace-pre-wrap rounded-2xl border border-rose-200/10 bg-rose-950/10 p-4 text-xs leading-relaxed text-rose-50/68">{promptPreview.negativePrompt}</pre>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return <StudioNodePortal>{shell}</StudioNodePortal>;
}
