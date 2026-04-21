"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ScrubNumberInput } from "../ScrubNumberInput";
import {
  defaultLayerEffects,
  type LayerEffectBlendMode,
  type LayerEffects,
  type OuterGlowTechnique,
} from "./layer-effects-types";

const PROP_PANEL_SCRUB_CLASS =
  "cursor-ew-resize rounded-[5px] border border-white/[0.08] bg-white/[0.06] px-2 py-1 font-mono text-[12px] text-zinc-100 outline-none focus:border-violet-500/50";
const PROP_PANEL_SCRUB_HINT = "Arrastra horizontalmente · Mayús = ×10";

const BLEND_OPTIONS: { value: LayerEffectBlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiplicar" },
  { value: "screen", label: "Trama" },
  { value: "overlay", label: "Superponer" },
  { value: "darken", label: "Oscurecer" },
  { value: "lighten", label: "Aclarar" },
  { value: "color-dodge", label: "Sobreexponer color" },
  { value: "color-burn", label: "Subexponer color" },
  { value: "hard-light", label: "Luz intensa" },
  { value: "soft-light", label: "Luz suave" },
  { value: "difference", label: "Diferencia" },
  { value: "exclusion", label: "Exclusión" },
  { value: "hue", label: "Tono" },
  { value: "saturation", label: "Saturación" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosidad" },
  { value: "plus-lighter", label: "Sobreexponer lineal" },
  { value: "plus-darker", label: "Subexponer lineal" },
];

type EffectTab = "colorOverlay" | "gradientOverlay" | "outerGlow";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function LayerStylesModal({
  open,
  draft,
  onDraftChange,
  onOk,
  onCancel,
  onReset,
}: {
  open: boolean;
  draft: LayerEffects;
  onDraftChange: (next: LayerEffects) => void;
  onOk: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<EffectTab>("colorOverlay");
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setTab("colorOverlay");
      setDragOffset({ x: 0, y: 0 });
    }
  }, [open]);

  const co = draft.colorOverlay!;
  const go = draft.gradientOverlay!;
  const og = draft.outerGlow ?? defaultLayerEffects().outerGlow!;

  const coEnabled = !!co.enabled;
  const goEnabled = !!go.enabled;
  const ogEnabled = !!og.enabled;

  /** No usar `<label>` + `<button>` anidados: en varios navegadores el clic no llega a `setTab` y el panel no cambia. */
  const sidebar = (
    <div
      className="flex w-[200px] shrink-0 flex-col border-r border-white/[0.08] bg-[#14171c] py-2"
      role="tablist"
      aria-label="Efectos de capa"
    >
      <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">Effects</p>
      <div
        id="fh-layer-style-tab-colorOverlay"
        role="tab"
        tabIndex={0}
        aria-selected={tab === "colorOverlay"}
        className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] outline-none hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-violet-500/60 ${
          tab === "colorOverlay" ? "bg-white/[0.07]" : ""
        }`}
        onClick={() => setTab("colorOverlay")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setTab("colorOverlay");
          }
        }}
      >
        <input
          type="checkbox"
          checked={coEnabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            onDraftChange({
              ...draft,
              colorOverlay: { ...co, enabled: e.target.checked },
            })
          }
          className="rounded border-white/20"
          aria-label="Activar color overlay"
        />
        <span className={`min-w-0 flex-1 truncate ${tab === "colorOverlay" ? "font-medium text-violet-200" : "text-zinc-300"}`}>
          Color Overlay
        </span>
      </div>
      <div
        id="fh-layer-style-tab-gradientOverlay"
        role="tab"
        tabIndex={0}
        aria-selected={tab === "gradientOverlay"}
        className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] outline-none hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-violet-500/60 ${
          tab === "gradientOverlay" ? "bg-white/[0.07]" : ""
        }`}
        onClick={() => setTab("gradientOverlay")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setTab("gradientOverlay");
          }
        }}
      >
        <input
          type="checkbox"
          checked={goEnabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            onDraftChange({
              ...draft,
              gradientOverlay: { ...go, enabled: e.target.checked },
            })
          }
          className="rounded border-white/20"
          aria-label="Activar gradient overlay"
        />
        <span className={`min-w-0 flex-1 truncate ${tab === "gradientOverlay" ? "font-medium text-violet-200" : "text-zinc-300"}`}>
          Gradient Overlay
        </span>
      </div>
      <div
        id="fh-layer-style-tab-outerGlow"
        role="tab"
        tabIndex={0}
        aria-selected={tab === "outerGlow"}
        className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-[12px] outline-none hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-violet-500/60 ${
          tab === "outerGlow" ? "bg-white/[0.07]" : ""
        }`}
        onClick={() => setTab("outerGlow")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setTab("outerGlow");
          }
        }}
      >
        <input
          type="checkbox"
          checked={ogEnabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            onDraftChange({
              ...draft,
              outerGlow: { ...og, enabled: e.target.checked },
            })
          }
          className="rounded border-white/20"
          aria-label="Activar outer glow"
        />
        <span className={`min-w-0 flex-1 truncate ${tab === "outerGlow" ? "font-medium text-violet-200" : "text-zinc-300"}`}>
          Outer Glow
        </span>
      </div>
    </div>
  );

  if (!open || typeof document === "undefined") return null;

  const onDragHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragOffset.x,
      origY: dragOffset.y,
    };
  };

  const onDragHandlePointerMove = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    setDragOffset({
      x: s.origX + (e.clientX - s.startX),
      y: s.origY + (e.clientY - s.startY),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = dragSessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    dragSessionRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const panel =
    tab === "colorOverlay" ? (
      <div className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-[12px] text-zinc-300">
          <input
            type="checkbox"
            checked={coEnabled}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                colorOverlay: { ...co, enabled: e.target.checked },
              })
            }
          />
          Enabled
        </label>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Blend mode</span>
          <select
            value={co.blendMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                colorOverlay: { ...co, blendMode: e.target.value as LayerEffectBlendMode },
              })
            }
            className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
          >
            {BLEND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Opacity</span>
            <ScrubNumberInput
              value={Math.round(co.opacity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(co.opacity * 100)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                colorOverlay: { ...co, opacity: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-violet-500"
          />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={co.color.startsWith("#") && co.color.length >= 7 ? co.color.slice(0, 7) : "#ff0000"}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, color: e.target.value },
                })
              }
              className="h-9 w-12 cursor-pointer rounded border border-white/[0.12] bg-transparent"
            />
            <input
              type="text"
              value={co.color}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  colorOverlay: { ...co, color: e.target.value },
                })
              }
              className="min-w-0 flex-1 rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 font-mono text-[11px] text-zinc-100"
            />
          </div>
        </div>
      </div>
    ) : tab === "gradientOverlay" ? (
      <div className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-[12px] text-zinc-300">
          <input
            type="checkbox"
            checked={goEnabled}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                gradientOverlay: { ...go, enabled: e.target.checked },
              })
            }
          />
          Enabled
        </label>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Blend mode</span>
          <select
            value={go.blendMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                gradientOverlay: { ...go, blendMode: e.target.value as LayerEffectBlendMode },
              })
            }
            className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
          >
            {BLEND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Opacity</span>
            <ScrubNumberInput
              value={Math.round(go.opacity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(go.opacity * 100)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                gradientOverlay: { ...go, opacity: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-violet-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Style</span>
            <select
              value={go.gradient.type}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, type: e.target.value as "linear" | "radial" },
                  },
                })
              }
              className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-1 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={go.gradient.reverse}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, reverse: e.target.checked },
                  },
                })
              }
            />
            Reverse
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Angle</span>
            <ScrubNumberInput
              value={Math.round(go.gradient.angle)}
              onKeyboardCommit={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, gradient: { ...go.gradient, angle: v } },
                });
              }}
              onScrubLive={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: { ...go, gradient: { ...go.gradient, angle: v } },
                });
              }}
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => Math.round(n)}
              title={PROP_PANEL_SCRUB_HINT}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Scale</span>
            <ScrubNumberInput
              value={go.gradient.scale}
              onKeyboardCommit={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, scale: clamp(v, 0.05, 4) },
                  },
                });
              }}
              onScrubLive={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  gradientOverlay: {
                    ...go,
                    gradient: { ...go.gradient, scale: clamp(v, 0.05, 4) },
                  },
                });
              }}
              onScrubEnd={() => {}}
              step={0.05}
              roundFn={(n) => Math.round(n * 100) / 100}
              min={0.05}
              max={4}
              title={PROP_PANEL_SCRUB_HINT}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
        </div>
        <div className="space-y-2 rounded-md border border-white/[0.08] bg-[#14171c] p-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Stops</span>
          {go.gradient.stops.map((s, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <ScrubNumberInput
                value={s.offset}
                onKeyboardCommit={(n) => {
                  const v = Number(n);
                  if (!Number.isFinite(v)) return;
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                onScrubLive={(n) => {
                  const v = Number(n);
                  if (!Number.isFinite(v)) return;
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                onScrubEnd={() => {}}
                step={0.01}
                roundFn={(x) => Math.round(x * 100) / 100}
                min={0}
                max={1}
                title={`Offset 0–1 · ${PROP_PANEL_SCRUB_HINT}`}
                className={`w-16 ${PROP_PANEL_SCRUB_CLASS}`}
              />
              <input
                type="color"
                value={s.color.startsWith("#") && s.color.length >= 7 ? s.color.slice(0, 7) : "#000000"}
                onChange={(e) => {
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, color: e.target.value } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                className="h-8 w-10 cursor-pointer rounded border border-white/[0.12] bg-transparent"
              />
              <input
                type="text"
                value={s.color}
                onChange={(e) => {
                  const stops = go.gradient.stops.map((st, j) =>
                    j === idx ? { ...st, color: e.target.value } : st,
                  );
                  onDraftChange({
                    ...draft,
                    gradientOverlay: { ...go, gradient: { ...go.gradient, stops } },
                  });
                }}
                className="min-w-0 flex-1 rounded border border-white/[0.1] bg-[#1a1d24] px-1 py-0.5 font-mono text-[10px] text-zinc-100"
              />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-[12px] text-zinc-300">
          <input
            type="checkbox"
            checked={ogEnabled}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, enabled: e.target.checked },
              })
            }
          />
          Enabled
        </label>
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Blend mode</span>
          <select
            value={og.blendMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, blendMode: e.target.value as LayerEffectBlendMode },
              })
            }
            className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
          >
            {BLEND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Opacity</span>
            <ScrubNumberInput
              value={Math.round(og.opacity * 100)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, opacity: clamp(Math.round(n), 0, 100) / 100 },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(og.opacity * 100)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, opacity: Number(e.target.value) / 100 },
              })
            }
            className="w-full accent-violet-500"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Noise</span>
            <ScrubNumberInput
              value={Math.round(og.noise)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, noise: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, noise: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-14 text-right ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(og.noise)}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                outerGlow: { ...og, noise: clamp(Number(e.target.value), 0, 100) },
              })
            }
            className="w-full accent-violet-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Fill</span>
            <select
              value={og.fill}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, fill: e.target.value as "color" | "gradient" },
                })
              }
              className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
            >
              <option value="color">Color</option>
              <option value="gradient">Gradient</option>
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Technique</span>
            <select
              value={og.technique}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, technique: e.target.value as OuterGlowTechnique },
                })
              }
              className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
            >
              <option value="softer">Softer</option>
              <option value="precise">Precise</option>
            </select>
          </div>
        </div>
        {og.fill === "color" ? (
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={og.color.startsWith("#") && og.color.length >= 7 ? og.color.slice(0, 7) : "#ffcc00"}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    outerGlow: { ...og, color: e.target.value },
                  })
                }
                className="h-9 w-12 cursor-pointer rounded border border-white/[0.12] bg-transparent"
              />
              <input
                type="text"
                value={og.color}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    outerGlow: { ...og, color: e.target.value },
                  })
                }
                className="min-w-0 flex-1 rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 font-mono text-[11px] text-zinc-100"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-white/[0.08] bg-[#14171c] p-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Gradient</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Style</span>
                <select
                  value={og.gradient.type}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, type: e.target.value as "linear" | "radial" },
                      },
                    })
                  }
                  className="w-full rounded-md border border-white/[0.1] bg-[#1a1d24] px-2 py-1.5 text-[12px] text-zinc-100"
                >
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-1 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={og.gradient.reverse}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, reverse: e.target.checked },
                      },
                    })
                  }
                />
                Reverse
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Angle</span>
                <ScrubNumberInput
                  value={Math.round(og.gradient.angle)}
                  onKeyboardCommit={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: { ...og, gradient: { ...og.gradient, angle: v } },
                    });
                  }}
                  onScrubLive={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: { ...og, gradient: { ...og.gradient, angle: v } },
                    });
                  }}
                  onScrubEnd={() => {}}
                  step={1}
                  roundFn={(n) => Math.round(n)}
                  title={PROP_PANEL_SCRUB_HINT}
                  className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Scale</span>
                <ScrubNumberInput
                  value={og.gradient.scale}
                  onKeyboardCommit={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, scale: clamp(v, 0.05, 4) },
                      },
                    });
                  }}
                  onScrubLive={(n) => {
                    const v = Number(n);
                    if (!Number.isFinite(v)) return;
                    onDraftChange({
                      ...draft,
                      outerGlow: {
                        ...og,
                        gradient: { ...og.gradient, scale: clamp(v, 0.05, 4) },
                      },
                    });
                  }}
                  onScrubEnd={() => {}}
                  step={0.05}
                  roundFn={(n) => Math.round(n * 100) / 100}
                  min={0.05}
                  max={4}
                  title={PROP_PANEL_SCRUB_HINT}
                  className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
                />
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Stops</span>
              {og.gradient.stops.map((s, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <ScrubNumberInput
                    value={s.offset}
                    onKeyboardCommit={(n) => {
                      const v = Number(n);
                      if (!Number.isFinite(v)) return;
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    onScrubLive={(n) => {
                      const v = Number(n);
                      if (!Number.isFinite(v)) return;
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, offset: clamp(v, 0, 1) } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    onScrubEnd={() => {}}
                    step={0.01}
                    roundFn={(x) => Math.round(x * 100) / 100}
                    min={0}
                    max={1}
                    title={`Offset 0–1 · ${PROP_PANEL_SCRUB_HINT}`}
                    className={`w-16 ${PROP_PANEL_SCRUB_CLASS}`}
                  />
                  <input
                    type="color"
                    value={s.color.startsWith("#") && s.color.length >= 7 ? s.color.slice(0, 7) : "#000000"}
                    onChange={(e) => {
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, color: e.target.value } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    className="h-8 w-10 cursor-pointer rounded border border-white/[0.12] bg-transparent"
                  />
                  <input
                    type="text"
                    value={s.color}
                    onChange={(e) => {
                      const stops = og.gradient.stops.map((st, j) =>
                        j === idx ? { ...st, color: e.target.value } : st,
                      );
                      onDraftChange({
                        ...draft,
                        outerGlow: { ...og, gradient: { ...og.gradient, stops } },
                      });
                    }}
                    className="min-w-0 flex-1 rounded border border-white/[0.1] bg-[#1a1d24] px-1 py-0.5 font-mono text-[10px] text-zinc-100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Spread</span>
            <ScrubNumberInput
              value={Math.round(og.spread)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, spread: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, spread: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Size</span>
            <ScrubNumberInput
              value={Math.round(og.size * 10) / 10}
              onKeyboardCommit={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, size: clamp(Math.round(v * 10) / 10, 0, 250) },
                });
              }}
              onScrubLive={(n) => {
                const v = Number(n);
                if (!Number.isFinite(v)) return;
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, size: clamp(Math.round(v * 10) / 10, 0, 250) },
                });
              }}
              onScrubEnd={() => {}}
              step={0.5}
              roundFn={(n) => Math.round(n * 10) / 10}
              min={0}
              max={250}
              title={`px · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Range</span>
            <ScrubNumberInput
              value={Math.round(og.range)}
              onKeyboardCommit={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, range: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubLive={(n) =>
                onDraftChange({
                  ...draft,
                  outerGlow: { ...og, range: clamp(Math.round(n), 0, 100) },
                })
              }
              onScrubEnd={() => {}}
              step={1}
              roundFn={(n) => clamp(Math.round(n), 0, 100)}
              min={0}
              max={100}
              title={`% · ${PROP_PANEL_SCRUB_HINT}`}
              className={`w-full ${PROP_PANEL_SCRUB_CLASS}`}
            />
          </div>
        </div>
      </div>
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fh-layer-style-title"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#0f1115] shadow-2xl shadow-black/60"
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-stretch border-b border-white/[0.08]">
          <div
            className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center px-4 py-3 active:cursor-grabbing"
            onPointerDown={onDragHandlePointerDown}
            onPointerMove={onDragHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <h2 id="fh-layer-style-title" className="text-[13px] font-semibold tracking-wide text-zinc-100">
              Layer Style
            </h2>
          </div>
          <div className="flex shrink-0 items-center pr-2">
            <button
              type="button"
              className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onCancel}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {sidebar}
          <div
            key={tab}
            className="min-h-0 flex-1 overflow-y-auto"
            role="tabpanel"
            id={`fh-layer-style-panel-${tab}`}
            aria-labelledby={`fh-layer-style-tab-${tab}`}
          >
            {panel}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[12px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            onClick={onReset}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[12px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-violet-600 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-violet-500"
            onClick={onOk}
          >
            OK
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
