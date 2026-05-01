"use client";

import React from "react";
import { CINE_CAMERA_MOVEMENT_LABELS, type CineCameraMovementType } from "./cine-types";

const CAMERA_MOTION_TOOLTIPS: Record<CineCameraMovementType, string> = {
  none: "Estático",
  push_in: "Push in (acercamiento lento)",
  pull_out: "Pull out (alejarse del sujeto)",
  pan: "Panorámica horizontal",
  tilt: "Tilt (barrido vertical)",
  tracking_forward: "Travelling hacia delante",
  tracking_backward: "Travelling hacia atrás",
  tracking_side: "Travelling lateral",
  handheld: "Cámara en mano",
  drone: "Movimiento aéreo / drone",
  static_subtle: "Plano fijo con vida sutil",
};

export const CINE_CAMERA_MOVEMENT_OPTIONS: CineCameraMovementType[] = [
  "none",
  "static_subtle",
  "push_in",
  "pull_out",
  "tracking_forward",
  "tracking_backward",
  "tracking_side",
  "pan",
  "tilt",
  "handheld",
  "drone",
];

function MotionGlyph({ type }: { type: CineCameraMovementType }) {
  if (type === "push_in") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <rect x="10" y="10" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-dolly-in" />
        <path d="M20 6v8M20 26v8M6 20h8M26 20h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "pull_out") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <rect x="10" y="10" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-dolly-out" />
        <path d="M15 15l-6-6M25 15l6-6M15 25l-6 6M25 25l6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "pan" || type === "tracking_side") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <path d="M8 20h24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M10 15h6M19 15h6M28 15h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="animate-pan" />
        <path d="M27 13l5 7-5 7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "tilt" || type === "drone") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <path d="M20 8v24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M15 12h10M15 20h10M15 28h10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="animate-crane" />
        <path d="M14 14l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "tracking_forward" || type === "tracking_backward") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <path d="M10 30h20L24 12h-8L10 30Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="20" cy="20" r="4" fill="currentColor" className={type === "tracking_forward" ? "animate-dolly-in" : "animate-dolly-out"} />
      </svg>
    );
  }
  if (type === "handheld") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <path d="M9 21c4-6 7 6 11 0s7 6 11 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="animate-pulse" />
        <rect x="12" y="12" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (type === "static_subtle") {
    return (
      <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
        <rect x="10" y="11" width="20" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-pulse" />
        <circle cx="20" cy="20" r="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <rect x="10" y="11" width="20" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 20h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CineCameraMotionIcon({
  type = "none",
  active,
  compact,
}: {
  type?: CineCameraMovementType;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-2xl border transition",
        compact ? "h-10 w-10" : "h-14 w-14",
        active ? "border-cyan-200/45 bg-cyan-300/15 text-cyan-50 shadow-[0_0_22px_rgba(103,232,249,0.14)]" : "border-white/10 bg-white/[0.04] text-white/50",
      ].join(" ")}
      title={CAMERA_MOTION_TOOLTIPS[type]}
    >
      <MotionGlyph type={type} />
    </span>
  );
}

export function CineCameraMotionSelector({
  value,
  onChange,
}: {
  value?: CineCameraMovementType;
  onChange: (next: CineCameraMovementType) => void;
}) {
  const current = value ?? "none";
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-4">
      {CINE_CAMERA_MOVEMENT_OPTIONS.map((type) => {
        const active = current === type;
        return (
          <button
            key={type}
            type="button"
            title={CAMERA_MOTION_TOOLTIPS[type]}
            onClick={() => onChange(type)}
            className={[
              "group rounded-2xl border p-2 text-left transition",
              active ? "border-cyan-200/35 bg-cyan-300/12" : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.06]",
            ].join(" ")}
          >
            <CineCameraMotionIcon type={type} active={active} />
            <span className={["mt-2 block truncate text-[10px] font-semibold uppercase tracking-[0.1em]", active ? "text-cyan-50/80" : "text-white/38 group-hover:text-white/65"].join(" ")}>
              {CINE_CAMERA_MOVEMENT_LABELS[type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
