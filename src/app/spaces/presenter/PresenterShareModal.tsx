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
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-sky-600" : "bg-zinc-600"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
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
  const [view, setView] = useState<"list" | "new">("list");
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [linkName, setLinkName] = useState(deckTitle);
  const [urlPreview, setUrlPreview] = useState(deckTitle);
  const [opts, setOpts] = useState<PresenterShareOptions>({ ...DEFAULT_PRESENTER_SHARE_OPTIONS });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const r = await fetch(`/api/presenter-share?deckKey=${encodeURIComponent(deckKey)}`);
      const j = (await r.json()) as { links?: unknown; error?: string };
      if (!r.ok) {
        setFetchError(j.error?.trim() || `Error ${r.status}`);
        setLinks([]);
        return;
      }
      setLinks(Array.isArray(j.links) ? (j.links as ShareLinkRow[]) : []);
    } catch (e) {
      const msg =
        e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("fetch"))
          ? "No se pudo conectar con el servidor (¿está en marcha `npm run dev`?)."
          : e instanceof Error
            ? e.message
            : "Error de red";
      setFetchError(msg);
      setLinks([]);
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
    setFetchError(null);
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
      const j = (await r.json()) as { link?: { token?: string }; error?: string };
      if (!r.ok) {
        setFetchError(j.error?.trim() || `No se pudo crear el enlace (${r.status})`);
        return;
      }
      if (j.link?.token) copyUrl(j.link.token);
      setView("list");
      await refresh();
    } catch (e) {
      const msg =
        e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("fetch"))
          ? "No se pudo conectar con el servidor."
          : e instanceof Error
            ? e.message
            : "Error de red";
      setFetchError(msg);
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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-[1] flex max-h-[min(92vh,880px)] w-full max-w-md flex-col overflow-hidden rounded-md border border-white/[0.08] bg-[#12151a] shadow-2xl shadow-black/40">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/[0.08] bg-[#12151a]/95 px-3 py-2.5 backdrop-blur-md">
          {view === "new" ? (
            <button
              type="button"
              onClick={() => setView("list")}
              className="mt-0.5 rounded-md border border-white/10 bg-white/[0.06] p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Volver"
            >
              <ChevronLeft size={18} strokeWidth={1.5} />
            </button>
          ) : (
            <span className="w-8 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1 text-center">
            {view === "list" ? (
              <>
                <h2 id="presenter-share-title" className="text-sm font-bold tracking-tight text-white">
                  Share links
                </h2>
                <p className="mt-0.5 truncate px-1 text-[10px] text-zinc-500">
                  {deckTitle}
                </p>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <h2 className="text-sm font-bold text-white">New link</h2>
                <span className="rounded-[3px] border border-sky-500/35 bg-sky-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-sky-200/90">
                  Advanced
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {view === "list" && (
            <>
              <p className="mb-2 text-center text-[10px] leading-snug text-zinc-500">
                Public links for this deck
              </p>
              {fetchError && (
                <p
                  className="mb-2 rounded-[4px] border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-center text-[10px] leading-snug text-rose-200/95"
                  role="alert"
                >
                  {fetchError}
                </p>
              )}
              {loading ? (
                <p className="py-8 text-center text-[10px] text-zinc-500">Cargando…</p>
              ) : links.length === 0 ? (
                <p className="rounded-[4px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-5 text-center text-[10px] text-zinc-500">
                  No links yet. Use <span className="font-semibold text-zinc-400">New link</span> below.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {links.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-2 rounded-[4px] border border-white/[0.07] bg-white/[0.03] px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-zinc-100">{l.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-sky-400/90">
                          <Sparkles size={10} className="shrink-0" aria-hidden />
                          {l.visits} visits
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyUrl(l.token)}
                        className="flex shrink-0 items-center gap-1 rounded-[4px] border border-white/12 bg-white/[0.04] px-2 py-1 text-[9px] font-semibold text-zinc-200 transition-colors hover:bg-white/10"
                      >
                        <Link2 size={11} strokeWidth={1.75} />
                        Copy
                      </button>
                      <button
                        type="button"
                        className="rounded-[4px] p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-300"
                        aria-label="Más"
                      >
                        <MoreVertical size={15} strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {view === "new" && (
            <div className="flex flex-col gap-3 pb-1">
              {fetchError && (
                <p
                  className="rounded-[4px] border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-center text-[10px] leading-snug text-rose-200/95"
                  role="alert"
                >
                  {fetchError}
                </p>
              )}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Link name
                </label>
                <input
                  value={linkName}
                  onChange={(e) => {
                    setLinkName(e.target.value);
                    setUrlPreview(e.target.value);
                  }}
                  className="w-full rounded-[4px] border border-sky-500/35 bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-sky-500/55"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  URL
                </label>
                <input
                  value={urlPreview}
                  onChange={(e) => setUrlPreview(e.target.value)}
                  className="w-full rounded-[4px] border border-white/[0.1] bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-white/20"
                />
                <p className="mt-1 break-all text-[9px] text-zinc-600">
                  {origin}/p/[token — copied when created]
                </p>
              </div>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div>
                  <p className="text-[11px] font-semibold text-zinc-100">Allow duplication</p>
                  <p className="text-[9px] text-zinc-500">Visitors can copy and reuse the presentation.</p>
                </div>
                <Toggle on={opts.allowDuplication} onChange={(v) => setOpts((o) => ({ ...o, allowDuplication: v }))} />
              </div>

              <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">Advanced options</p>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <BarChart2 size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Collect engagement analytics</p>
                    <p className="text-[9px] text-zinc-500">Track slide views, visit duration, and engagement.</p>
                  </div>
                </div>
                <Toggle
                  on={opts.collectEngagementAnalytics}
                  onChange={(v) => setOpts((o) => ({ ...o, collectEngagementAnalytics: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <HelpCircle size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">
                      Get visitor consent for engagement analytics
                    </p>
                  </div>
                </div>
                <Toggle
                  on={opts.visitorConsentAnalytics}
                  onChange={(v) => setOpts((o) => ({ ...o, visitorConsentAnalytics: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <Lock size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Require passcode</p>
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
                  className="w-full rounded-[4px] border border-white/[0.1] bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-white/20"
                />
              )}

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <User size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Require visitor email</p>
                  </div>
                </div>
                <Toggle
                  on={opts.requireVisitorEmail}
                  onChange={(v) => setOpts((o) => ({ ...o, requireVisitorEmail: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <Download size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Allow visitors to download a PDF</p>
                  </div>
                </div>
                <Toggle
                  on={opts.allowPdfDownload}
                  onChange={(v) => setOpts((o) => ({ ...o, allowPdfDownload: v }))}
                />
              </div>

              <div className="flex items-start justify-between gap-3 rounded-[4px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                <div className="flex gap-2">
                  <Clock size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-100">Automatically disable link</p>
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
                  className="w-full rounded-[4px] border border-white/[0.1] bg-[#0e1014] px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-white/20"
                />
              )}
            </div>
          )}
        </div>

        {view === "list" && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.08] bg-[#0f1218] px-3 py-2">
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-zinc-300 transition-colors hover:bg-white/10"
              onClick={() => {
                void refresh();
              }}
            >
              Go to links overview
              <ArrowRight size={12} strokeWidth={2} className="opacity-80" />
            </button>
            <button
              type="button"
              onClick={() => setView("new")}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-sky-500"
            >
              + New link
            </button>
          </div>
        )}

        {view === "new" && (
          <div className="flex shrink-0 justify-end border-t border-white/[0.08] bg-[#0f1218] px-3 py-2">
            <button
              type="button"
              disabled={creating}
              onClick={() => void createLink()}
              className="rounded-md bg-sky-600 px-4 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
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
