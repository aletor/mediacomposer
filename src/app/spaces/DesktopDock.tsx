"use client";

import React from "react";
import Image from "next/image";
import { NodeIcon } from "./foldder-icons";
import { TOPBAR_GLYPH_BY_NODE_TYPE } from "./TopbarPinIcons";
import { DOCK_STUDIO_APPS, type StudioAppConfig, type StudioAppId } from "./studioApps";

type DesktopDockProps = {
  activeAppId?: string | null;
  minimizedAppId?: string | null;
  onAppClick: (app: StudioAppConfig) => void;
};

function DockIcon({ app }: { app: StudioAppConfig }) {
  if (app.appId === "brain") {
    return <Image src="/brain_icon.svg" alt="" width={28} height={28} className="object-contain" unoptimized />;
  }
  const glyphKey = app.appId === "files" ? "files" : app.appId;
  const Glyph = glyphKey in TOPBAR_GLYPH_BY_NODE_TYPE
    ? TOPBAR_GLYPH_BY_NODE_TYPE[glyphKey as keyof typeof TOPBAR_GLYPH_BY_NODE_TYPE]
    : null;
  if (Glyph) return <Glyph size={29} className="text-white" />;
  return <NodeIcon type={app.nodeType ?? app.appId} size={29} colorOverride="#ffffff" />;
}

export function DesktopDock({ activeAppId, minimizedAppId, onAppClick }: DesktopDockProps) {
  return (
    <nav className="pointer-events-auto absolute bottom-6 left-1/2 z-[3] flex -translate-x-1/2 items-end gap-2 rounded-[26px] border border-white/16 bg-black/38 px-3 py-2 shadow-2xl backdrop-blur-2xl">
      {DOCK_STUDIO_APPS.map((app) => {
        const active = activeAppId === app.appId;
        const minimized = minimizedAppId === app.appId;
        return (
          <button
            key={app.appId}
            type="button"
            onClick={() => onAppClick(app)}
            className={`group relative flex h-[68px] w-[68px] flex-col items-center justify-center gap-1 rounded-2xl border bg-white/[0.06] transition hover:-translate-y-1 hover:border-white/24 hover:bg-white/[0.1] ${
              active ? "border-white/45" : minimized ? "border-amber-300/45" : "border-white/10"
            }`}
            title={app.label}
          >
            <DockIcon app={app} />
            <span className="max-w-[58px] truncate text-[8px] font-light uppercase tracking-[0.12em] text-white/75">
              {app.label}
            </span>
            {(active || minimized) && (
              <span
                className={`absolute -bottom-1 h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-300" : "bg-amber-300"}`}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

export type { StudioAppId };

