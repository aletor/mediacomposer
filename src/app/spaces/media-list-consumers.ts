import type { Node } from "@xyflow/react";

import { buildCineMediaListOutput } from "./cine-engine";
import { normalizeCineData } from "./cine-types";
import { isMediaListOutput, type MediaListItem, type MediaListOutput } from "./media-list-output";

export type VideoEditorClip = {
  id: string;
  sourceItemId: string;
  assetId: string;
  mediaType: "image" | "video" | "audio";
  title: string;
  startTime: number;
  durationSeconds: number;
  sceneId?: string;
  metadata?: unknown;
};

type MediaListSourceNode = Pick<Node, "id" | "type" | "data">;

function parseMediaListValue(value: unknown): MediaListOutput | null {
  if (isMediaListOutput(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isMediaListOutput(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readMediaListFromNode(sourceNode: MediaListSourceNode | undefined): MediaListOutput | null {
  if (!sourceNode) return null;
  const data = sourceNode.data ?? {};
  const direct = parseMediaListValue((data as { mediaListOutput?: unknown }).mediaListOutput);
  if (direct) return direct;
  const alias = parseMediaListValue((data as { media_list?: unknown }).media_list);
  if (alias) return alias;
  const value = parseMediaListValue((data as { value?: unknown }).value);
  if (value) return value;
  if (sourceNode.type === "cine") {
    return buildCineMediaListOutput(normalizeCineData(data), sourceNode.id);
  }
  return null;
}

export function isMediaListItemDownloadable(item: MediaListItem): boolean {
  return item.mediaType !== "placeholder" && Boolean(item.url || item.assetId);
}

export function buildMediaListManifest(output: MediaListOutput) {
  return {
    sourceNodeId: output.sourceNodeId,
    sourceNodeType: output.sourceNodeType,
    title: output.title,
    status: output.status,
    exportedAt: new Date().toISOString(),
    items: output.items,
    groups: output.groups ?? [],
    metadata: output.metadata,
  };
}

export function buildVideoEditorClipsFromMediaList(output: MediaListOutput): VideoEditorClip[] {
  const ordered = [...output.items].sort((a, b) => {
    const sceneA = a.sceneOrder ?? Number.MAX_SAFE_INTEGER;
    const sceneB = b.sceneOrder ?? Number.MAX_SAFE_INTEGER;
    if (sceneA !== sceneB) return sceneA - sceneB;
    return a.order - b.order;
  });
  const sceneIdsWithVideo = new Set(
    ordered
      .filter((item) => item.mediaType === "video" && Boolean(item.assetId || item.url) && item.sceneId)
      .map((item) => item.sceneId as string),
  );
  let startTime = 0;
  const clips: VideoEditorClip[] = [];

  ordered.forEach((item) => {
    if (item.mediaType === "placeholder" || !item.assetId && !item.url) return;
    if (item.mediaType !== "image" && item.mediaType !== "video" && item.mediaType !== "audio") return;
    if (item.mediaType === "image" && item.sceneId && sceneIdsWithVideo.has(item.sceneId)) return;
    const durationSeconds = item.durationSeconds ?? (item.mediaType === "image" ? 4 : 5);
    clips.push({
      id: `clip_${item.id}`,
      sourceItemId: item.id,
      assetId: item.assetId || item.url || "",
      mediaType: item.mediaType,
      title: item.title,
      startTime,
      durationSeconds,
      sceneId: item.sceneId,
      metadata: item.metadata,
    });
    startTime += durationSeconds;
  });

  return clips;
}
