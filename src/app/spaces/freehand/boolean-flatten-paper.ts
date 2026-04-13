/**
 * Aplana un grupo booleano a un único `path` (`d` SVG) usando Paper.js (operaciones vectoriales).
 * Solo se ejecuta en el cliente.
 */

/** Instancia de `paper.PathItem` (path / compound path tras boolean). */
type PaperPathItem = InstanceType<typeof import("paper")["PathItem"]>;

export type PaperBooleanOp = "union" | "subtract" | "intersect" | "exclude";

export type PaperFlattenResult = {
  pathData: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** SVG combinado (un solo documento con varias formas en el mismo viewBox). */
export async function paperFlattenBooleanFromCombinedSvg(
  operation: PaperBooleanOp,
  combinedSvg: string,
): Promise<PaperFlattenResult | null> {
  if (typeof window === "undefined") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paper = (await import("paper")).default as any;

  const canvas = document.createElement("canvas");
  paper.setup(canvas);

  const root = paper.project.importSVG(combinedSvg, { insert: true });
  if (!root) {
    paper.project.clear();
    return null;
  }

  // `importSVG` añade a veces un rectángulo de recorte (`clipMask`) alineado con el viewBox;
  // hay que ignorarlo o el boolean usa la misma forma dos veces.
  // Los `<rect>` / `<ellipse>` llegan como `Shape`, que no hereda `pathData` de PathItem: convierten con `toPath(false)`.
  const raw = paper.project.getItems({
    recursive: true,
    match: (it: { clipMask?: boolean }) => {
      if (it.clipMask) return false;
      return (
        it instanceof paper.Path ||
        it instanceof paper.CompoundPath ||
        it instanceof paper.Shape
      );
    },
  });

  const paths: PaperPathItem[] = [];
  for (const it of raw) {
    if (it instanceof paper.Shape) {
      const p = it.toPath(false);
      if (p && String(p.pathData ?? "").trim().length > 0) paths.push(p);
    } else if (String((it as { pathData?: string }).pathData ?? "").trim().length > 0) {
      paths.push(it);
    }
  }

  if (!paths || paths.length === 0) {
    paper.project.clear();
    return null;
  }

  let acc: PaperPathItem = paths[0];
  for (let i = 1; i < paths.length; i++) {
    const next = paths[i];
    switch (operation) {
      case "union":
        acc = acc.unite(next) as PaperPathItem;
        break;
      case "subtract":
        acc = acc.subtract(next) as PaperPathItem;
        break;
      case "intersect":
        acc = acc.intersect(next) as PaperPathItem;
        break;
      case "exclude":
        acc = acc.exclude(next) as PaperPathItem;
        break;
      default:
        paper.project.clear();
        return null;
    }
  }

  const b = acc.bounds;
  if (!b) {
    paper.project.clear();
    return null;
  }

  const x = b.x;
  const y = b.y;
  const width = Math.max(b.width, 0.01);
  const height = Math.max(b.height, 0.01);

  // `d` en espacio local (origen 0,0) para poder escalar con width/height sin reescribir el trazo.
  acc.translate(new paper.Point(-x, -y));
  const pathData = acc.pathData as string;
  paper.project.clear();

  if (!pathData) return null;

  return {
    pathData,
    x,
    y,
    width,
    height,
  };
}
