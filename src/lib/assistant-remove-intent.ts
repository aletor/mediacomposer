/**
 * Intenciones de borrado para el asistente (sin modelo o como refuerzo).
 */

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "elimina el último nodo", "delete the last node", etc. */
export function tryResolveRemoveLastNodeId(
  prompt: string,
  nodes: { id: string; position?: { x?: number; y?: number } }[]
): string | null {
  const p = normalize(prompt);
  if (nodes.length === 0) return null;

  const lastNodePhrase =
    /\b(elimina|eliminar|borra|borrar|quita|quitar|delete|remove|suprime|suprimir)\s+(el\s+|la\s+|the\s+)?(ultimo|last)\s+(nodo|node)\b/i.test(p) ||
    /\b(elimina|eliminar|borra|borrar|quita|quitar|delete|remove)\s+(el\s+|la\s+|the\s+)?(nodo|node)\s+(ultimo|last)\b/i.test(p);

  if (!lastNodePhrase) return null;

  let best = nodes[0];
  let bestX = best.position?.x ?? 0;
  let bestY = best.position?.y ?? 0;
  for (const n of nodes) {
    const x = n.position?.x ?? 0;
    const y = n.position?.y ?? 0;
    if (x > bestX || (x === bestX && y > bestY)) {
      best = n;
      bestX = x;
      bestY = y;
    }
  }
  return best.id;
}

/** Con nodos seleccionados: "elimina el seleccionado", "borra este nodo", etc. */
export function tryResolveRemoveSelectedIds(
  prompt: string,
  selectedNodes: { id: string }[]
): string[] {
  if (selectedNodes.length === 0) return [];
  const p = normalize(prompt);

  const deleteVerb =
    /\b(elimina|eliminar|borra|borrar|quita|quitar|delete|remove|suprime|suprimir|saca|sacar)\b/.test(p);
  if (!deleteVerb) return [];

  if (/\b(seleccionados?|selected)\b/.test(p)) {
    return selectedNodes.map((n) => n.id);
  }
  if (
    selectedNodes.length === 1 &&
    (/\beste\s+nodo\b/.test(p) || /\bthis\s+node\b/.test(p) || /\bel\s+nodo\s+seleccionado\b/.test(p))
  ) {
    return [selectedNodes[0].id];
  }
  return [];
}

export function applyNodeRemovals(
  nodes: unknown[],
  edges: unknown[],
  removeIds: string[]
): { nodes: unknown[]; edges: unknown[] } {
  if (removeIds.length === 0) return { nodes, edges };
  const rm = new Set(removeIds);
  const nextNodes = nodes.filter((n) => !rm.has((n as { id?: string }).id ?? ""));
  const ids = new Set(
    nextNodes.map((n) => (n as { id?: string }).id).filter((x): x is string => typeof x === "string")
  );
  const nextEdges = edges.filter((e) => {
    const s = (e as { source?: string }).source;
    const t = (e as { target?: string }).target;
    return typeof s === "string" && typeof t === "string" && ids.has(s) && ids.has(t);
  });
  return { nodes: nextNodes, edges: nextEdges };
}
