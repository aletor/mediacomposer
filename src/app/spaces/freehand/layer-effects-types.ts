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

/** Igual que en Photoshop: Softer = halo más suave; Precise = borde más definido. */
export type OuterGlowTechnique = "softer" | "precise";

export type OuterGlowEffect = {
  enabled: boolean;
  blendMode: LayerEffectBlendMode;
  /** 0–1 */
  opacity: number;
  /** 0–100 */
  noise: number;
  fill: "color" | "gradient";
  color: string;
  gradient: LayerGradientConfig;
  technique: OuterGlowTechnique;
  /** 0–100 (expande el borde antes del desenfoque) */
  spread: number;
  /** px, tamaño del desenfoque */
  size: number;
  /** 0–100 (caída del halo; ~50 ≈ neutro) */
  range: number;
};

export type LayerEffects = {
  colorOverlay?: ColorOverlayEffect;
  gradientOverlay?: GradientOverlayEffect;
  outerGlow?: OuterGlowEffect;
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
    outerGlow: {
      enabled: false,
      blendMode: "normal",
      opacity: 0.85,
      noise: 0,
      fill: "color",
      color: "#ffcc00",
      gradient: {
        type: "linear",
        angle: 90,
        scale: 1,
        reverse: false,
        stops: [
          { offset: 0, color: "#ffff00" },
          { offset: 1, color: "#ff6600" },
        ],
      },
      technique: "softer",
      spread: 0,
      size: 12,
      range: 50,
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
    outerGlow: d.outerGlow
      ? {
          ...d.outerGlow,
          gradient: {
            ...d.outerGlow.gradient,
            stops: d.outerGlow.gradient.stops.map((s) => ({ ...s })),
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
  if (src.outerGlow) {
    base.outerGlow = {
      ...src.outerGlow,
      gradient: {
        ...src.outerGlow.gradient,
        stops: src.outerGlow.gradient.stops.map((s) => ({ ...s })),
      },
    };
  }
  return base;
}

export function hasActiveLayerEffects(le: LayerEffects | undefined): boolean {
  if (!le) return false;
  return !!(le.colorOverlay?.enabled || le.gradientOverlay?.enabled || le.outerGlow?.enabled);
}

/**
 * Capas elegibles para Layer Styles (PhotoRoom): raster, boolean con caché, y formas vectoriales básicas.
 * Excluye marcos de imagen (`rect` con `isImageFrame`), texto y contenedores.
 */
export function isLayerStylesEligible(o: {
  type: string;
  cachedResult?: string | null;
  isImageFrame?: boolean;
}): boolean {
  if (o.type === "image") return true;
  if (o.type === "booleanGroup") {
    const s = o.cachedResult;
    return typeof s === "string" && s.trim().length > 0;
  }
  if (o.type === "rect") return o.isImageFrame !== true;
  if (o.type === "ellipse" || o.type === "path") return true;
  return false;
}
