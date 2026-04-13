import type { Canvas as FabricCanvas, FabricObject, Group as FabricGroup } from "fabric";
import { isFabricActiveSelection } from "./fabric-active-selection";
import type { Story, TextFrame } from "./text-model";
import { plainTextToStoryNodes, serializeStoryContent, uid } from "./text-model";

export type IndesignClipFabric = {
  kind: "fabric";
  json: Record<string, unknown>;
};

export type IndesignClipText = {
  kind: "text";
  story: Story;
  frame: TextFrame;
};

export type IndesignClipItem = IndesignClipFabric | IndesignClipText;

export type IndesignClipboardPayload = {
  items: IndesignClipItem[];
  /** Esquina superior izquierda del grupo copiado (para pegar con offset uniforme). */
  anchor: { x: number; y: number };
};

function shouldCopyObject(o: FabricObject): boolean {
  if (o.get?.("name") === "indesignPageBg") return false;
  if (o.get?.("indesignType") === "textLine") return false;
  return true;
}

export function collectSelectionTargets(active: FabricObject | null | undefined): FabricObject[] {
  if (!active) return [];
  if (isFabricActiveSelection(active)) {
    return (active as FabricGroup).getObjects().filter(shouldCopyObject);
  }
  return shouldCopyObject(active) ? [active] : [];
}

function selectionBBox(targets: FabricObject[]): { x: number; y: number } {
  if (targets.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  for (const o of targets) {
    const b = o.getBoundingRect();
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
  }
  return { x: minX, y: minY };
}

function cloneStoryForSingleFrame(story: Story, frame: TextFrame): { story: Story; frame: TextFrame } {
  const plain = serializeStoryContent(story.content);
  const storyId = uid("story");
  const frameId = uid("tf");
  const newStory: Story = {
    id: storyId,
    content: plainTextToStoryNodes(plain),
    frames: [frameId],
    typography: { ...story.typography },
  };
  const newFrame: TextFrame = {
    ...frame,
    id: frameId,
    storyId,
  };
  return { story: newStory, frame: newFrame };
}

/**
 * Construye la carga útil del portapapeles desde la selección actual del canvas.
 */
export function buildIndesignClipboardPayload(
  canvas: FabricCanvas,
  stories: Story[],
  textFrames: TextFrame[],
  serialProps: string[],
): IndesignClipboardPayload | null {
  const active = canvas.getActiveObject() as FabricObject | undefined;
  const targets = collectSelectionTargets(active ?? null);
  if (targets.length === 0) return null;

  const anchor = selectionBBox(targets);
  const items: IndesignClipItem[] = [];
  const storyById = new Map(stories.map((s) => [s.id, s]));
  const frameById = new Map(textFrames.map((f) => [f.id, f]));

  for (const o of targets) {
    const it = o.get("indesignType") as string | undefined;
    if (it === "textFrameHit") {
      const fid = o.get("frameId") as string;
      const fr = frameById.get(fid);
      const story = fr ? storyById.get(fr.storyId) : undefined;
      if (!fr || !story) continue;
      const { story: ns, frame: nf } = cloneStoryForSingleFrame(story, fr);
      items.push({ kind: "text", story: ns, frame: nf });
    } else {
      const json = o.toObject(serialProps) as Record<string, unknown>;
      items.push({ kind: "fabric", json });
    }
  }

  if (items.length === 0) return null;
  return { items, anchor };
}

function newFabricUid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Reasigna UIDs de marco / imagen y desplaza geometría en JSON antes de enliven. */
function remapFabricJsonForPaste(
  json: Record<string, unknown>,
  frameUidMap: Map<string, string>,
  uniformDx: number,
  uniformDy: number,
): void {
  const t = json.indesignType as string | undefined;
  const left = typeof json.left === "number" ? json.left : 0;
  const top = typeof json.top === "number" ? json.top : 0;
  json.left = left + uniformDx;
  json.top = top + uniformDy;

  if (t === "frame") {
    const old = json.indesignUid as string | undefined;
    if (old) {
      const nu = newFabricUid("frm");
      frameUidMap.set(old, nu);
      json.indesignUid = nu;
    }
  } else if (t === "frameImage") {
    json.indesignUid = newFabricUid("img");
    const fu = json.frameUid as string | undefined;
    if (fu && frameUidMap.has(fu)) {
      json.frameUid = frameUidMap.get(fu)!;
    }
  } else if (t === "vectorShape") {
    json.indesignUid = newFabricUid("vec");
  }

  const cp = json.clipPath as Record<string, unknown> | undefined;
  if (cp && typeof cp.left === "number" && typeof cp.top === "number") {
    cp.left = (cp.left as number) + uniformDx;
    cp.top = (cp.top as number) + uniformDy;
  }
}

function applyAbsoluteFabricPosition(
  json: Record<string, unknown>,
  abs: { left: number; top: number },
): void {
  const oldL = typeof json.left === "number" ? json.left : 0;
  const oldT = typeof json.top === "number" ? json.top : 0;
  const ddx = abs.left - oldL;
  const ddy = abs.top - oldT;
  json.left = abs.left;
  json.top = abs.top;
  const cp = json.clipPath as Record<string, unknown> | undefined;
  if (cp && typeof cp.left === "number" && typeof cp.top === "number") {
    cp.left = (cp.left as number) + ddx;
    cp.top = (cp.top as number) + ddy;
  }
}

export type PasteOptions = {
  /** Desplazamiento respecto a las posiciones copiadas (p. ej. 16,16 al pegar). */
  uniformDelta?: { dx: number; dy: number };
  /** Sustituye posición de cada ítem fabric (mismo orden que `kind: "fabric"` en el payload). */
  absoluteFabricPositions?: { left: number; top: number }[];
  /** Sustituye x/y del marco de texto pegado (mismo orden que `kind: "text"`). */
  absoluteTextFrames?: { x: number; y: number }[];
};

/**
 * Pega ítems en el canvas y devuelve el nuevo modelo de texto.
 * Los objetos fabric se añaden al canvas; el texto solo al modelo (paintText en el hook).
 */
export async function pasteIndesignClipboard(
  canvas: FabricCanvas,
  fabricNS: typeof import("fabric"),
  stories: Story[],
  textFrames: TextFrame[],
  payload: IndesignClipboardPayload,
  opts: PasteOptions = {},
): Promise<{
  stories: Story[];
  textFrames: TextFrame[];
  addedFabricObjects: FabricObject[];
  createdTextFrameIds: string[];
}> {
  const { util } = fabricNS;
  const uniform = opts.uniformDelta ?? { dx: 16, dy: 16 };
  const anchorDx = uniform.dx;
  const anchorDy = uniform.dy;

  let nextStories = [...stories];
  let nextFrames = [...textFrames];

  const frameUidMap = new Map<string, string>();
  const fabricJsons: Record<string, unknown>[] = [];
  let fabricPosIdx = 0;
  let textPosIdx = 0;
  const createdTextFrameIds: string[] = [];

  for (const item of payload.items) {
    if (item.kind === "text") {
      const storyId = uid("story");
      const frameId = uid("tf");
      createdTextFrameIds.push(frameId);
      const absT = opts.absoluteTextFrames?.[textPosIdx];
      textPosIdx++;
      const story: Story = {
        ...item.story,
        id: storyId,
        frames: [frameId],
        typography: { ...item.story.typography },
      };
      const frame: TextFrame = {
        ...item.frame,
        id: frameId,
        storyId,
        x: absT ? Math.round(absT.x) : Math.round(item.frame.x + anchorDx),
        y: absT ? Math.round(absT.y) : Math.round(item.frame.y + anchorDy),
      };
      nextStories = [...nextStories, story];
      nextFrames = [...nextFrames, frame];
    } else {
      const j = JSON.parse(JSON.stringify(item.json)) as Record<string, unknown>;
      remapFabricJsonForPaste(j, frameUidMap, anchorDx, anchorDy);
      const absList = opts.absoluteFabricPositions;
      if (absList && absList[fabricPosIdx]) {
        applyAbsoluteFabricPosition(j, absList[fabricPosIdx]!);
      }
      fabricJsons.push(j);
      fabricPosIdx++;
    }
  }

  const addedFabricObjects: FabricObject[] = [];
  if (fabricJsons.length > 0) {
    const objs = (await util.enlivenObjects(fabricJsons)) as FabricObject[];
    for (const o of objs) {
      canvas.add(o);
      addedFabricObjects.push(o);
    }
  }

  canvas.requestRenderAll();
  return {
    stories: nextStories,
    textFrames: nextFrames,
    addedFabricObjects,
    createdTextFrameIds,
  };
}

export function countFabricItemsInPayload(payload: IndesignClipboardPayload): number {
  return payload.items.filter((i) => i.kind === "fabric").length;
}

/** Posiciones actuales de los objetos seleccionados (mismo orden que al construir el payload). */
export function buildAbsolutePasteOptionsFromTargets(targets: FabricObject[]): Pick<
  PasteOptions,
  "absoluteFabricPositions" | "absoluteTextFrames"
> {
  const fabric: { left: number; top: number }[] = [];
  const texts: { x: number; y: number }[] = [];
  for (const t of targets) {
    if (!shouldCopyObject(t)) continue;
    const it = t.get("indesignType") as string | undefined;
    if (it === "textFrameHit") {
      texts.push({ x: Math.round(t.left ?? 0), y: Math.round(t.top ?? 0) });
    } else {
      fabric.push({ left: t.left ?? 0, top: t.top ?? 0 });
    }
  }
  return { absoluteFabricPositions: fabric, absoluteTextFrames: texts };
}
