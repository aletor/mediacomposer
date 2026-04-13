/**
 * Convierte rectángulo / elipse en PathObject con puntos Bézier (Selección directa).
 */

import paper from "paper";
import type { PathObject, RectObject, EllipseObject } from "../FreehandStudio";

type BezierPoint = NonNullable<PathObject["points"]>[number];

function paperSegmentToBezier(seg: paper.Segment): BezierPoint {
  const ax = seg.point.x;
  const ay = seg.point.y;
  return {
    anchor: { x: ax, y: ay },
    handleIn: { x: ax + seg.handleIn.x, y: ay + seg.handleIn.y },
    handleOut: { x: ax + seg.handleOut.x, y: ay + seg.handleOut.y },
    vertexMode: "smooth",
  };
}

function pathItemToRing(paperPath: paper.Path): BezierPoint[] {
  return paperPath.segments.map((s) => paperSegmentToBezier(s));
}

function ringsToFlat(rings: BezierPoint[][]): { points: BezierPoint[]; contourStarts: number[] } {
  const points: BezierPoint[] = [];
  const contourStarts: number[] = [];
  for (const r of rings) {
    contourStarts.push(points.length);
    points.push(...r);
  }
  return { points, contourStarts };
}

function boundsFromBezierPoints(points: BezierPoint[]): { x: number; y: number; w: number; h: number } {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const pt of points) {
    for (const q of [pt.anchor, pt.handleIn, pt.handleOut]) {
      x1 = Math.min(x1, q.x);
      y1 = Math.min(y1, q.y);
      x2 = Math.max(x2, q.x);
      y2 = Math.max(y2, q.y);
    }
  }
  return { x: x1, y: y1, w: Math.max(x2 - x1, 1e-6), h: Math.max(y2 - y1, 1e-6) };
}

function applyObjTransformToItem(
  item: paper.Item,
  o: { x: number; y: number; width: number; height: number; rotation?: number; flipX?: boolean; flipY?: boolean },
): void {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const c = new paper.Point(cx, cy);
  if (o.rotation) item.rotate(o.rotation, c);
  const fx = o.flipX ? -1 : 1;
  const fy = o.flipY ? -1 : 1;
  if (fx !== 1 || fy !== 1) item.scale(fx, fy, c);
}

function buildPathFromShape(shape: paper.Shape, source: RectObject | EllipseObject): PathObject | null {
  applyObjTransformToItem(shape, source);
  const path = shape.toPath(false);
  if (!path || path.segments.length < 2) return null;

  const rings = [pathItemToRing(path)];
  const { points, contourStarts } = ringsToFlat(rings);
  const pb = boundsFromBezierPoints(points);
  const name = source.name.endsWith("(trazo)") ? source.name : `${source.name} (trazo)`;

  const stripped =
    source.type === "rect"
      ? (() => {
          const { rx: _rx, type: _t, ...rest } = source as RectObject;
          return rest;
        })()
      : (() => {
          const { type: _t, ...rest } = source as EllipseObject;
          return rest;
        })();

  return {
    ...stripped,
    type: "path",
    name,
    x: pb.x,
    y: pb.y,
    width: pb.w,
    height: pb.h,
    rotation: 0,
    flipX: false,
    flipY: false,
    points,
    contourStarts: contourStarts.length > 1 ? contourStarts : undefined,
    closed: path.closed !== false,
  } as PathObject;
}

export function bakeRectToPath(r: RectObject): PathObject | null {
  if (typeof window === "undefined") return null;
  if (r.isImageFrame) return null;

  const canvas = document.createElement("canvas");
  paper.setup(canvas);

  const rect = new paper.Rectangle(r.x, r.y, r.width, r.height);
  const rx = Math.min(r.rx ?? 0, r.width / 2, r.height / 2);
  const shape = rx > 0 ? new paper.Shape.Rectangle(rect, new paper.Size(rx, rx)) : new paper.Shape.Rectangle(rect);

  const out = buildPathFromShape(shape, r);
  paper.project.clear();
  return out;
}

export function bakeEllipseToPath(e: EllipseObject): PathObject | null {
  if (typeof window === "undefined") return null;

  const canvas = document.createElement("canvas");
  paper.setup(canvas);

  const rect = new paper.Rectangle(e.x, e.y, e.width, e.height);
  const shape = new paper.Shape.Ellipse(rect);

  const out = buildPathFromShape(shape, e);
  paper.project.clear();
  return out;
}
