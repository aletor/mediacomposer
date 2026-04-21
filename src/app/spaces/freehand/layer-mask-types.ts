/**
 * Máscara de capa (gris): no destructiva, misma resolución que el bitmap de la capa.
 * Luminancia: blanco = visible, negro = transparente, gris = parcial. α_final = α_base × M.
 */

export type LayerMaskData = {
  /** PNG (RGBA o escala de gris); se usa la luminancia en render. */
  src: string;
  pixelW: number;
  pixelH: number;
  enabled: boolean;
  /** Si true, se invierte M en el render (1 − L). */
  inverted: boolean;
};

export function defaultLayerMask(over: Partial<LayerMaskData> & Pick<LayerMaskData, "src" | "pixelW" | "pixelH">): LayerMaskData {
  return {
    enabled: true,
    inverted: false,
    ...over,
  };
}

export function hasLayerMaskBlock(o: { layerMask?: LayerMaskData | null }): boolean {
  return !!(o.layerMask && o.layerMask.src && o.layerMask.pixelW > 0 && o.layerMask.pixelH > 0);
}

export function isLayerMaskVisible(o: { layerMask?: LayerMaskData | null }): boolean {
  return hasLayerMaskBlock(o) && (o.layerMask?.enabled !== false);
}

/** Mismas capas que Layer Styles: imagen o grupo booleano con caché raster. */
export function isLayerMaskRasterEligible(o: { type: string; cachedResult?: string | null }): boolean {
  if (o.type === "image") return true;
  if (o.type === "booleanGroup") {
    const s = o.cachedResult;
    return typeof s === "string" && s.trim().length > 0;
  }
  return false;
}

export function cloneLayerMaskForEdit(m: LayerMaskData | null | undefined): LayerMaskData | null {
  if (!m) return null;
  return { ...m };
}
