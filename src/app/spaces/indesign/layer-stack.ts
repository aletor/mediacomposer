import type { Canvas as FabricCanvas, FabricObject } from "fabric";

function isIndesignPageBackground(o: FabricObject): boolean {
  return o.get?.("name") === "indesignPageBg";
}

/** Objetos que aparecen como fila en el panel de capas (excluye líneas de texto sueltas y el fondo). */
function isIndesignLayerListObject(o: FabricObject): boolean {
  if (isIndesignPageBackground(o)) return false;
  if (o.get?.("indesignType") === "textLine") return false;
  return true;
}

/**
 * Separa el fondo de página y agrupa marcos de texto (hit + líneas) como un solo bloque de apilamiento.
 * `blocks` va de abajo arriba (orden de Fabric).
 */
export function splitIndesignPrefixAndLayerBlocks(objects: FabricObject[]): {
  prefix: FabricObject[];
  blocks: FabricObject[][];
} {
  const prefix: FabricObject[] = [];
  const blocks: FabricObject[][] = [];
  let i = 0;
  while (i < objects.length) {
    const o = objects[i]!;
    if (isIndesignPageBackground(o)) {
      prefix.push(o);
      i++;
      continue;
    }
    const it = o.get?.("indesignType") as string | undefined;
    if (it === "textFrameHit") {
      const fid = o.get("frameId") as string;
      const chunk: FabricObject[] = [o];
      i++;
      while (i < objects.length) {
        const t = objects[i]!;
        if (t.get?.("indesignType") === "textLine" && t.get("frameId") === fid) {
          chunk.push(t);
          i++;
        } else break;
      }
      blocks.push(chunk);
      continue;
    }
    if (isIndesignLayerListObject(o)) {
      blocks.push([o]);
      i++;
      continue;
    }
    prefix.push(o);
    i++;
  }
  return { prefix, blocks };
}

/**
 * Reordena capas según índices en la lista visual (arriba = índice 0).
 * Mueve bloques enteros (texto: hit + líneas).
 */
export function reorderIndesignLayersInCanvas(
  canvas: FabricCanvas,
  fromDisplayIndex: number,
  toDisplayIndex: number,
): void {
  const all = canvas.getObjects();
  const { prefix, blocks } = splitIndesignPrefixAndLayerBlocks(all);
  const n = blocks.length;
  if (n < 2) return;
  let from = Math.min(Math.max(0, fromDisplayIndex), n - 1);
  let to = Math.min(Math.max(0, toDisplayIndex), n - 1);
  if (from === to) return;
  const display = [...blocks].reverse();
  const [moved] = display.splice(from, 1);
  display.splice(to, 0, moved);
  const nextBlocksBottomToTop = [...display].reverse();
  const flat = [...prefix, ...nextBlocksBottomToTop.flat()];
  if (flat.length !== all.length) return;
  for (const o of all) canvas.remove(o);
  for (const o of flat) canvas.add(o);
  canvas.requestRenderAll();
}
