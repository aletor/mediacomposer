/**
 * Reduce el tamaño del workspace enviado al modelo del asistente (límite ~128k tokens).
 * Sustituye data URLs y recorta strings / arrays muy largos sin perder id/type/edges.
 */

const MAX_NEST = 14;
/** Cadenas largas genéricas (prompts, JSON embebido, etc.) */
const MAX_PLAIN_STRING = 2400;
/** Arrays numéricos o de puntos (trazos, paths…) */
const MAX_ARRAY_ITEMS = 100;

function approxKb(n: number): string {
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function isDataUrl(s: string): boolean {
  return s.length > 12 && /^data:[^,\s]+;base64,/i.test(s.slice(0, 200));
}

function lightenString(s: string): string {
  if (s.length === 0) return s;
  if (s.startsWith("data:") || isDataUrl(s)) {
    return `[omitted data URL ~${approxKb(s.length)}]`;
  }
  if (s.length > MAX_PLAIN_STRING) {
    const head = s.slice(0, Math.min(900, MAX_PLAIN_STRING));
    return `${head}… [truncated, ${s.length} chars total]`;
  }
  return s;
}

export function lightenUnknown(value: unknown, depth = 0): unknown {
  if (depth > MAX_NEST) return "[omitted: deep nesting]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return lightenString(value);

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      const head = value
        .slice(0, Math.min(40, MAX_ARRAY_ITEMS))
        .map((x) => lightenUnknown(x, depth + 1));
      return [...head, `[… ${value.length - head.length} more items omitted]`];
    }
    return value.map((x) => lightenUnknown(x, depth + 1));
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length > 80) {
      const slim: Record<string, unknown> = {};
      for (const k of keys.slice(0, 80)) {
        slim[k] = lightenUnknown(o[k], depth + 1);
      }
      slim._omittedKeys = keys.length - 80;
      return slim;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = lightenUnknown(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Nodos XYFlow: recorta `data` y metadatos pesados; conserva id, type, position, selected, etc. */
export function lightenNodesForAssistant(nodes: unknown[]): unknown[] {
  return nodes.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const n = raw as Record<string, unknown>;
    const {
      id,
      type,
      position,
      data,
      selected,
      width,
      height,
      style,
      parentId,
      zIndex,
      draggable,
      selectable,
      deletable,
    } = n;
    return {
      id,
      type,
      position,
      selected,
      width,
      height,
      style: style !== undefined ? lightenUnknown(style, 0) : undefined,
      parentId,
      zIndex,
      draggable,
      selectable,
      deletable,
      data: data !== undefined ? lightenUnknown(data, 0) : undefined,
    };
  });
}

const DEFAULT_CONTEXT_CHAR_BUDGET = 380_000;

/**
 * Si tras `lightenNodesForAssistant` el JSON sigue siendo enorme, recorta la lista de nodos.
 */
function minimalNodeStub(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return { type: "unknown", data: { _assistantOmitted: true } };
  const n = raw as Record<string, unknown>;
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    selected: n.selected,
    data: {
      _assistantOmitted: true,
      nodeType: n.type,
      hint: "Payload was too large for the assistant context; edit using id/type or select the node.",
    },
  };
}

export function trimNodesToCharBudget(
  nodes: unknown[],
  maxChars: number = DEFAULT_CONTEXT_CHAR_BUDGET
): { nodes: unknown[]; omitted: number } {
  const json = JSON.stringify(nodes);
  if (json.length <= maxChars) return { nodes, omitted: 0 };

  let lo = 1;
  let hi = nodes.length;
  let best: unknown[] = [];
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = nodes.slice(0, mid);
    if (JSON.stringify(slice).length <= maxChars) {
      best = slice;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best.length > 0) {
    return { nodes: best, omitted: nodes.length - best.length };
  }
  /** Ni un nodo completo cabe: dejar solo un esqueleto id/type. */
  const stub = minimalNodeStub(nodes[0]);
  return { nodes: [stub], omitted: nodes.length - 1 };
}
