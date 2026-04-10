import type { CSSProperties } from "react";
import React from "react";

export function gradientDefId(objId: string): string {
  return `fh-fill-grad-${objId}`;
}

/** Normalized 0–1 coordinates in object bounding box (gradientUnits="objectBoundingBox"). */
export interface GradientStop {
  color: string;
  opacity: number;
  /** 0–100 */
  position: number;
}

export type FillAppearance =
  | { type: "solid"; color: string }
  | {
      type: "gradient-linear";
      stops: GradientStop[];
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      type: "gradient-radial";
      stops: GradientStop[];
      cx: number;
      cy: number;
      r: number;
      fx?: number;
      fy?: number;
    };

export const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
  { color: "#6366f1", opacity: 1, position: 0 },
  { color: "#0f172a", opacity: 1, position: 100 },
];

export function solidFill(color: string): FillAppearance {
  return { type: "solid", color };
}

export function defaultLinearGradient(): FillAppearance {
  return {
    type: "gradient-linear",
    stops: DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s })),
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
  };
}

export function defaultRadialGradient(): FillAppearance {
  return {
    type: "gradient-radial",
    stops: DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s })),
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    fx: 0.5,
    fy: 0.5,
  };
}

/** Migrate legacy string fills or partial objects from storage. */
export function migrateFill(f: unknown): FillAppearance {
  if (f && typeof f === "object" && f !== null && "type" in f) {
    const t = (f as { type: string }).type;
    if (t === "solid" && "color" in (f as object)) {
      const c = (f as unknown as { color: unknown }).color;
      return { type: "solid", color: typeof c === "string" ? c : "#6366f1" };
    }
    if (t === "gradient-linear") {
      const g = f as Extract<FillAppearance, { type: "gradient-linear" }>;
      return {
        type: "gradient-linear",
        stops: normalizeStops(g.stops),
        x1: clamp01(g.x1 ?? 0),
        y1: clamp01(g.y1 ?? 0.5),
        x2: clamp01(g.x2 ?? 1),
        y2: clamp01(g.y2 ?? 0.5),
      };
    }
    if (t === "gradient-radial") {
      const g = f as Extract<FillAppearance, { type: "gradient-radial" }>;
      return {
        type: "gradient-radial",
        stops: normalizeStops(g.stops),
        cx: clamp01(g.cx ?? 0.5),
        cy: clamp01(g.cy ?? 0.5),
        r: Math.max(0.01, Math.min(2, g.r ?? 0.5)),
        fx: g.fx != null ? clamp01(g.fx) : undefined,
        fy: g.fy != null ? clamp01(g.fy) : undefined,
      };
    }
  }
  if (typeof f === "string") {
    return { type: "solid", color: f };
  }
  return { type: "solid", color: "#6366f1" };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function normalizeStops(stops: GradientStop[] | undefined): GradientStop[] {
  if (!stops || stops.length === 0) return DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s }));
  return stops
    .map((s) => ({
      color: typeof s.color === "string" ? s.color : "#ffffff",
      opacity: typeof s.opacity === "number" ? clamp01(s.opacity) : 1,
      position: typeof s.position === "number" ? Math.max(0, Math.min(100, s.position)) : 0,
    }))
    .sort((a, b) => a.position - b.position);
}

export function fillHasPaint(fill: FillAppearance): boolean {
  if (fill.type === "solid") return fill.color !== "none";
  return fill.stops.length > 0;
}

/** Angle in degrees (0 = left → right) → bbox line through center. */
export function linearGradientFromAngle(angleDeg: number): Pick<Extract<FillAppearance, { type: "gradient-linear" }>, "x1" | "y1" | "x2" | "y2"> {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * 0.5;
  const dy = Math.sin(rad) * 0.5;
  return {
    x1: 0.5 - dx,
    y1: 0.5 - dy,
    x2: 0.5 + dx,
    y2: 0.5 + dy,
  };
}

export function angleFromLinearGradient(f: Extract<FillAppearance, { type: "gradient-linear" }>): number {
  const dx = f.x2 - f.x1;
  const dy = f.y2 - f.y1;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function reverseGradientStops(stops: GradientStop[]): GradientStop[] {
  return stops
    .map((s) => ({
      ...s,
      position: 100 - s.position,
    }))
    .sort((a, b) => a.position - b.position);
}

export function addMidStop(stops: GradientStop[]): GradientStop[] {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return DEFAULT_GRADIENT_STOPS.map((s) => ({ ...s }));
  let bestGap = 0;
  let insertAt = 50;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].position - sorted[i].position;
    if (gap > bestGap) {
      bestGap = gap;
      insertAt = (sorted[i].position + sorted[i + 1].position) / 2;
    }
  }
  const t = insertAt / 100;
  const c = lerpColor(sorted[0].color, sorted[sorted.length - 1].color, t);
  const o = sorted[0].opacity * (1 - t) + sorted[sorted.length - 1].opacity * t;
  const next = [...sorted, { color: c, opacity: o, position: insertAt }].sort((a, b) => a.position - b.position);
  return next;
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function parseHex(s: string): { r: number; g: number; b: number } | null {
  const m = s.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function stopToSvgOffset(position: number): string {
  return `${Math.max(0, Math.min(100, position))}%`;
}

/** `fill` attribute value: solid color or `url(#id)`. */
export function fillPaintValue(fill: FillAppearance, gradientId: string): string {
  if (fill.type === "solid") return fill.color === "none" ? "none" : fill.color;
  return `url(#${gradientId})`;
}

export function renderFillDef(fill: FillAppearance, gradientId: string): React.ReactNode {
  if (fill.type === "solid") return null;
  const stops = normalizeStops(fill.stops);
  if (fill.type === "gradient-linear") {
    return (
      <linearGradient
        key={gradientId}
        id={gradientId}
        gradientUnits="objectBoundingBox"
        x1={fill.x1}
        y1={fill.y1}
        x2={fill.x2}
        y2={fill.y2}
      >
        {stops.map((s, i) => (
          <stop
            key={i}
            offset={stopToSvgOffset(s.position)}
            stopColor={s.color}
            stopOpacity={s.opacity}
          />
        ))}
      </linearGradient>
    );
  }
  const fx = fill.fx ?? fill.cx;
  const fy = fill.fy ?? fill.cy;
  return (
    <radialGradient
      key={gradientId}
      id={gradientId}
      gradientUnits="objectBoundingBox"
      cx={fill.cx}
      cy={fill.cy}
      r={fill.r}
      fx={fx}
      fy={fy}
    >
      {stops.map((s, i) => (
        <stop key={i} offset={stopToSvgOffset(s.position)} stopColor={s.color} stopOpacity={s.opacity} />
      ))}
    </radialGradient>
  );
}

/** Static SVG fragment for export / boolean raster pipeline. */
export function fillDefSvgString(fill: FillAppearance, gradientId: string): string {
  if (fill.type === "solid") return "";
  const stops = normalizeStops(fill.stops);
  const stopStr = stops
    .map((s) => `<stop offset="${stopToSvgOffset(s.position)}" stop-color="${escapeAttr(s.color)}" stop-opacity="${s.opacity}"/>`)
    .join("");
  if (fill.type === "gradient-linear") {
    return `<linearGradient id="${gradientId}" gradientUnits="objectBoundingBox" x1="${fill.x1}" y1="${fill.y1}" x2="${fill.x2}" y2="${fill.y2}">${stopStr}</linearGradient>`;
  }
  const fx = fill.fx ?? fill.cx;
  const fy = fill.fy ?? fill.cy;
  return `<radialGradient id="${gradientId}" gradientUnits="objectBoundingBox" cx="${fill.cx}" cy="${fill.cy}" r="${fill.r}" fx="${fx}" fy="${fy}">${stopStr}</radialGradient>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function cloneFill(fill: FillAppearance): FillAppearance {
  if (fill.type === "solid") return { ...fill };
  return {
    ...fill,
    stops: fill.stops.map((s) => ({ ...s })),
  };
}

function hexToRgba(hex: string, opacity: number): string {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(0,0,0,${opacity})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return `rgba(${r},${g},${b},${opacity})`;
}

/** ForeignObject text: CSS mirrors FillAppearance (same model, CSS paint for HTML). */
export function textFillCssProperties(fill: FillAppearance): CSSProperties {
  if (fill.type === "solid") {
    const c = fill.color === "none" ? "transparent" : fill.color;
    return { color: c };
  }
  const stops = normalizeStops(fill.stops);
  const stopStr = stops.map((s) => `${hexToRgba(s.color, s.opacity)} ${s.position}%`).join(", ");
  if (fill.type === "gradient-linear") {
    const ang = angleFromLinearGradient(fill);
    return {
      backgroundImage: `linear-gradient(${ang}deg, ${stopStr})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      WebkitTextFillColor: "transparent" as unknown as string,
    };
  }
  const { cx, cy, r } = fill;
  return {
    backgroundImage: `radial-gradient(circle at ${cx * 100}% ${cy * 100}%, ${stopStr})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent" as unknown as string,
    backgroundSize: `${200 * r}% ${200 * r}%`,
    backgroundPosition: `${50 + (0.5 - cx) * 100}% ${50 + (0.5 - cy) * 100}%`,
  };
}
