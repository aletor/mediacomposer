import type { FreehandObject } from "../FreehandStudio";

function unionBounds(items: FreehandObject[]): { x: number; y: number; width: number; height: number } | null {
  if (!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of items) {
    const x1 = o.x;
    const y1 = o.y;
    const x2 = o.x + Math.max(0, o.width);
    const y2 = o.y + Math.max(0, o.height);
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/** Rectángulo envolvente (eje alineado) de todos los objetos con ese `groupId` en la página. */
export function boundsForGroupId(objects: FreehandObject[], groupId: string): { x: number; y: number; width: number; height: number } | null {
  const parts = objects.filter((o) => o.groupId === groupId);
  return unionBounds(parts);
}

/** Bounds de un objeto por id (incluye máscara de clip o miembro suelto). */
/** Cuántos objetos comparten ese `groupId` (para mostrar en el panel Animations). */
export function countObjectsInGroup(objects: FreehandObject[], groupId: string): number {
  return objects.filter((o) => o.groupId === groupId).length;
}

export function boundsForObjectId(objects: FreehandObject[], objectId: string): { x: number; y: number; width: number; height: number } | null {
  const o = objects.find((x) => x.id === objectId);
  if (!o) return null;
  if (o.isClipMask) {
    const members = objects.filter((m) => m.clipMaskId === objectId);
    return unionBounds([o, ...members]);
  }
  return unionBounds([o]);
}
