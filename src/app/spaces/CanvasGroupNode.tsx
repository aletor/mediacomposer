"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  NodeProps,
  Position,
  useEdges,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { ChevronDown, ChevronUp, Layers, Link2 } from "lucide-react";
import { FoldderDataHandle, type FoldderHandleDataType } from "./FoldderDataHandle";
import { FOLDDER_FIT_VIEW_EASE } from "@/lib/fit-view-ease";
import {
  applyCanvasGroupCollapse,
  applyCanvasGroupExpand,
  parseCanvasGroupInHandle,
  parseCanvasGroupOutHandle,
  resolveHandleDataType,
} from "./canvas-group-logic";

/** Proxy handles: desplazamiento vertical respecto al borde superior del nodo (marco centrado ~90px). */
const COLLAPSED_PROXY_TOP_OFFSET = 40;

function foldderTypeFromRegistry(t: string | undefined): FoldderHandleDataType {
  switch (t) {
    case "prompt":
      return "prompt";
    case "image":
      return "image";
    case "video":
      return "video";
    case "mask":
      return "mask";
    case "pdf":
      return "pdf";
    case "txt":
      return "txt";
    case "url":
      return "url";
    default:
      return "generic";
  }
}

type CanvasGroupData = {
  label?: string;
  collapsed?: boolean;
  memberIds?: string[];
};

/** Marco visual idéntico en plegado y despliegue (borde discontinuo fino en spaces.css). `canvas-group-frame` anula el vidrio global de `.custom-node`. */
const GROUP_FRAME_CLASS =
  "canvas-group-frame bg-gradient-to-b from-white/[0.035] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm";

export const CanvasGroupNode = memo(function CanvasGroupNode({ id, data, selected }: NodeProps) {
  const d = (data ?? {}) as CanvasGroupData;
  const { setNodes, setEdges, getNodes, getEdges, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const allNodes = useNodes();
  const edges = useEdges();
  const collapsed = Boolean(d.collapsed);
  const memberIds = Array.isArray(d.memberIds) ? d.memberIds : [];

  const groupedCount = useMemo(() => {
    const n = allNodes.filter((node) => node.parentId === id).length;
    return n > 0 ? n : memberIds.length;
  }, [allNodes, id, memberIds.length]);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(d.label ?? "Grupo");

  useEffect(() => {
    setTitle(d.label ?? "Grupo");
  }, [d.label]);

  const incomingProxies = useMemo(() => {
    const list: { hid: string; dtype: FoldderHandleDataType; top: number }[] = [];
    let y = 10;
    for (const e of edges) {
      if (e.target !== id || !e.targetHandle?.startsWith("g_in_")) continue;
      const p = parseCanvasGroupInHandle(e.targetHandle);
      if (!p) continue;
      const inner = allNodes.find((n) => n.id === p.memberId);
      const rt = resolveHandleDataType(inner?.type as string, "in", p.handleId);
      list.push({
        hid: e.targetHandle!,
        dtype: foldderTypeFromRegistry(rt),
        top: y,
      });
      y += 22;
    }
    return list;
  }, [edges, id, allNodes]);

  const outgoingProxies = useMemo(() => {
    const list: { hid: string; dtype: FoldderHandleDataType; top: number }[] = [];
    let y = 10;
    for (const e of edges) {
      if (e.source !== id || !e.sourceHandle?.startsWith("g_out_")) continue;
      const p = parseCanvasGroupOutHandle(e.sourceHandle);
      if (!p) continue;
      const inner = allNodes.find((n) => n.id === p.memberId);
      const rt = resolveHandleDataType(inner?.type as string, "out", p.handleId);
      list.push({
        hid: e.sourceHandle!,
        dtype: foldderTypeFromRegistry(rt),
        top: y,
      });
      y += 22;
    }
    return list;
  }, [edges, id, allNodes]);

  useEffect(() => {
    if (collapsed) {
      updateNodeInternals(String(id));
    }
  }, [collapsed, incomingProxies.length, outgoingProxies.length, id, updateNodeInternals]);

  const commitTitle = useCallback(() => {
    const trimmed = title.trim().slice(0, 80) || "Grupo";
    setTitle(trimmed);
    setEditing(false);
    setNodes((nds: any[]) =>
      nds.map((n: any) => (n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n))
    );
  }, [id, setNodes, title]);

  const toggleCollapse = useCallback(() => {
    const n = getNodes();
    const e = getEdges();
    const cur = n.find((x) => x.id === id);
    const isCollapsed = Boolean((cur?.data as { collapsed?: boolean })?.collapsed);
    const next = isCollapsed
      ? applyCanvasGroupExpand(id, n, e)
      : applyCanvasGroupCollapse(id, n, e);
    if (!next) return;
    setNodes(next.nodes as any);
    setEdges(next.edges as any);
    queueMicrotask(() => updateNodeInternals(String(id)));
    if (isCollapsed) {
      setTimeout(() => {
        const nds = getNodes();
        const memberIdsNow = nds.filter((node) => node.parentId === id).map((node) => node.id);
        const fitTargets = [{ id }, ...memberIdsNow.map((mid) => ({ id: mid }))];
        void fitView({
          nodes: fitTargets as any,
          padding: 0.8,
          duration: 560,
          interpolate: "smooth",
          ...FOLDDER_FIT_VIEW_EASE,
        });
      }, 90);
    }
  }, [fitView, getEdges, getNodes, id, setEdges, setNodes, updateNodeInternals]);

  const onUngroup = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foldder-canvas-ungroup", { detail: { groupId: id } }));
    }
  }, [id]);

  const shell = collapsed ? (
    <div
      className={`custom-node relative w-full overflow-visible rounded-2xl ${GROUP_FRAME_CLASS} ${
        selected ? "ring-2 ring-violet-400/40" : ""
      }`}
      style={{ minHeight: 90, boxSizing: "border-box" }}
    >
      <div className="pointer-events-auto relative z-20 flex min-h-[90px] flex-col justify-center gap-1.5 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-white/85" strokeWidth={2} />
            {editing ? (
              <input
                autoFocus
                className="nodrag max-w-[min(240px,55vw)] rounded border border-white/20 bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-900"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setTitle(d.label ?? "Grupo");
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="max-w-[min(240px,55vw)] cursor-grab truncate py-0.5 text-left text-[10px] font-black uppercase tracking-wide text-white/90 select-none active:cursor-grabbing"
                title="Arrastra para mover el grupo · doble clic para editar el título"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
              >
                {title}
              </button>
            )}
          </div>
          <div className="nodrag nopan flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="nodrag nopan flex h-8 w-8 items-center justify-center rounded-full border border-white/22 bg-white/[0.12] text-white/95 shadow-sm backdrop-blur-sm hover:bg-white/[0.18]"
              title="Expandir grupo"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse();
              }}
            >
              <ChevronDown size={14} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              className="nodrag nopan flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/15 text-emerald-100 shadow-sm backdrop-blur-sm transition-colors hover:border-emerald-300/55 hover:bg-emerald-400/22"
              title="Desagrupar (igual que clic derecho → Desagrupar en el lienzo)"
              onClick={(e) => {
                e.stopPropagation();
                onUngroup();
              }}
            >
              <Link2 size={14} strokeWidth={2.25} />
            </button>
          </div>
        </div>
        <p className="pointer-events-none text-center text-[8px] font-bold uppercase tracking-wider text-white/35">
          Agrupados {groupedCount} elementos
        </p>
      </div>

      {incomingProxies.map((p) => (
        <div
          key={p.hid}
          className="pointer-events-auto absolute z-10"
          style={{ left: -6, top: p.top + COLLAPSED_PROXY_TOP_OFFSET }}
        >
          <FoldderDataHandle
            type="target"
            position={Position.Left}
            id={p.hid}
            dataType={p.dtype}
          />
        </div>
      ))}
      {outgoingProxies.map((p) => (
        <div
          key={p.hid}
          className="pointer-events-auto absolute z-10"
          style={{ right: -6, top: p.top + COLLAPSED_PROXY_TOP_OFFSET }}
        >
          <FoldderDataHandle
            type="source"
            position={Position.Right}
            id={p.hid}
            dataType={p.dtype}
          />
        </div>
      ))}
    </div>
  ) : (
    <div
      className={`custom-node relative overflow-hidden rounded-2xl ${GROUP_FRAME_CLASS} ${
        selected ? "ring-2 ring-violet-400/40" : ""
      }`}
      style={{ width: "100%", height: "100%", minWidth: 200, minHeight: 120 }}
    >
      <div className="pointer-events-auto absolute left-3 right-3 top-2 z-20 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-white/85" strokeWidth={2} />
          {editing ? (
            <input
              autoFocus
              className="nodrag rounded border border-white/20 bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-900"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  setTitle(d.label ?? "Grupo");
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 cursor-grab truncate text-left text-[10px] font-black uppercase tracking-wide text-white/90 select-none active:cursor-grabbing"
              title="Arrastra para mover el grupo · doble clic para editar el título"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {title}
            </button>
          )}
        </div>
        <div className="nodrag nopan flex gap-1.5">
          <button
            type="button"
            className="nodrag nopan flex h-8 w-8 items-center justify-center rounded-full border border-white/22 bg-white/[0.12] text-white/95 shadow-sm backdrop-blur-sm hover:bg-white/[0.18]"
            title="Comprimir"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="nodrag nopan flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/15 text-emerald-100 shadow-sm backdrop-blur-sm transition-colors hover:border-emerald-300/55 hover:bg-emerald-400/22"
            title="Desagrupar (igual que clic derecho → Desagrupar en el lienzo)"
            onClick={(e) => {
              e.stopPropagation();
              onUngroup();
            }}
          >
            <Link2 size={14} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );

  return <div className="relative h-full w-full">{shell}</div>;
});
