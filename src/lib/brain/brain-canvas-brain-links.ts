import type { BrainNodeType } from "./brain-telemetry";

/** Forma mínima de nodo/edge del canvas para derivar enlaces Brain. */
export type BrainFlowNodeLite = {
  id: string;
  type?: string;
  data?: { label?: string; title?: string; name?: string };
};

export type BrainFlowEdgeLite = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type BrainDownstreamClient = {
  id: string;
  /** Tipo de nodo en el registro del canvas (p. ej. designer, photoRoom). */
  canvasType: string;
  /** Tipo estable para UI / telemetría. */
  brainNodeType: BrainNodeType | "OTHER";
  label: string;
};

const BRAIN_OUT = "brain";

function pickLabel(n: BrainFlowNodeLite): string {
  const d = n.data;
  const a =
    (typeof d?.label === "string" && d.label.trim()) ||
    (typeof d?.title === "string" && d.title.trim()) ||
    (typeof d?.name === "string" && d.name.trim());
  if (a) return a;
  if (n.type) return humanizeCanvasType(n.type);
  return n.id;
}

function humanizeCanvasType(t: string): string {
  const map: Record<string, string> = {
    designer: "Designer",
    photoRoom: "Photoroom",
    articleWriter: "Article Writer",
    projectBrain: "Brain",
    nanoBanana: "Imagen",
    presentation: "Presentación",
  };
  return map[t] ?? t;
}

function toBrainNodeType(canvasType: string | undefined): BrainNodeType | "OTHER" {
  switch (canvasType) {
    case "designer":
      return "DESIGNER";
    case "articleWriter":
      return "ARTICLE_WRITER";
    case "photoRoom":
      return "PHOTOROOM";
    case "presentation":
      return "PRESENTATION_NODE";
    case "nanoBanana":
    case "imageComposer":
      return "IMAGE_GENERATOR";
    case "videoNode":
    case "grokProcessor":
      return "VIDEO_NODE";
    default:
      return "CUSTOM";
  }
}

/** Ids de nodos Brain (projectBrain) en el grafo. */
export function findProjectBrainNodeIds(nodes: BrainFlowNodeLite[]): string[] {
  return nodes.filter((n) => n.type === "projectBrain").map((n) => n.id);
}

/**
 * Nodos que reciben salida Brain (arista desde projectBrain con handle `brain`).
 * Placeholder para futuro `listConnectedBrainNodes(projectId)`.
 */
export function listDownstreamBrainClients(
  nodes: BrainFlowNodeLite[] | undefined,
  edges: BrainFlowEdgeLite[] | undefined,
): BrainDownstreamClient[] {
  if (!nodes?.length || !edges?.length) return [];
  const brainIds = new Set(findProjectBrainNodeIds(nodes));
  if (brainIds.size === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: BrainDownstreamClient[] = [];
  for (const e of edges) {
    if (!brainIds.has(e.source)) continue;
    if (e.sourceHandle !== BRAIN_OUT) continue;
    if (e.targetHandle !== "brain") continue;
    if (seen.has(e.target)) continue;
    const target = byId.get(e.target);
    if (!target) continue;
    seen.add(e.target);
    const ct = target.type ?? "unknown";
    out.push({
      id: e.target,
      canvasType: ct,
      brainNodeType: toBrainNodeType(ct),
      label: pickLabel(target),
    });
  }
  return out;
}
