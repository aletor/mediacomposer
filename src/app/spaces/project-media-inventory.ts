import type { Node } from "@xyflow/react";

export type ProjectMediaKind = "image" | "video" | "audio" | "unknown";

export type ProjectMediaItem = {
  /** Estable por URL + categoría */
  id: string;
  url: string;
  kind: ProjectMediaKind;
  /** Origen legible (tipo de nodo o «Designer» / «Presenter») */
  sourceLabel: string;
  nodeId: string;
};

const GENERATOR_NODE_TYPES = new Set([
  "nanoBanana",
  "geminiVideo",
  "vfxGenerator",
  "grokProcessor",
  "enhancer",
  "backgroundRemover",
  "mediaDescriber",
]);

const IMPORT_NODE_TYPES = new Set(["mediaInput", "urlImage", "spaceInput"]);

function isLikelyHttpUrl(s: string): boolean {
  const t = s.trim();
  if (t.length < 8) return false;
  if (t.startsWith("data:")) return false;
  return /^https?:\/\//i.test(t);
}

function guessKind(url: string, dataType?: string): ProjectMediaKind {
  const u = url.toLowerCase();
  if (dataType === "video" || /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u)) return "video";
  if (dataType === "audio" || /\.(mp3|wav|aac|ogg|m4a)(\?|#|$)/i.test(u)) return "audio";
  if (dataType === "image" || /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(u)) return "image";
  if (dataType === "video") return "video";
  if (dataType === "image") return "image";
  if (dataType === "audio") return "audio";
  return "unknown";
}

function pushUnique(
  list: ProjectMediaItem[],
  seen: Set<string>,
  url: string,
  kind: ProjectMediaKind,
  sourceLabel: string,
  nodeId: string,
) {
  if (!isLikelyHttpUrl(url)) return;
  const key = `${url}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    id: `${nodeId}::${seen.size}::${key.slice(0, 48)}`,
    url: url.trim(),
    kind,
    sourceLabel,
    nodeId,
  });
}

function extractFromNodeData(
  data: Record<string, unknown>,
  into: string[],
) {
  const v = data.value;
  if (typeof v === "string" && isLikelyHttpUrl(v)) into.push(v);

  const urls = data.urls;
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (typeof u === "string" && isLikelyHttpUrl(u)) into.push(u);
    }
  }

  const gh = data.generationHistory;
  if (Array.isArray(gh)) {
    for (const u of gh) {
      if (typeof u === "string" && isLikelyHttpUrl(u)) into.push(u);
    }
  }

  const av = data._assetVersions;
  if (Array.isArray(av)) {
    for (const ent of av) {
      if (!ent || typeof ent !== "object") continue;
      const url = (ent as { url?: string }).url;
      if (typeof url === "string" && isLikelyHttpUrl(url)) into.push(url);
    }
  }

  const lastGen = data.lastGenerated;
  if (typeof lastGen === "string" && isLikelyHttpUrl(lastGen)) into.push(lastGen);
}

function walkDesignerPagesForUrls(pages: unknown, into: string[]) {
  if (!Array.isArray(pages)) return;
  for (const p of pages) {
    const objects = (p as { objects?: unknown }).objects;
    if (!Array.isArray(objects)) continue;
    for (const o of objects) {
      if (!o || typeof o !== "object") continue;
      const ob = o as Record<string, unknown>;
      if (ob.type === "image" && typeof ob.src === "string") into.push(ob.src);
      if (ob.type === "rect") {
        const ifc = ob.imageFrameContent as { src?: string } | null | undefined;
        if (ifc?.src && typeof ifc.src === "string") into.push(ifc.src);
      }
      if (ob.type === "booleanGroup" && typeof ob.cachedResult === "string") into.push(ob.cachedResult);
    }
  }
}

function presenterVideoUrls(data: Record<string, unknown>, into: string[]) {
  const pl = data.imageVideoPlacements;
  if (!Array.isArray(pl)) return;
  for (const p of pl) {
    if (!p || typeof p !== "object") continue;
    const u = (p as { videoUrl?: string }).videoUrl;
    if (typeof u === "string" && isLikelyHttpUrl(u)) into.push(u);
  }
}

/**
 * Recorre el grafo del proyecto y agrupa URLs multimedia en importados vs generados.
 * - Generados: salidas de nodos de IA (Nano Banana, Video, VFX, Grok, etc.) y entradas en `_assetVersions` con `source === 'graph-run'`.
 * - Importados: subidas/URL manual (mediaInput, urlImage), contenido en Designer/Presenter, y el resto de orígenes no marcados como generador.
 */
export function collectProjectMedia(nodes: Node[]): {
  imported: ProjectMediaItem[];
  generated: ProjectMediaItem[];
} {
  const imported: ProjectMediaItem[] = [];
  const generated: ProjectMediaItem[] = [];
  const seenI = new Set<string>();
  const seenG = new Set<string>();

  for (const n of nodes) {
    const nodeId = n.id;
    const nodeType = n.type || "";
    const data = (n.data ?? {}) as Record<string, unknown>;
    const dataType = typeof data.type === "string" ? data.type : undefined;

    if (nodeType === "designer") {
      const urls: string[] = [];
      walkDesignerPagesForUrls(data.pages, urls);
      for (const url of urls) {
        pushUnique(imported, seenI, url, guessKind(url, "image"), "Designer", nodeId);
      }
      continue;
    }

    if (nodeType === "presenter") {
      const urls: string[] = [];
      presenterVideoUrls(data, urls);
      for (const url of urls) {
        pushUnique(imported, seenI, url, "video", "Presenter", nodeId);
      }
      continue;
    }

    const urls: string[] = [];
    extractFromNodeData(data, urls);

    const isGenNode = GENERATOR_NODE_TYPES.has(nodeType);
    const isImportNode = IMPORT_NODE_TYPES.has(nodeType);

    const av = data._assetVersions;
    const graphRunUrls: string[] = [];
    if (Array.isArray(av)) {
      for (const ent of av) {
        if (!ent || typeof ent !== "object") continue;
        const urlEnt = (ent as { url?: string; source?: string }).url;
        const source = (ent as { source?: string }).source;
        if (typeof urlEnt === "string" && isLikelyHttpUrl(urlEnt) && source === "graph-run") {
          graphRunUrls.push(urlEnt);
        }
      }
    }

    for (const url of urls) {
      const kind = guessKind(url, dataType);
      if (graphRunUrls.includes(url) || isGenNode) {
        pushUnique(generated, seenG, url, kind, nodeType || "nodo", nodeId);
      } else if (isImportNode) {
        pushUnique(imported, seenI, url, kind, nodeType || "nodo", nodeId);
      } else {
        pushUnique(imported, seenI, url, kind, nodeType || "nodo", nodeId);
      }
    }

    for (const url of graphRunUrls) {
      if (!urls.includes(url)) {
        pushUnique(generated, seenG, url, guessKind(url, dataType), `${nodeType} · historial`, nodeId);
      }
    }
  }

  const genUrlSet = new Set(generated.map((g) => g.url));
  const importedDeduped = imported.filter((i) => !genUrlSet.has(i.url));

  return { imported: importedDeduped, generated };
}
