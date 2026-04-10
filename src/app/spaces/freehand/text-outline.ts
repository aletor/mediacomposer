import opentype from "opentype.js";

interface Point {
  x: number;
  y: number;
}

export interface OutlineBezierPoint {
  anchor: Point;
  handleIn: Point;
  handleOut: Point;
  vertexMode?: "smooth" | "cusp" | "corner";
}

/** Map font family to optional TTF URL for outline conversion (extend as needed). */
const FONT_URLS: Record<string, string> = {
  Inter: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  "IBM Plex Sans": "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  system: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
};

const fontCache = new Map<string, opentype.Font>();

async function loadFont(family: string): Promise<opentype.Font | null> {
  const key = family.trim() || "Inter";
  if (fontCache.has(key)) return fontCache.get(key)!;
  const url = FONT_URLS[key] ?? FONT_URLS.Inter;
  try {
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const font = opentype.parse(buf);
    fontCache.set(key, font);
    return font;
  } catch {
    try {
      const fallback = await fetch(FONT_URLS.system).then((r) => r.arrayBuffer());
      const font = opentype.parse(fallback);
      fontCache.set(key, font);
      return font;
    } catch {
      return null;
    }
  }
}

/** opentype.js path commands → BezierPoint list (approximation for cubic segments). */
function pathToBezierPoints(path: opentype.Path, ox: number, oy: number): OutlineBezierPoint[] {
  const pts: OutlineBezierPoint[] = [];
  let cur: { x: number; y: number } = { x: ox, y: oy };
  for (const cmd of path.commands) {
    if (cmd.type === "M") {
      cur = { x: (cmd as { x: number; y: number }).x + ox, y: (cmd as { y: number }).y + oy };
      if (pts.length === 0) {
        pts.push({
          anchor: { ...cur },
          handleIn: { ...cur },
          handleOut: { ...cur },
          vertexMode: "corner",
        });
      }
    } else if (cmd.type === "L") {
      const x = (cmd as { x: number; y: number }).x + ox;
      const y = (cmd as { y: number }).y + oy;
      const end = { x, y };
      const prev = pts[pts.length - 1];
      if (prev) {
        prev.handleOut = { x: prev.anchor.x + (end.x - prev.anchor.x) / 3, y: prev.anchor.y + (end.y - prev.anchor.y) / 3 };
        pts.push({
          anchor: end,
          handleIn: { x: end.x - (end.x - prev.anchor.x) / 3, y: end.y - (end.y - prev.anchor.y) / 3 },
          handleOut: { ...end },
          vertexMode: "corner",
        });
      }
      cur = end;
    } else if (cmd.type === "C") {
      const c = cmd as { x1: number; y1: number; x2: number; y2: number; x: number; y: number };
      const p0 = pts.length > 0 ? pts[pts.length - 1].anchor : cur;
      const cp1 = { x: c.x1 + ox, y: c.y1 + oy };
      const cp2 = { x: c.x2 + ox, y: c.y2 + oy };
      const p3 = { x: c.x + ox, y: c.y + oy };
      if (pts.length > 0) {
        pts[pts.length - 1].handleOut = cp1;
      }
      pts.push({
        anchor: p3,
        handleIn: cp2,
        handleOut: { ...p3 },
        vertexMode: "smooth",
      });
      cur = p3;
    } else if (cmd.type === "Q") {
      const c = cmd as { x1: number; y1: number; x: number; y: number };
      const p0 = pts.length > 0 ? pts[pts.length - 1].anchor : cur;
      const qp = { x: c.x1 + ox, y: c.y1 + oy };
      const p2 = { x: c.x + ox, y: c.y + oy };
      const cp1 = { x: p0.x + (2 / 3) * (qp.x - p0.x), y: p0.y + (2 / 3) * (qp.y - p0.y) };
      const cp2 = { x: p2.x + (2 / 3) * (qp.x - p2.x), y: p2.y + (2 / 3) * (qp.y - p2.y) };
      if (pts.length > 0) pts[pts.length - 1].handleOut = cp1;
      pts.push({ anchor: p2, handleIn: cp2, handleOut: { ...p2 }, vertexMode: "smooth" });
      cur = p2;
    } else if (cmd.type === "Z" && pts.length > 1) {
      pts[pts.length - 1].handleOut = pts[0].handleIn;
    }
  }
  return pts;
}

export interface OutlineResult {
  points: OutlineBezierPoint[];
  closed: boolean;
}

export async function textToOutlinePaths(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  originX: number,
  originY: number,
): Promise<OutlineResult | null> {
  const font = await loadFont(fontFamily);
  if (!font) return null;
  const path = font.getPath(text, originX, originY, fontSize, { kerning: true });
  const unitsPerEm = font.unitsPerEm || 1000;
  const scale = fontSize / unitsPerEm;
  void scale;
  void fontWeight;
  const bb = path.getBoundingBox();
  if (!Number.isFinite(bb.x1)) return null;
  const commands = path.commands;
  if (commands.length === 0) return null;

  const subpaths: OutlineBezierPoint[][] = [];
  let current: OutlineBezierPoint[] = [];
  let cur = { x: originX, y: originY };

  const flush = () => {
    if (current.length > 1) subpaths.push(current);
    current = [];
  };

  for (const cmd of commands) {
    if (cmd.type === "M") {
      flush();
      cur = { x: (cmd as { x: number; y: number }).x, y: (cmd as { y: number }).y };
      current.push({
        anchor: { ...cur },
        handleIn: { ...cur },
        handleOut: { ...cur },
        vertexMode: "corner",
      });
    } else if (cmd.type === "L" && current.length) {
      const x = (cmd as { x: number; y: number }).x;
      const y = (cmd as { y: number }).y;
      const prev = current[current.length - 1];
      prev.handleOut = { x: prev.anchor.x + (x - prev.anchor.x) / 3, y: prev.anchor.y + (y - prev.anchor.y) / 3 };
      current.push({
        anchor: { x, y },
        handleIn: { x: x - (x - prev.anchor.x) / 3, y: y - (y - prev.anchor.y) / 3 },
        handleOut: { x, y },
        vertexMode: "corner",
      });
      cur = { x, y };
    } else if (cmd.type === "C" && current.length) {
      const c = cmd as { x1: number; y1: number; x2: number; y2: number; x: number; y: number };
      const last = current[current.length - 1];
      last.handleOut = { x: c.x1, y: c.y1 };
      current.push({
        anchor: { x: c.x, y: c.y },
        handleIn: { x: c.x2, y: c.y2 },
        handleOut: { x: c.x, y: c.y },
        vertexMode: "smooth",
      });
      cur = { x: c.x, y: c.y };
    } else if (cmd.type === "Q" && current.length) {
      const c = cmd as { x1: number; y1: number; x: number; y: number };
      const p0 = current[current.length - 1].anchor;
      const qp = { x: c.x1, y: c.y1 };
      const p2 = { x: c.x, y: c.y };
      const cp1 = { x: p0.x + (2 / 3) * (qp.x - p0.x), y: p0.y + (2 / 3) * (qp.y - p0.y) };
      const cp2 = { x: p2.x + (2 / 3) * (qp.x - p2.x), y: p2.y + (2 / 3) * (qp.y - p2.y) };
      current[current.length - 1].handleOut = cp1;
      current.push({
        anchor: p2,
        handleIn: cp2,
        handleOut: { ...p2 },
        vertexMode: "smooth",
      });
      cur = p2;
    } else if (cmd.type === "Z") {
      if (current.length > 2) {
        current[current.length - 1].handleOut = current[0].handleIn;
        subpaths.push(current);
        current = [];
      }
    }
  }
  flush();

  if (subpaths.length === 0) {
    const pts = pathToBezierPoints(path, 0, 0);
    if (pts.length < 2) return null;
    return { points: pts, closed: true };
  }

  const longest = subpaths.reduce((a, b) => (b.length > a.length ? b : a), subpaths[0]);
  return { points: longest, closed: true };
}
