/**
 * Estilos de capa no destructivos (PhotoRoom / Freehand).
 * UI: "Layer Styles"; propiedad persistida: `layerEffects` en el objeto.
 */

/** Mismos valores que CSS `mix-blend-mode` en SVG (ver `LayerBlendMode` en FreehandStudio). */
export type LayerEffectBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "plus-lighter"
  | "plus-darker";

export type LayerGradientStop = { offset: number; color: string };

export type LayerGradientConfig = {
  type: "linear" | "radial";
  angle: number;
  scale: number;
  reverse: boolean;
  stops: LayerGradientStop[];
};

export type ColorOverlayEffect = {
  enabled: boolean;
  color: string;
  opacity: number;
  blendMode: LayerEffectBlendMode;
};

export type GradientOverlayEffect = {
  enabled: boolean;
  opacity: number;
  blendMode: LayerEffectBlendMode;
  gradient: LayerGradientConfig;
};

export type LayerEffects = {
  colorOverlay?: ColorOverlayEffect;
  gradientOverlay?: GradientOverlayEffect;
};

export function defaultLayerEffects(): LayerEffects {
  return {
    colorOverlay: {
      enabled: false,
      color: "#ff0000",
      opacity: 1,
      blendMode: "normal",
    },
    gradientOverlay: {
      enabled: false,
      opacity: 1,
      blendMode: "normal",
      gradient: {
        type: "linear",
        angle: 90,
        scale: 1,
        reverse: false,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#0000ff" },
        ],
      },
    },
  };
}

export function cloneLayerEffectsForEdit(src: LayerEffects | undefined): LayerEffects {
  const d = defaultLayerEffects();
  const base: LayerEffects = {
    colorOverlay: d.colorOverlay ? { ...d.colorOverlay } : undefined,
    gradientOverlay: d.gradientOverlay
      ? {
          ...d.gradientOverlay,
          gradient: {
            ...d.gradientOverlay.gradient,
            stops: d.gradientOverlay.gradient.stops.map((s) => ({ ...s })),
          },
        }
      : undefined,
  };
  if (!src) return base;
  if (src.colorOverlay) base.colorOverlay = { ...src.colorOverlay };
  if (src.gradientOverlay) {
    base.gradientOverlay = {
      ...src.gradientOverlay,
      gradient: {
        ...src.gradientOverlay.gradient,
        stops: src.gradientOverlay.gradient.stops.map((s) => ({ ...s })),
      },
    };
  }
  return base;
}

export function hasActiveLayerEffects(le: LayerEffects | undefined): boolean {
  if (!le) return false;
  return !!(le.colorOverlay?.enabled || le.gradientOverlay?.enabled);
}

/** Capas raster elegibles para Layer Styles en PhotoRoom. */
export function isLayerStylesEligible(o: { type: string; cachedResult?: string | null }): boolean {
  if (o.type === "image") return true;
  if (o.type === "booleanGroup") {
    const s = o.cachedResult;
    return typeof s === "string" && s.trim().length > 0;
  }
  return false;
}
