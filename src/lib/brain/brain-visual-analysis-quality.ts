import type { BrainVisualAnalysisQualityTier, BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";

export type VisualAnalysisQualityTier = BrainVisualAnalysisQualityTier;

/** Términos demasiado vagos si aparecen solos o dominan el texto. */
const GENERIC_HINTS = [
  "lifestyle",
  "minimalista",
  "minimalist",
  "contexto",
  "calma",
  "cercanía",
  "cercania",
  "moderno",
  "modern",
  "accesible",
  "estudio limpio",
  "contemporáneo",
  "contemporary",
  "personas",
  "people",
  "humano",
  "human",
  "marca cercana",
  "cercana",
  "accesible",
] as const;

/** Señales concretas que esperamos en referencias editoriales / proceso real (ES/EN). */
const CONCRETE_SIGNALS = [
  "portátil",
  "laptop",
  "macbook",
  "mesa",
  "escritorio",
  "boceto",
  "sketch",
  "moodboard",
  "libro",
  "libros",
  "vinilo",
  "vinilos",
  "madera",
  "natural",
  "editorial",
  "documental",
  "ordenador",
  "papel",
  "creativ",
  "trabajo",
  "interior",
  "doméstico",
  "ropa",
  "luz natural",
  "biblioteca",
  "objeto",
  "cultural",
  "analógico",
  "digital",
  "proceso",
  "reunión",
  "equipo",
  "material",
  "collage",
  "referencia física",
] as const;

function haystack(a: BrainVisualImageAnalysis): string {
  const bits: string[] = [
    ...(a.subjectTags ?? []),
    ...(a.visualStyle ?? []),
    ...(a.mood ?? []),
    ...(a.composition ?? []),
    a.people,
    a.clothingStyle,
    a.graphicStyle,
    a.implicitBrandMessage ?? "",
    ...(a.visualMessage ?? []),
    a.reasoning ?? "",
    a.subject,
  ];
  return bits.join(" ").toLowerCase();
}

function countHits(text: string, needles: readonly string[]): number {
  let n = 0;
  for (const w of needles) {
    if (text.includes(w.toLowerCase())) n += 1;
  }
  return n;
}

/**
 * Clasifica si un análisis visual aporta señales específicas o solo vocabulario genérico.
 * No sustituye la opinión humana; sirve para warnings y re-estudio.
 */
export function validateVisualAnalysisSpecificity(a: BrainVisualImageAnalysis): VisualAnalysisQualityTier {
  if (a.visionProviderId === "mock" && a.fallbackUsed !== true) return "mock";
  if (a.analysisStatus === "failed") return "failed";

  const t = haystack(a);
  const concrete = countHits(t, CONCRETE_SIGNALS);
  const generic = countHits(t, GENERIC_HINTS);
  const tagDepth = (a.subjectTags?.length ?? 0) + (a.visualStyle?.length ?? 0) + (a.mood?.length ?? 0);

  if (concrete >= 4 || (concrete >= 2 && tagDepth >= 10)) return "specific";
  if (generic >= 5 && concrete <= 2) return "too_generic";
  if (generic >= 3 && concrete === 0) return "too_generic";
  if (concrete >= 1) return "acceptable";
  if (tagDepth >= 8) return "acceptable";
  return "too_generic";
}

export function annotateAnalysesWithQuality(
  analyses: BrainVisualImageAnalysis[],
): BrainVisualImageAnalysis[] {
  return analyses.map((a) => ({
    ...a,
    analysisQuality: validateVisualAnalysisSpecificity(a),
  }));
}
