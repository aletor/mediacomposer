import { INDESIGN_PAD } from "./page-formats";
import type { Story, TextFrame } from "./text-model";
import {
  DEFAULT_TYPOGRAPHY,
  plainTextToStoryNodes,
  serializeStoryContent,
  uid,
} from "./text-model";

export function linkFrameAfter(
  stories: Story[],
  textFrames: TextFrame[],
  afterFrameId: string,
  targetFrameId: string,
): { stories: Story[]; textFrames: TextFrame[] } {
  const afterFr = textFrames.find((f) => f.id === afterFrameId);
  const targetFr = textFrames.find((f) => f.id === targetFrameId);
  if (!afterFr || !targetFr || afterFrameId === targetFrameId) return { stories, textFrames };

  const sa = stories.find((s) => s.id === afterFr.storyId);
  const sb = stories.find((s) => s.id === targetFr.storyId);
  if (!sa || !sb) return { stories, textFrames };

  if (sa.id === sb.id) {
    if (sa.frames.includes(targetFrameId)) return { stories, textFrames };
    const next = { ...sa, frames: [...sa.frames] };
    const i = next.frames.indexOf(afterFrameId);
    if (i >= 0) next.frames.splice(i + 1, 0, targetFrameId);
    else next.frames.push(targetFrameId);
    return {
      stories: stories.map((s) => (s.id === sa.id ? next : s)),
      textFrames,
    };
  }

  if (sb.frames.length !== 1 || sb.frames[0] !== targetFrameId) {
    return { stories, textFrames };
  }

  const mergedStream =
    serializeStoryContent(sa.content) + serializeStoryContent(sb.content);
  const merged: Story = {
    ...sa,
    content: plainTextToStoryNodes(mergedStream),
    frames: (() => {
      const out = [...sa.frames];
      const i = out.indexOf(afterFrameId);
      if (i >= 0) out.splice(i + 1, 0, targetFrameId);
      else out.push(targetFrameId);
      return out;
    })(),
  };

  const nextFrames = textFrames.map((f) =>
    f.id === targetFrameId ? { ...f, storyId: sa.id } : f,
  );

  return {
    stories: stories.filter((s) => s.id !== sb.id).map((s) => (s.id === sa.id ? merged : s)),
    textFrames: nextFrames,
  };
}

/**
 * Separa a partir de `frameId`: cabeza conserva marcos anteriores; cola (desde este marco) → nueva Story.
 */
export function unlinkFrameAt(
  stories: Story[],
  textFrames: TextFrame[],
  frameId: string,
  contentSplitIndex: number,
): { stories: Story[]; textFrames: TextFrame[] } {
  const fr = textFrames.find((f) => f.id === frameId);
  const story = stories.find((s) => s.id === fr?.storyId);
  if (!fr || !story) return { stories, textFrames };

  const ord = story.frames;
  const idx = ord.indexOf(frameId);
  if (idx <= 0) return { stories, textFrames };

  const stream = serializeStoryContent(story.content);
  const headText = stream.slice(0, contentSplitIndex);
  const tailText = stream.slice(contentSplitIndex);

  const headFrameIds = ord.slice(0, idx);
  const tailFrameIds = ord.slice(idx);

  const headStory: Story = {
    ...story,
    content: plainTextToStoryNodes(headText),
    frames: headFrameIds,
  };

  const newSid = uid("story");
  const tailStory: Story = {
    id: newSid,
    content: plainTextToStoryNodes(tailText),
    frames: tailFrameIds,
    typography: { ...story.typography },
  };

  const nextFrames = textFrames.map((f) => {
    if (!tailFrameIds.includes(f.id)) return f;
    return { ...f, storyId: newSid };
  });

  return {
    stories: stories.filter((s) => s.id !== story.id).concat([headStory, tailStory]),
    textFrames: nextFrames,
  };
}

export function appendTextFrameAfter(
  stories: Story[],
  textFrames: TextFrame[],
  afterFrameId: string,
  box: Pick<TextFrame, "x" | "y" | "width" | "height"> & { padding?: number },
): { stories: Story[]; textFrames: TextFrame[] } {
  const src = textFrames.find((f) => f.id === afterFrameId);
  const story = stories.find((s) => s.id === src?.storyId);
  if (!src || !story) return { stories, textFrames };

  const nfId = uid("tf");
  const nf: TextFrame = {
    id: nfId,
    storyId: story.id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    padding: box.padding ?? 4,
  };
  const i = story.frames.indexOf(afterFrameId);
  const newOrder = [...story.frames];
  if (i >= 0) newOrder.splice(i + 1, 0, nfId);
  else newOrder.push(nfId);

  const nextStory: Story = { ...story, frames: newOrder };
  return {
    stories: stories.map((s) => (s.id === story.id ? nextStory : s)),
    textFrames: [...textFrames, nf],
  };
}

export function createStoryWithFrame(
  box: Pick<TextFrame, "x" | "y" | "width" | "height"> & { padding?: number },
): { story: Story; frame: TextFrame } {
  const storyId = uid("story");
  const frameId = uid("tf");
  const frame: TextFrame = {
    id: frameId,
    storyId,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    padding: box.padding ?? 4,
  };
  const story: Story = {
    id: storyId,
    content: plainTextToStoryNodes("Escribe aquí…"),
    frames: [frameId],
    typography: { ...DEFAULT_TYPOGRAPHY },
  };
  return { story, frame };
}

export function updateTextFrameGeometry(
  textFrames: TextFrame[],
  frameId: string,
  patch: Partial<Pick<TextFrame, "x" | "y" | "width" | "height" | "padding" | "opacity">>,
): TextFrame[] {
  return textFrames.map((f) => (f.id === frameId ? { ...f, ...patch } : f));
}

export function updateStoryTypography(
  stories: Story[],
  storyId: string,
  patch: Partial<Story["typography"]>,
): Story[] {
  return stories.map((s) =>
    s.id === storyId ? { ...s, typography: { ...s.typography, ...patch } } : s,
  );
}

export function patchStoryContentPlain(stories: Story[], storyId: string, plain: string): Story[] {
  return stories.map((s) =>
    s.id === storyId ? { ...s, content: plainTextToStoryNodes(plain) } : s,
  );
}

/** Elimina un marco del flujo y del modelo; el texto de la historia se mantiene y se redistribuye. */
const FOLLOW_GAP = 8;
const DEFAULT_FOLLOW_W = 200;
const DEFAULT_FOLLOW_H = 120;

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Posición para un marco de continuación: primero a la derecha / debajo del origen,
 * luego rejilla en el pliego sin solapar otros marcos.
 */
export function findFollowUpFrameRect(
  source: TextFrame,
  allFrames: TextFrame[],
  pageWidth: number,
  pageHeight: number,
  opts?: { width?: number; height?: number; gap?: number },
): Pick<TextFrame, "x" | "y" | "width" | "height"> {
  const gap = opts?.gap ?? FOLLOW_GAP;
  let w = opts?.width ?? DEFAULT_FOLLOW_W;
  let h = opts?.height ?? DEFAULT_FOLLOW_H;
  w = Math.min(w, Math.max(24, pageWidth - gap * 2));
  h = Math.min(h, Math.max(24, pageHeight - gap * 2));
  const minX = INDESIGN_PAD;
  const minY = INDESIGN_PAD;
  const maxX = INDESIGN_PAD + pageWidth - w;
  const maxY = INDESIGN_PAD + pageHeight - h;

  const blocks = allFrames;

  const tryPositions: Array<{ x: number; y: number }> = [
    { x: source.x + source.width + gap, y: source.y },
    { x: source.x + source.width + gap, y: source.y + Math.max(0, source.height - h) },
    { x: source.x, y: source.y + source.height + gap },
    {
      x: source.x + Math.max(0, (source.width - w) / 2),
      y: source.y + source.height + gap,
    },
    { x: source.x - w - gap, y: source.y },
  ];

  for (const p of tryPositions) {
    const x = Math.max(minX, Math.min(p.x, maxX));
    const y = Math.max(minY, Math.min(p.y, maxY));
    const cand = { x, y, width: w, height: h };
    if (!blocks.some((o) => rectsOverlap(cand, o))) return cand;
  }

  const stepX = w + gap;
  const stepY = h + gap;
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 40; col++) {
      const x = Math.max(minX, Math.min(minX + col * stepX, maxX));
      const y = Math.max(minY, Math.min(minY + row * stepY, maxY));
      const cand = { x, y, width: w, height: h };
      if (!blocks.some((o) => rectsOverlap(cand, o))) return cand;
    }
  }

  return { x: maxX, y: maxY, width: w, height: h };
}

export function deleteTextFrame(
  stories: Story[],
  textFrames: TextFrame[],
  frameId: string,
): { stories: Story[]; textFrames: TextFrame[] } {
  const fr = textFrames.find((f) => f.id === frameId);
  if (!fr) return { stories, textFrames };
  const story = stories.find((s) => s.id === fr.storyId);
  if (!story) return { stories, textFrames };

  const nextFramesOrder = story.frames.filter((id) => id !== frameId);
  const nextTextFrames = textFrames.filter((f) => f.id !== frameId);

  if (nextFramesOrder.length === 0) {
    return {
      stories: stories.filter((s) => s.id !== story.id),
      textFrames: nextTextFrames,
    };
  }

  return {
    stories: stories.map((s) =>
      s.id === story.id ? { ...s, frames: nextFramesOrder } : s,
    ),
    textFrames: nextTextFrames,
  };
}
