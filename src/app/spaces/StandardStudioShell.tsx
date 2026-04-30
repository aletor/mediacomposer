"use client";

import React from "react";
import { Minus, SaveAll, X } from "lucide-react";
import { NodeIcon } from "./foldder-icons";
import {
  FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT,
  FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT,
  FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT,
} from "./desktop-studio-events";

export type StandardStudioShellConfig = {
  appLabel: string;
  fileName?: string;
  canSaveAs?: boolean;
  nodeId?: string;
  nodeType?: string;
  fileId?: string;
  appId?: string;
};

function dispatchStandardStudioAction(name: string, shell: StandardStudioShellConfig): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(name, {
      detail: {
        nodeId: shell.nodeId,
        nodeType: shell.nodeType,
        fileId: shell.fileId,
        appId: shell.appId,
      },
    }),
  );
}

export function StandardStudioShellHeader({ shell }: { shell: StandardStudioShellConfig }) {
  const nodeIconType = shell.nodeType || shell.appId || "projectAssets";
  return (
    <header className="relative z-[100020] flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-[#090b0f]/95 px-4 text-white shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
        <NodeIcon type={nodeIconType} size={18} colorOverride="#ffffff" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold uppercase tracking-[0.16em] text-white/78">
          {shell.appLabel}
        </div>
        {shell.fileName ? (
          <div className="truncate text-[11px] font-light text-white/46">
            {shell.fileName}
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {shell.canSaveAs ? (
          <button
            type="button"
            onClick={() => dispatchStandardStudioAction(FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT, shell)}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-[10px] font-medium uppercase tracking-wide text-white/70 transition hover:bg-white/[0.11] hover:text-white"
          >
            <SaveAll className="h-3.5 w-3.5" strokeWidth={1.7} />
            Guardar como
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => dispatchStandardStudioAction(FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT, shell)}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-[10px] font-medium uppercase tracking-wide text-white/70 transition hover:bg-white/[0.11] hover:text-white"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.7} />
          Minimizar
        </button>
        <button
          type="button"
          onClick={() => dispatchStandardStudioAction(FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT, shell)}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-[10px] font-medium uppercase tracking-wide text-white/70 transition hover:bg-white/[0.11] hover:text-white"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.7} />
          Cerrar
        </button>
      </div>
    </header>
  );
}
