"use client";

import React from "react";
import { INDESIGN_PAGE_FORMATS, type IndesignPageFormatId } from "../indesign/page-formats";

export type DesignerFormatModalState =
  | null
  | { kind: "add" }
  | { kind: "resize"; pageIndex: number };

type Props = {
  formatModal: DesignerFormatModalState;
  pendingFormat: IndesignPageFormatId;
  onPendingFormatChange: (id: IndesignPageFormatId) => void;
  onDismiss: () => void;
  onConfirmAdd: () => void;
  onConfirmResize: () => void;
};

export function DesignerFormatModal({
  formatModal,
  pendingFormat,
  onPendingFormatChange,
  onDismiss,
  onConfirmAdd,
  onConfirmResize,
}: Props) {
  if (!formatModal) return null;

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-[#12121a] p-5 shadow-2xl shadow-black/60 ring-1 ring-white/[0.06]">
        <p className="text-sm font-bold tracking-tight text-zinc-100">
          {formatModal.kind === "add" ? "Nueva página" : "Tamaño del pliego"}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {formatModal.kind === "add"
            ? "Elige el preset del pliego que se añadirá al final."
            : "Aplica un preset de tamaño a esta página (se sustituyen ancho y alto personalizados)."}
        </p>
        <div className="mt-4 space-y-2">
          {INDESIGN_PAGE_FORMATS.map((f) => (
            <label
              key={f.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${
                pendingFormat === f.id
                  ? "border-violet-400/40 bg-violet-500/10 text-zinc-100"
                  : "border-white/[0.08] bg-black/20 text-zinc-400 hover:border-white/15"
              }`}
            >
              <input
                type="radio"
                name="fmt"
                className="accent-violet-500"
                checked={pendingFormat === f.id}
                onChange={() => onPendingFormatChange(f.id)}
              />
              <span>
                {f.label}{" "}
                <span className="text-zinc-600">
                  ({f.width}×{f.height})
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
            onClick={onDismiss}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-gradient-to-b from-violet-500 to-purple-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-950/40"
            onClick={formatModal.kind === "add" ? onConfirmAdd : onConfirmResize}
          >
            {formatModal.kind === "add" ? "Añadir" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
