"use client";

import React from "react";

type IconProps = { className?: string; size?: number };

const sw = 1.35;

/** Miniatura «None»: diagonal simple. */
export function TransitionIconNone({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="6" y="8" width="28" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth={sw} opacity={0.35} />
      <path d="M12 28 L28 12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

/** Degradado horizontal suave. */
export function TransitionIconFade({ size = 40, className }: IconProps) {
  const uid = React.useId().replace(/:/g, "");
  const gid = `fade-g-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.15} />
          <stop offset="50%" stopColor="currentColor" stopOpacity={0.45} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.15} />
        </linearGradient>
      </defs>
      <rect x="7" y="9" width="26" height="22" rx="2.5" fill={`url(#${gid})`} stroke="currentColor" strokeWidth={1} opacity={0.5} />
    </svg>
  );
}

/** Cuadrado + círculo con líneas horizontales hacia la izquierda (slide left). */
export function TransitionIconSlideLeft({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M8 14h5 M8 18h5 M8 22h5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.45} />
      <rect x="16" y="12" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth={sw} />
      <circle cx="30" cy="17" r="4" fill="none" stroke="currentColor" strokeWidth={sw} />
    </svg>
  );
}

/** Cuadrado + círculo con líneas hacia la derecha. */
export function TransitionIconSlideRight({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M32 14h-5 M32 18h-5 M32 22h-5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.45} />
      <rect x="14" y="12" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth={sw} />
      <circle cx="10" cy="17" r="4" fill="none" stroke="currentColor" strokeWidth={sw} />
    </svg>
  );
}

/** Líneas verticales hacia arriba + formas. */
export function TransitionIconSlideUp({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M14 28v-5 M18 30v-7 M22 28v-5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.45} />
      <rect x="12" y="14" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth={sw} />
      <circle cx="26" cy="20" r="4" fill="none" stroke="currentColor" strokeWidth={sw} />
    </svg>
  );
}

/** Líneas verticales hacia abajo. */
export function TransitionIconSlideDown({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M14 12v5 M18 10v7 M22 12v5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.45} />
      <rect x="12" y="17" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth={sw} />
      <circle cx="26" cy="22" r="4" fill="none" stroke="currentColor" strokeWidth={sw} />
    </svg>
  );
}

export const TRANSITION_THUMB_BY_ID: Record<
  string,
  React.FC<{ className?: string; size?: number }>
> = {
  none: TransitionIconNone,
  fade: TransitionIconFade,
  slideLeft: TransitionIconSlideLeft,
  slideRight: TransitionIconSlideRight,
  slideUp: TransitionIconSlideUp,
  slideDown: TransitionIconSlideDown,
};
