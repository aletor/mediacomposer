"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Brain, Link2 } from "lucide-react";
import { BRAIN_ADN_COMPLETENESS_TOOLTIP_ES, computeAdnScore } from "@/lib/brain/brain-adn-score";
import { listDownstreamBrainClients } from "@/lib/brain/brain-canvas-brain-links";
import { collectVisualImageAssetRefs } from "@/lib/brain/brain-visual-analysis";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import {
  BRAIN_IMAGE_INVENTORY_NODE_TOOLTIP_ES,
  BRAIN_PENDING_QUEUE_TOOLTIP_ES,
  BRAIN_RECENT_SIGNALS_TOOLTIP_ES,
  BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES,
  BRAIN_VISION_REAL_COUNT_NODE_TOOLTIP_ES,
  buildPendingCountByNodeId,
  connectedNodeSignalsCopy,
  learningRowMatchesCanvasNode,
} from "@/lib/brain/brain-connected-signals-ui";
import { countVisualImageAnalysisDisposition } from "@/lib/brain/brain-learning-provenance";
import { fetchBrainTelemetrySummaryByNodeId } from "@/lib/brain/fetch-brain-telemetry-summary";
import { labelForBrainNodeSource, stripLearningValueUiPrefixes } from "@/lib/brain/brain-review-labels";
import { readResponseJson } from "@/lib/read-response-json";
import { FoldderDataHandle } from "./FoldderDataHandle";
import { NodeLabel } from "./foldder-node-ui";
import { normalizeProjectAssets } from "./project-assets-metadata";
import { useProjectBrainCanvas } from "./project-brain-canvas-context";

export type ProjectBrainNodeData = {
  label?: string;
};

type TelemetryRowUi = { summaryLine: string | null; lastAt: string | null };

function BrainNodeHeader({
  adnTotal,
  introActive,
}: {
  adnTotal: number;
  introActive: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-2 border-b border-zinc-200/80 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 ${
            introActive ? "ring-2 ring-cyan-400/50" : ""
          }`}
        >
          <Brain className="h-4 w-4 text-violet-700" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[12px] font-black uppercase tracking-[0.08em] text-zinc-900">Brain</h2>
            <span className="rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-zinc-600">
              Project
            </span>
          </div>
          <p className="text-[10px] font-medium text-zinc-500">Memoria creativa</p>
        </div>
      </div>
      <div
        className="shrink-0 rounded-xl border border-violet-100 bg-violet-50 px-2.5 py-1 text-center"
        title={BRAIN_ADN_COMPLETENESS_TOOLTIP_ES}
      >
        <p className="text-[8px] font-black uppercase tracking-wide text-violet-700">ADN</p>
        <p className="text-lg font-black leading-none text-violet-900">{adnTotal}</p>
      </div>
    </header>
  );
}

function BrainQuickStats({ activos, nodos, pendientes }: { activos: number; nodos: number; pendientes: number }) {
  return (
    <p
      className="text-[11px] font-semibold tabular-nums leading-snug text-zinc-800"
      title="Activos = documentos y enlaces en conocimiento. Nodos = creativos enlazados al Brain. Por revisar = cola de aprendizajes pendientes (ver procedencia en Studio)."
    >
      {activos} activos · {nodos} nodos · {pendientes} por revisar
    </p>
  );
}

function BrainBrandChips({
  hasLogo,
  hasPalette,
  hasVoice,
  imageCount,
  visionRealCount,
}: {
  hasLogo: boolean;
  hasPalette: boolean;
  hasVoice: boolean;
  imageCount: number;
  visionRealCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasLogo ? (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">
          Logo
        </span>
      ) : null}
      {hasPalette ? (
        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-900">
          Paleta
        </span>
      ) : null}
      {hasVoice ? (
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-900">
          Voz
        </span>
      ) : null}
      {imageCount > 0 ? (
        <span
          title={BRAIN_IMAGE_INVENTORY_NODE_TOOLTIP_ES}
          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-900"
        >
          {imageCount} imágenes
        </span>
      ) : null}
      {visionRealCount > 0 ? (
        <span
          title={BRAIN_VISION_REAL_COUNT_NODE_TOOLTIP_ES}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900"
        >
          {visionRealCount} analizadas
        </span>
      ) : null}
    </div>
  );
}

function BrainConnectedNodesSummary({
  clients,
  expanded,
  pendingByNodeId,
  telemetryByNodeId,
}: {
  clients: ReturnType<typeof listDownstreamBrainClients>;
  expanded: boolean;
  pendingByNodeId: Map<string, number>;
  telemetryByNodeId: Record<string, TelemetryRowUi>;
}) {
  if (clients.length === 0) {
    return (
      <p className="text-[10px] leading-snug text-zinc-500">
        Ningún nodo enlazado al puerto Brain. Conecta Designer, Photoroom u otros creativos.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {clients.map((c) => {
        const tel = telemetryByNodeId[c.id];
        const pendN = pendingByNodeId.get(c.id) ?? 0;
        const typeLabel = labelForBrainNodeSource(c.brainNodeType);
        const { signalsLine, pendingLine, lastSignalLine } = connectedNodeSignalsCopy({
          summaryLine: tel?.summaryLine ?? null,
          lastAt: tel?.lastAt ?? null,
          pendingCount: pendN,
          expanded,
        });
        return (
          <li key={c.id} className="text-[10px] leading-snug text-zinc-800">
            <div className="font-bold text-zinc-900">{c.label}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{typeLabel}</div>
            <div className="mt-0.5 text-zinc-800" title={BRAIN_RECENT_SIGNALS_TOOLTIP_ES}>
              {signalsLine}
            </div>
            {pendingLine ? (
              <div className="mt-0.5 text-zinc-700" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
                {pendingLine}
              </div>
            ) : null}
            {lastSignalLine ? <div className="mt-0.5 text-zinc-500">{lastSignalLine}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function BrainPendingSummary({
  count,
  samples,
}: {
  count: number;
  samples: string[];
}) {
  if (count === 0) {
    return (
      <p className="text-[11px] font-semibold text-emerald-800" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
        Sin pendientes
      </p>
    );
  }
  return (
    <div className="space-y-1" title={BRAIN_PENDING_QUEUE_TOOLTIP_ES}>
      <p className="text-[11px] font-bold text-amber-900">
        {count} {count === 1 ? "aprendizaje pendiente" : "aprendizajes pendientes"}
      </p>
      {samples.length > 0 && (
        <ul className="space-y-0.5 text-[10px] leading-snug text-amber-950/90">
          {samples.map((s, i) => (
            <li key={i} className="truncate">
              · {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ProjectBrainNode = memo(({ id, data, selected }: NodeProps<any>) => {
  const nodeData = data as ProjectBrainNodeData;
  const ctx = useProjectBrainCanvas();
  const assets = useMemo(() => normalizeProjectAssets(ctx?.assetsMetadata), [ctx?.assetsMetadata]);
  const adn = useMemo(() => computeAdnScore(assets), [assets]);

  const pdfCount = assets.knowledge.documents.filter((d) => d.mime === "application/pdf").length;
  const coreCount = assets.knowledge.documents.filter((d) => d.scope !== "context").length;
  const contextCount = assets.knowledge.documents.filter((d) => d.scope === "context").length;
  const linkCount = assets.knowledge.urls.length;
  const imageDocCount = assets.knowledge.documents.filter((d) => d.mime.toLowerCase().startsWith("image/")).length;
  const visualRefCount = useMemo(() => collectVisualImageAssetRefs(assets).length, [assets]);
  const visionDisposition = useMemo(
    () => countVisualImageAnalysisDisposition(assets.strategy.visualReferenceAnalysis?.analyses),
    [assets.strategy.visualReferenceAnalysis?.analyses],
  );
  const assetLikeCount = imageDocCount + visualRefCount;

  const hasLogo = Boolean(assets.brand.logoPositive || assets.brand.logoNegative);
  const hasPalette = [assets.brand.colorPrimary, assets.brand.colorSecondary, assets.brand.colorAccent].some(
    (c) => typeof c === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(c.trim()),
  );
  const hasVoice =
    assets.strategy.voiceExamples.length +
      assets.strategy.approvedPhrases.length +
      assets.strategy.languageTraits.length >
    0;

  const brainClients = useMemo(
    () => listDownstreamBrainClients(ctx?.flowNodes ?? undefined, ctx?.flowEdges ?? undefined),
    [ctx?.flowNodes, ctx?.flowEdges],
  );

  const totalActives = assets.knowledge.documents.length + assets.knowledge.urls.length;

  const [pendingRows, setPendingRows] = useState<StoredLearningCandidate[]>([]);
  const [telemetryByNodeId, setTelemetryByNodeId] = useState<Record<string, TelemetryRowUi>>({});

  const projectId = ctx?.projectScopeId && ctx.projectScopeId !== "__local__" ? ctx.projectScopeId : null;

  useEffect(() => {
    if (!projectId?.trim()) {
      setPendingRows([]);
      setTelemetryByNodeId({});
      return;
    }
    const clientIds = brainClients.map((c) => c.id).filter(Boolean);
    let cancelled = false;
    (async () => {
      try {
        const pendUrl = `/api/spaces/brain/learning/pending?projectId=${encodeURIComponent(projectId.trim())}`;
        const [pRes, telMap] = await Promise.all([
          fetch(pendUrl),
          clientIds.length > 0
            ? fetchBrainTelemetrySummaryByNodeId(projectId.trim(), clientIds)
            : Promise.resolve({} as Record<string, TelemetryRowUi>),
        ]);
        if (cancelled) return;
        const pJson = await readResponseJson<{ items?: StoredLearningCandidate[] }>(pRes, "brain/pending");
        const items = pJson?.items ?? [];
        setPendingRows(items);

        if (cancelled) return;
        setTelemetryByNodeId(telMap);
      } catch {
        if (!cancelled) {
          setPendingRows([]);
          setTelemetryByNodeId({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, ctx?.assetsMetadata, brainClients]);

  const pendingByNodeId = useMemo(() => buildPendingCountByNodeId(pendingRows), [pendingRows]);

  const pendingLinkedRows = useMemo(() => {
    if (!brainClients.length) return pendingRows;
    return pendingRows.filter((r) =>
      brainClients.some((c) => learningRowMatchesCanvasNode(r, c.id, c.brainNodeType)),
    );
  }, [pendingRows, brainClients]);

  const pendingCount = pendingLinkedRows.length;

  const pendingSamples = useMemo(() => {
    return pendingLinkedRows
      .slice(0, 2)
      .map((r) => stripLearningValueUiPrefixes(r.candidate.value).trim())
      .filter(Boolean)
      .map((v) => (v.length > 72 ? `${v.slice(0, 69)}…` : v));
  }, [pendingLinkedRows]);

  const variant = useMemo(() => {
    if (pendingCount > 0) return "attention" as const;
    if (totalActives === 0 && brainClients.length === 0) return "empty" as const;
    if (adn.total >= 72 && brainClients.length > 0 && pendingCount === 0) return "healthy" as const;
    return "partial" as const;
  }, [adn.total, brainClients.length, pendingCount, totalActives]);

  const shellClass =
    variant === "attention"
      ? "border-amber-300/90 bg-gradient-to-b from-amber-50/95 to-white shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
      : variant === "healthy"
        ? "border-emerald-200/90 bg-gradient-to-b from-emerald-50/50 to-white"
        : variant === "empty"
          ? "border-zinc-200 bg-zinc-50/40"
          : "border-zinc-200/90 bg-white";

  const openStudio = useCallback(() => {
    ctx?.openProjectBrain?.();
    if (!ctx?.openProjectBrain && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-open-project-brain"));
    }
  }, [ctx]);

  const openReview = useCallback(() => {
    if (ctx?.openProjectBrainReview) {
      ctx.openProjectBrainReview();
      return;
    }
    openStudio();
  }, [ctx, openStudio]);

  const introActive = !!(nodeData as { _foldderCanvasIntro?: boolean })._foldderCanvasIntro;
  const expanded = Boolean(selected);

  return (
    <div
      className={`custom-node tool-node rounded-[22px] border ${shellClass} ${
        expanded ? "shadow-lg ring-2 ring-violet-400/35" : "shadow-sm"
      }`}
      style={{ width: 340, minHeight: expanded ? 300 : 228, padding: "16px 17px" }}
    >
      <NodeLabel id={id} label={nodeData.label} defaultLabel="Brain" />

      <div className="flex min-w-0 flex-col gap-3">
        <BrainNodeHeader adnTotal={adn.total} introActive={introActive} />

        <BrainQuickStats activos={totalActives} nodos={brainClients.length} pendientes={pendingCount} />

        <section className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2">
          <p className="text-[8px] font-black uppercase tracking-[0.12em] text-zinc-500">Conocimiento</p>
          <p className="mt-1 text-[10px] font-semibold leading-snug text-zinc-800">
            {coreCount} fuentes core · {pdfCount} PDF{pdfCount === 1 ? "" : "s"} · {assetLikeCount} assets
            {linkCount > 0 ? ` · ${linkCount} enlaces` : ""}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {contextCount > 0 ? `${contextCount} fuentes de contexto` : "Sin contexto externo"}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-2">
          <p className="text-[8px] font-black uppercase tracking-[0.12em] text-zinc-500">Marca en Brain</p>
          <div className="mt-1.5">
            <BrainBrandChips
              hasLogo={hasLogo}
              hasPalette={hasPalette}
              hasVoice={hasVoice}
              imageCount={visualRefCount}
              visionRealCount={visionDisposition.realRemoteAnalyzed}
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden />
            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-zinc-500">Nodos conectados</p>
          </div>
          <p className="mt-1 text-[9px] leading-snug text-zinc-500">
            Señales recientes e información recibida por cada nodo conectado.
          </p>
          <div className="mt-1.5 max-h-[120px] overflow-y-auto pr-0.5">
            <BrainConnectedNodesSummary
              clients={brainClients}
              expanded={expanded}
              pendingByNodeId={pendingByNodeId}
              telemetryByNodeId={telemetryByNodeId}
            />
          </div>
          {process.env.NODE_ENV === "development" ? (
            <p className="mt-1.5 text-[8px] leading-snug text-zinc-400">{BRAIN_TELEMETRY_EPHEMERAL_DEV_NOTE_ES}</p>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-2">
          <p className="text-[8px] font-black uppercase tracking-[0.12em] text-zinc-500">Pendientes</p>
          <div className="mt-1">
            <BrainPendingSummary count={pendingCount} samples={pendingSamples} />
          </div>
        </section>

        <footer className="mt-auto flex flex-col gap-2 border-t border-zinc-200/80 pt-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openStudio();
            }}
            className="nodrag w-full rounded-xl border border-violet-600 bg-violet-600 py-2 text-center text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          >
            Abrir Brain
          </button>
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openReview();
              }}
              className="nodrag w-full rounded-xl border border-amber-400 bg-amber-50 py-2 text-center text-[10px] font-black uppercase tracking-wide text-amber-950 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              Revisar pendientes
            </button>
          ) : null}
        </footer>
      </div>

      <div className="handle-wrapper handle-right" style={{ top: "38%" }}>
        <span className="handle-label sr-only">Salida prompt</span>
        <FoldderDataHandle type="source" position={Position.Right} id="prompt" dataType="prompt" />
      </div>
      <div className="handle-wrapper handle-right" style={{ top: "62%" }}>
        <span className="handle-label sr-only">Salida Brain</span>
        <FoldderDataHandle type="source" position={Position.Right} id="brain" dataType="brain" />
      </div>
    </div>
  );
});

ProjectBrainNode.displayName = "ProjectBrainNode";
