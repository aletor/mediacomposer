/** Misma convención que Freehand (CSS `font-feature-settings`). */

export const OPEN_TYPE_PANEL_TAGS = ["kern", "liga", "calt", "smcp", "onum", "frac", "sups", "subs"] as const;

export function parseOpenTypeFeatureMap(s: string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!s || !s.trim() || s.trim() === "normal") return m;
  const re = /"([^"]+)"\s*(\d+)/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(s)) !== null) m.set(hit[1], Number(hit[2]));
  return m;
}

export function stringifyOpenTypeFeatureMap(map: Map<string, number>): string {
  if (map.size === 0) return "normal";
  return [...map.entries()].map(([k, v]) => `"${k}" ${v}`).join(", ");
}
