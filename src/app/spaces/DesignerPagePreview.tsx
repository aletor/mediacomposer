"use client";

import type { FreehandObject } from "./FreehandStudio";

function looseThumbRect(o: FreehandObject): { x: number; y: number; w: number; h: number } | null {
  if (!o.visible) return null;
  if (o.isClipMask) return null;

  if (o.type === "path") {
    const pts = (o as { points?: { anchor: { x: number; y: number } }[] }).points;
    if (pts && pts.length > 0) {
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (const p of pts) {
        x1 = Math.min(x1, p.anchor.x);
        y1 = Math.min(y1, p.anchor.y);
        x2 = Math.max(x2, p.anchor.x);
        y2 = Math.max(y2, p.anchor.y);
      }
      if (!Number.isFinite(x1)) return null;
      const pad = 4;
      return {
        x: x1 - pad,
        y: y1 - pad,
        w: Math.max(x2 - x1 + pad * 2, 6),
        h: Math.max(y2 - y1 + pad * 2, 6),
      };
    }
  }

  const a = o as { x?: number; y?: number; width?: number; height?: number };
  if (
    typeof a.x === "number" &&
    typeof a.y === "number" &&
    typeof a.width === "number" &&
    typeof a.height === "number"
  ) {
    return { x: a.x, y: a.y, w: Math.max(a.width, 1), h: Math.max(a.height, 1) };
  }
  return null;
}

/**
 * Miniatura esquemática del contenido de una página (no es WYSIWYG; solo bloques por objeto).
 */
export function DesignerPagePreview({
  objects,
  pageWidth,
  pageHeight,
}: {
  objects: FreehandObject[];
  pageWidth: number;
  pageHeight: number;
}) {
  const pw = Math.max(32, pageWidth);
  const ph = Math.max(32, pageHeight);
  const sw = Math.max(pw, ph) * 0.0035;

  return (
    <svg
      className="pointer-events-none block h-full w-full"
      viewBox={`0 0 ${pw} ${ph}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={pw} height={ph} fill="#fafafa" />
      {objects.map((o) => {
        const r = looseThumbRect(o);
        if (!r) return null;
        return (
          <rect
            key={o.id}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="rgba(99,102,241,0.18)"
            stroke="rgba(99,102,241,0.42)"
            strokeWidth={sw}
            rx={Math.min(3, sw * 3)}
          />
        );
      })}
    </svg>
  );
}
