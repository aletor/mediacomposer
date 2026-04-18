"use client";

import React from "react";
import { Image } from "lucide-react";

/** Iconos para modos de ajuste del marco de imagen (Designer) y vídeo en Presenter. */
export function ImageFrameFittingGlyph({ mode, className }: { mode: string; className?: string }) {
  const cn = className ?? "h-[18px] w-[18px]";
  const stroke = "currentColor";
  switch (mode) {
    case "fit-proportional":
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="6" y="7.5" width="12" height="9" rx="0.75" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "fill-proportional":
      return (
        <svg viewBox="0 0 24 24" className={cn} style={{ overflow: "hidden" }} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="-1" y="5" width="26" height="14" rx="1" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "fit-stretch":
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="3.5" y="3.5" width="17" height="17" rx="1" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "center-content":
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <rect x="8.5" y="9.5" width="7" height="5" rx="0.5" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "fill-stretch":
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" fill="none" stroke={stroke} strokeWidth="1.25" opacity={0.4} />
          <path d="M4 4.5 L20 3.5 L19.5 20.5 L3.5 19.5 Z" fill={stroke} opacity={0.92} />
        </svg>
      );
    case "frame-to-content":
      return (
        <svg viewBox="0 0 24 24" className={cn} aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="1.5" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="2.5 2" opacity={0.28} />
          <rect x="7" y="8.5" width="10" height="7" rx="0.75" fill={stroke} opacity={0.92} />
          <rect x="6.5" y="8" width="11" height="8" rx="1" fill="none" stroke={stroke} strokeWidth="1.1" opacity={0.55} />
        </svg>
      );
    default:
      return <Image className={cn} aria-hidden />;
  }
}
