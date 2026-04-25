"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Droplets,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  LayoutDashboard,
  MessageSquareText,
  Network,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
  XIcon,
} from "lucide-react";
import {
  AUDIENCE_PERSONA_CATALOG,
  MAX_KNOWLEDGE_DOC_BYTES,
  MAX_LOGO_BYTES,
  normalizeProjectAssets,
  defaultBrainVisualStyle,
  type BrainVisualImageAnalysis,
  type BrainVisualImageUserOverride,
  type BrainVisualReferenceLayer,
  type BrainVisualStyleSlotKey,
  type BrainGeneratedPiece,
  type BrainPersona,
  type BrainVoiceExample,
  type KnowledgeDocumentEntry,
  type ProjectAssetsMetadata,
  type VisualImageClassification,
} from "./project-assets-metadata";
import { BRAIN_ADN_COMPLETENESS_TOOLTIP_ES, computeAdnScore } from "@/lib/brain/brain-adn-score";
import type { BrandSummaryBadge, BrandSummarySection } from "@/lib/brain/brain-brand-summary";
import {
  buildBrainBrandSummary,
  filterLegacyFunnelMessages,
  filterLegacyLanguageTraits,
  isLegacyDemoFunnelText,
  LEGACY_LANGUAGE_TRAITS_EXACT,
} from "@/lib/brain/brain-brand-summary";
import {
  buildVisualStyleFromVisionAnalyses,
  mergeVisualStyleWithVisionDerivedDescriptions,
} from "@/lib/brain/brain-visual-style-from-vision";
import { countVisualImageAnalysisDisposition, getPendingLearningProvenanceUi } from "@/lib/brain/brain-learning-provenance";
import { readResponseJson } from "@/lib/read-response-json";
import { hasVisualLearningReviewBundle } from "@/lib/brain/brain-visual-review-constants";
import {
  formatLearningReviewCardHeadline,
  labelForBrainNodeSource,
  labelForLearningCard,
  learningReviewDiagnosticBullets,
  stripLearningValueUiPrefixes,
} from "@/lib/brain/brain-review-labels";
import {
  aggregateVisualPatterns,
  collectVisualImageAssetRefs,
  createVisualLearningCandidates,
  getEffectiveClassification,
  isExcludedFromVisualDna,
  reanalyzeVisualReferences,
} from "@/lib/brain/brain-visual-analysis";
import {
  buildBrainVisualPromptContext,
  composeBrainVisualStyleSlotPrompt,
} from "@/lib/brain/build-brain-visual-prompt-context";
import type { LearningResolutionAction, StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import {
  listDownstreamBrainClients,
  type BrainDownstreamClient,
  type BrainFlowEdgeLite,
  type BrainFlowNodeLite,
} from "@/lib/brain/brain-canvas-brain-links";
import {
  BRAIN_PENDING_QUEUE_TOOLTIP_ES,
  BRAIN_RECENT_SIGNALS_TOOLTIP_ES,
  BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES,
  buildPendingCountByNodeId,
  connectedNodeSignalsCopy,
  learningRowMatchesCanvasNode,
  resolveLearningPendingAnchorNodeId,
} from "@/lib/brain/brain-connected-signals-ui";
import type { VisualReanalyzeDiagnosticRow } from "@/lib/brain/brain-visual-reanalyze-diagnostics";
import { fetchBrainTelemetrySummaryByNodeId } from "@/lib/brain/fetch-brain-telemetry-summary";
import { applyLearningCandidateToProjectAssets } from "@/lib/brain/brain-apply-learning-candidate";
import { BrandSummarySourcesPanel, type BrandSummaryNavTab } from "./brand-summary-sources-panel";
import { fireAndForgetDeleteS3Keys } from "@/lib/s3-delete-client";
import { tryExtractKnowledgeFilesKeyFromUrl } from "@/lib/s3-media-hydrate";

function visualReferenceRowMeta(
  analysis: BrainVisualImageAnalysis | null,
  layer: BrainVisualReferenceLayer | undefined,
): {
  estadoLabel: string;
  proveedorLabel: string;
  versionLabel: string;
  imageUrlLine: string;
  fallbackNote: string | null;
} {
  const versionFallback = layer?.analyzerVersion?.trim() || "—";
  const imageUrlLine =
    analysis?.imageUrlForVisionAvailable === true
      ? "disponible"
      : analysis?.imageUrlForVisionAvailable === false
        ? "no disponible"
        : "—";

  if (!analysis) {
    return {
      estadoLabel: "Pendiente",
      proveedorLabel: "—",
      versionLabel: versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  const attempted = analysis.visionProviderAttempted;
  const attemptedLabel =
    attempted === "gemini-vision"
      ? "Gemini"
      : attempted === "openai-vision"
        ? "OpenAI"
        : attempted === "mock"
          ? "Mock"
          : null;

  if (analysis.analysisStatus === "failed" && analysis.fallbackUsed) {
    return {
      estadoLabel: attemptedLabel ? `Error en ${attemptedLabel}` : "Error en visión remota",
      proveedorLabel: "Mock / heurística local",
      versionLabel: analysis.analyzerVersion?.trim() || "mock-1",
      imageUrlLine,
      fallbackNote:
        "Fallback heurístico mostrado. No es análisis visual real.",
    };
  }

  if (analysis.analysisStatus === "failed") {
    return {
      estadoLabel: "Error",
      proveedorLabel: "—",
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: analysis.failureReason?.trim() ?? null,
    };
  }

  const provId = analysis.visionProviderId ?? layer?.lastVisionProviderId;
  const provLabel =
    provId === "gemini-vision"
      ? "Gemini"
      : provId === "openai-vision"
        ? "OpenAI"
        : provId === "mock"
          ? "Mock"
          : "—";

  if (provId === "mock") {
    return {
      estadoLabel: "Análisis simulado",
      proveedorLabel: "Mock",
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  if (provId === "openai-vision" || provId === "gemini-vision") {
    return {
      estadoLabel: "Analizado con visión real",
      proveedorLabel: provLabel,
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  const legacyMock =
    !provId &&
    ((!layer?.lastVisionProviderId && versionFallback.toLowerCase().startsWith("mock")) ||
      layer?.lastVisionProviderId === "mock");
  if (legacyMock) {
    return {
      estadoLabel: "Análisis simulado",
      proveedorLabel: "Mock",
      versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
      imageUrlLine,
      fallbackNote: null,
    };
  }

  return {
    estadoLabel: analysis.analysisStatus === "analyzing" ? "Analizando" : "Analizado",
    proveedorLabel: provLabel,
    versionLabel: analysis.analyzerVersion?.trim() || versionFallback,
    imageUrlLine,
    fallbackNote: null,
  };
}

type MessageType = "" | "error" | "success" | "info";
type LogoSlotId = "positive" | "negative";
export type BrainMainSection =
  | "overview"
  | "dna"
  | "visual_refs"
  | "knowledge"
  | "connected_nodes"
  | "review"
  | "voice"
  | "personas"
  | "messages"
  | "facts";

type Props = {
  open: boolean;
  onClose: () => void;
  assetsMetadata: unknown;
  onAssetsMetadataChange: (next: ProjectAssetsMetadata) => void;
  /** Proyecto persistible; necesario para “Por revisar” (aprendizajes pendientes). */
  projectId?: string | null;
  /** Ámbito de aprendizajes (mismo id que uso en lienzo cuando aplica). */
  workspaceId?: string | null;
  /** Nodos del canvas (opcional) para “Nodos conectados”. */
  canvasNodes?: BrainFlowNodeLite[] | null;
  canvasEdges?: BrainFlowEdgeLite[] | null;
  /** Al abrir desde el lienzo (p. ej. «Revisar pendientes»), forzar pestaña inicial. */
  initialSection?: BrainMainSection | null;
  /** Análisis visual reanalizado en memoria; falta guardar `metadata.assets` en el servidor. */
  visualReferenceAnalysisDirty?: boolean;
  onVisualReferenceAnalysisDirty?: () => void;
  /** Persistir proyecto (incluye capa visual); mismo flujo que guardar en el lienzo. */
  onSaveProjectFromBrain?: () => Promise<boolean>;
  isSavingProject?: boolean;
};

type BrainChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ id: string; name: string; score: number }>;
  suggestedUploads?: string[];
};

type GeneratedPreview = {
  internalPrompt: string;
  draft: string;
  critique: string;
  score: number;
  issues: string[];
  revised: string;
  sources: {
    core: Array<{ id: string; name: string }>;
    context: Array<{ id: string; name: string }>;
  };
};

function readFileDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error("FILE_TOO_LARGE"));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("READ_ERROR"));
    r.readAsDataURL(file);
  });
}

async function rasterizeDataUrlToPng(dataUrl: string, maxSide = 1024): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w0 = Math.max(1, img.naturalWidth || img.width || 1);
        const h0 = Math.max(1, img.naturalHeight || img.height || 1);
        const scale = Math.min(1, maxSide / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function tryNormalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function labelVisualClassification(cls: VisualImageClassification | "EXCLUDED"): string {
  if (cls === "EXCLUDED") return "EXCLUIDA";
  switch (cls) {
    case "CORE_VISUAL_DNA":
      return "CORE VISUAL";
    case "PROJECT_VISUAL_REFERENCE":
      return "REFERENCIA DE PROYECTO";
    case "CONTEXTUAL_VISUAL_MEMORY":
      return "CONTEXTO VISUAL";
    case "RAW_ASSET_ONLY":
      return "RAW ASSET";
    default:
      return cls;
  }
}

function computeVisualIdentityScore(assets: ReturnType<typeof normalizeProjectAssets>): number {
  let s = 0;
  if (assets.brand.logoPositive) s += 34;
  if (assets.brand.logoNegative) s += 26;
  const cols = [assets.brand.colorPrimary, assets.brand.colorSecondary, assets.brand.colorAccent].filter(
    (c) => typeof c === "string" && c.trim().length > 2,
  );
  s += Math.min(40, cols.length * 13);
  return Math.min(100, s);
}

function computeVisualRefsHealthScore(analyzed: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((analyzed / total) * 100));
}

function computeFactsSignalsScore(assets: ReturnType<typeof normalizeProjectAssets>): number {
  const n = assets.strategy.factsAndEvidence.filter((f) => f.verified || f.interpreted).length;
  return Math.min(100, Math.round((n / 10) * 100));
}

function computeNodeLearningScore(pendingCount: number, generatedPieces: number): number {
  return Math.min(100, pendingCount * 22 + Math.min(45, generatedPieces * 5));
}

function brandSummaryBadgeClass(badge: BrandSummaryBadge): string {
  switch (badge) {
    case "Confirmado":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "Visual real":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "Fallback":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "Legacy":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "Mezcla":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "Inferido":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "Pendiente":
      return "border-amber-300 bg-amber-100 text-amber-950";
    case "CORE":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "Sin consolidar":
    case "Default sin confirmar":
      return "border-zinc-300 bg-zinc-100 text-zinc-700";
    case "Provisional":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "Legacy filtrado":
      return "border-rose-200 bg-rose-100 text-rose-950";
    case "Pendiente de análisis":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function LogoDropSlot({
  label,
  description,
  dataUrl,
  slotId,
  onPick,
  onClear,
  disabled,
  compact,
}: {
  label: string;
  description: string;
  dataUrl: string | null;
  slotId: LogoSlotId;
  onPick: (slot: LogoSlotId, file: File) => void;
  onClear: (slot: LogoSlotId) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onPick(slotId, f);
  };

  return (
    <div className={`min-w-0 ${compact ? "" : "flex-1"}`}>
      <p
        className={`mb-1 font-black uppercase tracking-[0.14em] text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
        title={compact ? description : undefined}
      >
        {label}
      </p>
      {!compact && <p className="mb-2 text-[11px] leading-snug text-zinc-600">{description}</p>}
      <div
        role="button"
        tabIndex={0}
        title={compact ? description : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed transition ${
          compact ? "min-h-[76px] rounded-lg" : "min-h-[140px] rounded-2xl"
        } ${
          dragOver
            ? "border-amber-400 bg-amber-50"
            : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100"
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(slotId, f);
            e.target.value = "";
          }}
        />
        {dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt=""
              className={`max-w-full object-contain ${compact ? "max-h-14 p-1.5" : "max-h-[120px] p-3"}`}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear(slotId);
              }}
              className={`absolute rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-100 hover:text-zinc-900 ${
                compact ? "right-1 top-1 p-1" : "right-2 top-2 p-1.5"
              }`}
              aria-label="Quitar logo"
            >
              <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2} />
            </button>
          </>
        ) : (
          <div
            className={`flex flex-col items-center text-center ${compact ? "gap-1 px-2 py-2" : "gap-2 px-4 py-6"}`}
          >
            <ImageIcon
              className={`text-zinc-400 ${compact ? "h-5 w-5" : "h-8 w-8"}`}
              strokeWidth={1.25}
              aria-hidden
            />
            <span className={`font-semibold text-zinc-600 ${compact ? "text-[9px] leading-tight" : "text-[11px]"}`}>
              {compact ? "Soltar / elegir" : "Suelta o elige imagen"}
            </span>
            {!compact && (
              <span className="text-[10px] text-zinc-500">
                PNG, JPG, WebP o SVG · máx. {Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  compact?: boolean;
}) {
  const id = React.useId();
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const pickerValue = /^#[0-9A-Fa-f]{6}$/i.test(value) ? value : "#000000";

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-1" : "flex-1 gap-1.5"}`}>
      <label
        htmlFor={id}
        className={`font-bold uppercase tracking-wide text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
      >
        {label}
      </label>
      <div
        className={`flex items-center gap-1.5 border border-zinc-200 bg-white ${compact ? "rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-2 py-1.5"}`}
      >
        <input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className={`cursor-pointer shrink-0 overflow-hidden rounded border border-zinc-200 bg-transparent p-0 ${
            compact ? "h-7 w-8" : "h-9 w-11"
          }`}
          aria-label={label}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const raw = text.trim();
            const v = raw.startsWith("#") ? raw : `#${raw}`;
            if (/^#[0-9A-Fa-f]{6}$/i.test(v)) {
              onChange(`#${v.slice(1).toLowerCase()}`);
            } else {
              setText(value);
            }
          }}
          className={`min-w-0 flex-1 bg-transparent font-mono text-zinc-900 outline-none placeholder:text-zinc-400 ${
            compact ? "text-[10px]" : "text-[12px]"
          }`}
          placeholder="#000000"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function ProjectBrainFullscreen({
  open,
  onClose,
  assetsMetadata,
  onAssetsMetadataChange,
  projectId = null,
  workspaceId = null,
  canvasNodes = null,
  canvasEdges = null,
  initialSection = null,
  visualReferenceAnalysisDirty = false,
  onVisualReferenceAnalysisDirty,
  onSaveProjectFromBrain,
  isSavingProject = false,
}: Props) {
  const assets = useMemo(() => normalizeProjectAssets(assetsMetadata), [assetsMetadata]);
  const brandSummary = useMemo(() => buildBrainBrandSummary(assets), [assets]);
  /** Vista previa ADN alineada con el resumen (filtra seed/demo; los datos crudos siguen en Voz/Mensajes hasta que edites). */
  const dnaTabPreview = useMemo(() => {
    const rawTraits = assets.strategy.languageTraits;
    const traitsClean = filterLegacyLanguageTraits(rawTraits);
    const legacyTraitRows = rawTraits.filter((t) => LEGACY_LANGUAGE_TRAITS_EXACT.has(t.trim().toLowerCase()));
    const voiceN = assets.strategy.voiceExamples.length;
    const funnel = assets.strategy.funnelMessages;
    const cleanFunnel = filterLegacyFunnelMessages(funnel);
    const legacyFunnelRows = funnel.filter((m) => isLegacyDemoFunnelText(m.text ?? ""));
    const toneHasRealSignals = traitsClean.length > 0 || voiceN > 0;
    const toneBody = traitsClean.length
      ? traitsClean.slice(0, 6).join(" · ")
      : voiceN > 0
        ? `${voiceN} ejemplo(s) de voz en «Voz y tono»${legacyTraitRows.length ? " (los rasgos listados eran demo EN y no se muestran aquí)." : "."}`
        : rawTraits.length
          ? "Solo hay rasgos demo en inglés (p. ej. Professional / Collaborative / Innovative). Sustitúyelos en «Voz y tono»."
          : "Añade rasgos y ejemplos en Voz y tono.";
    const toneStatus = toneHasRealSignals
      ? "Confirmado"
      : rawTraits.length > 0
        ? "Legacy"
        : "Incompleto";
    return {
      toneBody,
      toneStatus,
      toneFootnote:
        legacyTraitRows.length && traitsClean.length
          ? `Se ocultan del resumen ${legacyTraitRows.length} rasgo(s) demo EN no confirmados.`
          : null,
      messagesBody: cleanFunnel.length
        ? cleanFunnel
            .slice(0, 4)
            .map((m) => m.text)
            .join(" · ")
        : funnel.length
          ? "Los mensajes del embudo son copy demo (Foldder / Creative OS). Edita «Mensajes»."
          : "Define mensajes por etapa.",
      messagesStatus:
        cleanFunnel.length > 0 ? "Detectado" : funnel.length > 0 ? "Legacy" : "Incompleto",
      messagesFootnote:
        legacyFunnelRows.length && cleanFunnel.length
          ? `${legacyFunnelRows.length} mensaje(s) demo (inglés) no se muestran aquí ni en el resumen principal.`
          : null,
    };
  }, [assets.strategy.languageTraits, assets.strategy.funnelMessages, assets.strategy.voiceExamples]);

  /** Píxeles accesibles para i2i (mismo inventario que visión); máx. 4 por límite Gemini flash. */
  const visualRefUrlsForSlotGen = useMemo(() => {
    const refs = collectVisualImageAssetRefs(assets);
    return refs
      .map((r) => r.imageUrlForVision?.trim())
      .filter((u): u is string => typeof u === "string" && (u.startsWith("https://") || u.startsWith("data:image")))
      .slice(0, 4);
  }, [assets]);

  const adn = useMemo(() => computeAdnScore(assets), [assets]);
  const brainClients = useMemo(
    () => listDownstreamBrainClients(canvasNodes ?? undefined, canvasEdges ?? undefined),
    [canvasNodes, canvasEdges],
  );
  const assetsMetadataRef = useRef<unknown>(assetsMetadata);

  useEffect(() => {
    assetsMetadataRef.current = assetsMetadata;
  }, [assetsMetadata]);

  const loadPendingLearnings = useCallback(async () => {
    if (!projectId?.trim()) {
      setPendingLearnings([]);
      return;
    }
    setPendingLoading(true);
    try {
      const res = await fetch(
        `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(projectId.trim())}`,
      );
      const json = await readResponseJson<{ items?: StoredLearningCandidate[] }>(res, "brain/pending");
      if (json?.items) setPendingLearnings(json.items);
    } finally {
      setPendingLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || !projectId?.trim()) {
      setPendingLearnings([]);
      return;
    }
    void loadPendingLearnings();
  }, [open, projectId, loadPendingLearnings]);

  const [activeTab, setActiveTab] = useState<BrainMainSection>("overview");
  const [brandSummarySectionSourcesKey, setBrandSummarySectionSourcesKey] = useState<BrandSummarySection["key"] | null>(
    null,
  );
  const [lastRestudyCompletedIso, setLastRestudyCompletedIso] = useState<string | null>(null);
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setActiveTab(initialSection ?? "overview");
    }
    prevOpenRef.current = open;
  }, [open, initialSection]);

  const [urlDraftCore, setUrlDraftCore] = useState("");
  const [urlDraftContext, setUrlDraftContext] = useState("");
  const [coreFiles, setCoreFiles] = useState<File[]>([]);
  const [contextFiles, setContextFiles] = useState<File[]>([]);
  const [isDraggingCoreFiles, setIsDraggingCoreFiles] = useState(false);
  const [isDraggingContextFiles, setIsDraggingContextFiles] = useState(false);
  const [uploadingScope, setUploadingScope] = useState<"core" | "context" | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState("all");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<{ text: string; type: MessageType }>({ text: "", type: "" });
  const [pendingLearnings, setPendingLearnings] = useState<StoredLearningCandidate[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [telemetryByNodeId, setTelemetryByNodeId] = useState<
    Record<string, { summaryLine: string | null; lastAt: string | null }>
  >({});
  const [reviewSourceFilter, setReviewSourceFilter] = useState<
    "all" | "visual" | "designer" | "photoroom" | "article"
  >("all");
  const [reviewReasoningOpenId, setReviewReasoningOpenId] = useState<string | null>(null);

  const pendingFiltered = useMemo(() => {
    if (reviewSourceFilter === "all") return pendingLearnings;
    return pendingLearnings.filter((row) => {
      if (reviewSourceFilter === "visual") {
        const bundle = hasVisualLearningReviewBundle(row.candidate.evidence.eventCounts);
        return row.candidate.type === "VISUAL_MEMORY" || bundle;
      }
      if (reviewSourceFilter === "designer") return row.telemetryNodeType === "DESIGNER";
      if (reviewSourceFilter === "photoroom") return row.telemetryNodeType === "PHOTOROOM";
      if (reviewSourceFilter === "article") return row.telemetryNodeType === "ARTICLE_WRITER";
      return true;
    });
  }, [pendingLearnings, reviewSourceFilter]);

  const pendingReviewSplit = useMemo(() => {
    const anchored: StoredLearningCandidate[] = [];
    const orphans: StoredLearningCandidate[] = [];
    for (const row of pendingFiltered) {
      if (resolveLearningPendingAnchorNodeId(row)) anchored.push(row);
      else orphans.push(row);
    }
    return { anchored, orphans };
  }, [pendingFiltered]);

  const pendingByNodeId = useMemo(() => buildPendingCountByNodeId(pendingLearnings), [pendingLearnings]);

  const refreshTelemetrySummary = useCallback(async () => {
    if (!projectId?.trim()) {
      setTelemetryByNodeId({});
      return;
    }
    const ids = brainClients.map((c) => c.id).filter(Boolean);
    try {
      const map = ids.length ? await fetchBrainTelemetrySummaryByNodeId(projectId.trim(), ids) : {};
      setTelemetryByNodeId(map);
    } catch {
      setTelemetryByNodeId({});
    }
  }, [projectId, brainClients]);

  useEffect(() => {
    if (!open) {
      setTelemetryByNodeId({});
      return;
    }
    void refreshTelemetrySummary();
  }, [open, refreshTelemetrySummary]);

  const refreshConnectedSignals = useCallback(async () => {
    await Promise.all([loadPendingLearnings(), refreshTelemetrySummary()]);
  }, [loadPendingLearnings, refreshTelemetrySummary]);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<BrainChatMessage[]>([
    {
      id: "brain-chat-welcome",
      role: "assistant",
      text:
        "Soy Brain Copilot. Preguntame sobre el contenido que hayas subido y analizado. Si falta contexto, te sugerire que documentos o URLs subir.",
    },
  ]);

  const [voiceText, setVoiceText] = useState("");
  const [voiceKind, setVoiceKind] = useState<BrainVoiceExample["kind"]>("approved_voice");
  const [newTaboo, setNewTaboo] = useState("");
  const [newApprovedPhrase, setNewApprovedPhrase] = useState("");
  const [newLanguageTrait, setNewLanguageTrait] = useState("");
  const [newSyntaxPattern, setNewSyntaxPattern] = useState("");
  const [newPreferredTerm, setNewPreferredTerm] = useState("");
  const [newForbiddenTerm, setNewForbiddenTerm] = useState("");
  const [channelIntensityName, setChannelIntensityName] = useState("");
  const [channelIntensityValue, setChannelIntensityValue] = useState(60);

  const [personaName, setPersonaName] = useState("");
  const [personaPain, setPersonaPain] = useState("");
  const [personaChannel, setPersonaChannel] = useState("");
  const [personaSophistication, setPersonaSophistication] = useState("");
  const [personaTags, setPersonaTags] = useState("");
  const [personaObjections, setPersonaObjections] = useState("");
  const [personaProofNeeded, setPersonaProofNeeded] = useState("");
  const [personaAttentionTriggers, setPersonaAttentionTriggers] = useState("");
  const [personaMarketSophistication, setPersonaMarketSophistication] = useState("");
  const [personaModalOpen, setPersonaModalOpen] = useState(false);

  const [funnelStageDraft, setFunnelStageDraft] = useState<
    "awareness" | "consideration" | "conversion" | "retention"
  >("awareness");
  const [funnelTextDraft, setFunnelTextDraft] = useState("");
  const [messageClaimDraft, setMessageClaimDraft] = useState("");
  const [messageSupportDraft, setMessageSupportDraft] = useState("");
  const [messageAudienceDraft, setMessageAudienceDraft] = useState("");
  const [messageChannelDraft, setMessageChannelDraft] = useState("");
  const [messageCtaDraft, setMessageCtaDraft] = useState("");
  const [messageEvidenceDraft, setMessageEvidenceDraft] = useState("");

  const [briefObjective, setBriefObjective] = useState("");
  const [briefChannel, setBriefChannel] = useState("");
  const [briefPersonaId, setBriefPersonaId] = useState("");
  const [briefFunnel, setBriefFunnel] = useState<
    "awareness" | "consideration" | "conversion" | "retention"
  >("awareness");
  const [briefAsk, setBriefAsk] = useState("");
  const [generatingPiece, setGeneratingPiece] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<GeneratedPreview | null>(null);
  const [pieceFeedbackNote, setPieceFeedbackNote] = useState("");
  const [factsVerificationFilter, setFactsVerificationFilter] = useState<"all" | "verified" | "interpreted">("verified");
  const [factsStrengthFilter, setFactsStrengthFilter] = useState<"all" | "fuerte" | "media" | "debil">("fuerte");
  const [visualStyleLoadingBySlot, setVisualStyleLoadingBySlot] = useState<
    Partial<Record<BrainVisualStyleSlotKey, boolean>>
  >({});
  const [visualStyleRefreshing, setVisualStyleRefreshing] = useState(false);
  const visualAutoFillAttemptedRef = useRef(false);
  const visualPresignRefreshRef = useRef<{ signature: string; at: number } | null>(null);
  const visualStyleRef = useRef(assets.strategy.visualStyle);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: MessageType = "info") => {
    setMessage({ text: msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage({ text: "", type: "" }), 4200);
  }, []);

  const [reviewEvidenceOpenId, setReviewEvidenceOpenId] = useState<string | null>(null);
  const [reviewResolvingId, setReviewResolvingId] = useState<string | null>(null);
  const [signalModalClient, setSignalModalClient] = useState<BrainDownstreamClient | null>(null);
  const [visualReanalyzing, setVisualReanalyzing] = useState(false);
  const [visualReanalyzeDiagnostics, setVisualReanalyzeDiagnostics] = useState<VisualReanalyzeDiagnosticRow[]>([]);
  const [visualQueueBusy, setVisualQueueBusy] = useState(false);
  const [serverVisionProviderId, setServerVisionProviderId] = useState<
    "mock" | "gemini-vision" | "openai-vision" | null
  >(null);
  const [serverVisionProbeDone, setServerVisionProbeDone] = useState(false);
  const [restudyBusy, setRestudyBusy] = useState(false);
  const [restudyTraceOpen, setRestudyTraceOpen] = useState(false);
  const [restudyLast, setRestudyLast] = useState<{
    steps: Array<{ step: string; ok: boolean; detail?: string }>;
    visual: {
      totalImages: number;
      analyzedReal: number;
      fallback: number;
      failed: number;
      tooGeneric: number;
      mock: number;
      provider: string;
    };
    documents: { totalCoreDocuments: number; analyzed: number; failed: number };
    summary: {
      identityNarrative: string;
      tone: string;
      messages: string;
      visualDirection: string;
      confidence: number;
      warnings: string[];
    };
    candidatesCreated: number;
    warnings: string[];
    traceability: Record<string, unknown>;
    devValidation?: {
      samples: Array<{ sourceAssetId: string; subjectTags: string[]; visualStyle: string[]; quality: string }>;
      passed: boolean;
      warning?: string;
    };
  } | null>(null);

  const refreshServerVisionProvider = useCallback(async () => {
    setServerVisionProbeDone(false);
    try {
      const res = await fetch("/api/spaces/brain/visual/provider");
      const j =
        (await readResponseJson<{ providerId?: string }>(res, "brain/visual/provider")) ?? {};
      if (!res.ok) {
        setServerVisionProviderId(res.status === 401 ? null : "mock");
        return;
      }
      const id = j.providerId;
      if (id === "gemini-vision" || id === "openai-vision" || id === "mock") {
        setServerVisionProviderId(id);
      } else {
        setServerVisionProviderId("mock");
      }
    } catch {
      setServerVisionProviderId(null);
    } finally {
      setServerVisionProbeDone(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setServerVisionProbeDone(false);
      setServerVisionProviderId(null);
      return;
    }
    void refreshServerVisionProvider();
  }, [open, refreshServerVisionProvider]);

  const visualDiagnosticByAssetId = useMemo(() => {
    const m = new Map<string, VisualReanalyzeDiagnosticRow>();
    for (const d of visualReanalyzeDiagnostics) m.set(d.assetId, d);
    return m;
  }, [visualReanalyzeDiagnostics]);

  const resolvePendingItem = useCallback(
    async (row: StoredLearningCandidate, action: LearningResolutionAction) => {
      const learningId = row.id;
      setReviewResolvingId(learningId);
      try {
        const res = await fetch("/api/spaces/brain/learning/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ learningId, action }),
        });
        const json = await readResponseJson<{ error?: string }>(res, "brain/resolve");
        if (!res.ok) {
          showToast(json?.error ?? "No se pudo aplicar la decisión.", "error");
          return;
        }

        if (action !== "DISMISS") {
          const { nextAssets, applied, changedPaths, warnings } = applyLearningCandidateToProjectAssets(
            assets,
            row,
            action,
          );
          if (applied) {
            onAssetsMetadataChange(nextAssets);
            onVisualReferenceAnalysisDirty?.();
            const human =
              changedPaths.includes("strategy.languageTraits")
                ? "Añadido a tono (rasgos de lenguaje)."
                : changedPaths.some((p) => p.includes("funnelMessages"))
                  ? "Añadido a mensajes del embudo."
                  : changedPaths.some((p) => p.includes("messageBlueprints"))
                    ? "Añadido a blueprints de mensaje."
                    : changedPaths.some((p) => p.includes("factsAndEvidence"))
                      ? "Añadido a hechos y pruebas."
                      : changedPaths.some((p) => p.includes("personas"))
                        ? "Añadido a personas."
                        : changedPaths.some((p) => p.includes("confirmedVisualPatterns"))
                          ? "Añadido a ADN visual confirmado."
                          : changedPaths.some((p) => p.includes("projectOnlyMemories"))
                            ? "Guardado en memoria de este proyecto."
                            : changedPaths.some((p) => p.includes("contextualMemories"))
                              ? "Guardado como contexto puntual."
                              : changedPaths.some((p) => p.includes("rejectedPatterns"))
                                ? "Archivado en patrones rechazados."
                                : changedPaths.some((p) => p.includes("approvedPhrases"))
                                  ? "Añadido a frases aprobadas / preferencias."
                                  : changedPaths.some((p) => p.includes("approvedPatterns"))
                                    ? "Añadido a patrones aprobados."
                                    : `Actualizado: ${changedPaths.join(", ") || "estrategia"}.`;
            showToast(human, "success");
            if (warnings.length) {
              showToast(warnings.join(" "), "info");
            }
          } else {
            showToast(
              "Aprendizaje marcado como resuelto en el servidor, pero no se pudo aplicar al proyecto en local. Revisa manualmente o guarda el proyecto.",
              "error",
            );
            if (warnings.length) showToast(warnings.join(" "), "info");
          }
        } else {
          showToast("Descartado.", "success");
        }

        setPendingLearnings((prev) => prev.filter((p) => p.id !== learningId));
      } catch {
        showToast("No se pudo aplicar la decisión.", "error");
      } finally {
        setReviewResolvingId(null);
      }
    },
    [assets, onAssetsMetadataChange, onVisualReferenceAnalysisDirty, showToast],
  );

  const devClearPendingLearnings = useCallback(
    async (mode: "all" | "orphan" | "visual_reference") => {
      const pid = projectId?.trim();
      if (!pid) {
        showToast("Guarda el proyecto con sesión para limpiar pendientes.", "error");
        return;
      }
      try {
        const res = await fetch(
          `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(pid)}&mode=${encodeURIComponent(mode)}`,
          { method: "DELETE" },
        );
        const json =
          (await readResponseJson<{ removed?: number; error?: string }>(res, "brain/pending DELETE")) ?? {};
        if (res.ok && typeof json.removed === "number") {
          showToast(`Pendientes eliminados (${mode}): ${json.removed}`, "success");
          await loadPendingLearnings();
        } else {
          showToast(json.error ?? "No se pudo limpiar", "error");
        }
      } catch {
        showToast("No se pudo limpiar pendientes.", "error");
      }
    },
    [projectId, loadPendingLearnings, showToast],
  );

  const handleBrainRestudy = useCallback(async () => {
    const pid = projectId?.trim();
    if (!pid) {
      showToast("Guarda el proyecto con sesión para re-estudiar Brain.", "error");
      return;
    }
    setRestudyBusy(true);
    setRestudyLast(null);
    try {
      const res = await fetch("/api/spaces/brain/restudy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          workspaceId: workspaceId?.trim() || undefined,
          assets: assetsMetadataRef.current,
          options: {
            provider: "gemini",
            devValidateThreeImages: true,
          },
        }),
      });
      const json = (await readResponseJson<{
        ok?: boolean;
        error?: string;
        steps?: Array<{ step: string; ok: boolean; detail?: string }>;
        visual?: {
          totalImages: number;
          analyzedReal: number;
          fallback: number;
          failed: number;
          tooGeneric: number;
          mock: number;
          provider: string;
        };
        documents?: { totalCoreDocuments: number; analyzed: number; failed: number };
        summary?: {
          identityNarrative: string;
          tone: string;
          messages: string;
          visualDirection: string;
          confidence: number;
          warnings: string[];
        };
        candidatesCreated?: number;
        warnings?: string[];
        nextAssets?: ProjectAssetsMetadata;
        traceability?: Record<string, unknown>;
        devValidation?: {
          samples: Array<{ sourceAssetId: string; subjectTags: string[]; visualStyle: string[]; quality: string }>;
          passed: boolean;
          warning?: string;
        };
      }>(res, "brain/restudy")) ?? { error: "Sin respuesta JSON" };
      if (!res.ok || json.error) {
        showToast(json.error ?? "Re-estudio no disponible o falló.", "error");
        return;
      }
      if (json.nextAssets) {
        onAssetsMetadataChange(normalizeProjectAssets(json.nextAssets));
        onVisualReferenceAnalysisDirty?.();
        setLastRestudyCompletedIso(new Date().toISOString());
      }
      if (
        json.steps &&
        json.visual &&
        json.documents &&
        json.summary &&
        typeof json.candidatesCreated === "number" &&
        json.traceability
      ) {
        setRestudyLast({
          steps: json.steps,
          visual: json.visual,
          documents: json.documents,
          summary: json.summary,
          candidatesCreated: json.candidatesCreated,
          warnings: json.warnings ?? json.summary.warnings ?? [],
          traceability: json.traceability,
          ...(json.devValidation ? { devValidation: json.devValidation } : {}),
        });
      }
      await loadPendingLearnings();
      showToast(
        json.ok ? "Re-estudio Brain completado. Revisa el panel de diagnóstico." : "Re-estudio con advertencias.",
        json.ok ? "success" : "info",
      );
    } catch {
      showToast("Error de red al re-estudiar Brain.", "error");
    } finally {
      setRestudyBusy(false);
    }
  }, [
    projectId,
    workspaceId,
    showToast,
    onAssetsMetadataChange,
    onVisualReferenceAnalysisDirty,
    loadPendingLearnings,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const patch = useCallback(
    (fn: (a: ProjectAssetsMetadata) => ProjectAssetsMetadata) => {
      const base = normalizeProjectAssets(assetsMetadataRef.current);
      onAssetsMetadataChange(fn(base));
    },
    [onAssetsMetadataChange],
  );

  const stripLegacyDemoStrategyCopy = useCallback(() => {
    patch((a) => ({
      ...a,
      strategy: {
        ...a.strategy,
        funnelMessages: filterLegacyFunnelMessages(a.strategy.funnelMessages),
        languageTraits: filterLegacyLanguageTraits(a.strategy.languageTraits),
      },
    }));
    showToast("Se eliminaron del proyecto los mensajes demo del embudo y los rasgos EN demo (Professional/Collaborative/Innovative).", "success");
  }, [patch, showToast]);

  const setBrand = useCallback(
    (partial: Partial<ProjectAssetsMetadata["brand"]>) => {
      patch((a) => ({ ...a, brand: { ...a.brand, ...partial } }));
    },
    [patch],
  );

  const setKnowledge = useCallback(
    (next: Partial<ProjectAssetsMetadata["knowledge"]>) => {
      patch((a) => ({
        ...a,
        knowledge: {
          ...a.knowledge,
          ...next,
          urls: next.urls ?? a.knowledge.urls,
          documents: next.documents ?? a.knowledge.documents,
        },
      }));
    },
    [patch],
  );

  const setStrategy = useCallback(
    (next: Partial<ProjectAssetsMetadata["strategy"]>) => {
      patch((a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          ...next,
          voiceExamples: next.voiceExamples ?? a.strategy.voiceExamples,
          tabooPhrases: next.tabooPhrases ?? a.strategy.tabooPhrases,
          approvedPhrases: next.approvedPhrases ?? a.strategy.approvedPhrases,
          languageTraits: next.languageTraits ?? a.strategy.languageTraits,
          syntaxPatterns: next.syntaxPatterns ?? a.strategy.syntaxPatterns,
          preferredTerms: next.preferredTerms ?? a.strategy.preferredTerms,
          forbiddenTerms: next.forbiddenTerms ?? a.strategy.forbiddenTerms,
          channelIntensity: next.channelIntensity ?? a.strategy.channelIntensity,
          allowAbsoluteClaims: next.allowAbsoluteClaims ?? a.strategy.allowAbsoluteClaims,
          personas: next.personas ?? a.strategy.personas,
          funnelMessages: next.funnelMessages ?? a.strategy.funnelMessages,
          messageBlueprints: next.messageBlueprints ?? a.strategy.messageBlueprints,
          factsAndEvidence: next.factsAndEvidence ?? a.strategy.factsAndEvidence,
          generatedPieces: next.generatedPieces ?? a.strategy.generatedPieces,
          approvedPatterns: next.approvedPatterns ?? a.strategy.approvedPatterns,
          rejectedPatterns: next.rejectedPatterns ?? a.strategy.rejectedPatterns,
          visualStyle: next.visualStyle ?? a.strategy.visualStyle,
          visualReferenceAnalysis: next.visualReferenceAnalysis ?? a.strategy.visualReferenceAnalysis,
        },
      }));
    },
    [patch],
  );

  const visualImageRefCount = useMemo(() => collectVisualImageAssetRefs(assets).length, [assets]);
  const visualLayer = assets.strategy.visualReferenceAnalysis;
  const visualAnalyzedCount = visualLayer?.analyses?.length ?? 0;
  const visualDisposition = useMemo(
    () => countVisualImageAnalysisDisposition(visualLayer?.analyses),
    [visualLayer?.analyses],
  );
  const visualAggregatedResolved = useMemo(() => {
    const al = visualLayer?.analyses;
    if (!al?.length) return null;
    return aggregateVisualPatterns(al);
  }, [visualLayer?.analyses]);

  const visualRefInventoryRows = useMemo(() => {
    const refs = collectVisualImageAssetRefs(assets);
    const byId = new Map((assets.strategy.visualReferenceAnalysis?.analyses ?? []).map((a) => [a.sourceAssetId, a]));
    return refs.map((ref) => ({ ref, analysis: byId.get(ref.id) ?? null }));
  }, [assets]);

  const pendingVisualAnalysisCount = useMemo(() => {
    const refIds = new Set(collectVisualImageAssetRefs(assets).map((r) => r.id));
    const analyzed = new Set(assets.strategy.visualReferenceAnalysis?.analyses.map((a) => a.sourceAssetId) ?? []);
    return [...refIds].filter((id) => !analyzed.has(id)).length;
  }, [assets]);

  const isVisualMockAnalyzer = useMemo(() => {
    const lp = visualLayer?.lastVisionProviderId;
    if (lp === "mock") return true;
    if (lp === "openai-vision" || lp === "gemini-vision") return false;
    const v = (visualLayer?.analyzerVersion ?? "").toLowerCase();
    return v.length === 0 || v.startsWith("mock");
  }, [visualLayer?.analyzerVersion, visualLayer?.lastVisionProviderId]);

  const patchVisualAnalysisOverride = useCallback(
    (sourceAssetId: string, override: BrainVisualImageUserOverride | undefined) => {
      onVisualReferenceAnalysisDirty?.();
      patch((a) => {
        const layer = a.strategy.visualReferenceAnalysis ?? { analyses: [] };
        const list = layer.analyses.map((row) => {
          if (row.sourceAssetId !== sourceAssetId) return row;
          if (override === undefined) {
            const { userVisualOverride: _omit, ...rest } = row;
            return rest as BrainVisualImageAnalysis;
          }
          return { ...row, userVisualOverride: override };
        });
        const aggregated = aggregateVisualPatterns(list);
        return {
          ...a,
          strategy: {
            ...a.strategy,
            visualReferenceAnalysis: {
              ...layer,
              analyses: list,
              aggregated,
            },
          },
        };
      });
    },
    [patch, onVisualReferenceAnalysisDirty],
  );

  const runVisualReferenceReanalysis = useCallback(
    (baseAssets: ReturnType<typeof normalizeProjectAssets>) => {
      const pid = (projectId?.trim() || "__local__").trim();
      const nextLayer = reanalyzeVisualReferences(pid, baseAssets);
      setStrategy({ visualReferenceAnalysis: nextLayer });
      return nextLayer;
    },
    [projectId, setStrategy],
  );

  const handleReanalyzeVisualRefs = useCallback(async () => {
    setVisualReanalyzing(true);
    setVisualReanalyzeDiagnostics([]);
    try {
      const base = normalizeProjectAssets(assetsMetadataRef.current);
      const pid = (projectId?.trim() || "__local__").trim();
      const debug = process.env.NODE_ENV === "development";
      const res = await fetch("/api/spaces/brain/visual/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, assets: assetsMetadataRef.current, debug }),
      });
      const json = (await readResponseJson<{
        visualReferenceAnalysis?: ProjectAssetsMetadata["strategy"]["visualReferenceAnalysis"];
        provider?: string;
        diagnostics?: VisualReanalyzeDiagnosticRow[];
        batch?: { candidatesCreated?: number };
        error?: string;
      }>(res, "brain/visual/reanalyze")) ?? { error: "Sin respuesta JSON" };
      if (res.ok && json.visualReferenceAnalysis) {
        const cur = normalizeProjectAssets(assetsMetadataRef.current);
        const derived = buildVisualStyleFromVisionAnalyses(json.visualReferenceAnalysis.analyses ?? []);
        const visualStyle = derived
          ? mergeVisualStyleWithVisionDerivedDescriptions(cur.strategy.visualStyle, derived)
          : cur.strategy.visualStyle;
        setStrategy({ visualReferenceAnalysis: json.visualReferenceAnalysis, visualStyle });
        onVisualReferenceAnalysisDirty?.();
        if (json.provider === "mock" || json.provider === "gemini-vision" || json.provider === "openai-vision") {
          setServerVisionProviderId(json.provider);
          setServerVisionProbeDone(true);
        }
        if (debug && Array.isArray(json.diagnostics)) {
          setVisualReanalyzeDiagnostics(json.diagnostics);
        }
        if (json.provider === "mock") {
          showToast("Análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.", "info");
        } else if (json.provider === "openai-vision" || json.provider === "gemini-vision") {
          const n = json.visualReferenceAnalysis.analyses?.filter(
            (a) => a.fallbackUsed || a.visionProviderId === "mock" || a.analysisStatus === "failed",
          ).length;
          const total = json.visualReferenceAnalysis.analyses?.length ?? 0;
          if (n && total) {
            showToast(
              `Visión remota conectada. ${n} de ${total} imagen${total === 1 ? "" : "es"} usaron mock o fallback; revisa cada fila.`,
              "info",
            );
          } else {
            showToast("Análisis visual real conectado con Gemini/OpenAI.", "success");
          }
        } else {
          showToast("Análisis visual actualizado.", "success");
        }
        return;
      }
      runVisualReferenceReanalysis(base);
      onVisualReferenceAnalysisDirty?.();
      showToast(
        json.error
          ? `${json.error} · Análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.`
          : "Visión remota no disponible; análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.",
        "info",
      );
    } catch {
      try {
        const base = normalizeProjectAssets(assetsMetadataRef.current);
        runVisualReferenceReanalysis(base);
        onVisualReferenceAnalysisDirty?.();
      } catch {
        /* ignore */
      }
      showToast(
        "No se pudo reanalizar con el servidor; análisis simulado. Conecta Gemini/OpenAI Vision para análisis real.",
        "error",
      );
    } finally {
      setVisualReanalyzing(false);
    }
  }, [projectId, runVisualReferenceReanalysis, setStrategy, showToast, onVisualReferenceAnalysisDirty]);

  const handleSaveVisualAnalysis = useCallback(async () => {
    if (!onSaveProjectFromBrain) {
      showToast("Usa «Guardar proyecto» en la barra del espacio para persistir el análisis.", "info");
      return;
    }
    const ok = await onSaveProjectFromBrain();
    if (ok) showToast("Proyecto guardado; el análisis visual quedó persistido.", "success");
    else showToast("No se pudo guardar el proyecto.", "error");
  }, [onSaveProjectFromBrain, showToast]);

  const handleQueueVisualLearnings = useCallback(async () => {
    if (!projectId?.trim()) {
      showToast("Guarda el proyecto con sesión iniciada para enviar aprendizajes a revisión.", "error");
      return;
    }
    const base = normalizeProjectAssets(assetsMetadataRef.current);
    let layer = base.strategy.visualReferenceAnalysis;
    if (!layer?.analyses?.length) {
      layer = reanalyzeVisualReferences(projectId.trim(), base);
      setStrategy({ visualReferenceAnalysis: layer });
      onVisualReferenceAnalysisDirty?.();
    }
    const analyses = layer.analyses;
    const agg = aggregateVisualPatterns(analyses);
    const candidates = createVisualLearningCandidates(projectId.trim(), analyses, agg);
    if (!candidates.length) {
      showToast("No hay candidatos visuales que encolar.", "info");
      return;
    }
    setVisualQueueBusy(true);
    try {
      const res = await fetch("/api/spaces/brain/learning/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          workspaceId: workspaceId?.trim() || undefined,
          candidates,
        }),
      });
      const json = await readResponseJson<{ error?: string }>(res, "brain/learning/candidates");
      if (!res.ok) {
        showToast(json?.error ?? "No se pudieron crear las sugerencias.", "error");
        return;
      }
      await loadPendingLearnings();
      setActiveTab("review");
      showToast("Aprendizajes visuales enviados a «Por revisar».", "success");
    } catch {
      showToast("No se pudieron crear las sugerencias.", "error");
    } finally {
      setVisualQueueBusy(false);
    }
  }, [projectId, workspaceId, showToast, setStrategy, loadPendingLearnings, onVisualReferenceAnalysisDirty]);

  const setVisualStyleSlot = useCallback(
    (
      key: BrainVisualStyleSlotKey,
      patchSlot: Partial<ProjectAssetsMetadata["strategy"]["visualStyle"][BrainVisualStyleSlotKey]>,
    ) => {
      patch((a) => ({
        ...a,
        strategy: {
          ...a.strategy,
          visualStyle: {
            ...a.strategy.visualStyle,
            [key]: {
              ...a.strategy.visualStyle[key],
              ...patchSlot,
              key,
            },
          },
        },
      }));
    },
    [patch],
  );

  const visualPresignSignature = useMemo(() => {
    const keys = new Set<string>();
    const slotKeys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people"];
    for (const k of slotKeys) {
      const slot = assets.strategy.visualStyle?.[k];
      if (slot?.imageS3Key) {
        keys.add(slot.imageS3Key);
        continue;
      }
      const url = slot?.imageUrl?.trim();
      if (!url) continue;
      const parsed = tryExtractKnowledgeFilesKeyFromUrl(url);
      if (parsed) keys.add(parsed);
    }
    return Array.from(keys).sort().join("|");
  }, [assets.strategy.visualStyle]);

  useEffect(() => {
    visualStyleRef.current = assets.strategy.visualStyle;
  }, [assets.strategy.visualStyle]);

  useEffect(() => {
    if (!open) return;
    if (!visualPresignSignature) return;
    const now = Date.now();
    if (
      visualPresignRefreshRef.current &&
      visualPresignRefreshRef.current.signature === visualPresignSignature &&
      now - visualPresignRefreshRef.current.at < 60_000
    ) {
      return;
    }
    visualPresignRefreshRef.current = { signature: visualPresignSignature, at: now };
    let cancelled = false;
    const keys = new Set<string>();
    const slotKeys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people"];
    for (const k of slotKeys) {
      const slot = visualStyleRef.current?.[k];
      if (slot?.imageS3Key) {
        keys.add(slot.imageS3Key);
        continue;
      }
      const url = slot?.imageUrl?.trim();
      if (!url) continue;
      const parsed = tryExtractKnowledgeFilesKeyFromUrl(url);
      if (parsed) keys.add(parsed);
    }
    if (keys.size === 0) return;
    setVisualStyleRefreshing(true);
    (async () => {
      try {
        const res = await fetch("/api/spaces/s3-presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: Array.from(keys) }),
        });
        const data = await readResponseJson<{ urls?: Record<string, string> }>(
          res,
          "POST /api/spaces/s3-presign",
        );
        if (!res.ok || !data?.urls || cancelled) return;
        const refreshed = data.urls;
        const nextVisual = { ...visualStyleRef.current };
        let changed = false;
        for (const k of slotKeys) {
          const slot = nextVisual[k];
          const key = slot.imageS3Key || (slot.imageUrl ? tryExtractKnowledgeFilesKeyFromUrl(slot.imageUrl) : null);
          if (!key || !refreshed[key] || refreshed[key] === slot.imageUrl) continue;
          changed = true;
          nextVisual[k] = { ...slot, imageUrl: refreshed[key], imageS3Key: key };
        }
        if (changed) {
          setStrategy({ visualStyle: nextVisual });
        }
      } catch {
        // noop
      } finally {
        if (!cancelled) setVisualStyleRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, setStrategy, visualPresignSignature]);

  const uploadLocalImageForVisualStyle = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/runway/upload", { method: "POST", body: fd });
    const data = await readResponseJson<{ url?: string; s3Key?: string; error?: string }>(
      res,
      "POST /api/runway/upload",
    );
    if (!res.ok || !data?.url) throw new Error(data?.error || "No se pudo subir la imagen.");
    return { url: data.url, s3Key: data.s3Key };
  }, []);

  const prepareLogoRefsForNano = useCallback(async (): Promise<string[]> => {
    const refs: string[] = [];
    const push = (v?: string | null) => {
      if (typeof v !== "string") return;
      const t = v.trim();
      if (!t) return;
      if (!refs.includes(t)) refs.push(t);
    };
    const logos = [assets.brand.logoPositive, assets.brand.logoNegative];
    for (const logo of logos) {
      if (!logo) continue;
      if (logo.startsWith("data:image/svg+xml") || logo.startsWith("data:image/svg+xml;")) {
        const png = await rasterizeDataUrlToPng(logo, 1024);
        if (png) push(png);
      } else {
        push(logo);
      }
    }
    return refs.slice(0, 2);
  }, [assets.brand.logoNegative, assets.brand.logoPositive]);

  const buildVisualPrompt = useCallback(
    (slotKey: BrainVisualStyleSlotKey, description: string) => {
      const ctx = buildBrainVisualPromptContext(assets, { slotKey });
      const voiceHints = filterLegacyLanguageTraits(assets.strategy.languageTraits || [])
        .slice(0, 6)
        .join(", ");
      const termsHints = (assets.strategy.preferredTerms || []).slice(0, 8).join(", ");
      const msgHints = (assets.strategy.approvedPhrases || []).slice(0, 5).join(" | ");
      return composeBrainVisualStyleSlotPrompt({
        context: ctx,
        slotKey,
        slotDescription: description,
        colorPrimary: assets.brand.colorPrimary,
        colorSecondary: assets.brand.colorSecondary,
        colorAccent: assets.brand.colorAccent,
        voiceHints,
        termsHints,
        msgHints,
      });
    },
    [assets],
  );

  const generateVisualStyleSlotImage = useCallback(
    async (
      key: BrainVisualStyleSlotKey,
      force = false,
      descriptionOverride?: string,
      options?: { silentError?: boolean; retryOnFailure?: boolean },
    ): Promise<boolean> => {
      const slot = assets.strategy.visualStyle[key];
      if (!force && slot.imageUrl) return true;
      const description = (descriptionOverride ?? slot.description ?? "").trim();
      if (!description) return false;
      setVisualStyleLoadingBySlot((prev) => ({ ...prev, [key]: true }));
      try {
        const logoRefs = await prepareLogoRefsForNano();
        const prompt = buildVisualPrompt(key, description);
        const maxAttempts = options?.retryOnFailure ? 2 : 1;
        let outputUrl: string | null = null;
        let outputKey: string | undefined;
        let lastError: unknown = null;

        const tryReq = async (images: string[]) => {
          const res = await fetch("/api/gemini/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              images,
              model: "flash31",
              resolution: "0.5k",
              aspect_ratio: "16:9",
            }),
          });
          const data = await readResponseJson<{ output?: string; key?: string; error?: string }>(
            res,
            "POST /api/gemini/generate",
          );
          if (!res.ok || !data?.output) throw new Error(data?.error || "No se pudo generar imagen.");
          outputUrl = data.output;
          outputKey = data.key;
        };

        const refUrls = visualRefUrlsForSlotGen;
        const mergedRefs = [...logoRefs, ...refUrls].filter(Boolean);
        const primaryImages = mergedRefs.length ? mergedRefs.slice(0, 4) : logoRefs;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            try {
              await tryReq(primaryImages.length ? primaryImages : logoRefs);
            } catch {
              try {
                await tryReq(logoRefs);
              } catch {
                await tryReq([]);
              }
            }
            break;
          } catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }
          }
        }
        if (!outputUrl) throw (lastError instanceof Error ? lastError : new Error("No se recibió imagen de Nano Banana."));
        setVisualStyleSlot(key, {
          imageUrl: outputUrl,
          imageS3Key: outputKey,
          prompt,
          source: "auto",
        });
        return true;
      } catch (error) {
        if (!options?.silentError) {
          showToast(error instanceof Error ? error.message : "No se pudo generar la imagen de estilo.", "error");
        }
        return false;
      } finally {
        setVisualStyleLoadingBySlot((prev) => ({ ...prev, [key]: false }));
      }
    },
    [
      assets.strategy.visualStyle,
      buildVisualPrompt,
      prepareLogoRefsForNano,
      setVisualStyleSlot,
      showToast,
      visualRefUrlsForSlotGen,
    ],
  );

  const autoGenerateMissingVisualSlots = useCallback(
    async (
      visualOverride?: ProjectAssetsMetadata["strategy"]["visualStyle"],
      force = false,
    ) => {
      const visual = visualOverride || assets.strategy.visualStyle || defaultBrainVisualStyle();
      const keys: BrainVisualStyleSlotKey[] = ["protagonist", "people", "environment", "textures"];
      let failed = 0;
      for (const key of keys) {
        const slot = visual[key];
        const description = (slot?.description || "").trim();
        if (!description) continue;
        if (!force && slot?.imageUrl) continue;
        const ok = await generateVisualStyleSlotImage(key, force, description, {
          silentError: true,
          retryOnFailure: true,
        });
        if (!ok) failed += 1;
      }
      if (failed > 0) {
        showToast(
          `No se pudieron generar ${failed} bloque(s) visual(es) automáticamente. Puedes regenerarlos manualmente.`,
          "info",
        );
      }
    },
    [assets.strategy.visualStyle, generateVisualStyleSlotImage, showToast],
  );

  useEffect(() => {
    if (!open) {
      visualAutoFillAttemptedRef.current = false;
      return;
    }
    if (visualAutoFillAttemptedRef.current) return;
    const visual = assets.strategy.visualStyle || defaultBrainVisualStyle();
    const hasMissing = (["protagonist", "environment", "textures", "people"] as BrainVisualStyleSlotKey[]).some(
      (k) => {
        const slot = visual[k];
        return !!slot?.description?.trim() && !slot?.imageUrl;
      },
    );
    if (!hasMissing) return;
    visualAutoFillAttemptedRef.current = true;
    void autoGenerateMissingVisualSlots(visual, false);
  }, [open, assets.strategy.visualStyle, autoGenerateMissingVisualSlots]);

  const filteredFactsForGeneration = useMemo(
    () =>
      assets.strategy.factsAndEvidence.filter((f) => {
        const verificationOk =
          factsVerificationFilter === "all" ||
          (factsVerificationFilter === "verified" && f.verified) ||
          (factsVerificationFilter === "interpreted" && f.interpreted);
        const strengthOk = factsStrengthFilter === "all" || f.strength === factsStrengthFilter;
        return verificationOk && strengthOk;
      }),
    [assets.strategy.factsAndEvidence, factsStrengthFilter, factsVerificationFilter],
  );

  const onLogoPick = useCallback(
    async (slot: LogoSlotId, file: File) => {
      if (!file.type.startsWith("image/")) {
        showToast("Usa una imagen (PNG, JPG, WebP o SVG).", "error");
        return;
      }
      try {
        const dataUrl = await readFileDataUrl(file, MAX_LOGO_BYTES);
        setBrand(slot === "positive" ? { logoPositive: dataUrl } : { logoNegative: dataUrl });
      } catch (e) {
        if ((e as Error).message === "FILE_TOO_LARGE") {
          showToast(`El logo supera ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB.`, "error");
        } else {
          showToast("No se pudo leer el archivo.", "error");
        }
      }
    },
    [setBrand, showToast],
  );

  const onLogoClear = useCallback(
    (slot: LogoSlotId) => {
      setBrand(slot === "positive" ? { logoPositive: null } : { logoNegative: null });
    },
    [setBrand],
  );

  const handleUpload = useCallback(
    async (scope: "core" | "context") => {
      const files = scope === "core" ? coreFiles : contextFiles;
      if (files.length === 0) return;
      setUploadingScope(scope);
      setMessage({ text: "", type: "" });
      const formData = new FormData();
      files.forEach((f) => formData.append("file", f));
      formData.append("scope", scope);
      if (scope === "context") formData.append("contextKind", "general");

      try {
        const response = await fetch("/api/spaces/brain/knowledge/upload", {
          method: "POST",
          body: formData,
        });
        const data = await readResponseJson<{
          message?: string;
          documents?: KnowledgeDocumentEntry[];
          rejected?: Array<{ name?: string; reason?: string }>;
          error?: string;
        }>(response, "POST /api/spaces/brain/knowledge/upload");
        if (!response.ok) throw new Error(data?.error || "Error subiendo archivos");
        const added = data?.documents || [];
        const nextDocs = [...assets.knowledge.documents, ...added];
        const addedImages = added.some((d) => (d.mime || "").toLowerCase().startsWith("image/"));
        if (addedImages) {
          patch((a) => {
            const mergedDocs = [...a.knowledge.documents, ...added];
            const temp: ProjectAssetsMetadata = { ...a, knowledge: { ...a.knowledge, documents: mergedDocs } };
            const pid = (projectId?.trim() || "__local__").trim();
            return {
              ...a,
              knowledge: { ...a.knowledge, documents: mergedDocs },
              strategy: {
                ...a.strategy,
                visualReferenceAnalysis: reanalyzeVisualReferences(pid, temp),
              },
            };
          });
        } else {
          setKnowledge({ documents: nextDocs });
        }
        if (scope === "core") setCoreFiles([]);
        else setContextFiles([]);
        const skipped = data?.rejected?.length || 0;
        if ((data?.documents?.length || 0) === 0 && skipped > 0) {
          showToast(`Ningún archivo compatible. ${skipped} omitido(s).`, "error");
        } else if (skipped > 0) {
          showToast(`${data?.message || "Archivos subidos"} (${skipped} omitido(s)).`, "info");
        } else {
          showToast(data?.message || "Archivos subidos", "success");
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Falló la subida de archivos", "error");
      } finally {
        setUploadingScope(null);
      }
    },
    [assets.knowledge.documents, contextFiles, coreFiles, patch, projectId, setKnowledge, showToast],
  );

  const handleAddUrl = useCallback(
    async (scope: "core" | "context") => {
      const draft = scope === "core" ? urlDraftCore : urlDraftContext;
      const normalized = tryNormalizeUrl(draft);
      if (!normalized) {
        showToast("Introduce una URL válida (https://…)", "error");
        return;
      }

      if (assets.knowledge.urls.includes(normalized)) {
        showToast("Esa URL ya está en la lista.", "info");
        return;
      }

      setUploadingScope(scope);
      setMessage({ text: "Extrayendo contenido de la URL...", type: "info" });
      try {
        const response = await fetch("/api/spaces/brain/knowledge/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: normalized,
            scope,
            contextKind: scope === "context" ? "general" : undefined,
          }),
        });
        const data = await readResponseJson<{ error?: string; document?: KnowledgeDocumentEntry }>(
          response,
          "POST /api/spaces/brain/knowledge/url",
        );
        if (!response.ok) throw new Error(data?.error || "Error al procesar URL");
        setKnowledge({
          urls: [...assets.knowledge.urls, normalized],
          documents: data?.document ? [...assets.knowledge.documents, data.document] : assets.knowledge.documents,
        });
        if (scope === "core") setUrlDraftCore("");
        else setUrlDraftContext("");
        showToast("URL añadida con éxito", "success");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Error al procesar URL", "error");
      } finally {
        setUploadingScope(null);
      }
    },
    [
      assets.knowledge.documents,
      assets.knowledge.urls,
      setKnowledge,
      showToast,
      urlDraftContext,
      urlDraftCore,
    ],
  );

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setMessage({ text: "Analizando documentos con IA...", type: "info" });
    try {
      const response = await fetch("/api/spaces/brain/knowledge/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: assets.knowledge.documents,
          strategy: assets.strategy,
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        message?: string;
        documents?: KnowledgeDocumentEntry[];
        corporateContext?: string;
        strategy?: ProjectAssetsMetadata["strategy"];
      }>(response, "POST /api/spaces/brain/knowledge/analyze");
      if (!response.ok) throw new Error(data?.error || "Error analizando documentos");
      setKnowledge({
        documents: data?.documents || assets.knowledge.documents,
        corporateContext: data?.corporateContext || "",
      });
      if (data?.strategy) {
        const derived = buildVisualStyleFromVisionAnalyses(assets.strategy.visualReferenceAnalysis?.analyses);
        const baseVs = data.strategy.visualStyle ?? defaultBrainVisualStyle();
        const visualStyle = derived ? mergeVisualStyleWithVisionDerivedDescriptions(baseVs, derived) : baseVs;
        setStrategy({
          ...data.strategy,
          visualStyle,
        });
        if (!briefPersonaId && data.strategy.personas[0]?.id) {
          setBriefPersonaId(data.strategy.personas[0].id);
        }
        void autoGenerateMissingVisualSlots(visualStyle, false);
      }
      showToast(data?.message || "Análisis completado", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Error analizando documentos.", "error");
    } finally {
      setAnalyzing(false);
    }
  }, [
    assets.knowledge.documents,
    assets.strategy,
    autoGenerateMissingVisualSlots,
    briefPersonaId,
    setKnowledge,
    setStrategy,
    showToast,
  ]);

  const handleOpenOriginal = useCallback(
    async (doc: KnowledgeDocumentEntry) => {
      if (doc.format === "url" && doc.originalSourceUrl) {
        window.open(doc.originalSourceUrl, "_blank");
        return;
      }
      if (!doc.s3Path) {
        showToast("Documento legacy sin ruta S3", "error");
        return;
      }
      try {
        const resp = await fetch(`/api/spaces/brain/knowledge/view?key=${encodeURIComponent(doc.s3Path)}`);
        if (!resp.ok) throw new Error("Error generating view URL");
        const parsed = await readResponseJson<{ url?: string }>(resp, "GET /api/spaces/brain/knowledge/view");
        if (!parsed?.url) throw new Error("Error generating view URL");
        window.open(parsed.url, "_blank");
      } catch {
        showToast("No se pudo abrir el archivo original", "error");
      }
    },
    [showToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("¿Seguro que quieres eliminar este documento?")) return;
      setIsDeleting(id);
      try {
        const doc = assets.knowledge.documents.find((d) => d.id === id);
        if (doc?.s3Path) fireAndForgetDeleteS3Keys([doc.s3Path]);
        setKnowledge({ documents: assets.knowledge.documents.filter((d) => d.id !== id) });
        showToast("Documento eliminado", "success");
      } catch {
        showToast("No se pudo eliminar el documento", "error");
      } finally {
        setIsDeleting(null);
      }
    },
    [assets.knowledge.documents, setKnowledge, showToast],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startEditing = useCallback((doc: KnowledgeDocumentEntry) => {
    setEditingDocId(doc.id);
    try {
      setEditForm(JSON.parse(doc.extractedContext || "{}"));
    } catch {
      setEditForm({ raw: doc.extractedContext || "" });
    }
  }, []);

  const handleSaveAdn = useCallback(
    async (docId: string) => {
      try {
        const response = await fetch("/api/spaces/brain/knowledge/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: docId, context: editForm, documents: assets.knowledge.documents }),
        });
        const data = await readResponseJson<{
          error?: string;
          documents?: KnowledgeDocumentEntry[];
          corporateContext?: string;
        }>(response, "POST /api/spaces/brain/knowledge/update");
        if (!response.ok) throw new Error(data?.error || "No se pudo guardar ADN");
        setKnowledge({
          documents: data?.documents || assets.knowledge.documents,
          corporateContext: data?.corporateContext || assets.knowledge.corporateContext || "",
        });
        setEditingDocId(null);
        showToast("Cerebro corporativo actualizado", "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Error guardando ADN", "error");
      }
    },
    [assets.knowledge.corporateContext, assets.knowledge.documents, editForm, setKnowledge, showToast],
  );

  const submitChatQuestion = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const userMsg: BrainChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/spaces/brain/knowledge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, documents: assets.knowledge.documents }),
      });

      const data = await readResponseJson<{
        error?: string;
        answer?: string;
        sources?: Array<{ id: string; name: string; score: number }>;
        suggestedUploads?: string[];
      }>(response, "POST /api/spaces/brain/knowledge/chat");

      if (!response.ok) throw new Error(data?.error || "No se pudo responder la pregunta.");

      const aiMsg: BrainChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: data?.answer || "No pude responder con el contexto actual.",
        sources: data?.sources || [],
        suggestedUploads: data?.suggestedUploads || [],
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const aiErr: BrainChatMessage = {
        id: `a-err-${Date.now()}`,
        role: "assistant",
        text:
          error instanceof Error ? error.message : "No pude completar la respuesta. Intenta de nuevo.",
      };
      setChatMessages((prev) => [...prev, aiErr]);
    } finally {
      setChatLoading(false);
    }
  }, [assets.knowledge.documents, chatInput, chatLoading]);

  const addVoiceExample = useCallback(() => {
    const text = voiceText.trim();
    if (!text) return;
    const next: BrainVoiceExample = {
      id: crypto.randomUUID(),
      kind: voiceKind,
      text,
      label:
        voiceKind === "approved_voice"
          ? "Aprobado"
          : voiceKind === "forbidden_voice"
          ? "Prohibido"
          : undefined,
    };
    setStrategy({ voiceExamples: [...assets.strategy.voiceExamples, next] });
    setVoiceText("");
  }, [assets.strategy.voiceExamples, setStrategy, voiceKind, voiceText]);

  const removeVoiceExample = useCallback(
    (id: string) => {
      setStrategy({ voiceExamples: assets.strategy.voiceExamples.filter((v) => v.id !== id) });
    },
    [assets.strategy.voiceExamples, setStrategy],
  );

  const addTagItem = useCallback(
    (kind: "taboo" | "approved", value: string) => {
      const text = value.trim();
      if (!text) return;
      if (kind === "taboo") {
        if (assets.strategy.tabooPhrases.includes(text)) return;
        setStrategy({ tabooPhrases: [...assets.strategy.tabooPhrases, text] });
      } else {
        if (assets.strategy.approvedPhrases.includes(text)) return;
        setStrategy({ approvedPhrases: [...assets.strategy.approvedPhrases, text] });
      }
    },
    [assets.strategy.approvedPhrases, assets.strategy.tabooPhrases, setStrategy],
  );

  const removeTagItem = useCallback(
    (kind: "taboo" | "approved", idx: number) => {
      if (kind === "taboo") {
        setStrategy({ tabooPhrases: assets.strategy.tabooPhrases.filter((_, i) => i !== idx) });
      } else {
        setStrategy({ approvedPhrases: assets.strategy.approvedPhrases.filter((_, i) => i !== idx) });
      }
    },
    [assets.strategy.approvedPhrases, assets.strategy.tabooPhrases, setStrategy],
  );

  const addStringListItem = useCallback(
    (kind: "languageTraits" | "syntaxPatterns" | "preferredTerms" | "forbiddenTerms", value: string) => {
      const text = value.trim();
      if (!text) return;
      const current = assets.strategy[kind] || [];
      if (current.includes(text)) return;
      setStrategy({ [kind]: [...current, text] });
    },
    [assets.strategy, setStrategy],
  );

  const removeStringListItem = useCallback(
    (kind: "languageTraits" | "syntaxPatterns" | "preferredTerms" | "forbiddenTerms", idx: number) => {
      const current = assets.strategy[kind] || [];
      setStrategy({ [kind]: current.filter((_, i) => i !== idx) });
    },
    [assets.strategy, setStrategy],
  );

  const addChannelIntensity = useCallback(() => {
    const channel = channelIntensityName.trim();
    if (!channel) return;
    const intensity = Math.max(0, Math.min(100, Number(channelIntensityValue) || 0));
    const others = (assets.strategy.channelIntensity || []).filter(
      (x) => x.channel.toLowerCase() !== channel.toLowerCase(),
    );
    setStrategy({ channelIntensity: [...others, { channel, intensity }] });
    setChannelIntensityName("");
    setChannelIntensityValue(60);
  }, [assets.strategy.channelIntensity, channelIntensityName, channelIntensityValue, setStrategy]);

  const removeChannelIntensity = useCallback(
    (idx: number) => {
      setStrategy({ channelIntensity: assets.strategy.channelIntensity.filter((_, i) => i !== idx) });
    },
    [assets.strategy.channelIntensity, setStrategy],
  );

  const addPersona = useCallback(() => {
    if (!personaName.trim()) return;
    const persona: BrainPersona = {
      id: crypto.randomUUID(),
      name: personaName.trim(),
      pain: personaPain.trim(),
      channel: personaChannel.trim(),
      sophistication: personaSophistication.trim(),
      tags: personaTags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      objections: personaObjections.split(",").map((x) => x.trim()).filter(Boolean),
      proofNeeded: personaProofNeeded.split(",").map((x) => x.trim()).filter(Boolean),
      attentionTriggers: personaAttentionTriggers.split(",").map((x) => x.trim()).filter(Boolean),
      marketSophistication: personaMarketSophistication.trim() || undefined,
    };
    setStrategy({ personas: [...assets.strategy.personas, persona] });
    setPersonaName("");
    setPersonaPain("");
    setPersonaChannel("");
    setPersonaSophistication("");
    setPersonaTags("");
    setPersonaObjections("");
    setPersonaProofNeeded("");
    setPersonaAttentionTriggers("");
    setPersonaMarketSophistication("");
  }, [
    assets.strategy.personas,
    personaChannel,
    personaName,
    personaPain,
    personaObjections,
    personaProofNeeded,
    personaAttentionTriggers,
    personaMarketSophistication,
    personaSophistication,
    personaTags,
    setStrategy,
  ]);

  const addCatalogPersona = useCallback(
    (persona: BrainPersona) => {
      if (assets.strategy.personas.some((p) => p.id === persona.id)) return;
      setStrategy({ personas: [...assets.strategy.personas, persona] });
      if (!briefPersonaId) setBriefPersonaId(persona.id);
    },
    [assets.strategy.personas, briefPersonaId, setStrategy],
  );

  const removePersona = useCallback(
    (id: string) => {
      setStrategy({ personas: assets.strategy.personas.filter((p) => p.id !== id) });
      if (briefPersonaId === id) setBriefPersonaId("");
    },
    [assets.strategy.personas, briefPersonaId, setStrategy],
  );

  const addFunnelMessage = useCallback(() => {
    const text = funnelTextDraft.trim();
    if (!text) return;
    setStrategy({
      funnelMessages: [
        ...assets.strategy.funnelMessages,
        { id: crypto.randomUUID(), stage: funnelStageDraft, text },
      ],
    });
    setFunnelTextDraft("");
  }, [assets.strategy.funnelMessages, funnelStageDraft, funnelTextDraft, setStrategy]);

  const removeFunnelMessage = useCallback(
    (id: string) => {
      setStrategy({ funnelMessages: assets.strategy.funnelMessages.filter((m) => m.id !== id) });
    },
    [assets.strategy.funnelMessages, setStrategy],
  );

  const addMessageBlueprint = useCallback(() => {
    const claim = messageClaimDraft.trim();
    if (!claim) return;
    setStrategy({
      messageBlueprints: [
        ...assets.strategy.messageBlueprints,
        {
          id: crypto.randomUUID(),
          claim,
          support: messageSupportDraft.trim(),
          audience: messageAudienceDraft.trim(),
          channel: messageChannelDraft.trim(),
          stage: funnelStageDraft,
          cta: messageCtaDraft.trim(),
          evidence: messageEvidenceDraft
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      ],
    });
    setMessageClaimDraft("");
    setMessageSupportDraft("");
    setMessageAudienceDraft("");
    setMessageChannelDraft("");
    setMessageCtaDraft("");
    setMessageEvidenceDraft("");
  }, [
    assets.strategy.messageBlueprints,
    funnelStageDraft,
    messageAudienceDraft,
    messageChannelDraft,
    messageClaimDraft,
    messageCtaDraft,
    messageEvidenceDraft,
    messageSupportDraft,
    setStrategy,
  ]);

  const removeMessageBlueprint = useCallback(
    (id: string) => {
      setStrategy({
        messageBlueprints: assets.strategy.messageBlueprints.filter((m) => m.id !== id),
      });
    },
    [assets.strategy.messageBlueprints, setStrategy],
  );

  const generateWithBriefing = useCallback(async () => {
    if (!briefObjective.trim() || !briefChannel.trim() || !briefPersonaId || !briefFunnel) {
      showToast("Completa objetivo, canal, persona y etapa del funnel.", "error");
      return;
    }
    setGeneratingPiece(true);
    try {
      const res = await fetch("/api/spaces/brain/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing: {
            objective: briefObjective,
            channel: briefChannel,
            personaId: briefPersonaId,
            funnelStage: briefFunnel,
            ask: briefAsk,
          },
          documents: assets.knowledge.documents,
          strategy: assets.strategy,
          officialFacts: filteredFactsForGeneration,
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        internalPrompt?: string;
        draft?: string;
        critique?: string;
        score?: number;
        issues?: string[];
        revised?: string;
        sources?: { core: Array<{ id: string; name: string }>; context: Array<{ id: string; name: string }> };
      }>(res, "POST /api/spaces/brain/content/generate");
      if (!res.ok) throw new Error(data?.error || "No se pudo generar la pieza");
      setGeneratedPreview({
        internalPrompt: data?.internalPrompt || "",
        draft: data?.draft || "",
        critique: data?.critique || "",
        score: typeof data?.score === "number" ? data.score : 50,
        issues: data?.issues || [],
        revised: data?.revised || data?.draft || "",
        sources: data?.sources || { core: [], context: [] },
      });
      showToast("Pieza generada y evaluada por modo crítico.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error generando pieza", "error");
    } finally {
      setGeneratingPiece(false);
    }
  }, [
    assets.knowledge.documents,
    assets.strategy,
    briefAsk,
    briefChannel,
    briefFunnel,
    briefObjective,
    briefPersonaId,
    filteredFactsForGeneration,
    showToast,
  ]);

  const registerLearning = useCallback(
    (decision: "approved" | "rejected") => {
      if (!generatedPreview) return;
      const piece: BrainGeneratedPiece = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        objective: briefObjective,
        channel: briefChannel,
        personaId: briefPersonaId,
        funnelStage: briefFunnel,
        prompt: generatedPreview.internalPrompt,
        draft: generatedPreview.draft,
        critique: generatedPreview.critique,
        revised: generatedPreview.revised,
        status: decision,
        notes: pieceFeedbackNote || undefined,
      };
      const approvedPatterns = [...assets.strategy.approvedPatterns];
      const rejectedPatterns = [...assets.strategy.rejectedPatterns];

      const firstLine = (generatedPreview.revised || generatedPreview.draft).split("\n").find((x) => x.trim()) || "";
      const normalized = firstLine.trim().slice(0, 160);
      if (decision === "approved" && normalized) {
        approvedPatterns.push(normalized);
      }
      if (decision === "rejected" && normalized) {
        rejectedPatterns.push(normalized);
      }

      const voiceExamples = [...assets.strategy.voiceExamples];
      voiceExamples.push({
        id: crypto.randomUUID(),
        kind: decision === "approved" ? "good_piece" : "bad_piece",
        text: (generatedPreview.revised || generatedPreview.draft).slice(0, 600),
        label: decision === "approved" ? "Pieza aprobada" : "Pieza rechazada",
      });

      setStrategy({
        generatedPieces: [piece, ...assets.strategy.generatedPieces].slice(0, 60),
        approvedPatterns: [...new Set(approvedPatterns)].slice(0, 120),
        rejectedPatterns: [...new Set(rejectedPatterns)].slice(0, 120),
        voiceExamples,
      });

      setPieceFeedbackNote("");
      showToast(
        decision === "approved"
          ? "Aprendizaje registrado: patrón aprobado"
          : "Aprendizaje registrado: patrón a evitar",
        "success",
      );
    },
    [
      assets.strategy.approvedPatterns,
      assets.strategy.generatedPieces,
      assets.strategy.rejectedPatterns,
      assets.strategy.voiceExamples,
      briefChannel,
      briefFunnel,
      briefObjective,
      briefPersonaId,
      generatedPreview,
      pieceFeedbackNote,
      setStrategy,
      showToast,
    ],
  );

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (personaModalOpen) {
        setPersonaModalOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, personaModalOpen]);

  if (!open) return null;

  function renderPendingReviewArticle(row: StoredLearningCandidate) {
    const c = row.candidate;
    const anchor = resolveLearningPendingAnchorNodeId(row);
    const provUi = getPendingLearningProvenanceUi(row);
    const origin = !anchor
      ? "Sin nodo asignado · revisa la evidencia antes de promover"
      : row.telemetryNodeType
        ? `${labelForBrainNodeSource(row.telemetryNodeType)} · información recibida`
        : "Flujo creativo general";
    const visualNodeBundle = hasVisualLearningReviewBundle(c.evidence.eventCounts);
    const chip = visualNodeBundle ? "Visual / Imagen" : labelForLearningCard(c.type);
    const busy = reviewResolvingId === row.id;
    const whyOpen = reviewEvidenceOpenId === row.id;
    const reasoningOpen = reviewReasoningOpenId === row.id;
    const strength = c.confidence >= 0.75 ? "Fuerte" : c.confidence >= 0.45 ? "Media" : "Débil";
    const example = c.evidence.examples?.[0];
    return (
      <article
        key={row.id}
        className="flex flex-col gap-3 rounded-[20px] border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
            {chip}
          </span>
          <span
            title={provUi.tooltip}
            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-900"
          >
            {provUi.badge}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Origen · {origin}</span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
            Fuerza · {strength}
          </span>
          {(c.conflictWithDNA || c.type === "CONTRADICTION") && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              Revisar con el ADN
            </span>
          )}
        </div>
        <p className="text-[16px] font-semibold leading-snug text-zinc-900">{formatLearningReviewCardHeadline(c.value)}</p>
        {example && (
          <p className="text-[11px] text-zinc-600">
            {example.startsWith("Basado en:") ? (
              <>
                <span className="font-bold text-zinc-800">Basado en:</span>{" "}
                {example.slice("Basado en:".length).trim().length > 220
                  ? `${example.slice("Basado en:".length).trim().slice(0, 217)}…`
                  : example.slice("Basado en:".length).trim()}
              </>
            ) : (
              <>
                <span className="font-bold text-zinc-800">Ejemplo:</span> «
                {example.length > 220 ? `${example.slice(0, 217)}…` : example}»
              </>
            )}
          </p>
        )}
        <button
          type="button"
          onClick={() => setReviewReasoningOpenId(reasoningOpen ? null : row.id)}
          className="flex w-fit items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900"
        >
          {reasoningOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {reasoningOpen ? "Ocultar razonamiento" : "Ver razonamiento"}
        </button>
        {reasoningOpen && (
          <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-700">
            {c.reasoning}
          </p>
        )}
        <button
          type="button"
          onClick={() => setReviewEvidenceOpenId(whyOpen ? null : row.id)}
          className="flex w-fit items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
        >
          {whyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Ver por qué
        </button>
        {whyOpen && (
          <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug text-zinc-600">
            {learningReviewDiagnosticBullets(row, {
              visualAnalyses: assets.strategy.visualReferenceAnalysis?.analyses,
            }).map((line, i) => (
              <li key={`${row.id}-why-${i}`}>{line}</li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "PROMOTE_TO_DNA")}
            className="rounded-lg border border-violet-600 bg-violet-600 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
          >
            {visualNodeBundle ? "Guardar en ADN visual" : "Guardar en ADN"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "KEEP_IN_PROJECT")}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
          >
            Solo este proyecto
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "SAVE_AS_CONTEXT")}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
          >
            {visualNodeBundle ? "Guardar como contexto visual" : "Guardar como contexto puntual"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolvePendingItem(row, "DISMISS")}
            className="rounded-lg border border-zinc-200 bg-zinc-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-600 disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setActiveTab("voice");
              showToast("Edita en Voz / Mensajes y vuelve aquí para confirmar.", "info");
            }}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 disabled:opacity-50"
          >
            Editar antes de guardar
          </button>
        </div>
      </article>
    );
  }

  const existingFormats = Array.from(new Set(assets.knowledge.documents.map((d) => d.format).filter(Boolean)));
  const filterTabs = ["all", "core", "context", ...existingFormats] as string[];
  const docsFiltered = assets.knowledge.documents.filter((d) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "core") return d.scope !== "context";
    if (activeFilter === "context") return d.scope === "context";
    return d.format === activeFilter;
  });

  const analyzedCount = assets.knowledge.documents.filter((d) => d.status === "Analizado").length;
  const selectedPersonaIds = new Set(assets.strategy.personas.map((p) => p.id));
  const personaCatalogRemaining = AUDIENCE_PERSONA_CATALOG.filter((p) => !selectedPersonaIds.has(p.id));

  const skinIdentityScore = computeVisualIdentityScore(assets);
  const skinVisualRefScore = computeVisualRefsHealthScore(
    visualDisposition.realRemoteAnalyzed,
    visualImageRefCount || 0,
  );
  const skinFactsScore = computeFactsSignalsScore(assets);
  const skinNodeLearningScore = computeNodeLearningScore(
    pendingLearnings.length,
    assets.strategy.generatedPieces.length,
  );
  const imageDocCount = assets.knowledge.documents.filter(
    (d) => d.mime.toLowerCase().startsWith("image/") || d.format === "image" || d.type === "image",
  ).length;
  const visualPendingProposals = pendingLearnings.filter(
    (p) => p.candidate.evidence.evidenceSource === "visual_reference",
  ).length;

  const shell = (
    <div
      className="fixed inset-0 z-[100080] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-brain-title"
    >
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50">
            <Brain className="h-6 w-6 text-violet-700" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="project-brain-title" className="text-[15px] font-black uppercase tracking-wide text-zinc-900">
              Brain
            </h1>
            <p className="text-[11px] text-zinc-500">Memoria creativa · ADN · conocimiento · aprendizaje</p>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 text-center text-[11px] font-semibold text-zinc-600 md:flex">
          <span
            title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}
            className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-violet-900"
          >
            ADN {adn.total}/100
          </span>
          <span className="text-zinc-300">·</span>
          <span
            title="Cola de aprendizajes pendientes de decisión; la procedencia (visión real, telemetría, etc.) se indica en cada tarjeta."
            className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-amber-900"
          >
            {pendingLearnings.length} por revisar
          </span>
          <span className="text-zinc-300">·</span>
          <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-sky-900">
            {brainClients.length} nodos conectados
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-zinc-800 transition hover:bg-zinc-100"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          Cerrar
        </button>
      </header>

      {message.text && (
        <div
          role="status"
          className={`fixed left-1/2 top-[4.5rem] z-[100090] max-w-[min(460px,92vw)] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-[12px] font-semibold shadow-lg ${
            message.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-6 pb-6 pt-5">
        <aside className="flex w-[280px] shrink-0 flex-col gap-5 overflow-y-auto pr-1">
          <section className="rounded-[22px] border border-zinc-200 bg-gradient-to-b from-violet-50/90 to-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Salud del Brain</p>
            <p className="mt-2 text-3xl font-black text-violet-800" title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}>
              {adn.total}
              <span className="text-sm font-semibold text-zinc-500">/100</span>
            </p>
            <p className="mt-1 text-[10px] leading-snug text-zinc-500">
              Heurística de completitud (voz, personas, mensajes, contexto analizado)
            </p>
            <div className="mt-4 space-y-2.5">
              {[
                ["Identidad visual", skinIdentityScore, "bg-fuchsia-500"],
                ["Voz y tono", adn.voiceScore, "bg-violet-500"],
                ["Personas", adn.personasScore, "bg-amber-500"],
                ["Mensajes", adn.msgScore, "bg-sky-500"],
                ["Datos / pruebas", skinFactsScore, "bg-rose-500"],
                [
                  "Imágenes con visión remota",
                  skinVisualRefScore,
                  "bg-indigo-500",
                  "Cuántas imágenes de referencia tienen análisis remoto (Gemini/OpenAI) sin fallback, frente al inventario total.",
                ],
                ["Aprendizaje de nodos", skinNodeLearningScore, "bg-emerald-500"],
              ].map((row) => {
                const label = String(row[0]);
                const value = Number(row[1]);
                const klass = String(row[2]);
                const barTitle = row.length > 3 ? String(row[3]) : undefined;
                return (
                  <div key={label} title={barTitle}>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-600">
                      <span>{label}</span>
                      <span>{value}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-200">
                      <div className={`h-1.5 rounded-full ${klass}`} style={{ width: `${value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[22px] border border-zinc-200 bg-zinc-50/90 p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">Identidad visual</p>
            <LogoDropSlot
              compact
              label="Logo +"
              description="Fondos claros"
              dataUrl={assets.brand.logoPositive}
              slotId="positive"
              onPick={onLogoPick}
              onClear={onLogoClear}
            />
            <div className="mt-2" />
            <LogoDropSlot
              compact
              label="Logo -"
              description="Fondos oscuros"
              dataUrl={assets.brand.logoNegative}
              slotId="negative"
              onPick={onLogoPick}
              onClear={onLogoClear}
            />
            <div className="mt-3 border-t border-zinc-200 pt-3">
              <span className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">
                <Droplets className="h-3 w-3 text-amber-600" aria-hidden />
                Paleta
              </span>
              <div className="space-y-2">
                <ColorField compact label="Primario" value={assets.brand.colorPrimary} onChange={(h) => setBrand({ colorPrimary: h })} />
                <ColorField compact label="Secundario" value={assets.brand.colorSecondary} onChange={(h) => setBrand({ colorSecondary: h })} />
                <ColorField compact label="Acento" value={assets.brand.colorAccent} onChange={(h) => setBrand({ colorAccent: h })} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("knowledge")}
              className="mt-3 w-full rounded-xl border border-zinc-300 bg-white py-2 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
            >
              Editar identidad
            </button>
          </section>

          <section className="rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Fuentes de conocimiento</p>
            <ul className="mt-3 space-y-2 text-[11px] text-zinc-700">
              <li className="flex justify-between">
                <span>Documentos</span>
                <span className="font-bold text-zinc-900">{assets.knowledge.documents.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Enlaces</span>
                <span className="font-bold text-zinc-900">{assets.knowledge.urls.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Imágenes (docs)</span>
                <span className="font-bold text-zinc-900">{imageDocCount}</span>
              </li>
              <li
                className="flex justify-between"
                title="Inventario de imágenes de referencia; no indica cuántas tienen visión remota."
              >
                <span>Imágenes referencia</span>
                <span className="font-bold text-zinc-900">{visualImageRefCount}</span>
              </li>
              <li
                className="flex justify-between"
                title="Filas con Gemini u OpenAI sin mock ni fallback (metadatos del proyecto)."
              >
                <span>Visión remota (sin fallback)</span>
                <span className="font-bold text-zinc-900">{visualDisposition.realRemoteAnalyzed}</span>
              </li>
            </ul>
          </section>

          <section className="rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Estado de aprendizaje</p>
            <ul className="mt-3 space-y-2 text-[11px] text-zinc-700">
              <li className="flex justify-between">
                <span>Por revisar</span>
                <span className="font-bold text-amber-700">{pendingLearnings.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Propuestas visuales</span>
                <span className="font-bold text-violet-800">{visualPendingProposals}</span>
              </li>
              <li className="flex justify-between">
                <span>Piezas en memoria</span>
                <span className="font-bold text-zinc-900">{assets.strategy.generatedPieces.length}</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setActiveTab("review")}
              className="mt-3 w-full rounded-xl border border-violet-600 bg-violet-600 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-violet-700"
            >
              Ir a por revisar
            </button>
          </section>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto rounded-[22px] border border-zinc-200 bg-zinc-50/60 p-5 shadow-inner sm:p-6">
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["overview", "Resumen", LayoutDashboard],
                  ["dna", "ADN de marca", Sparkles],
                  ["visual_refs", "Referencias visuales", ImageIcon],
                  ["knowledge", "Conocimiento", BookOpen],
                  ["connected_nodes", "Nodos conectados", Network],
                  ["review", "Por revisar", MessageSquareText],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  data-testid={
                    id === "review"
                      ? "brain-tab-review"
                      : id === "knowledge"
                        ? "brain-tab-knowledge"
                        : id === "visual_refs"
                          ? "brain-tab-visual-refs"
                          : id === "overview"
                            ? "brain-tab-overview"
                            : undefined
                  }
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-[11px] font-black uppercase tracking-wide ${
                    activeTab === id
                      ? "border-violet-700 bg-violet-700 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-zinc-200/80 pt-3">
              <span className="py-1 text-[10px] font-black uppercase tracking-wide text-zinc-400">Editoriales</span>
              {(
                [
                  ["voice", "Voz y tono"],
                  ["personas", "Personas"],
                  ["messages", "Mensajes"],
                  ["facts", "Hechos"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                    activeTab === id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[20px] border border-violet-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">ADN de marca</p>
                    <p className="mt-2 text-3xl font-black text-violet-800" title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}>
                      {adn.total}
                      <span className="text-sm font-semibold text-zinc-500">/100</span>
                    </p>
                    <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                      {adn.total < 45
                        ? "Heurística de completitud: faltan voz, mensajes y contexto analizado."
                        : adn.total < 72
                          ? "Buen avance de señales cargadas; refuerza hechos y visión remota en referencias."
                          : "Señales cargadas alineadas; revisa siempre «Por revisar» antes de asumir visión real."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("dna")}
                      className="mt-3 w-fit text-[11px] font-bold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                    >
                      Ver ADN
                    </button>
                  </div>
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[20px] border border-indigo-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Referencias imagen</p>
                    <p
                      className="mt-2 text-3xl font-black text-indigo-800"
                      title="Inventario de imágenes; el segundo número es visión remota (Gemini/OpenAI) sin fallback."
                    >
                      {visualImageRefCount}
                      {visualDisposition.realRemoteAnalyzed > 0 ? (
                        <span className="text-lg font-black text-indigo-600">
                          {" "}
                          · {visualDisposition.realRemoteAnalyzed}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                      {visualImageRefCount === 0
                        ? "Sube imágenes de referencia; el inventario no implica análisis remoto hasta reanalizar."
                        : `${visualImageRefCount} en inventario · ${visualDisposition.realRemoteAnalyzed} con visión remota · ${pendingVisualAnalysisCount} sin fila · ${visualDisposition.fallbackOrMockAnalyzed} mock/fallback · ${visualDisposition.failed} errores.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("visual_refs")}
                      className="mt-3 w-fit text-[11px] font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                    >
                      Revisar
                    </button>
                  </div>
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[20px] border border-sky-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Nodos conectados</p>
                    <p className="mt-2 text-3xl font-black text-sky-800">{brainClients.length}</p>
                    <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                      {brainClients.length === 0
                        ? "Conecta Designer, Photoroom u otros al puerto Brain del lienzo."
                        : `${brainClients.map((c) => c.label).join(" · ")}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("connected_nodes")}
                      className="mt-3 w-fit text-[11px] font-bold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                    >
                      Ver nodos
                    </button>
                  </div>
                  <div className="flex min-h-[120px] flex-col justify-between rounded-[20px] border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-900">Por revisar</p>
                    <p className="mt-2 text-3xl font-black text-amber-900">{pendingLearnings.length}</p>
                    <p className="mt-2 text-[11px] leading-snug text-amber-950/80">
                      Nada cambia en el ADN hasta que confirmes cada aprendizaje.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("review")}
                      className="mt-3 w-fit text-[11px] font-bold text-amber-900 underline decoration-amber-400 underline-offset-2"
                    >
                      Revisar
                    </button>
                  </div>
                </div>

                <div className="min-h-[120px] rounded-[22px] border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Brain resume así tu marca</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => stripLegacyDemoStrategyCopy()}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-900 hover:bg-rose-100"
                      >
                        Quitar copy demo (embudo + tono EN)
                      </button>
                      {process.env.NODE_ENV === "development" ? (
                        <button
                          type="button"
                          title="Diagnóstico técnico JSON"
                          onClick={() => {
                            // eslint-disable-next-line no-console
                            console.log("[Brain summary diagnostics]", brandSummary.diagnostics);
                            showToast("Diagnostics JSON en consola del navegador.", "info");
                          }}
                          className="rounded-lg border border-zinc-300 bg-zinc-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"
                        >
                          Log JSON (dev)
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-zinc-800">
                    {[
                      brandSummary.identityNarrative,
                      brandSummary.tone,
                      brandSummary.messages,
                      brandSummary.visualDirection,
                    ].map((sec) => (
                      <li key={sec.key} className="rounded-lg border border-transparent p-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span className="font-bold text-zinc-900">{sec.labelEs}:</span>
                              <span
                                className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${brandSummaryBadgeClass(sec.badge)}`}
                                title="Indicador de procedencia del resumen (cliente)."
                              >
                                {sec.badge}
                              </span>
                            </span>{" "}
                            <span className="text-zinc-800">{sec.value}</span>
                            {sec.warnings.length > 0 ? (
                              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-900/90">
                                {sec.warnings.map((w, i) => (
                                  <li key={`${sec.key}-w-${i}`}>{w}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            aria-expanded={brandSummarySectionSourcesKey === sec.key}
                            aria-controls={`brain-summary-sources-${sec.key}`}
                            id={`brain-summary-sources-trigger-${sec.key}`}
                            onClick={() =>
                              setBrandSummarySectionSourcesKey((k) => (k === sec.key ? null : sec.key))
                            }
                            className="nodrag flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-700 shadow-sm hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900"
                          >
                            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                            Fuentes
                          </button>
                        </div>
                        {brandSummarySectionSourcesKey === sec.key ? (
                          <div id={`brain-summary-sources-${sec.key}`} role="region" className="nodrag">
                            <BrandSummarySourcesPanel
                              section={sec}
                              diagnostics={brandSummary.diagnostics}
                              fieldProvenance={assets.strategy.fieldProvenance}
                              pendingLearningsCount={pendingLearnings.length}
                              lastRestudyCompletedIso={lastRestudyCompletedIso}
                              analyzingKnowledge={analyzing}
                              visualReanalyzing={visualReanalyzing}
                              restudyBusy={restudyBusy}
                              onNavigate={(tab: BrandSummaryNavTab) => {
                                setActiveTab(tab);
                                setBrandSummarySectionSourcesKey(null);
                              }}
                              onAnalyzeKnowledge={() => void handleAnalyze()}
                              onReanalyzeVisualRefs={() => void handleReanalyzeVisualRefs()}
                              onBrainRestudy={() => void handleBrainRestudy()}
                              onStripLegacyDemo={() => {
                                stripLegacyDemoStrategyCopy();
                                setBrandSummarySectionSourcesKey(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[22px] border border-zinc-200 bg-zinc-50/80 p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Señales recientes por nodo</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                    Información recibida desde el lienzo, agrupada por nodo a partir de señales recientes en el servidor.
                  </p>
                  <ul className="mt-3 space-y-2 text-[12px] text-zinc-800">
                    {brainClients.map((c) => {
                      const tel = telemetryByNodeId[c.id];
                      const pendN = pendingByNodeId.get(c.id) ?? 0;
                      const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                        summaryLine: tel?.summaryLine ?? null,
                        lastAt: tel?.lastAt ?? null,
                        pendingCount: pendN,
                        expanded: true,
                      });
                      return (
                        <li key={c.id} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
                          <span>
                            <span className="font-semibold text-zinc-900">{c.label}</span>
                            <span className="text-zinc-500"> · {labelForBrainNodeSource(c.brainNodeType)}</span>
                            <br />
                            <span className="text-[11px] text-zinc-800">{signalsLine}</span>
                            {pendingLine ? (
                              <>
                                <br />
                                <span className="text-[11px] text-zinc-700">{pendingLine}</span>
                              </>
                            ) : null}
                            {lastSignalLine ? (
                              <>
                                <br />
                                <span className="text-[11px] text-zinc-500">{lastSignalLine}</span>
                              </>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                      <span>
                        Conocimiento · {analyzedCount} fuentes analizadas de {assets.knowledge.documents.length} activas.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                      <span>
                        Referencias visuales · {visualImageRefCount} en memoria
                        {pendingVisualAnalysisCount > 0 ? ` · ${pendingVisualAnalysisCount} pendientes de capa visual` : ""}.
                      </span>
                    </li>
                    {pendingLearnings.length > 0 && (
                      <li className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        <span>
                          Hay {pendingLearnings.length}{" "}
                          {pendingLearnings.length === 1 ? "aprendizaje en revisión" : "aprendizajes en revisión"} en
                          «Por revisar».
                        </span>
                      </li>
                    )}
                  </ul>
                  {process.env.NODE_ENV === "development" ? (
                    <p className="mt-3 text-[10px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
                  ) : null}
                </div>
              </div>
            )}

            {activeTab === "dna" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">ADN de marca</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                    Solo lo que consideras base reutilizable. Los aprendizajes pendientes viven en «Por revisar». Las
                    tarjetas leen los mismos datos guardados que el resumen; el texto demo/seed se filtra igual que en
                    «Resumen» para no confundir con tu marca real.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {(
                    [
                      {
                        title: "Contexto de marca",
                        status: assets.knowledge.corporateContext?.trim() ? "Confirmado" : "Incompleto",
                        body:
                          assets.knowledge.corporateContext?.trim() ||
                          "Analiza documentos CORE o resume la marca en conocimiento.",
                        tab: "knowledge" as BrainMainSection,
                        footnote: null as string | null,
                      },
                      {
                        title: "Tono y rasgos",
                        status: dnaTabPreview.toneStatus,
                        body: dnaTabPreview.toneBody,
                        tab: "voice",
                        footnote: dnaTabPreview.toneFootnote,
                      },
                      {
                        title: "Mensajes y claims",
                        status: dnaTabPreview.messagesStatus,
                        body: dnaTabPreview.messagesBody,
                        tab: "messages",
                        footnote: dnaTabPreview.messagesFootnote,
                      },
                      {
                        title: "Audiencia (personas)",
                        status: assets.strategy.personas.length > 0 ? "Confirmado" : "Incompleto",
                        body:
                          assets.strategy.personas
                            .slice(0, 3)
                            .map((p) => p.name)
                            .join(" · ") || "Añade al menos una persona.",
                        tab: "personas",
                        footnote: null as string | null,
                      },
                      {
                        title: "Colores de marca",
                        status: "Confirmado",
                        body: `${assets.brand.colorPrimary} · ${assets.brand.colorSecondary} · ${assets.brand.colorAccent}`,
                        tab: "knowledge",
                        footnote: null as string | null,
                      },
                      {
                        title: "Hechos y pruebas",
                        status: assets.strategy.factsAndEvidence.length > 0 ? "Detectado" : "Incompleto",
                        body: `${assets.strategy.factsAndEvidence.length} piezas en memoria de verdad.`,
                        tab: "facts",
                        footnote: null as string | null,
                      },
                      {
                        title: "Qué evitar",
                        status: assets.strategy.tabooPhrases.length > 0 ? "Bloqueado" : "Incompleto",
                        body: assets.strategy.tabooPhrases.slice(0, 5).join(" · ") || "Añade frases prohibidas en Voz.",
                        tab: "voice",
                        footnote: null as string | null,
                      },
                      {
                        title: "Reglas de claims absolutos",
                        status: assets.strategy.allowAbsoluteClaims ? "Detectado" : "Bloqueado",
                        body: assets.strategy.allowAbsoluteClaims
                          ? "Permites claims fuertes: revisa con hechos verificados."
                          : "Claims absolutos restringidos (marca más conservadora).",
                        tab: "facts",
                        footnote: null as string | null,
                      },
                    ] as const
                  ).map((card) => (
                    <article
                      key={card.title}
                      className="flex min-h-[120px] flex-col rounded-[20px] border border-zinc-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wide text-zinc-900">{card.title}</p>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-600">
                          {card.status}
                        </span>
                      </div>
                      <p className="mt-2 flex-1 text-[12px] leading-relaxed text-zinc-700">{card.body}</p>
                      {card.footnote ? (
                        <p className="mt-2 text-[10px] leading-snug text-amber-900/90">{card.footnote}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab(card.tab)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-100"
                        >
                          Editar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "connected_nodes" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Nodos conectados</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                    Brain recibe señales recientes e información desde el lienzo por cada nodo conectado. Nada entra al
                    ADN hasta que revises las propuestas en «Por revisar».
                  </p>
                </div>
                {brainClients.length === 0 ? (
                  <p className="rounded-[20px] border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-[12px] leading-relaxed text-zinc-600">
                    Aún no hay nodos enlazados. En el lienzo, conecta la salida Brain de este nodo al puerto Brain de
                    Designer, Photoroom u otros creativos.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {brainClients.map((client) => {
                      const tel = telemetryByNodeId[client.id];
                      const pendN = pendingByNodeId.get(client.id) ?? 0;
                      const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                        summaryLine: tel?.summaryLine ?? null,
                        lastAt: tel?.lastAt ?? null,
                        pendingCount: pendN,
                        expanded: true,
                      });
                      const pendingForNode = pendingLearnings.filter((row) =>
                        learningRowMatchesCanvasNode(row, client.id, client.brainNodeType),
                      );
                      const accent =
                        client.brainNodeType === "DESIGNER"
                          ? "border-sky-200 bg-sky-50/50 ring-1 ring-sky-100"
                          : client.brainNodeType === "PHOTOROOM"
                            ? "border-fuchsia-200 bg-fuchsia-50/40 ring-1 ring-fuchsia-100"
                            : client.brainNodeType === "ARTICLE_WRITER"
                              ? "border-emerald-200 bg-emerald-50/40 ring-1 ring-emerald-100"
                              : "border-zinc-200 bg-zinc-50/80 ring-1 ring-zinc-100";
                      return (
                        <article
                          key={client.id}
                          className={`flex min-h-[320px] flex-col rounded-[22px] border p-5 shadow-sm ${accent}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                                {labelForBrainNodeSource(client.brainNodeType)}
                              </p>
                              <p className="text-lg font-black text-zinc-900">{client.label}</p>
                              <p className="mt-1 text-[11px] text-zinc-600">
                                Señales recientes e información recibida desde este nodo hacia Brain.
                              </p>
                            </div>
                            <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-zinc-600">
                              {client.canvasType}
                            </span>
                          </div>
                          <div className="mt-4 rounded-xl border border-zinc-200/80 bg-white/70 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                              Señales recientes (resumen)
                            </p>
                            <p className="mt-2 text-[12px] font-semibold text-zinc-900">{signalsLine}</p>
                            {lastSignalLine ? (
                              <p className="mt-1 text-[11px] text-zinc-500">{lastSignalLine}</p>
                            ) : null}
                          </div>
                          <div className="mt-3 rounded-xl border border-zinc-200/80 bg-white/70 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                              Aprendizajes en revisión
                            </p>
                            {pendingLine ? (
                              <p className="mt-2 text-[12px] font-semibold text-zinc-900">{pendingLine}</p>
                            ) : (
                              <p className="mt-2 text-[12px] text-zinc-600">Ninguno pendiente de este nodo.</p>
                            )}
                            {pendingForNode.length > 0 ? (
                              <ul className="mt-2 space-y-1 text-[11px] text-zinc-700">
                                {pendingForNode.slice(0, 5).map((row) => {
                                  const snippet = stripLearningValueUiPrefixes(row.candidate.value).trim();
                                  return (
                                    <li key={row.id} className="leading-snug">
                                      · {snippet.slice(0, 140)}
                                      {snippet.length > 140 ? "…" : ""}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2 pt-4">
                            <button
                              type="button"
                              onClick={() => setSignalModalClient(client)}
                              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-black"
                            >
                              Ver señales
                            </button>
                            <button
                              type="button"
                              onClick={() => showToast("Próximamente: pausar solo este nodo.", "info")}
                              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                            >
                              Pausar aprendizaje
                            </button>
                            <button
                              type="button"
                              onClick={() => void refreshConnectedSignals()}
                              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                            >
                              Refrescar señales
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                showToast("Desconecta el cable Brain en el lienzo para dejar de recibir señales.", "info")
                              }
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-rose-800 hover:bg-rose-100"
                            >
                              Cómo desconectar
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {process.env.NODE_ENV === "development" ? (
                  <p className="text-[10px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
                ) : null}
              </div>
            )}

            {activeTab === "review" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-violet-900">Por revisar</h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-violet-950/80">
                    Propuestas a partir de señales recientes e información recibida en el lienzo. Nada cambia en la
                    marca hasta que elijas una acción.
                  </p>
                </div>
                {!projectId?.trim() ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[12px] text-zinc-500">
                    Guarda el proyecto con sesión iniciada para ver pendientes aquí.
                  </p>
                ) : pendingLoading ? (
                  <p className="text-center text-[12px] text-zinc-500">Cargando…</p>
                ) : pendingLearnings.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[12px] text-zinc-500">
                    Brain está al día. No hay aprendizajes pendientes por revisar.
                  </p>
                ) : pendingFiltered.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-center text-[12px] text-amber-950">
                    No hay elementos con este filtro. Cambia el filtro en el panel derecho o vuelve a «Todos».
                  </p>
                ) : (
                  <div className="space-y-4">
                    {pendingReviewSplit.anchored.length === 0 && pendingReviewSplit.orphans.length > 0 ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[11px] leading-relaxed text-amber-950">
                        No hay pendientes con nodo de lienzo anclado para este filtro. Los que siguen carecen de un{" "}
                        <code className="rounded bg-amber-100 px-1">nodeId</code> fiable; no deben mostrarse dentro de
                        tarjetas Photoroom/Designer hasta corregir la evidencia.
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3">
                      {pendingReviewSplit.anchored.map((row) => renderPendingReviewArticle(row))}
                    </div>
                    {pendingReviewSplit.orphans.length > 0 ? (
                      <div className="space-y-3">
                        <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-600">
                          Aprendizajes sin nodo asignado
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {pendingReviewSplit.orphans.map((row) => renderPendingReviewArticle(row))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {activeTab === "visual_refs" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Referencias visuales</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-600">
                    Inventario de imágenes reutilizables y, cuando exista, la capa interpretada arriba. Los contadores
                    separan inventario total, filas con visión remota fiable (Gemini/OpenAI sin fallback), mock o
                    heurística local, errores y referencias aún sin fila de análisis.
                  </p>
                </div>
                {visualReferenceAnalysisDirty ? (
                  <div className="rounded-xl border border-sky-400 bg-sky-50 px-4 py-3 text-[11px] leading-relaxed text-sky-950">
                    <p className="font-semibold text-sky-950">
                      Análisis visual actualizado. Guarda el proyecto para conservarlo.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isSavingProject}
                        onClick={() => void handleSaveVisualAnalysis()}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-800 bg-sky-800 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingProject ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Save className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Guardar análisis
                      </button>
                      <span className="text-[10px] text-sky-900/90">Mismo efecto que «Guardar proyecto» en el lienzo.</span>
                    </div>
                  </div>
                ) : null}
                {!serverVisionProbeDone ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-[11px] leading-relaxed text-sky-950">
                    <p className="font-semibold text-sky-950">Comprobando visión en el servidor…</p>
                    <p className="mt-1 text-[10px] text-sky-900/90">
                      El aviso amarillo anterior miraba solo los datos guardados del proyecto; ahora se consulta la
                      configuración real (variables de entorno).
                    </p>
                  </div>
                ) : serverVisionProviderId === null ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-[11px] leading-relaxed text-amber-950">
                    <p className="font-semibold text-amber-950">
                      No se pudo comprobar la visión en el servidor (¿sesión cerrada o error de red?).
                    </p>
                    <p className="mt-1 text-[10px] text-amber-900/90">
                      Inicia sesión y recarga Brain Studio. El aviso amarillo antiguo se basaba solo en datos
                      guardados; sin comprobación remota no sabemos si hay claves en el proceso de Next.
                    </p>
                  </div>
                ) : serverVisionProviderId === "mock" ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-[11px] leading-relaxed text-amber-950">
                    <p className="font-semibold text-amber-950">
                      El servidor no tiene visión remota activa (mock). Revisa claves y reinicia{" "}
                      <code className="rounded bg-amber-100 px-1">npm run dev</code>.
                    </p>
                    <p className="mt-1 text-[10px] text-amber-900/90">
                      Configura <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code> u{" "}
                      <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> y opcionalmente{" "}
                      <code className="rounded bg-amber-100 px-1">BRAIN_VISION_PROVIDER=gemini|openai</code>. Si
                      «Análisis simulado» venía solo de datos viejos, tras configurar y reiniciar pulsa «Reanalizar
                      imágenes».
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-[11px] leading-relaxed text-emerald-950">
                    <p className="font-semibold text-emerald-950">
                      Servidor con visión remota:{" "}
                      {serverVisionProviderId === "gemini-vision"
                        ? "Gemini"
                        : serverVisionProviderId === "openai-vision"
                          ? "OpenAI"
                          : "—"}
                      .
                    </p>
                    <p className="mt-1 text-[10px] text-emerald-900/90">
                      Cada fila muestra su proveedor real y si hubo fallback. Si el proyecto guardó análisis mock antes
                      de configurar claves, pulsa «Reanalizar imágenes» para regenerar la capa.
                    </p>
                    {isVisualMockAnalyzer ? (
                      <p className="mt-2 text-[10px] font-semibold text-amber-900">
                        Los metadatos guardados aún marcan el último lote como mock: usa «Reanalizar imágenes» para
                        alinearlos con el servidor actual.
                      </p>
                    ) : null}
                  </div>
                )}
                {process.env.NODE_ENV === "development" && projectId?.trim() ? (
                  <div className="rounded-xl border border-zinc-300 bg-zinc-100/90 px-4 py-3 text-[10px] leading-relaxed text-zinc-800">
                    <p className="font-black uppercase tracking-[0.1em] text-zinc-600">Herramientas dev · pendientes</p>
                    <p className="mt-1 text-zinc-600">
                      Limpia la cola en memoria del servidor para este proyecto (no afecta assets guardados).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void devClearPendingLearnings("all")}
                        className="rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                      >
                        Limpiar todos los pendientes
                      </button>
                      <button
                        type="button"
                        onClick={() => void devClearPendingLearnings("orphan")}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-amber-950 hover:bg-amber-100"
                      >
                        Limpiar sin nodo
                      </button>
                      <button
                        type="button"
                        onClick={() => void devClearPendingLearnings("visual_reference")}
                        className="rounded-lg border border-violet-400 bg-violet-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-violet-950 hover:bg-violet-100"
                      >
                        Limpiar cola referencias visuales
                      </button>
                      <button
                        type="button"
                        disabled={restudyBusy}
                        onClick={() => void handleBrainRestudy()}
                        className="rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {restudyBusy ? "Re-estudiando…" : "Reestudiar Brain completo"}
                      </button>
                    </div>
                    {restudyLast ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-white p-3 text-[10px] text-zinc-800">
                        <p className="font-black uppercase tracking-wide text-zinc-600">Último re-estudio</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold text-zinc-600">Visión remota:</span>{" "}
                            {restudyLast.visual.analyzedReal} / {restudyLast.visual.totalImages} · fallback{" "}
                            {restudyLast.visual.fallback} · fallidas {restudyLast.visual.failed} · demasiado genéricas{" "}
                            {restudyLast.visual.tooGeneric} · proveedor {restudyLast.visual.provider}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-600">Documentos CORE:</span>{" "}
                            {restudyLast.documents.analyzed} analizados / {restudyLast.documents.totalCoreDocuments} ·
                            errores {restudyLast.documents.failed}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-600">Candidatos creados:</span>{" "}
                            {restudyLast.candidatesCreated}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-600">Confianza resumen:</span>{" "}
                            {(restudyLast.summary.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                        {restudyLast.devValidation?.samples?.length ? (
                          <div className="rounded border border-amber-100 bg-amber-50/80 p-2 text-[9px] text-amber-950">
                            <p className="font-semibold">Validación 3 imágenes (dev)</p>
                            <p className="mt-1">
                              {restudyLast.devValidation.passed ? "OK: al menos una muestra no genérica." : restudyLast.devValidation.warning ?? "Muestra genérica."}
                            </p>
                            <ul className="mt-1 list-inside list-disc">
                              {restudyLast.devValidation.samples.map((s) => (
                                <li key={s.sourceAssetId}>
                                  {s.sourceAssetId}: calidad {s.quality} · tags {s.subjectTags.slice(0, 6).join(", ")}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {restudyLast.warnings.length ? (
                          <div className="max-h-28 overflow-y-auto rounded border border-amber-200 bg-amber-50/90 p-2 text-[9px] text-amber-950">
                            {restudyLast.warnings.slice(0, 12).map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setRestudyTraceOpen(true)}
                            className="rounded-lg border border-zinc-400 bg-zinc-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-100"
                          >
                            Ver trazabilidad del resumen
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {restudyTraceOpen && restudyLast ? (
                  <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                  >
                    <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                        <p className="text-[12px] font-black uppercase tracking-wide text-zinc-800">
                          Trazabilidad del resumen (re-estudio)
                        </p>
                        <button
                          type="button"
                          onClick={() => setRestudyTraceOpen(false)}
                          className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50"
                        >
                          Cerrar
                        </button>
                      </div>
                      <pre className="max-h-[calc(85vh-52px)] overflow-auto p-4 text-[10px] leading-relaxed text-zinc-800">
                        {JSON.stringify(restudyLast.traceability, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div
                    className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm"
                    title="Imágenes detectadas en el proyecto como referencia o recurso visual (inventario)."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Referencias totales</p>
                    <p className="mt-1 text-2xl font-black text-violet-800">{visualImageRefCount}</p>
                    <p className="mt-1 text-[10px] text-zinc-500">Inventario en Brain</p>
                  </div>
                  <div
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm"
                    title="Filas con Gemini u OpenAI sin mock ni fallback (según metadatos guardados)."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-900">Visión remota</p>
                    <p className="mt-1 text-2xl font-black text-emerald-900">{visualDisposition.realRemoteAnalyzed}</p>
                    <p className="mt-1 text-[10px] text-emerald-900/90">Analizadas con API de visión</p>
                  </div>
                  <div
                    className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm"
                    title="Análisis simulado, fallback heurístico o metadatos que no cuentan como visión remota fiable."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-900">Mock / fallback</p>
                    <p className="mt-1 text-2xl font-black text-sky-900">{visualDisposition.fallbackOrMockAnalyzed}</p>
                    <p className="mt-1 text-[10px] text-sky-900/85">Heurística o simulado</p>
                  </div>
                  <div
                    className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm"
                    title="Filas cuyo último intento de análisis quedó en error."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-900">Errores</p>
                    <p className="mt-1 text-2xl font-black text-rose-900">{visualDisposition.failed}</p>
                    <p className="mt-1 text-[10px] text-rose-900/85">Estado fallido</p>
                  </div>
                  <div
                    className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm"
                    title="Referencias del inventario sin ninguna fila en la capa de análisis; pulsa Reanalizar."
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">Sin capa aún</p>
                    <p className="mt-1 text-2xl font-black text-amber-900">{pendingVisualAnalysisCount}</p>
                    <p className="mt-1 text-[10px] text-amber-900/80">Sin fila de análisis</p>
                  </div>
                </div>
                <p className="text-[10px] leading-snug text-zinc-500">
                  Filas en capa (cualquier estado): {visualAnalyzedCount}. Excluidas del agregado ADN visual:{" "}
                  {visualAggregatedResolved?.excludedFromVisualDnaCount ?? 0}.
                </p>
                {visualAggregatedResolved && visualAnalyzedCount > 0 ? (
                  <>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                        Resumen Core / contexto / raw
                      </p>
                      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-800">
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-semibold">
                          CORE {visualAggregatedResolved.countsByClassification.CORE_VISUAL_DNA ?? 0}
                        </span>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold">
                          Proyecto {visualAggregatedResolved.countsByClassification.PROJECT_VISUAL_REFERENCE ?? 0}
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold">
                          Contexto {visualAggregatedResolved.countsByClassification.CONTEXTUAL_VISUAL_MEMORY ?? 0}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold">
                          RAW {visualAggregatedResolved.countsByClassification.RAW_ASSET_ONLY ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Estilo y mood
                          </p>
                          <p className="text-[11px] text-zinc-700">
                            <span className="font-semibold text-zinc-900">Estilo:</span>{" "}
                            {visualAggregatedResolved.recurringStyles.length
                              ? visualAggregatedResolved.recurringStyles.join(", ")
                              : "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-700">
                            <span className="font-semibold text-zinc-900">Mood:</span>{" "}
                            {visualAggregatedResolved.dominantMoods.length
                              ? visualAggregatedResolved.dominantMoods.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Composición y sujetos
                          </p>
                          <p className="text-[11px] text-zinc-700">
                            {visualAggregatedResolved.compositionNotes.length
                              ? visualAggregatedResolved.compositionNotes.join(" · ")
                              : "—"}
                          </p>
                          <p className="mt-2 text-[11px] text-zinc-600">
                            <span className="font-semibold text-zinc-800">Sujetos:</span>{" "}
                            {visualAggregatedResolved.frequentSubjects.length
                              ? visualAggregatedResolved.frequentSubjects.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Personas y ropa / styling
                          </p>
                          <p className="text-[11px] leading-relaxed text-zinc-700">
                            {visualAggregatedResolved.peopleClothingNotes.length
                              ? visualAggregatedResolved.peopleClothingNotes.join(" · ")
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Paleta dominante y secundaria
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {visualAggregatedResolved.dominantPalette.slice(0, 10).map((hex) => (
                              <span
                                key={`d-${hex}`}
                                title={hex}
                                className="inline-flex h-9 w-9 rounded-full border border-zinc-200 shadow-inner"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Secundarios
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(visualAggregatedResolved.dominantSecondaryPalette ?? []).slice(0, 8).map((hex) => (
                              <span
                                key={`s-${hex}`}
                                title={hex}
                                className="inline-flex h-7 w-7 rounded-full border border-zinc-200 shadow-inner"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                            {(visualAggregatedResolved.dominantSecondaryPalette ?? []).length === 0 ? (
                              <span className="text-[11px] text-zinc-500">—</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            Estilo gráfico
                          </p>
                          <p className="text-[11px] text-zinc-700">
                            {(visualAggregatedResolved.graphicStyleNotes ?? []).length
                              ? (visualAggregatedResolved.graphicStyleNotes ?? []).join(" · ")
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-900">
                            Mensaje implícito de marca
                          </p>
                          <p className="text-[11px] leading-relaxed text-violet-950/90">
                            {(visualAggregatedResolved.implicitBrandMessages ?? []).length
                              ? (visualAggregatedResolved.implicitBrandMessages ?? []).join(" ")
                              : visualAggregatedResolved.narrativeSummary || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                        Cada referencia
                      </p>
                      <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                        {visualRefInventoryRows.map(({ ref, analysis }) => {
                          const diag = visualDiagnosticByAssetId.get(ref.id);
                          const rowMeta = visualReferenceRowMeta(analysis, visualLayer);
                          const status = !analysis
                            ? {
                                label: rowMeta.estadoLabel,
                                klass: "border-amber-200 bg-amber-50 text-amber-900",
                              }
                            : isExcludedFromVisualDna(analysis)
                              ? {
                                  label: "Excluida del ADN visual",
                                  klass: "border-zinc-300 bg-zinc-100 text-zinc-700",
                                }
                              : analysis.userVisualOverride && analysis.userVisualOverride !== "EXCLUDED"
                                ? {
                                    label: "Clasificación manual",
                                    klass: "border-violet-200 bg-violet-50 text-violet-900",
                                  }
                              : rowMeta.estadoLabel.startsWith("Error")
                                ? {
                                    label: rowMeta.estadoLabel,
                                    klass: "border-rose-200 bg-rose-50 text-rose-900",
                                  }
                                : rowMeta.estadoLabel.includes("simulado")
                                  ? {
                                      label: rowMeta.estadoLabel,
                                      klass: "border-sky-200 bg-sky-50 text-sky-900",
                                    }
                                  : rowMeta.estadoLabel === "Pendiente"
                                    ? {
                                        label: rowMeta.estadoLabel,
                                        klass: "border-amber-200 bg-amber-50 text-amber-900",
                                      }
                                    : {
                                        label: rowMeta.estadoLabel,
                                        klass: "border-emerald-200 bg-emerald-50 text-emerald-900",
                                      };
                          const eff = analysis ? getEffectiveClassification(analysis) : null;
                          const dnaHint =
                            analysis &&
                            !isExcludedFromVisualDna(analysis) &&
                            getEffectiveClassification(analysis) === "CORE_VISUAL_DNA";
                          return (
                            <div
                              key={ref.id}
                              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 sm:flex-row sm:items-start sm:justify-between"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-semibold text-zinc-900">{ref.label ?? ref.name}</p>
                                <p className="text-[10px] text-zinc-500">
                                  {ref.sourceKind.replace(/_/g, " ")} ·{" "}
                                  <span className="font-mono text-zinc-600">id={ref.id}</span>
                                  {analysis?.fileName ? (
                                    <>
                                      {" "}
                                      · <span className="font-mono text-zinc-600">{analysis.fileName}</span>
                                    </>
                                  ) : null}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${status.klass}`}>
                                    {status.label}
                                  </span>
                                  {dnaHint ? (
                                    <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-900">
                                      Usada para ADN visual
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1.5 text-[9px] leading-snug text-zinc-500">
                                  <span className="font-semibold text-zinc-600">Estado:</span> {rowMeta.estadoLabel}
                                  <span className="text-zinc-400"> · </span>
                                  <span className="font-semibold text-zinc-600">Proveedor:</span> {rowMeta.proveedorLabel}
                                  <span className="text-zinc-400"> · </span>
                                  <span className="font-semibold text-zinc-600">Versión:</span> {rowMeta.versionLabel}
                                  <span className="text-zinc-400"> · </span>
                                  <span className="font-semibold text-zinc-600">Imagen para visión:</span>{" "}
                                  {rowMeta.imageUrlLine}
                                  {analysis?.fallbackUsed ? (
                                    <>
                                      <span className="text-zinc-400"> · </span>
                                      <span className="font-semibold text-zinc-600">Fallback:</span> sí
                                    </>
                                  ) : analysis && analysis.fallbackUsed === false ? (
                                    <>
                                      <span className="text-zinc-400"> · </span>
                                      <span className="font-semibold text-zinc-600">Fallback:</span> no
                                    </>
                                  ) : null}
                                </p>
                                {rowMeta.fallbackNote ? (
                                  <p className="mt-1 text-[9px] font-semibold leading-snug text-rose-800">
                                    {rowMeta.fallbackNote}
                                  </p>
                                ) : null}
                                {process.env.NODE_ENV === "development" && diag ? (
                                  <details className="mt-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
                                    <summary className="cursor-pointer text-[9px] font-black uppercase tracking-wide text-zinc-600">
                                      Ver diagnóstico (dev)
                                    </summary>
                                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[8px] leading-snug text-zinc-700">
                                      {JSON.stringify(diag, null, 2)}
                                    </pre>
                                  </details>
                                ) : null}
                                {analysis ? (
                                  <p className="mt-2 text-[10px] text-zinc-600">
                                    Modelo: {labelVisualClassification(analysis.classification)}
                                    {analysis.userVisualOverride ? (
                                      <>
                                        {" "}
                                        · Manual:{" "}
                                        {analysis.userVisualOverride === "EXCLUDED"
                                          ? "EXCLUIDA"
                                          : labelVisualClassification(analysis.userVisualOverride)}
                                      </>
                                    ) : null}
                                    {eff ? (
                                      <>
                                        {" "}
                                        · Efectiva: {labelVisualClassification(eff)}
                                      </>
                                    ) : null}
                                  </p>
                                ) : null}
                                {analysis?.subjectTags?.length ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                    <span className="font-semibold text-zinc-800">Sujetos:</span>{" "}
                                    {analysis.subjectTags.slice(0, 10).join(" · ")}
                                  </p>
                                ) : null}
                                {analysis?.visualStyle?.length ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                    <span className="font-semibold text-zinc-800">Estilo:</span>{" "}
                                    {analysis.visualStyle.slice(0, 8).join(" · ")}
                                  </p>
                                ) : null}
                                {analysis?.mood?.length ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                    <span className="font-semibold text-zinc-800">Mood:</span>{" "}
                                    {analysis.mood.slice(0, 10).join(" · ")}
                                  </p>
                                ) : null}
                                {analysis?.composition?.length ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                    <span className="font-semibold text-zinc-800">Composición:</span>{" "}
                                    {analysis.composition.slice(0, 10).join(" · ")}
                                  </p>
                                ) : null}
                                {analysis?.colorPalette?.dominant?.length ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                    <span className="font-semibold text-zinc-800">Paleta dominante:</span>{" "}
                                    {analysis.colorPalette.dominant.slice(0, 12).join(", ")}
                                  </p>
                                ) : null}
                                {analysis?.visualMessage?.length ? (
                                  <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                                    <span className="font-semibold text-zinc-800">Mensaje visual:</span>{" "}
                                    {analysis.visualMessage.slice(0, 5).join(" · ")}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-shrink-0 flex-wrap gap-1.5 sm:justify-end">
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "CORE_VISUAL_DNA")}
                                  className="rounded-lg border border-violet-500 bg-violet-600 px-2 py-1 text-[9px] font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Core
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "PROJECT_VISUAL_REFERENCE")}
                                  className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[9px] font-black uppercase text-sky-900 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Proyecto
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "CONTEXTUAL_VISUAL_MEMORY")}
                                  className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-black uppercase text-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Contexto
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, "EXCLUDED")}
                                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[9px] font-black uppercase text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Excluir
                                </button>
                                <button
                                  type="button"
                                  disabled={!analysis || !analysis.userVisualOverride}
                                  onClick={() => patchVisualAnalysisOverride(ref.id, undefined)}
                                  className="rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Reset
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[12px] text-zinc-500">
                    Sube imágenes en Conocimiento o completa slots visuales; luego pulsa «Reanalizar imágenes» para
                    generar la capa interpretada.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={visualReanalyzing || visualImageRefCount === 0}
                    onClick={() => void handleReanalyzeVisualRefs()}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-700 bg-violet-700 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {visualReanalyzing ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Reanalizar imágenes
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("knowledge")}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-800 hover:bg-zinc-50"
                  >
                    Ver imágenes
                  </button>
                  <button
                    type="button"
                    disabled={visualQueueBusy || visualImageRefCount === 0}
                    onClick={() => void handleQueueVisualLearnings()}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {visualQueueBusy ? "Enviando…" : "Revisar aprendizajes visuales"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "knowledge" && (
              <>
                <div className="mb-4 flex flex-wrap items-start gap-3 border-b border-zinc-200 pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                    <BookOpen className="h-5 w-5 text-sky-600" strokeWidth={1.5} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">Pozo de conocimiento</h2>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
                      Ingesta CORE y CONTEXTO + extracción de ADN con data numérica.
                    </p>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wide shadow ${
                      analyzing
                        ? "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400"
                        : "border border-zinc-800 bg-zinc-900 text-white hover:bg-black"
                    }`}
                  >
                    {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                    {analyzing ? "Analizando..." : "Extraer ADN"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-sky-200 bg-white p-4">
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-sky-700">Ingesta empresa (CORE)</p>
                    <p className="mb-3 text-[11px] text-zinc-600">Documentos propios · tono · verdad de marca</p>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingCoreFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingCoreFiles(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingCoreFiles(false);
                        if (e.dataTransfer.files?.length) {
                          setCoreFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
                        }
                      }}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.multiple = true;
                        input.accept = ".pdf,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp";
                        input.onchange = () => {
                          if (input.files?.length) {
                            setCoreFiles((prev) => [...prev, ...Array.from(input.files || [])]);
                          }
                        };
                        input.click();
                      }}
                      className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center ${
                        isDraggingCoreFiles
                          ? "border-sky-400 bg-sky-50"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                      }`}
                    >
                      <Plus className="mb-2 h-7 w-7 text-zinc-400" />
                      <span className="text-[12px] font-semibold text-zinc-700">Arrastra documentos CORE</span>
                      <span className="mt-1 text-[11px] text-zinc-500">PDF · DOCX · TXT · MD · JPG · WEBP · máx {Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024)} MB</span>
                    </div>
                    {coreFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {coreFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-zinc-800">{f.name}</p>
                              <p className="text-[10px] text-zinc-500">{formatSize(f.size)}</p>
                            </div>
                            <button onClick={() => setCoreFiles((p) => p.filter((_, idx) => idx !== i))} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => void handleUpload("core")} disabled={uploadingScope !== null} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">
                          {uploadingScope === "core" ? "Subiendo..." : "Sincronizar Core"}
                        </button>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <input value={urlDraftCore} onChange={(e) => setUrlDraftCore(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddUrl("core"))} placeholder="https://web-empresa.com/recurso" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                      <button onClick={() => void handleAddUrl("core")} disabled={!urlDraftCore || uploadingScope !== null} className="rounded-xl border border-sky-500/50 bg-sky-50 px-3 py-2 text-[11px] font-bold uppercase text-sky-800 disabled:opacity-50">Añadir</button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-white p-4">
                    <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-amber-700">Ingesta contexto (mercado)</p>
                    <p className="mb-3 text-[11px] text-zinc-600">Benchmarks · competencia · informes (no contamina tono)</p>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingContextFiles(true);
                      }}
                      onDragLeave={() => setIsDraggingContextFiles(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingContextFiles(false);
                        if (e.dataTransfer.files?.length) {
                          setContextFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files || [])]);
                        }
                      }}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.multiple = true;
                        input.accept = ".pdf,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp";
                        input.onchange = () => {
                          if (input.files?.length) {
                            setContextFiles((prev) => [...prev, ...Array.from(input.files || [])]);
                          }
                        };
                        input.click();
                      }}
                      className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center ${
                        isDraggingContextFiles
                          ? "border-amber-400 bg-amber-50"
                          : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
                      }`}
                    >
                      <Plus className="mb-2 h-7 w-7 text-zinc-400" />
                      <span className="text-[12px] font-semibold text-zinc-700">Arrastra documentos contexto</span>
                      <span className="mt-1 text-[11px] text-zinc-500">Informes mercado/competencia · máx {Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024)} MB</span>
                    </div>
                    {contextFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {contextFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-zinc-800">{f.name}</p>
                              <p className="text-[10px] text-zinc-500">{formatSize(f.size)}</p>
                            </div>
                            <button onClick={() => setContextFiles((p) => p.filter((_, idx) => idx !== i))} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => void handleUpload("context")} disabled={uploadingScope !== null} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">
                          {uploadingScope === "context" ? "Subiendo..." : "Sincronizar Contexto"}
                        </button>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <input value={urlDraftContext} onChange={(e) => setUrlDraftContext(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddUrl("context"))} placeholder="https://informe-mercado.com/recurso" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                      <button onClick={() => void handleAddUrl("context")} disabled={!urlDraftContext || uploadingScope !== null} className="rounded-xl border border-amber-500/50 bg-amber-50 px-3 py-2 text-[11px] font-bold uppercase text-amber-800 disabled:opacity-50">Añadir</button>
                    </div>
                  </div>
                </div>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">
                        Dirección visual aprendida
                      </h3>
                      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
                        Estas cuatro miniaturas{" "}
                        <span className="font-semibold text-zinc-800">
                          no son copias de tus referencias subidas
                        </span>
                        : son{" "}
                        <span className="font-semibold text-zinc-800">
                          imágenes generadas (Gemini)
                        </span>{" "}
                        a partir del texto de cada bloque, la paleta, la voz (filtrada) y, si hay URLs accesibles, hasta
                        cuatro referencias como guía visual. Tus ~20 fotos analizadas viven en{" "}
                        <button
                          type="button"
                          onClick={() => setActiveTab("visual_refs")}
                          className="font-bold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                        >
                          Referencias visuales
                        </button>{" "}
                        (tabla + agregados). Tras cambiar referencias o textos, pulsa Regenerar o sube imagen manual.
                      </p>
                    </div>
                    {visualStyleRefreshing && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-600">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        refrescando
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {(["protagonist", "environment", "textures", "people"] as BrainVisualStyleSlotKey[]).map(
                      (key) => {
                        const slot = assets.strategy.visualStyle[key];
                        const loading = Boolean(visualStyleLoadingBySlot[key]);
                        const description = slot.description || "";
                        return (
                          <article key={key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">
                              {slot.title}
                            </p>
                            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                              {slot.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={slot.imageUrl}
                                  alt={slot.title}
                                  className="h-36 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-36 w-full items-center justify-center text-[11px] text-zinc-500">
                                  Sin imagen aún
                                </div>
                              )}
                            </div>
                            <textarea
                              value={description}
                              onChange={(e) =>
                                setVisualStyleSlot(key, {
                                  description: e.target.value,
                                  source: "manual",
                                })
                              }
                              placeholder="Describe qué debe representarse en este eje visual..."
                              className="mt-2 h-20 w-full rounded-xl border border-zinc-200 bg-white p-2 text-[12px] text-zinc-800"
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void generateVisualStyleSlotImage(key, true)}
                                disabled={loading || !description.trim()}
                                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
                              >
                                {loading ? "Generando..." : slot.imageUrl ? "Regenerar" : "Generar imagen"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
                                  input.onchange = async () => {
                                    const file = input.files?.[0];
                                    if (!file) return;
                                    try {
                                      const uploaded = await uploadLocalImageForVisualStyle(file);
                                      setVisualStyleSlot(key, {
                                        imageUrl: uploaded.url,
                                        imageS3Key: uploaded.s3Key,
                                        source: "manual",
                                      });
                                      showToast("Imagen manual aplicada al ADN visual.", "success");
                                    } catch (error) {
                                      showToast(
                                        error instanceof Error ? error.message : "No se pudo subir la imagen.",
                                        "error",
                                      );
                                    }
                                  };
                                  input.click();
                                }}
                                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                              >
                                Sustituir desde disco
                              </button>
                            </div>
                          </article>
                        );
                      },
                    )}
                  </div>
                  {visualAggregatedResolved && visualAnalyzedCount > 0 ? (
                    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-900">
                        Señales agregadas desde referencias visuales
                      </p>
                      <div className="mt-3 grid gap-3 text-[11px] leading-snug text-violet-950/90 sm:grid-cols-2 lg:grid-cols-4">
                        <p>
                          <span className="font-bold">Protagonista / sujetos:</span>{" "}
                          {visualAggregatedResolved.frequentSubjects.slice(0, 4).join(", ") || "—"}
                        </p>
                        <p>
                          <span className="font-bold">Entorno / composición:</span>{" "}
                          {visualAggregatedResolved.compositionNotes.slice(0, 4).join(" · ") || "—"}
                        </p>
                        <p>
                          <span className="font-bold">Personas / ropa:</span>{" "}
                          {visualAggregatedResolved.peopleClothingNotes.join(" · ") || "—"}
                        </p>
                        <p>
                          <span className="font-bold">Texturas (lectura agregada):</span>{" "}
                          {visualAggregatedResolved.recurringStyles.filter((s) =>
                            /textura|material|superficie|acabado/i.test(s),
                          ).join(", ") || "—"}
                        </p>
                        <p>
                          <span className="font-bold">Paleta:</span>{" "}
                          {visualAggregatedResolved.dominantPalette.slice(0, 6).join(" ") || "—"}
                        </p>
                        <p>
                          <span className="font-bold">Mood:</span>{" "}
                          {visualAggregatedResolved.dominantMoods.slice(0, 5).join(", ") || "—"}
                        </p>
                        <p>
                          <span className="font-bold">Estilo gráfico:</span>{" "}
                          {(visualAggregatedResolved.graphicStyleNotes ?? []).slice(0, 4).join(" · ") || "—"}
                        </p>
                        <p className="sm:col-span-2 lg:col-span-4">
                          <span className="font-bold">Mensaje visual implícito:</span>{" "}
                          {(visualAggregatedResolved.implicitBrandMessages ?? []).join(" ") ||
                            visualAggregatedResolved.narrativeSummary ||
                            "—"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Inventario de sabiduría · {assets.knowledge.documents.length} activos</h3>
                    <div className="flex flex-wrap gap-2">
                      {filterTabs.map((f) => (
                        <button key={f} onClick={() => setActiveFilter(f)} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${activeFilter === f ? "border-violet-700 bg-violet-700 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {docsFiltered.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-[12px] text-zinc-500">Bandeja vacía.</p>
                  ) : (
                    <ul className="space-y-3">
                      {docsFiltered.map((doc) => (
                        <li key={doc.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {doc.format === "image" ? <ImageIcon className="h-4 w-4 text-zinc-500" /> : doc.format === "url" ? <Globe className="h-4 w-4 text-zinc-500" /> : <FileText className="h-4 w-4 text-zinc-500" />}
                                <p className="truncate text-[12px] font-semibold text-zinc-900">{doc.name}</p>
                                <span className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-zinc-500">{doc.format || "doc"}</span>
                                <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${doc.scope === "context" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>{doc.scope === "context" ? "Contexto" : "Core"}</span>
                              </div>
                              <p className="mt-1 text-[10px] text-zinc-500">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString("es-ES") : "sin fecha"} · {formatSize(doc.size)} · status: {doc.status || "Subido"}</p>
                              {doc.errorMessage && <p className="mt-1 text-[10px] text-rose-600">{doc.errorMessage}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => void handleOpenOriginal(doc)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" />Original</span></button>
                              {doc.status === "Analizado" && doc.extractedContext && (
                                <button onClick={() => toggleExpand(doc.id)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"><span className="inline-flex items-center gap-1">{expandedDocs.has(doc.id) ? <>Colapsar ADN <ChevronUp className="h-3.5 w-3.5" /></> : <>Ver ADN <ChevronDown className="h-3.5 w-3.5" /></>}</span></button>
                              )}
                              <button onClick={() => void handleDelete(doc.id)} disabled={isDeleting === doc.id} className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Eliminar">{isDeleting === doc.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                            </div>
                          </div>
                          {doc.status === "Analizado" && doc.extractedContext && expandedDocs.has(doc.id) && (
                            <div className="mt-3 border-t border-zinc-200 pt-3">
                              {editingDocId === doc.id ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-wide text-zinc-600">Editando ADN</p>
                                    <div className="flex gap-2">
                                      <button onClick={() => setEditingDocId(null)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><XIcon className="h-3.5 w-3.5" />Cancelar</span></button>
                                      <button onClick={() => void handleSaveAdn(doc.id)} className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-black"><span className="inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" />Guardar</span></button>
                                    </div>
                                  </div>
                                  <textarea value={JSON.stringify(editForm, null, 2)} onChange={(e) => { try { setEditForm(JSON.parse(e.target.value)); } catch { setEditForm({ raw: e.target.value }); } }} className="h-56 w-full rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[12px] text-zinc-900 outline-none focus:border-sky-500" />
                                </div>
                              ) : (
                                <div>
                                  <div className="mb-2 flex justify-end">
                                    <button onClick={() => startEditing(doc)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 hover:bg-zinc-100"><span className="inline-flex items-center gap-1"><Edit3 className="h-3.5 w-3.5" />Editar matriz</span></button>
                                  </div>
                                  {doc.insights && (
                                    <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                                      <article className="rounded-xl border border-zinc-200 bg-white p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Claims extraídos</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {doc.insights.claims.length === 0 && <span className="text-[10px] text-zinc-500">Sin claims</span>}
                                          {doc.insights.claims.map((x, i) => <span key={`${doc.id}-c-${i}`} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800">{x}</span>)}
                                        </div>
                                      </article>
                                      <article className="rounded-xl border border-zinc-200 bg-white p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Métricas detectadas</p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {doc.insights.metrics.length === 0 && <span className="text-[10px] text-zinc-500">Sin métricas</span>}
                                          {doc.insights.metrics.map((x, i) => <span key={`${doc.id}-m-${i}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800">{x}</span>)}
                                        </div>
                                      </article>
                                      <article className="rounded-xl border border-zinc-200 bg-white p-2.5 lg:col-span-2">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Uso potencial · frescura · fiabilidad · piezas usadas</p>
                                        <p className="mt-1 text-[11px] text-zinc-700">
                                          Uso: {(doc.insights.potentialUse || []).join(" · ") || "No definido"}.
                                          Frescura: {doc.insights.freshness || "sin fecha"}.
                                          Fiabilidad: {doc.insights.reliability || 0}/100.
                                          Piezas: {(doc.insights.usedInPieces || []).length}.
                                        </p>
                                      </article>
                                    </div>
                                  )}
                                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">JSON ADN</p>
                                  <pre className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800">{doc.extractedContext}</pre>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex items-start gap-2">
                    <span className="mt-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-600"><MessageSquareText className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Conversar con Brain</h3>
                      <p className="mt-1 text-[11px] text-zinc-600">Responde solo con contenido subido y analizado.</p>
                    </div>
                  </div>

                  <div className="max-h-[300px] space-y-2 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    {chatMessages.map((m) => (
                      <article key={m.id} className={`rounded-xl border px-3 py-2 ${m.role === "user" ? "ml-8 border-sky-200 bg-sky-50" : "mr-8 border-zinc-200 bg-white"}`}>
                        <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">{m.role === "user" ? "Tú" : "Brain"}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{m.text}</p>
                        {m.sources && m.sources.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.sources.map((s) => <span key={`${m.id}-${s.id}`} className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">{s.name}</span>)}</div>}
                        {m.suggestedUploads && m.suggestedUploads.length > 0 && <div className="mt-2"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Ideas para subir más</p><div className="mt-1 flex flex-wrap gap-1.5">{m.suggestedUploads.map((s, idx) => <span key={`${m.id}-${idx}`} className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">{s}</span>)}</div></div>}
                      </article>
                    ))}
                    {chatLoading && <article className="mr-8 rounded-xl border border-zinc-200 bg-white px-3 py-2"><p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Brain</p><p className="mt-1 inline-flex items-center gap-2 text-[12px] text-zinc-700"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Pensando...</p></article>}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void submitChatQuestion())} placeholder="Pregunta sobre el contenido de Brain..." className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px]" />
                    <button onClick={() => void submitChatQuestion()} disabled={chatLoading || !chatInput.trim()} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />Enviar</button>
                  </div>
                </section>
              </>
            )}

            {activeTab === "voice" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Ejemplos reales de voz</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">El modelo aprende por analogía: ejemplos aprobados/prohibidos y piezas reales.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select value={voiceKind} onChange={(e) => setVoiceKind(e.target.value as BrainVoiceExample["kind"])} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="approved_voice">Voz aprobada</option>
                      <option value="forbidden_voice">Voz prohibida</option>
                      <option value="good_piece">Pieza que sí suena</option>
                      <option value="bad_piece">Pieza que NO suena</option>
                    </select>
                    <input value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="Añade frase o ejemplo real" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <button onClick={addVoiceExample} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.voiceExamples.length === 0 && <p className="text-[12px] text-zinc-500">Aún no hay ejemplos guardados.</p>}
                    {assets.strategy.voiceExamples.map((v) => (
                      <div key={v.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{v.kind}</span>
                          <button onClick={() => removeVoiceExample(v.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-zinc-800">{v.text}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Tabús y frases aprobadas</h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Tabú de marca</p>
                      <div className="flex gap-2">
                        <input value={newTaboo} onChange={(e) => setNewTaboo(e.target.value)} placeholder="frase a evitar" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addTagItem("taboo", newTaboo); setNewTaboo(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.tabooPhrases.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeTagItem("taboo", i)} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Frases aprobadas</p>
                      <div className="flex gap-2">
                        <input value={newApprovedPhrase} onChange={(e) => setNewApprovedPhrase(e.target.value)} placeholder="frase aprobada" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addTagItem("approved", newApprovedPhrase); setNewApprovedPhrase(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.approvedPhrases.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeTagItem("approved", i)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{x} ×</button>)}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Ingeniería de voz (funcional)</h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Rasgos de lenguaje</p>
                      <div className="flex gap-2">
                        <input value={newLanguageTrait} onChange={(e) => setNewLanguageTrait(e.target.value)} placeholder="ej: directo, preciso, anti-humo" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("languageTraits", newLanguageTrait); setNewLanguageTrait(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.languageTraits.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("languageTraits", i)} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] text-indigo-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Patrones de sintaxis</p>
                      <div className="flex gap-2">
                        <input value={newSyntaxPattern} onChange={(e) => setNewSyntaxPattern(e.target.value)} placeholder="ej: frases cortas + cierre accionable" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("syntaxPatterns", newSyntaxPattern); setNewSyntaxPattern(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.syntaxPatterns.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("syntaxPatterns", i)} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Términos preferidos</p>
                      <div className="flex gap-2">
                        <input value={newPreferredTerm} onChange={(e) => setNewPreferredTerm(e.target.value)} placeholder="ej: control creativo, flujo unificado" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("preferredTerms", newPreferredTerm); setNewPreferredTerm(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.preferredTerms.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("preferredTerms", i)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">{x} ×</button>)}</div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-600">Términos prohibidos</p>
                      <div className="flex gap-2">
                        <input value={newForbiddenTerm} onChange={(e) => setNewForbiddenTerm(e.target.value)} placeholder="ej: mejor del mundo, garantía total" className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                        <button onClick={() => { addStringListItem("forbiddenTerms", newForbiddenTerm); setNewForbiddenTerm(""); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.forbiddenTerms.map((x, i) => <button key={`${x}-${i}`} onClick={() => removeStringListItem("forbiddenTerms", i)} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">{x} ×</button>)}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-600">Intensidad por canal</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input value={channelIntensityName} onChange={(e) => setChannelIntensityName(e.target.value)} placeholder="LinkedIn, Email, Instagram..." className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                        <input type="number" min={0} max={100} value={channelIntensityValue} onChange={(e) => setChannelIntensityValue(Number(e.target.value) || 0)} className="w-20 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-[12px]" />
                        <button onClick={addChannelIntensity} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir</button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {assets.strategy.channelIntensity.map((x, i) => (
                          <div key={`${x.channel}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px]">
                            <span>{x.channel}</span>
                            <span className="inline-flex items-center gap-2"><strong>{x.intensity}%</strong><button onClick={() => removeChannelIntensity(i)} className="text-rose-600">×</button></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-zinc-600">Claims absolutos</p>
                      <div className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                        <span className="text-[12px] text-zinc-700">Permitir absolutos (“el mejor”, “siempre”)</span>
                        <button onClick={() => setStrategy({ allowAbsoluteClaims: !assets.strategy.allowAbsoluteClaims })} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${assets.strategy.allowAbsoluteClaims ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-zinc-300 bg-zinc-100 text-zinc-700"}`}>
                          {assets.strategy.allowAbsoluteClaims ? "Permitidos" : "Bloqueados"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "personas" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Personas de audiencia</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">Mostramos solo las personas relevantes para este proyecto. El resto está en “+ Nueva persona”.</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {assets.strategy.personas.length === 0 && <p className="text-[12px] text-zinc-500">No hay personas aún.</p>}
                    {assets.strategy.personas.map((p) => (
                      <article key={p.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[13px] font-black text-zinc-900">{p.name}</h4>
                          <button onClick={() => removePersona(p.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-600">Dolor: {p.pain || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Canal: {p.channel || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Sofisticación: {p.sophistication || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Objeciones: {(p.objections || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Prueba necesaria: {(p.proofNeeded || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Disparadores: {(p.attentionTriggers || []).slice(0, 2).join(" · ") || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">Sofisticación mercado: {p.marketSophistication || "-"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">{p.tags.map((t, i) => <span key={`${p.id}-${t}-${i}`} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600">{t}</span>)}</div>
                      </article>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPersonaModalOpen(true)}
                      className="flex min-h-[182px] items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-lg font-semibold text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
                    >
                      + Nueva persona
                    </button>
                  </div>
                </section>

                {personaModalOpen && (
                  <div className="fixed inset-0 z-[100120] flex items-center justify-center bg-black/40 p-4">
                    <div className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-900">Añadir Nueva Persona</h4>
                          <p className="mt-1 text-[12px] text-zinc-600">Selecciona del catálogo restante o crea una persona manual.</p>
                        </div>
                        <button onClick={() => setPersonaModalOpen(false)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700">
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {personaCatalogRemaining.length === 0 && (
                          <p className="text-[12px] text-zinc-500">No quedan perfiles predefinidos por adjuntar.</p>
                        )}
                        {personaCatalogRemaining.map((persona) => (
                          <article key={persona.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="text-[13px] font-black text-zinc-900">{persona.name}</h5>
                              <button
                                onClick={() => addCatalogPersona(persona)}
                                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
                              >
                                Adjuntar
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-600">{persona.pain}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {[...persona.tags, persona.channel].slice(0, 4).map((tag, i) => (
                                <span key={`${persona.id}-${tag}-${i}`} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>

                      <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <h5 className="text-[12px] font-black uppercase tracking-[0.12em] text-zinc-900">Creación manual (opción B)</h5>
                        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="Nombre persona" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaPain} onChange={(e) => setPersonaPain(e.target.value)} placeholder="Dolor principal" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaChannel} onChange={(e) => setPersonaChannel(e.target.value)} placeholder="Canal principal" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaSophistication} onChange={(e) => setPersonaSophistication(e.target.value)} placeholder="Nivel de sofisticación" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaMarketSophistication} onChange={(e) => setPersonaMarketSophistication(e.target.value)} placeholder="Sofisticación del mercado" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px]" />
                          <input value={personaTags} onChange={(e) => setPersonaTags(e.target.value)} placeholder="Tags (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaObjections} onChange={(e) => setPersonaObjections(e.target.value)} placeholder="Objeciones (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaProofNeeded} onChange={(e) => setPersonaProofNeeded(e.target.value)} placeholder="Prueba que necesita (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                          <input value={personaAttentionTriggers} onChange={(e) => setPersonaAttentionTriggers(e.target.value)} placeholder="Disparadores de atención (coma separada)" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] lg:col-span-2" />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button onClick={addPersona} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir persona manual</button>
                        </div>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "messages" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Matriz de mensajes (claim + soporte)</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <input value={messageClaimDraft} onChange={(e) => setMessageClaimDraft(e.target.value)} placeholder="Claim" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageSupportDraft} onChange={(e) => setMessageSupportDraft(e.target.value)} placeholder="Soporte" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageAudienceDraft} onChange={(e) => setMessageAudienceDraft(e.target.value)} placeholder="Audiencia" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageChannelDraft} onChange={(e) => setMessageChannelDraft(e.target.value)} placeholder="Canal" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <select value={funnelStageDraft} onChange={(e) => setFunnelStageDraft(e.target.value as "awareness" | "consideration" | "conversion" | "retention")} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="awareness">Awareness</option>
                      <option value="consideration">Consideración</option>
                      <option value="conversion">Conversión</option>
                      <option value="retention">Retención</option>
                    </select>
                    <input value={messageCtaDraft} onChange={(e) => setMessageCtaDraft(e.target.value)} placeholder="CTA" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={messageEvidenceDraft} onChange={(e) => setMessageEvidenceDraft(e.target.value)} placeholder="Evidencia asociada (coma separada)" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] lg:col-span-2" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={addMessageBlueprint} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Añadir fila de matriz</button>
                    <button onClick={addFunnelMessage} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700">Añadir mensaje simple</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.messageBlueprints.map((m) => (
                      <div key={m.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">{m.stage}</span>
                          <button onClick={() => removeMessageBlueprint(m.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="mt-1 text-[12px] text-zinc-900"><strong>Claim:</strong> {m.claim}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Soporte:</strong> {m.support || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Audiencia:</strong> {m.audience || "-"} · <strong>Canal:</strong> {m.channel || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>CTA:</strong> {m.cta || "-"}</p>
                        <p className="mt-1 text-[11px] text-zinc-700"><strong>Evidencia:</strong> {(m.evidence || []).join(" | ") || "-"}</p>
                      </div>
                    ))}
                    {assets.strategy.funnelMessages.length > 0 && (
                      <details className="rounded-xl border border-zinc-200 bg-white p-2.5">
                        <summary className="cursor-pointer text-[11px] font-semibold text-zinc-700">Mensajes simples legacy ({assets.strategy.funnelMessages.length})</summary>
                        <div className="mt-2 space-y-2">
                          {assets.strategy.funnelMessages.map((m) => (
                            <div key={m.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">{m.stage}</span>
                                <button onClick={() => removeFunnelMessage(m.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                              <p className="mt-1 text-[12px] text-zinc-800">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Briefing estructurado (antes de generar)</h3>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    Fuentes oficiales activas para generación: {filteredFactsForGeneration.length} (según filtros de “Hechos y pruebas”).
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <input value={briefObjective} onChange={(e) => setBriefObjective(e.target.value)} placeholder="Objetivo de la pieza" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <input value={briefChannel} onChange={(e) => setBriefChannel(e.target.value)} placeholder="Canal (LinkedIn, blog, etc.)" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" />
                    <select value={briefPersonaId} onChange={(e) => setBriefPersonaId(e.target.value)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="">Selecciona persona</option>
                      {assets.strategy.personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select value={briefFunnel} onChange={(e) => setBriefFunnel(e.target.value as "awareness" | "consideration" | "conversion" | "retention")} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]">
                      <option value="awareness">Awareness</option>
                      <option value="consideration">Consideración</option>
                      <option value="conversion">Conversión</option>
                      <option value="retention">Retención</option>
                    </select>
                    <textarea value={briefAsk} onChange={(e) => setBriefAsk(e.target.value)} placeholder="Instrucción adicional (opcional)" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] lg:col-span-2" rows={3} />
                  </div>
                  <button onClick={() => void generateWithBriefing()} disabled={generatingPiece} className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50">{generatingPiece ? "Generando..." : "Crear pieza con este ADN"}</button>
                </section>

                {generatedPreview && (
                  <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Modo crítico automático</h3>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Score {generatedPreview.score}/100</span>
                    </div>
                    {generatedPreview.issues.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{generatedPreview.issues.map((i, idx) => <span key={`${i}-${idx}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">{i}</span>)}</div>}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Borrador inicial</p>
                        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{generatedPreview.draft}</pre>
                      </article>
                      <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Versión revisada</p>
                        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-800">{generatedPreview.revised}</pre>
                      </article>
                    </div>
                    <article className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Crítica</p>
                      <p className="text-[12px] leading-relaxed text-zinc-800">{generatedPreview.critique}</p>
                    </article>
                    <div className="mt-3">
                      <textarea value={pieceFeedbackNote} onChange={(e) => setPieceFeedbackNote(e.target.value)} placeholder="Nota del equipo (opcional)" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]" rows={2} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => registerLearning("approved")} className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Aprobar y aprender</button>
                        <button onClick={() => registerLearning("rejected")} className="rounded-xl border border-rose-600 bg-rose-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white">Rechazar y aprender</button>
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Bucle de aprendizaje</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">Lo aprobado y rechazado vuelve al ADN para afinar futuras piezas.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Patrones aprobados</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.approvedPatterns.slice(0, 20).map((p, i) => <span key={`${p}-${i}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">{p}</span>)}</div>
                    </article>
                    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Patrones a evitar</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{assets.strategy.rejectedPatterns.slice(0, 20).map((p, i) => <span key={`${p}-${i}`} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">{p}</span>)}</div>
                    </article>
                  </div>
                  <div className="mt-3 space-y-2">
                    {assets.strategy.generatedPieces.slice(0, 8).map((g) => (
                      <article key={g.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-zinc-800">{g.objective || "Pieza"}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.status === "approved" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : g.status === "rejected" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-zinc-200 bg-white text-zinc-600"}`}>{g.status}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">{new Date(g.createdAt).toLocaleString("es-ES")} · {g.channel} · {g.funnelStage}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "facts" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[0.12em] text-zinc-900">Hechos y pruebas</h3>
                  <p className="mt-1 text-[12px] text-zinc-600">
                    Este módulo separa afirmaciones verificadas vs interpretadas y muestra el respaldo documental.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <select
                      value={factsVerificationFilter}
                      onChange={(e) => setFactsVerificationFilter(e.target.value as "all" | "verified" | "interpreted")}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <option value="all">Verificación: Todas</option>
                      <option value="verified">Verificación: Solo verificadas</option>
                      <option value="interpreted">Verificación: Solo interpretadas</option>
                    </select>
                    <select
                      value={factsStrengthFilter}
                      onChange={(e) => setFactsStrengthFilter(e.target.value as "all" | "fuerte" | "media" | "debil")}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <option value="all">Fuerza: Todas</option>
                      <option value="fuerte">Fuerza: Fuerte</option>
                      <option value="media">Fuerza: Media</option>
                      <option value="debil">Fuerza: Débil</option>
                    </select>
                    <button
                      onClick={() => { setFactsVerificationFilter("verified"); setFactsStrengthFilter("fuerte"); }}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-700"
                    >
                      Reset recomendado
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    {filteredFactsForGeneration.length === 0 && (
                      <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-[12px] text-zinc-500">
                        Aún no hay hechos detectados. Ejecuta “Analizar documentos”.
                      </p>
                    )}
                    {filteredFactsForGeneration.map((f) => (
                      <article key={f.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                            {f.verified ? "Verificado" : "Interpretado"}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${f.strength === "fuerte" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : f.strength === "media" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                            Fuerza: {f.strength}
                          </span>
                        </div>
                        <p className="mt-2 text-[12px] font-semibold text-zinc-900">{f.claim}</p>
                        <p className="mt-1 text-[11px] text-zinc-700">
                          Evidencia: {f.evidence.length > 0 ? f.evidence.join(" | ") : "Sin evidencia explícita"}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          Fuentes: {f.sourceDocIds.length > 0 ? f.sourceDocIds.join(", ") : "sin fuente id"}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
        </main>

        <aside className="hidden w-[min(380px,34vw)] shrink-0 flex-col gap-4 overflow-y-auto rounded-[22px] border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90 p-5 shadow-sm xl:flex">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Próximas acciones</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("review")}
                  className="rounded-xl border border-violet-600 bg-violet-600 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-white px-3"
                >
                  Revisar bandeja · {pendingLearnings.length}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("visual_refs")}
                  className="rounded-xl border border-zinc-300 bg-white py-2.5 text-left text-[11px] font-bold text-zinc-800 px-3 hover:bg-zinc-50"
                >
                  Completar referencias visuales
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("knowledge")}
                  className="rounded-xl border border-zinc-300 bg-white py-2.5 text-left text-[11px] font-bold text-zinc-800 px-3 hover:bg-zinc-50"
                >
                  Subir o analizar fuentes CORE
                </button>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">Tres focos que suben el ADN</p>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-amber-950/90">
                  <li>· Añade hechos verificados y mensajes con evidencia.</li>
                  <li>· Marca referencias visuales como CORE cuando encajen.</li>
                  <li>· Conecta nodos creativos al Brain para captar señales reales.</li>
                </ul>
              </div>
            </div>
          )}
          {activeTab === "dna" && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Resumen ADN</p>
              <p className="text-2xl font-black text-violet-800" title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}>
                {adn.total}
                <span className="text-sm font-semibold text-zinc-500">/100</span>
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Puntuación de completitud (heurística) a partir de voz, personas, mensajes y documentos de contexto
                analizados. No mide calidad creativa absoluta.
              </p>
            </div>
          )}
          {activeTab === "visual_refs" && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Paleta dominante (agregada)</p>
              <div className="flex flex-wrap gap-2">
                {(visualAggregatedResolved?.dominantPalette ?? []).slice(0, 10).map((hex) => (
                  <span
                    key={hex}
                    title={hex}
                    className="h-9 w-9 rounded-full border border-zinc-200 shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                ))}
                {!visualAggregatedResolved?.dominantPalette?.length && (
                  <p className="text-[11px] text-zinc-500">Analiza referencias para ver swatches.</p>
                )}
              </div>
              <button
                type="button"
                disabled={visualReanalyzing || visualImageRefCount === 0}
                onClick={() => void handleReanalyzeVisualRefs()}
                className="w-full rounded-xl border border-zinc-900 bg-zinc-900 py-2.5 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-50"
              >
                {visualReanalyzing ? "Reanalizando…" : "Reanalizar referencias"}
              </button>
              {visualReferenceAnalysisDirty ? (
                <p className="text-[10px] leading-snug text-amber-900">
                  Análisis actualizado en memoria — guarda el proyecto para conservarlo.
                </p>
              ) : null}
            </div>
          )}
          {activeTab === "connected_nodes" && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Señales por nodo</p>
              <ul className="space-y-2 text-[11px] text-zinc-700">
                {brainClients.map((c) => {
                  const tel = telemetryByNodeId[c.id];
                  const pendN = pendingByNodeId.get(c.id) ?? 0;
                  const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                    summaryLine: tel?.summaryLine ?? null,
                    lastAt: tel?.lastAt ?? null,
                    pendingCount: pendN,
                    expanded: true,
                  });
                  return (
                    <li key={c.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <span className="font-bold text-zinc-900">{c.label}</span>
                      <span className="text-zinc-500"> · {labelForBrainNodeSource(c.brainNodeType)}</span>
                      <span className="mt-1 block text-[10px] text-zinc-600" title={BRAIN_RECENT_SIGNALS_TOOLTIP_ES}>
                        {signalsLine}
                      </span>
                      {pendingLine ? (
                        <span className="mt-0.5 block text-[10px] text-zinc-700" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
                          {pendingLine}
                        </span>
                      ) : null}
                      {lastSignalLine ? (
                        <span className="mt-0.5 block text-[9px] text-zinc-500">{lastSignalLine}</span>
                      ) : null}
                    </li>
                  );
                })}
                {brainClients.length === 0 && <li className="text-zinc-500">Sin nodos enlazados aún.</li>}
              </ul>
              {process.env.NODE_ENV === "development" ? (
                <p className="text-[9px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
              ) : null}
            </div>
          )}
          {activeTab === "review" && (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Filtrar origen</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "Todos"],
                    ["visual", "Visual / Imagen"],
                    ["designer", "Designer"],
                    ["photoroom", "Photoroom"],
                    ["article", "Artículos"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setReviewSourceFilter(id)}
                    className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${
                      reviewSourceFilter === id
                        ? "border-violet-700 bg-violet-700 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                {pendingFiltered.length} de {pendingLearnings.length} visibles con el filtro actual.
              </p>
            </div>
          )}
          {activeTab === "knowledge" && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Estado de análisis</p>
              <p className="text-[12px] text-zinc-800">
                {analyzedCount} fuentes analizadas de {assets.knowledge.documents.length} activas.
              </p>
              <p className="text-[11px] text-zinc-600">
                Sube PDFs CORE para tono y ADN; usa contexto para mercado sin mezclar voz.
              </p>
            </div>
          )}
          {(activeTab === "voice" ||
            activeTab === "personas" ||
            activeTab === "messages" ||
            activeTab === "facts") && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Modo editorial</p>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Estas vistas son para afinar detalle. El pulso del Brain está en «Resumen» y «Por revisar».
              </p>
            </div>
          )}
        </aside>

        {signalModalClient && (
          <div
            className="fixed inset-0 z-[100110] flex items-end justify-center bg-black/45 p-4 pb-8 backdrop-blur-[2px] sm:items-center sm:pb-4"
            role="presentation"
            onClick={() => setSignalModalClient(null)}
            onKeyDown={(e) => e.key === "Escape" && setSignalModalClient(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="brain-signals-title"
              className="max-h-[min(520px,86vh)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-zinc-200 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="brain-signals-title" className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                    Señales recibidas
                  </p>
                  <p className="text-lg font-black text-zinc-900">{signalModalClient.label}</p>
                  <p className="text-[11px] text-zinc-500">{labelForBrainNodeSource(signalModalClient.brainNodeType)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSignalModalClient(null)}
                  className="rounded-xl border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-100"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(() => {
                const tel = telemetryByNodeId[signalModalClient.id];
                const pendN = pendingByNodeId.get(signalModalClient.id) ?? 0;
                const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
                  summaryLine: tel?.summaryLine ?? null,
                  lastAt: tel?.lastAt ?? null,
                  pendingCount: pendN,
                  expanded: true,
                });
                const pendingForNode = pendingLearnings.filter((row) =>
                  learningRowMatchesCanvasNode(row, signalModalClient.id, signalModalClient.brainNodeType),
                );
                return (
                  <div className="mt-4 space-y-4 text-[12px] text-zinc-800">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Señales recientes</p>
                      <p className="mt-1 font-semibold text-zinc-900">{signalsLine}</p>
                      {lastSignalLine ? <p className="mt-1 text-[11px] text-zinc-500">{lastSignalLine}</p> : null}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                        Aprendizajes en revisión
                      </p>
                      {pendingLine ? (
                        <p className="mt-1 font-semibold text-zinc-900">{pendingLine}</p>
                      ) : (
                        <p className="mt-1 text-zinc-600">Ninguno pendiente de este nodo.</p>
                      )}
                      {pendingForNode.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-[11px] text-zinc-700">
                          {pendingForNode.slice(0, 6).map((row) => (
                            <li key={row.id} className="leading-snug">
                              · {row.candidate.value.trim().slice(0, 160)}
                              {row.candidate.value.trim().length > 160 ? "…" : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSignalModalClient(null);
                        setActiveTab("review");
                      }}
                      className="w-full rounded-xl border border-violet-600 bg-violet-600 py-2.5 text-[11px] font-black uppercase tracking-wide text-white hover:bg-violet-700"
                    >
                      Ir a Por revisar
                    </button>
                    {process.env.NODE_ENV === "development" ? (
                      <p className="text-[10px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
                    ) : null}
                    <p className="text-[10px] text-zinc-400">
                      Nodo en lienzo · {signalModalClient.id}
                      {projectId?.trim() ? ` · Proyecto ${projectId.trim()}` : ""}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-[11px] text-zinc-600 sm:px-6">
        <p>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />{" "}
          {analyzedCount} activos analizados · ADN listo para generación
        </p>
        <p>Los datos de Brain se guardan con el proyecto al pulsar Guardar.</p>
      </footer>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
