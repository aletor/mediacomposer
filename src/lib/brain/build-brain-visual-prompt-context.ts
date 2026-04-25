import type {
  AggregatedVisualPatterns,
  BrainVisualImageAnalysis,
  BrainVisualStyleSlotKey,
  ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import { defaultBrainVisualStyle } from "@/app/spaces/project-assets-metadata";
import {
  aggregateVisualPatterns,
  getEffectiveClassification,
  isExcludedFromVisualDna,
} from "@/lib/brain/brain-visual-analysis";
import {
  buildSpanishTrustedVisualNarrative,
  filterLegacyLanguageTraits,
  isTrustedRemoteVisionAnalysis,
} from "@/lib/brain/brain-brand-summary";
import type { BrainSourceTier } from "@/lib/brain/brain-field-provenance";

/** Fuentes que realmente alimentaron el contexto visual (prioridad conceptual). */
export type BrainVisualPromptSourcesUsed = {
  confirmedUserVisualDna: boolean;
  coreVisualReferenceAnalysis: boolean;
  projectVisualReferenceAnalysis: boolean;
  aggregatedPatternsTrusted: boolean;
  visionDerivedVisualStyleSlots: boolean;
  /** Copy de estrategia / voz: solo como capa secundaria cuando hay señal visual fuerte, o como refuerzo débil. */
  secondaryBrandStrategyText: boolean;
};

export type BrainVisualPromptSourceQuality = "high" | "medium" | "low" | "text_only";

export type BrainVisualPromptContextResult = {
  visualDirection: string;
  visualStyleTags: string[];
  mood: string[];
  subjects: string[];
  environments: string[];
  composition: string[];
  lighting: string[];
  colorPalette: string[];
  peopleAndWardrobe: string[];
  objectsAndProps: string[];
  visualMessage: string[];
  doUse: string[];
  doAvoid: string[];
  visualAvoid: string[];
  sourceQuality: BrainVisualPromptSourceQuality;
  sources: BrainVisualPromptSourcesUsed;
  textOnlyGeneration: boolean;
  /** Señal visual débil (sin confirmados ni análisis remotos ni slots fuertes). */
  visualContextWeak: boolean;
  /** Tier dominante usado para la columna vertebral del prompt. */
  sourceTier: BrainSourceTier | "mixed";
  /** Advertencias de trazabilidad (p. ej. topic legacy, corporate relegado). */
  warnings: string[];
  /** Texto corporativo recortado solo como contexto de mensaje (nunca sustituye ADN confirmado en A). */
  brandMessageContext?: string;
  /** Análisis con visión remota fiable (Gemini/OpenAI, sin fallback). */
  visualReferenceAnalysisRealCount: number;
  patternSummaryUsed: boolean;
  /** Se usó texto de slots por defecto o agregados sin referencias remotas como columna vertebral. */
  fallbackDefaultUsed: boolean;
};

export type BrainImageSuggestionDiagnostics = {
  finalPromptUsed: string;
  visualSourcesUsed: BrainVisualPromptSourcesUsed;
  visualReferenceAnalysisRealCount: number;
  confirmedVisualDnaUsed: boolean;
  patternSummaryUsed: boolean;
  fallbackDefaultUsed: boolean;
  textOnlyGeneration: boolean;
  /** Capa de copy de producto/capacidades añadida al prompt (siempre después del bloque visual). */
  secondaryBrandProductCopy?: boolean;
};

const DEFAULT_VISUAL_AVOID: readonly string[] = [
  "stock corporate photography",
  "futuristic SaaS dashboard as hero",
  "generic glass office",
  "team smiling at tablet or screen",
  "over-polished startup stock photo",
  "blue tech gel lighting as main mood",
  "sterile empty workspace",
  "unrealistic glossy AI render",
  "screens and UI chrome as the main subject",
  "empty minimalism without cultural or tactile objects",
];

function analysisQualityOk(a: BrainVisualImageAnalysis): boolean {
  const q = a.analysisQuality;
  if (!q || q === "specific" || q === "acceptable") return true;
  return false;
}

function slotIsVisionDerived(
  key: BrainVisualStyleSlotKey,
  slot: ProjectAssetsMetadata["strategy"]["visualStyle"][BrainVisualStyleSlotKey] | undefined,
): boolean {
  if (!slot?.description?.trim()) return false;
  if (slot.source === "manual") return true;
  const def = defaultBrainVisualStyle()[key];
  return slot.description.trim() !== def.description.trim();
}

/** Slot confirmado manualmente o derivado de visión real (no plantilla default). */
function slotIsUserOrVisionReal(
  key: BrainVisualStyleSlotKey,
  slot: ProjectAssetsMetadata["strategy"]["visualStyle"][BrainVisualStyleSlotKey] | undefined,
): boolean {
  if (!slot?.description?.trim()) return false;
  if (slot.source === "manual") return true;
  return slotIsVisionDerived(key, slot);
}

function uniqStrings(items: readonly string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const t = (raw || "").trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function collectLightingHints(analyses: BrainVisualImageAnalysis[]): string[] {
  const hints: string[] = [];
  for (const a of analyses) {
    const g = (a.graphicStyle || "").toLowerCase();
    const comp = (a.composition || []).join(" ").toLowerCase();
    const tags = (a.subjectTags ?? []).join(" ").toLowerCase();
    const moods = (a.mood ?? []).join(" ").toLowerCase();
    const blob = `${g} ${comp} ${tags} ${moods}`;
    if (blob.includes("natural light") || blob.includes("luz natural")) hints.push("luz natural");
    if (blob.includes("window light") || blob.includes("ventana")) hints.push("luz de ventana");
    if (blob.includes("flash") || blob.includes("editorial flash")) hints.push("flash editorial suave");
    if (blob.includes("golden hour") || blob.includes("hora dorada")) hints.push("luz cálida de interior");
  }
  return uniqStrings(hints, 6);
}

function collectEnvironmentHints(analyses: BrainVisualImageAnalysis[], agg: AggregatedVisualPatterns): string[] {
  const fromComp = agg.compositionNotes.filter((x) => /interior|espacio|mesa|estudio|habitación|sala|oficina casera/i.test(x));
  const fromSubjects = analyses.flatMap((a) => a.subjectTags ?? []).filter((x) =>
    /interior|mesa|estudio|habitación|sala|living|home office|loft/i.test(x),
  );
  return uniqStrings([...fromComp, ...fromSubjects], 12);
}

function collectTextureHints(analyses: BrainVisualImageAnalysis[], agg: AggregatedVisualPatterns): string[] {
  const graphic = analyses.flatMap((a) =>
    String(a.graphicStyle || "")
      .split(/[,;·]/g)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return uniqStrings([...agg.graphicStyleNotes, ...graphic], 14);
}

/**
 * Contexto visual unificado para prompts de imagen (Brain Studio, Designer, Image Generator, etc.).
 * Prioriza ADN confirmado y análisis remotos fiables; el copy de marca queda secundario.
 */
export function buildBrainVisualPromptContext(
  assets: ProjectAssetsMetadata,
  options?: { slotKey?: BrainVisualStyleSlotKey },
): BrainVisualPromptContextResult {
  const strategy = assets.strategy;
  const layer = strategy.visualReferenceAnalysis;
  const rawAnalyses = layer?.analyses ?? [];
  const analyses = rawAnalyses.filter((a) => !isExcludedFromVisualDna(a));
  const trusted = analyses.filter(isTrustedRemoteVisionAnalysis).filter(analysisQualityOk);
  const confirmed = (layer?.confirmedVisualPatterns ?? []).map((s) => s.trim()).filter(Boolean);

  const coreTrusted = trusted.filter((a) => getEffectiveClassification(a) === "CORE_VISUAL_DNA");
  const projectTrusted = trusted.filter((a) => getEffectiveClassification(a) === "PROJECT_VISUAL_REFERENCE");
  const contextualTrusted = trusted.filter((a) => getEffectiveClassification(a) === "CONTEXTUAL_VISUAL_MEMORY");

  const primaryPool =
    coreTrusted.length || projectTrusted.length
      ? [...coreTrusted, ...projectTrusted]
      : contextualTrusted.length
        ? contextualTrusted
        : [];

  const aggTrusted = aggregateVisualPatterns(primaryPool.length ? primaryPool : trusted);
  const patternSummaryUsed = Boolean(
    (aggTrusted.patternSummary && aggTrusted.patternSummary.trim().length > 10) ||
      aggTrusted.narrativeSummary.trim().length > 12,
  );

  const vs = strategy.visualStyle;
  const slotKeys: BrainVisualStyleSlotKey[] = ["protagonist", "environment", "textures", "people"];
  const visionSlotsUsed = slotKeys.some((k) => slotIsUserOrVisionReal(k, vs[k]));
  const activeSlotKey = options?.slotKey;
  const slotExtra =
    activeSlotKey && slotIsUserOrVisionReal(activeSlotKey, vs[activeSlotKey])
      ? (vs[activeSlotKey]?.description || "").trim()
      : "";

  const sources: BrainVisualPromptSourcesUsed = {
    confirmedUserVisualDna: confirmed.length > 0,
    coreVisualReferenceAnalysis: coreTrusted.length > 0,
    projectVisualReferenceAnalysis: projectTrusted.length > 0,
    aggregatedPatternsTrusted:
      patternSummaryUsed && (primaryPool.length > 0 || trusted.length > 0),
    visionDerivedVisualStyleSlots: visionSlotsUsed,
    secondaryBrandStrategyText: false,
  };

  const subjects = uniqStrings(
    [
      ...confirmed,
      ...primaryPool.flatMap((a) => (a.subjectTags?.length ? a.subjectTags : [a.subject]).filter(Boolean)),
      ...(!primaryPool.length && trusted.length ? trusted.flatMap((a) => a.subjectTags ?? []) : []),
    ],
    40,
  );

  const mood = uniqStrings(
    [...primaryPool.flatMap((a) => a.mood), ...(!primaryPool.length ? trusted.flatMap((a) => a.mood) : [])],
    14,
  );

  const visualStyleTags = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.visualStyle),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.visualStyle) : []),
      ...aggTrusted.recurringStyles,
    ],
    22,
  );

  const composition = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.composition),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.composition) : []),
      ...aggTrusted.compositionNotes,
    ],
    18,
  );

  const colorPalette = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.colorPalette.dominant),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.colorPalette.dominant) : []),
      ...aggTrusted.dominantPalette,
    ],
    16,
  );

  const clothingBits = (d: BrainVisualImageAnalysis["clothingDetail"]): string => {
    if (!d?.present) return "";
    const parts = [
      ...(d.style ?? []),
      ...(d.colors ?? []),
      ...(d.textures ?? []),
      d.formality ? String(d.formality) : "",
    ]
      .map((s) => String(s).trim())
      .filter(Boolean);
    return parts.join(", ");
  };

  const peopleAndWardrobe = uniqStrings(
    [
      ...primaryPool.map((a) => (a.peopleDetail?.description || a.people || "").trim()).filter(Boolean),
      ...primaryPool.map((a) => clothingBits(a.clothingDetail) || (a.clothingStyle || "").trim()).filter(Boolean),
      ...aggTrusted.peopleClothingNotes,
    ],
    12,
  );

  const objectsAndProps = subjects;

  const environments = collectEnvironmentHints(primaryPool.length ? primaryPool : trusted, aggTrusted);
  const lighting = collectLightingHints(primaryPool.length ? primaryPool : trusted);
  const textures = collectTextureHints(primaryPool.length ? primaryPool : trusted, aggTrusted);

  const visualMessage = uniqStrings(
    [
      ...primaryPool.flatMap((a) => a.visualMessage ?? []),
      ...(!primaryPool.length ? trusted.flatMap((a) => a.visualMessage ?? []) : []),
      ...aggTrusted.implicitBrandMessages,
    ],
    10,
  );

  const taboo = [...(strategy.tabooPhrases ?? []), ...(strategy.forbiddenTerms ?? [])]
    .map((s) => s.trim())
    .filter(Boolean);

  const doAvoid = uniqStrings([...taboo], 16);
  const doUse = uniqStrings(
    [
      ...(strategy.preferredTerms ?? []).slice(0, 8),
      ...filterLegacyLanguageTraits(strategy.languageTraits ?? []).slice(0, 4),
    ],
    12,
  );

  const visualAvoid = uniqStrings([...DEFAULT_VISUAL_AVOID, ...doAvoid], 24);

  const narrativeBlock =
    primaryPool.length || trusted.length
      ? buildSpanishTrustedVisualNarrative(primaryPool.length ? primaryPool : trusted, aggTrusted).text
      : "";

  const corporateRaw = (assets.knowledge.corporateContext || "").trim();
  const warnings: string[] = [];
  let brandMessageContext: string | undefined;
  if (corporateRaw.length > 60) {
    brandMessageContext = corporateRaw.slice(0, 480);
    if (confirmed.length) {
      warnings.push(
        "Hay texto corporativo largo: no forma parte del bloque A; solo puede apoyar el mensaje (B) sin redefinir la estética porque existe ADN visual confirmado.",
      );
    } else if (!trusted.length) {
      warnings.push(
        "Sin ADN confirmado ni análisis visuales remotos: el contexto corporativo pesa más; conviene subir y reanalizar referencias.",
      );
    }
  }

  const directionParts: string[] = [];
  if (confirmed.length) {
    directionParts.push(
      `PRIORIDAD 1 — Patrones visuales confirmados por el usuario (imperativos sobre corporateContext y claims genéricos): ${confirmed.slice(0, 20).join(", ")}.`,
    );
  }
  if (narrativeBlock.trim()) directionParts.push(narrativeBlock.trim());
  if (aggTrusted.patternSummary?.trim() && !directionParts.some((p) => p.includes(aggTrusted.patternSummary!.trim()))) {
    directionParts.push(`Síntesis de patrones: ${aggTrusted.patternSummary.trim()}`);
  }
  if (slotExtra) {
    directionParts.push(`Bloque de dirección (${activeSlotKey}): ${slotExtra}`);
  }
  if (visionSlotsUsed && !slotExtra) {
    const slotBits = slotKeys
      .map((k) => (slotIsUserOrVisionReal(k, vs[k]) ? `${k}: ${(vs[k]?.description || "").trim()}` : ""))
      .filter(Boolean);
    if (slotBits.length) {
      directionParts.push(`Slots de dirección visual (manual o derivados de visión real): ${slotBits.join(" · ")}`);
    }
  }

  let visualDirection = directionParts.join("\n").trim();

  const hasStrongVisual =
    confirmed.length > 0 ||
    coreTrusted.length + projectTrusted.length > 0 ||
    trusted.length >= 2 ||
    (trusted.length === 1 && patternSummaryUsed);

  const textOnlyGeneration = !hasStrongVisual;
  const visualContextWeak = !confirmed.length && trusted.length === 0 && !visionSlotsUsed;

  let sourceTier: BrainSourceTier | "mixed" = "unknown";
  if (confirmed.length) sourceTier = "confirmed";
  else if (coreTrusted.length || projectTrusted.length) sourceTier = "visual_real";
  else if (trusted.length > 0 && patternSummaryUsed) sourceTier = "visual_real";
  else if (visionSlotsUsed) sourceTier = "heuristic";
  else if (trusted.length > 0) sourceTier = "mixed";
  else sourceTier = "default";

  let fallbackDefaultUsed = false;
  if (!visualDirection) {
    fallbackDefaultUsed = true;
    const fallbackBits = slotKeys
      .map((k) => `${(vs[k]?.description || defaultBrainVisualStyle()[k].description).trim()}`)
      .filter(Boolean);
    visualDirection = `No hay análisis visual remoto fiable todavía. Usa solo como guía débil (no sustituye referencias reales): ${fallbackBits.slice(0, 2).join(" · ")}`;
  }

  let sourceQuality: BrainVisualPromptSourceQuality = "text_only";
  if (confirmed.length && (coreTrusted.length || projectTrusted.length)) sourceQuality = "high";
  else if (confirmed.length || coreTrusted.length || projectTrusted.length) sourceQuality = "high";
  else if (primaryPool.length || trusted.length >= 2) sourceQuality = "medium";
  else if (trusted.length === 1 || visionSlotsUsed) sourceQuality = "low";

  if (textOnlyGeneration) sourceQuality = "text_only";

  return {
    visualDirection,
    visualStyleTags,
    mood,
    subjects,
    environments,
    composition,
    lighting,
    colorPalette,
    peopleAndWardrobe,
    objectsAndProps,
    textures,
    visualMessage,
    doUse,
    doAvoid,
    visualAvoid,
    sourceQuality,
    sources,
    textOnlyGeneration,
    visualContextWeak,
    sourceTier,
    warnings,
    ...(brandMessageContext ? { brandMessageContext } : {}),
    visualReferenceAnalysisRealCount: trusted.length,
    patternSummaryUsed,
    fallbackDefaultUsed,
  };
}

/** Ensambla el prompt de slot Brain Studio: A = ADN visual, B = bloque, C = color + voz secundaria. */
export function composeBrainVisualStyleSlotPrompt(params: {
  context: BrainVisualPromptContextResult;
  slotKey: BrainVisualStyleSlotKey;
  slotDescription: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  voiceHints?: string;
  termsHints?: string;
  msgHints?: string;
}): string {
  const slotLabel =
    params.slotKey === "protagonist"
      ? "Protagonista"
      : params.slotKey === "environment"
        ? "Entorno"
        : params.slotKey === "textures"
          ? "Texturas"
          : "Personas";

  const voice = params.voiceHints?.trim() || "claro, honesto, contemporáneo";
  const terms = params.termsHints?.trim() || "coherencia con referencias y marca";
  const msgs = params.msgHints?.trim() || "mensaje propio de la marca";

  const neg = params.context.visualAvoid.join("; ");

  return [
    "A — DIRECCIÓN VISUAL (prioridad máxima; manda sobre el copy y sobre clichés SaaS):",
    params.context.visualDirection,
    "",
    "B — BLOQUE / INTENCIÓN DE ESTA IMAGEN:",
    `${slotLabel}. ${params.slotDescription || "Mantener coherencia con el ADN anterior."}`,
    "",
    "C — RESTRICCIONES DE MARCA (secundarias respecto a A):",
    `Paleta: primaria ${params.colorPrimary}, secundaria ${params.colorSecondary}, acento ${params.colorAccent}.`,
    `Tono de voz (referencia, no redefine el encuadre): ${voice}.`,
    `Términos preferidos: ${terms}.`,
    `Frases aprobadas: ${msgs}.`,
    "",
    "Si hay imágenes de referencia adjuntas, úsalas como guía de materiales, luz y ambiente; no copies composiciones literalmente si chocan con A/B.",
    "NO incluyas texto largo en la imagen ni marcas de agua.",
    "",
    "EVITAR (estética y clichés):",
    neg,
  ].join("\n");
}

export function composeBrainDesignerImagePrompt(params: {
  context: BrainVisualPromptContextResult;
  pieceMessage: string;
  pageContext: string;
  brandColorLine: string;
  logoBlock: string;
  featureLine?: string;
  differentiatorsLine?: string;
  metricsLine?: string;
}): { prompt: string; diagnostics: BrainImageSuggestionDiagnostics } {
  const ctx = params.context;
  const warnTextOnly = ctx.textOnlyGeneration
    ? "AVISO: generación principalmente desde texto de marca; no hay ADN visual analizado fiable suficiente."
    : "";

  const secondaryCopy =
    !ctx.textOnlyGeneration && (params.featureLine || params.differentiatorsLine)
      ? [
          "Contexto de producto (no debe convertirse en interfaz futurista ni dashboard si contradice A):",
          params.featureLine ? `Capacidades: ${params.featureLine}.` : "",
          params.differentiatorsLine ? `Diferenciales: ${params.differentiatorsLine}.` : "",
          params.metricsLine ? `Señales de mercado: ${params.metricsLine}.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  const prompt = [
    warnTextOnly,
    "A — DIRECCIÓN VISUAL (imperativo; prevalece sobre mensajes de campaña o claims):",
    ctx.visualDirection,
    subjectsObjectsLine(ctx),
    moodPaletteLine(ctx),
    "",
    "B — MENSAJE DE LA PIEZA (secundario; no reinterpretar el visual hacia UI stock o equipo corporativo):",
    params.pieceMessage,
    ctx.brandMessageContext
      ? `\nContexto de negocio / corporativo (solo apoyo al mensaje; no sustituye el bloque A): ${ctx.brandMessageContext}`
      : "",
    "",
    "C — CONTEXTO DE PÁGINA / LAYOUT (terciario):",
    params.pageContext || "(sin contexto de página cercano)",
    "",
    "D — RESTRICCIONES DE MARCA:",
    params.brandColorLine,
    params.logoBlock,
    "Si hay logo de referencia en la petición: usar solo ese logotipo; no inventar ni sustituir otro. No usar marca Foldder salvo que sea exactamente el logo adjunto.",
    secondaryCopy,
    "",
    "EVITAR:",
    ctx.visualAvoid.join("; "),
    "",
    "Salida: fotografía o ilustración con dirección de arte creíble, coherente con A; key visual para deck creativo.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const diagnostics: BrainImageSuggestionDiagnostics = {
    finalPromptUsed: prompt,
    visualSourcesUsed: {
      ...ctx.sources,
      secondaryBrandStrategyText: secondaryCopy.length > 0,
    },
    visualReferenceAnalysisRealCount: ctx.visualReferenceAnalysisRealCount,
    confirmedVisualDnaUsed: ctx.sources.confirmedUserVisualDna,
    patternSummaryUsed: ctx.patternSummaryUsed,
    fallbackDefaultUsed: ctx.fallbackDefaultUsed,
    textOnlyGeneration: ctx.textOnlyGeneration,
    secondaryBrandProductCopy: secondaryCopy.length > 0,
  };

  return { prompt, diagnostics };
}

function subjectsObjectsLine(ctx: BrainVisualPromptContextResult): string {
  const s = ctx.subjects.slice(0, 28).join(", ");
  if (!s) return "";
  return `Sujetos y objetos a honrar (de referencias analizadas): ${s}.`;
}

function moodPaletteLine(ctx: BrainVisualPromptContextResult): string {
  const m = ctx.mood.slice(0, 8).join(", ");
  const c = ctx.colorPalette.slice(0, 8).join(", ");
  const bits = [
    m ? `Mood: ${m}.` : "",
    c ? `Paleta observada en referencias: ${c}.` : "",
    ctx.lighting.length ? `Luz: ${ctx.lighting.join(", ")}.` : "",
  ].filter(Boolean);
  return bits.join(" ");
}

export function buildVisualImageDiagnosticsFromContext(
  ctx: BrainVisualPromptContextResult,
  finalPromptUsed: string,
): BrainImageSuggestionDiagnostics {
  return {
    finalPromptUsed,
    visualSourcesUsed: ctx.sources,
    visualReferenceAnalysisRealCount: ctx.visualReferenceAnalysisRealCount,
    confirmedVisualDnaUsed: ctx.sources.confirmedUserVisualDna,
    patternSummaryUsed: ctx.patternSummaryUsed,
    fallbackDefaultUsed: ctx.fallbackDefaultUsed,
    textOnlyGeneration: ctx.textOnlyGeneration,
  };
}
