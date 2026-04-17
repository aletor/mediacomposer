"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BarChart2,
  ChevronLeft,
  Clock,
  Download,
  HelpCircle,
  Link2,
  Lock,
  MoreVertical,
  Sparkles,
  User,
  X,
} from "lucide-react";
import type { DesignerPageState } from "../designer/DesignerNode";
import type { SlideTransitionId } from "./slide-transition-types";
import type { PresenterShareOptions } from "@/lib/presenter-share-types";
import { DEFAULT_PRESENTER_SHARE_OPTIONS } from "@/lib/presenter-share-types";

type ShareLinkRow = {
  id: string;
  token: string;
  name: string;
  slug: string;
  visits: number;
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  deckKey: string;
  deckTitle: string;
  pages: DesignerPageState[];
  transitionsByPageId: Record<string, SlideTransitionId>;
};

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PresenterShareModal({
  open,
  onClose,
  deckKey,
  deckTitle,
  pages,
  transitionsByPageId,
}: Props) {
  const [tab, setTab] = useState<"invite" | "external" | "export">("external");
  const [view, setView] = useState<"list" | "new">("list");
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [linkName, setLinkName] = useState(deckTitle);
  const [urlPreview, setUrlPreview] = useState(deckTitle);
  const [opts, setOpts] = useState<PresenterShareOptions>({ ...DEFAULT_PRESENTER_SHARE_OPTIONS });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/presenter-share?deckKey=${encodeURIComponent(deckKey)}`);
      const j = await r.json();
      setLinks(Array.isArray(j.links) ? j.links : []);
    } finally {
      setLoading(false);
    }
  }, [deckKey]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    setView("list");
    setLinkName(deckTitle);
    setUrlPreview(deckTitle);
    setOpts({ ...DEFAULT_PRESENTER_SHARE_OPTIONS });
  }, [open, deckKey, deckTitle, refresh]);

  const copyUrl = (token: string) => {
    const u = `${origin}/p/${token}`;
    void navigator.clipboard.writeText(u);
  };

  const createLink = async () => {
    setCreating(true);
    try {
      const r = await fetch("/api/presenter-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckKey,
          deckTitle,
          name: linkName.trim() || deckTitle,
          options: {
            allowDuplication: opts.allowDuplication,
            collectEngagementAnalytics: opts.collectEngagementAnalytics,
            visitorConsentAnalytics: opts.visitorConsentAnalytics,
            requirePasscode: opts.requirePasscode,
            passcodePlain: opts.passcodePlain,
            requireVisitorEmail: opts.requireVisitorEmail,
            allowPdfDownload: opts.allowPdfDownload,
            autoDisableLink: opts.autoDisableLink,
            autoDisableAt:
              opts.autoDisableLink && opts.autoDisableAt
                ? new Date(opts.autoDisableAt).toISOString()
                : null,
          },
          payload: { pages, transitionsByPageId },
        }),
      });
      if (!r.ok) throw new Error("create failed");
      const j = await r.json();
      if (j.link?.token) copyUrl(j.link.token);
      setView("list");
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100030] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presenter-share-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-[1] flex max-h-[min(92vh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200/90 px-4 py-3 dark:border-zinc-700">
          {view === "new" ? (
            <button
              type="button"
              onClick={() => setView("list")}
              className="mt-0.5 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Volver"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <span className="w-7" />
          )}
          <div className="min-w-0 flex-1 text-center">
            {view === "list" ? (
              <>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("invite")}
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      tab === "invite" ? "text-violet-600" : "text-zinc-400"
                    }`}
                  >
                    Invite
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("external")}
                    className={`border-b-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      tab === "external" ? "border-violet-600 text-violet-600" : "border-transparent text-zinc-400"
                    }`}
                  >
                    Share externally
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("export")}
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      tab === "export" ? "text-violet-600" : "text-zinc-400"
                    }`}
                  >
                    Export
                  </button>
                </div>
                <h2 id="presenter-share-title" className="mt-2 text-sm font-bold text-zinc-900 dark:text-white">
                  Share
                </h2>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white">New link</h2>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
                  Advanced
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab !== "external" && view === "list" && (
            <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:bg-zinc-800/50">
              Próximamente: esta pestaña no está disponible aún.
            </p>
          )}

          {tab === "external" && view === "list" && (
            <>
              <p className="mb-3 text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                Links created for &quot;{deckTitle}&quot;
              </p>
              {loading ? (
                <p className="py-8 text-center text-xs text-zinc-500">Cargando…</p>
              ) : links.length === 0 ? (
                <p className="rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/30">
                  Aún no hay enlaces. Pulsa <span className="font-semibold text-zinc-700 dark:text-zinc-300">New link</span>.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {links.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{l.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
                          <Sparkles size={12} aria-hidden />
                          {l.visits} visits
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyUrl(l.token)}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        <Link2 size={12} />
                        Copy link
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        aria-label="Más"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "external" && view === "new" && (
            <div className="flex flex-col gap-4 pb-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Link name</label>
                <input
                  value={linkName}
                  onChange={(e) => {
                    setLinkName(e.target.value);
                    setUrlPreview(e.target.value);
                  }}
                  className="w-full rounded-xl border border-violet-400/60 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 focus:border-violet-500 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">URL</label>
                <input
                  value={urlPreview}
                  onChange={(e) => setUrlPreview(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />
                <p className="mt-1 break-all text-[10px] text-zinc-500">
                  {origin}/p/[token generado al crear — el enlace final se copia al portapapeles]
                </p>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Allow duplication</p>
                  <p className="text-[10px] text-zinc-500">Visitors can copy and reuse the presentation.</p>
                </div>
                <Toggle on={opts.allowDuplication} onChange={(v) => setOpts((o) => ({ ...o, allowDuplication: v }))} />
              </div>

              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Advanced options</p>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div className="flex gap-2">
                  <BarChart2 size={18} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Collect engagement analytics</p>
                    <p className="text-[10px] text-zinc-500">Track slide views, visit duration, and engagement.</p>
                  </div>
                </div>
                <Toggle
                  on={opts.collectEngagementAnalytics}
                  onChange={(v) => setOpts((o) => ({ ...o, collectEngagementAnalytics: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div className="flex gap-2">
                  <HelpCircle size={18} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Get visitor consent for engagement analytics
                    </p>
                  </div>
                </div>
                <Toggle
                  on={opts.visitorConsentAnalytics}
                  onChange={(v) => setOpts((o) => ({ ...o, visitorConsentAnalytics: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div className="flex gap-2">
                  <Lock size={18} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Require passcode</p>
                  </div>
                </div>
                <Toggle
                  on={opts.requirePasscode}
                  onChange={(v) => setOpts((o) => ({ ...o, requirePasscode: v }))}
                />
              </div>
              {opts.requirePasscode && (
                <input
                  type="password"
                  value={opts.passcodePlain}
                  onChange={(e) => setOpts((o) => ({ ...o, passcodePlain: e.target.value }))}
                  placeholder="Passcode"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              )}

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div className="flex gap-2">
                  <User size={18} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Require visitor email</p>
                  </div>
                </div>
                <Toggle
                  on={opts.requireVisitorEmail}
                  onChange={(v) => setOpts((o) => ({ ...o, requireVisitorEmail: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div className="flex gap-2">
                  <Download size={18} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Allow visitors to download a PDF</p>
                  </div>
                </div>
                <Toggle
                  on={opts.allowPdfDownload}
                  onChange={(v) => setOpts((o) => ({ ...o, allowPdfDownload: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-700">
                <div className="flex gap-2">
                  <Clock size={18} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Automatically disable link</p>
                  </div>
                </div>
                <Toggle
                  on={opts.autoDisableLink}
                  onChange={(v) => setOpts((o) => ({ ...o, autoDisableLink: v }))}
                />
              </div>
              {opts.autoDisableLink && (
                <input
                  type="datetime-local"
                  value={opts.autoDisableAt ?? ""}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, autoDisableAt: e.target.value ? e.target.value : null }))
                  }
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              )}
            </div>
          )}
        </div>

        {tab === "external" && view === "list" && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-200/90 px-4 py-3 dark:border-zinc-700">
            <button
              type="button"
              className="flex items-center gap-1 rounded-xl border border-zinc-200 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => {
                void refresh();
              }}
            >
              Go to links overview
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView("new")}
              className="rounded-xl bg-violet-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-violet-500"
            >
              + New link
            </button>
          </div>
        )}

        {tab === "external" && view === "new" && (
          <div className="flex shrink-0 justify-end border-t border-zinc-200/90 px-4 py-3 dark:border-zinc-700">
            <button
              type="button"
              disabled={creating}
              onClick={() => void createLink()}
              className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create link"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
