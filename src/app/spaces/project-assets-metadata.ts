/**
 * Datos de «Assets» del proyecto (marca + fuente de conocimiento).
 * Se persisten en `project.metadata.assets` al guardar el proyecto.
 */

export type KnowledgeDocumentEntry = {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** data URL (base64); solo si cabe bajo el límite */
  dataUrl?: string;
};

export type ProjectBrandKit = {
  /** data URL imagen logo en positivo (fondo claro) */
  logoPositive: string | null;
  /** data URL imagen logo en negativo (fondo oscuro) */
  logoNegative: string | null;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
};

export type ProjectKnowledgeSource = {
  urls: string[];
  documents: KnowledgeDocumentEntry[];
};

export type ProjectAssetsMetadata = {
  brand: ProjectBrandKit;
  knowledge: ProjectKnowledgeSource;
};

const DEFAULT_BRAND: ProjectBrandKit = {
  logoPositive: null,
  logoNegative: null,
  colorPrimary: "#0f172a",
  colorSecondary: "#64748b",
  colorAccent: "#f59e0b",
};

const DEFAULT_KNOWLEDGE: ProjectKnowledgeSource = {
  urls: [],
  documents: [],
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_KNOWLEDGE_DOC_BYTES = 4 * 1024 * 1024;

export function defaultProjectAssets(): ProjectAssetsMetadata {
  return {
    brand: { ...DEFAULT_BRAND },
    knowledge: {
      urls: [...DEFAULT_KNOWLEDGE.urls],
      documents: [],
    },
  };
}

export function normalizeProjectAssets(raw: unknown): ProjectAssetsMetadata {
  const base = defaultProjectAssets();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const brandIn = o.brand;
  const knowIn = o.knowledge;

  const brand = { ...base.brand };
  if (brandIn && typeof brandIn === "object") {
    const b = brandIn as Record<string, unknown>;
    if (b.logoPositive === null || typeof b.logoPositive === "string") brand.logoPositive = b.logoPositive as string | null;
    if (b.logoNegative === null || typeof b.logoNegative === "string") brand.logoNegative = b.logoNegative as string | null;
    for (const key of ["colorPrimary", "colorSecondary", "colorAccent"] as const) {
      if (typeof b[key] === "string" && /^#[0-9A-Fa-f]{6}$/.test(b[key] as string)) {
        brand[key] = b[key] as string;
      }
    }
  }

  const knowledge = { ...base.knowledge, urls: [...base.knowledge.urls], documents: [...base.knowledge.documents] };
  if (knowIn && typeof knowIn === "object") {
    const k = knowIn as Record<string, unknown>;
    if (Array.isArray(k.urls)) {
      knowledge.urls = k.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    }
    if (Array.isArray(k.documents)) {
      knowledge.documents = k.documents
        .filter((d): d is KnowledgeDocumentEntry => {
          if (!d || typeof d !== "object") return false;
          const x = d as Record<string, unknown>;
          return typeof x.id === "string" && typeof x.name === "string" && typeof x.size === "number";
        })
        .map((d) => ({
          ...d,
          mime: typeof d.mime === "string" ? d.mime : "application/octet-stream",
          dataUrl: typeof d.dataUrl === "string" ? d.dataUrl : undefined,
        }));
    }
  }

  return { brand, knowledge };
}

/** Texto compacto para el asistente del lienzo (sin data URLs de logos). */
export function summarizeProjectAssetsForAssistant(raw: unknown): string {
  const a = normalizeProjectAssets(raw);
  const nUrl = a.knowledge.urls.length;
  const nDoc = a.knowledge.documents.length;
  const hasPos = Boolean(a.brand.logoPositive);
  const hasNeg = Boolean(a.brand.logoNegative);
  return [
    `Brand colors (hex): primary ${a.brand.colorPrimary}, secondary ${a.brand.colorSecondary}, accent ${a.brand.colorAccent}.`,
    `Logos in Brain: positive=${hasPos ? "yes" : "no"}, negative=${hasNeg ? "yes" : "no"}.`,
    `Knowledge: ${nUrl} link(s), ${nDoc} document(s).`,
  ].join(" ");
}
