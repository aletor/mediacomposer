"use client";

import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Node } from "@xyflow/react";
import { FolderOpen, X } from "lucide-react";
import { collectProjectMedia, type ProjectMediaItem } from "./project-media-inventory";

type Props = {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
};

function MediaTile({ item }: { item: ProjectMediaItem }) {
  const isVideo = item.kind === "video";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-lg transition hover:border-amber-400/35 hover:bg-zinc-900"
    >
      <div className="relative aspect-video w-full bg-black/50">
        {isVideo ? (
          <video
            src={item.url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = "0.2";
            }}
          />
        )}
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/90">
          {isVideo ? "Vídeo" : item.kind === "audio" ? "Audio" : "Imagen"}
        </span>
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <p className="truncate text-[10px] font-semibold text-zinc-200" title={item.sourceLabel}>
          {item.sourceLabel}
        </p>
        <p className="truncate font-mono text-[8px] text-zinc-500" title={item.url}>
          {item.url.replace(/^https?:\/\//, "").slice(0, 56)}
          {item.url.length > 56 ? "…" : ""}
        </p>
      </div>
    </a>
  );
}

function Section({
  title,
  subtitle,
  items,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  items: ProjectMediaItem[];
  emptyHint: string;
}) {
  return (
    <section className="min-w-0 flex-1">
      <div className="mb-3 border-b border-white/10 pb-2">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-amber-200/95">{title}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-8 text-center text-[12px] text-zinc-500">{emptyHint}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <MediaTile item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProjectFilesFullscreen({ open, onClose, nodes }: Props) {
  const { imported, generated } = useMemo(() => collectProjectMedia(nodes), [nodes]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const shell = (
    <div
      className="fixed inset-0 z-[100080] flex flex-col bg-[#0c0e12]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-files-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10">
            <FolderOpen className="h-5 w-5 text-amber-300" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="project-files-title" className="text-base font-black uppercase tracking-wide text-zinc-100">
              Files
            </h1>
            <p className="text-[11px] text-zinc-500">Multimedia del proyecto · importados y generados en el espacio</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-zinc-200 transition hover:bg-white/12"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          Cerrar
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-10 lg:flex-row lg:gap-12">
          <Section
            title="Importados"
            subtitle="Archivos que has añadido: subidas, URLs, contenido en Designer/Presenter, etc."
            items={imported}
            emptyHint="Aún no hay elementos importados visibles en este proyecto."
          />
          <Section
            title="Generados"
            subtitle="Salidas del sistema: Image/Video/VFX, Grok, historial graph-run, etc."
            items={generated}
            emptyHint="Aún no hay elementos generados en este proyecto."
          />
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}
