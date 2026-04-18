"use client";

import React from "react";
import type { PresenterGroupEnterId } from "./presenter-group-animations";

const W = "#f8fafc";
const W_SOFT = "rgba(248, 250, 252, 0.22)";
const W_MUTE = "rgba(148, 163, 184, 0.75)";

type Props = {
  id: PresenterGroupEnterId;
  size?: number;
  className?: string;
  active?: boolean;
};

const VB = 48;

/** Iconos en línea blanca, vista 48×48; tamaño por defecto mayor vía `size`. */
export function PresenterEnterAnimationIcon({ id, size = 52, className, active }: Props) {
  const s = size;
  const r = 7;
  const fadeGradId = React.useId().replace(/:/g, "_");
  const inner = (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${VB} ${VB}`}
      className={className}
      aria-hidden
    >
      {id === "none" && <IconNone />}
      {id === "instant" && <IconInstant r={r} />}
      {id === "fadeIn" && <IconFade r={r} gradId={`pfade-${fadeGradId}`} />}
      {id === "slideUp" && <IconSlideUp r={r} />}
      {id === "slideDown" && <IconSlideDown r={r} />}
      {id === "slideRight" && <IconSlideRight r={r} />}
      {id === "slideLeft" && <IconSlideLeft r={r} />}
      {id === "grow" && <IconGrow r={r} />}
      {id === "shrink" && <IconShrink r={r} />}
    </svg>
  );

  if (!active) return inner;

  return (
    <span className="relative inline-flex rounded-[8px] ring-1 ring-sky-400/50 bg-white/[0.06] p-0.5">{inner}</span>
  );
}

function IconNone() {
  return (
    <g fill="none" stroke={W_MUTE} strokeWidth={2.2} strokeLinecap="round">
      <line x1="34" y1="14" x2="14" y2="34" />
    </g>
  );
}

function IconInstant({ r }: { r: number }) {
  return (
    <rect
      x={13}
      y={13}
      width={22}
      height={22}
      rx={r}
      fill="none"
      stroke={W}
      strokeWidth={2.2}
    />
  );
}

function IconFade({ r, gradId }: { r: number; gradId: string }) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={W} stopOpacity={1} />
          <stop offset="100%" stopColor={W} stopOpacity={0.2} />
        </linearGradient>
      </defs>
      <rect
        x={11}
        y={14}
        width={26}
        height={20}
        rx={r}
        fill={`url(#${gradId})`}
        stroke={W}
        strokeWidth={1.5}
        opacity={0.95}
      />
    </>
  );
}

function IconSlideUp({ r }: { r: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={12} y={26} width={24} height={14} rx={5} stroke={W_SOFT} strokeWidth={1.8} />
      <rect x={12} y={10} width={24} height={16} rx={r} stroke={W} strokeWidth={2.2} />
      <path d="M24 26 L24 18 M20 22 L24 18 L28 22" stroke={W} strokeWidth={2.2} />
    </g>
  );
}

function IconSlideDown({ r }: { r: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={12} y={8} width={24} height={14} rx={5} stroke={W_SOFT} strokeWidth={1.8} />
      <rect x={12} y={22} width={24} height={16} rx={r} stroke={W} strokeWidth={2.2} />
      <path d="M24 28 L24 34 M20 30 L24 34 L28 30" stroke={W} strokeWidth={2.2} />
    </g>
  );
}

function IconSlideRight({ r }: { r: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={8} y={15} width={14} height={18} rx={4} stroke={W_SOFT} strokeWidth={1.8} />
      <rect x={18} y={11} width={22} height={22} rx={r} stroke={W} strokeWidth={2.2} />
      <path d="M26 24 L34 24 M30 20 L34 24 L30 28" stroke={W} strokeWidth={2.2} />
    </g>
  );
}

function IconSlideLeft({ r }: { r: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={26} y={15} width={14} height={18} rx={4} stroke={W_SOFT} strokeWidth={1.8} />
      <rect x={8} y={11} width={22} height={22} rx={r} stroke={W} strokeWidth={2.2} />
      <path d="M22 24 L14 24 M18 20 L14 24 L18 28" stroke={W} strokeWidth={2.2} />
    </g>
  );
}

function IconGrow({ r }: { r: number }) {
  return (
    <g fill="none" stroke={W} strokeLinecap="round">
      <rect x={14} y={14} width={14} height={14} rx={4} stroke={W_SOFT} strokeWidth={1.6} />
      <rect x={9} y={9} width={30} height={30} rx={r} strokeWidth={2.2} />
      <path d="M15 15 L9 9 M33 15 L39 9 M15 33 L9 39 M33 33 L39 39" strokeWidth={2.2} />
    </g>
  );
}

function IconShrink({ r }: { r: number }) {
  return (
    <g fill="none" stroke={W} strokeLinecap="round">
      <rect x={8} y={8} width={32} height={32} rx={6} stroke={W_SOFT} strokeWidth={1.6} />
      <rect x={14} y={14} width={20} height={20} rx={r} strokeWidth={2.2} />
      <path d="M14 14 L18 18 M34 14 L30 18 M14 34 L18 30 M34 34 L30 30" strokeWidth={2} />
    </g>
  );
}
