import type {
  AggregatedVisualPatterns,
  BrainVisualImageAnalysis,
  BrainFunnelMessage,
} from "@/app/spaces/project-assets-metadata";
import type { BrainSourceConfidence, BrainSourceTier } from "@/lib/brain/brain-field-provenance";
import type { NormalizedProjectAssets } from "./brain-adn-score";
import { aggregateVisualPatterns } from "./brain-visual-analysis";
import { validateVisualAnalysisSpecificity } from "./brain-visual-analysis-quality";

/** Subcadenas típicas del copy demo en inglés embebido en proyectos seed / legacy. */
export const LEGACY_FUNNEL_TEXT_MARKERS = [
  "discover the creative os",
  "explore how foldder",
  "seamless creative journey",
  "foldder unifies the creative process",
  "seamless creative workflows",
  "achieve seamless creative",
] as const;

/** Rasgos de tono en inglés del seed demo (no confirmados por el usuario en un proyecto ES). */
export const LEGACY_LANGUAGE_TRAITS_EXACT = new Set(["professional", "collaborative", "innovative"]);

export type BrandSummaryBadge =
  | "Confirmado"
  | "Inferido"
  | "Pendiente"
  | "Visual real"
  | "Fallback"
  | "Sin datos suficientes"
  | "Legacy"
  | "Mezcla"
  | "Sin consolidar"
  | "Default sin confirmar"
  | "Provisional"
  | "Legacy filtrado"
  | "CORE"
  | "Pendiente de análisis";

export type BrandSummarySourceRecord = {
  kind: string;
  path?: string;
  provider?: string | null;
  fallbackUsed?: boolean;
  analysisStatus?: string;
  analyzerVersion?: string | null;
  analyzedImages?: number;
  usedAssetIds?: string[];
  usedFields?: string[];
  /** No existe `providerReturnedJson` en el esquema; inferimos visión real con proveedor + fallback. */
  inferredRemoteJson?: boolean;
  note?: string;
};

export type BrandSummarySection = {
  key: "identityNarrative" | "tone" | "messages" | "visualDirection";
  labelEs: string;
  /** Texto mostrado en el resumen (antes `body`). */
  value: string;
  sourceTier: BrainSourceTier;
  sourceConfidence: BrainSourceConfidence;
  /** Etiqueta compacta en UI (derivada de procedencia y reglas del resumen). */
  badge: BrandSummaryBadge;
  sources: BrandSummarySourceRecord[];
  warnings: string[];
};

export type BrandSummaryDiagnosticsDocumentRow = {
  id: string;
  name: string;
  status?: string;
};

export type BrandSummaryDiagnosticsVisualRow = {
  sourceAssetId: string;
  sourceLabel?: string;
  visionProviderId?: string;
  analysisStatus?: string;
  fallbackUsed: boolean;
  analysisQuality?: string;
};

export type BrandSummaryDiagnosticsInventory = {
  funnelMessagesTotal: number;
  funnelLegacyExcluded: number;
  languageTraitsTotal: number;
  languageTraitsLegacyExcluded: number;
  visualAnalysesTotal: number;
  visualTrustedRemote: number;
  visualTrustedTooGeneric: number;
  visualMockOrFallback: number;
  visualFailed: number;
  visualAnalyzedNonTrusted: number;
};

export type BrandSummaryDiagnostics = {
  generatedAt: string;
  inventory: BrandSummaryDiagnosticsInventory;
  /** Documentos CORE / contexto analizados (típicas fuentes tras “Analizar conocimiento”). */
  documents: {
    coreAnalyzed: BrandSummaryDiagnosticsDocumentRow[];
    contextAnalyzed: BrandSummaryDiagnosticsDocumentRow[];
    coreTotal: number;
    coreUploadedNotAnalyzed: number;
  };
  funnel: {
    totalInStrategy: number;
    legacyExcludedFromSummary: number;
    cleanRemainingCount: number;
  };
  toneTraits: {
    totalInStrategy: number;
    legacyExcludedFromSummary: number;
    cleanRemainingCount: number;
  };
  identity: {
    usesCorporateContext: boolean;
    usesApprovedPatternsFallback: boolean;
    corporateContextChars: number;
  };
  /** Filas de análisis visual (referencias) para trazabilidad en UI. */
  visualRows: BrandSummaryDiagnosticsVisualRow[];
  visualLastAnalyzedAt: string | null;
  sections: Record<string, unknown>;
};

export type BrandSummaryResult = {
  identityNarrative: BrandSummarySection;
  tone: BrandSummarySection;
  messages: BrandSummarySection;
  visualDirection: BrandSummarySection;
  /** Metadatos y conteos para “Ver fuentes” por bloque del resumen. */
  diagnostics: BrandSummaryDiagnostics;
};

export function isLegacyDemoFunnelText(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return LEGACY_FUNNEL_TEXT_MARKERS.some((m) => t.includes(m));
}

export function filterLegacyFunnelMessages(messages: readonly BrainFunnelMessage[]): BrainFunnelMessage[] {
  return messages.filter((m) => !isLegacyDemoFunnelText(m.text ?? ""));
}

export function filterLegacyLanguageTraits(traits: readonly string[]): string[] {
  return traits.filter((x) => !LEGACY_LANGUAGE_TRAITS_EXACT.has(x.trim().toLowerCase()));
}

export function isTrustedRemoteVisionAnalysis(a: BrainVisualImageAnalysis): boolean {
  return (
    a.analysisStatus === "analyzed" &&
    (a.visionProviderId === "gemini-vision" || a.visionProviderId === "openai-vision") &&
    a.fallbackUsed !== true
  );
}

export function isMockOrFallbackAnalyzed(a: BrainVisualImageAnalysis): boolean {
  if (a.analysisStatus !== "analyzed") return false;
  if (isTrustedRemoteVisionAnalysis(a)) return false;
  return (
    a.fallbackUsed === true ||
    a.visionProviderId === "mock" ||
    (!a.visionProviderId && String(a.analyzerVersion ?? "").toLowerCase().startsWith("mock"))
  );
}

function dominantVisionProvider(analyses: BrainVisualImageAnalysis[]): string | null {
  const g = analyses.filter((a) => a.visionProviderId === "gemini-vision").length;
  const o = analyses.filter((a) => a.visionProviderId === "openai-vision").length;
  if (g && o) return "gemini-vision+openai-vision";
  if (g) return "gemini-vision";
  if (o) return "openai-vision";
  return null;
}

/** Narrativa en español priorizando tags y campos de filas con visión remota real. */
export function buildSpanishTrustedVisualNarrative(
  trusted: BrainVisualImageAnalysis[],
  agg: AggregatedVisualPatterns,
): { text: string; usedFields: string[] } {
  if (!trusted.length) return { text: "", usedFields: [] };
  const usedFields: string[] = [];
  const uniqueSubjects = [...new Set(trusted.flatMap((a) => a.subjectTags ?? []))].filter(Boolean);
  const uniqueMood = [...new Set(trusted.flatMap((a) => a.mood ?? []))].filter(Boolean);
  const uniqueStyle = [...new Set(trusted.flatMap((a) => a.visualStyle ?? []))].filter(Boolean);
  const compTop = agg.compositionNotes.slice(0, 10);
  const implied = (agg.implicitBrandMessages ?? []).slice(0, 3);
  const visMsg = trusted
    .flatMap((a) => a.visualMessage ?? [])
    .filter(Boolean)
    .slice(0, 6);
  const people = trusted
    .map((a) => (typeof a.peopleDetail?.description === "string" ? a.peopleDetail.description : null) || a.people)
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, 4);
  const graphic = trusted.flatMap((a) =>
    String(a.graphicStyle ?? "")
      .split(/[,;·]/g)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const graphicTop = [...new Set(graphic)].slice(0, 8);

  const sentences: string[] = [];
  sentences.push(
    `Dirección visual consolidada a partir de ${trusted.length} referencia(s) analizada(s) con visión remota (sin fallback).`,
  );
  usedFields.push("aggregate.compositionNotes", "per-image:subjectTags", "per-image:mood", "per-image:visualStyle");
  if (uniqueStyle.length || uniqueMood.length) {
    sentences.push(
      `La estética se orienta hacia ${uniqueStyle.slice(0, 8).join(", ") || "una lectura visual propia"} con sensación ${uniqueMood.slice(0, 6).join(", ") || "equilibrada"}.`,
    );
  }
  if (uniqueSubjects.length) {
    sentences.push(`Elementos y sujetos recurrentes en encuadre: ${uniqueSubjects.slice(0, 28).join(", ")}.`);
    usedFields.push("per-image:subjectTags");
  }
  if (compTop.length) {
    sentences.push(`Composición: ${compTop.join(" · ")}.`);
    usedFields.push("aggregate.compositionNotes");
  }
  if (people.length) {
    sentences.push(`Personas y ambiente: ${[...new Set(people)].join(" · ")}.`);
    usedFields.push("per-image:peopleDetail|people");
  }
  if (graphicTop.length) {
    sentences.push(`Estilo gráfico / materiales: ${graphicTop.join(", ")}.`);
    usedFields.push("per-image:graphicStyle");
  }
  if (visMsg.length) {
    sentences.push(`Lecturas de intención desde visión: ${[...new Set(visMsg)].join(" · ")}.`);
    usedFields.push("per-image:visualMessage");
  }
  if (implied.length) {
    sentences.push(`Mensajes implícitos frecuentes en el lote: ${implied.join(" ")}`);
    usedFields.push("aggregate.implicitBrandMessages");
  }
  return { text: sentences.join(" ").slice(0, 1400), usedFields: [...new Set(usedFields)] };
}

function mapTierToDisplayBadge(tier: BrainSourceTier, warnings: string[], mixLegacy: boolean): BrandSummaryBadge {
  const legacyNote = warnings.some((w) => /legacy|demo|inglés/i.test(w));
  if (mixLegacy && legacyNote) return "Mezcla";
  if (legacyNote && tier === "legacy") return "Legacy filtrado";
  switch (tier) {
    case "confirmed":
    case "user_manual":
      return "Confirmado";
    case "core_document":
      return "CORE";
    case "visual_real":
      return "Visual real";
    case "pending":
      return "Pendiente de análisis";
    case "heuristic":
      return "Inferido";
    case "mock":
      return "Provisional";
    case "default":
      return "Default sin confirmar";
    case "legacy":
      return "Legacy filtrado";
    default:
      return legacyNote ? "Legacy filtrado" : "Sin consolidar";
  }
}

function section(
  key: BrandSummarySection["key"],
  labelEs: string,
  value: string,
  sourceTier: BrainSourceTier,
  sourceConfidence: BrainSourceConfidence,
  sources: BrandSummarySourceRecord[],
  warnings: string[],
  mixLegacy = false,
): BrandSummarySection {
  const badge = mapTierToDisplayBadge(sourceTier, warnings, mixLegacy);
  return { key, labelEs, value, sourceTier, sourceConfidence, badge, sources, warnings };
}

/**
 * Resumen honesto para “Brain resume así tu marca”: prioriza datos confirmados,
 * filtra copy demo legacy en embudo, y separa visión remota de mock/heurística.
 */
export function buildBrainBrandSummary(assets: NormalizedProjectAssets): BrandSummaryResult {
  const warningsGlobal: string[] = [];
  const analyses = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const trusted = analyses.filter(isTrustedRemoteVisionAnalysis);
  const mockLike = analyses.filter(isMockOrFallbackAnalyzed);

  // --- Identidad ---
  const corp = assets.knowledge.corporateContext?.trim() ?? "";
  let identityValue = "";
  let identityTier: BrainSourceTier = "default";
  let identityConf: BrainSourceConfidence = "low";
  const identitySources: BrandSummarySourceRecord[] = [];
  const identityWarnings: string[] = [];
  const identityProv = assets.strategy.fieldProvenance?.identityNarrative;
  if (corp) {
    identityValue = corp.length > 280 ? `${corp.slice(0, 277)}…` : corp;
    identityTier =
      identityProv?.sourceTier && identityProv.sourceTier !== "unknown" ? identityProv.sourceTier : "confirmed";
    identityConf = identityProv?.sourceConfidence ?? "high";
    identitySources.push({
      kind: "corporate_context",
      path: "knowledge.corporateContext",
      note: "Texto explícito de marca en conocimiento.",
    });
  } else {
    const approved = assets.strategy.approvedPatterns.filter(Boolean);
    if (approved.length) {
      identityValue = `Patrones aprobados (${approved.length}): ${approved.slice(0, 4).join(" · ")}${approved.length > 4 ? "…" : ""}`;
      identityTier =
        identityProv?.sourceTier && identityProv.sourceTier !== "unknown" ? identityProv.sourceTier : "user_manual";
      identityConf = identityProv?.sourceConfidence ?? "medium";
      identitySources.push({
        kind: "approved_patterns",
        path: "strategy.approvedPatterns",
        note: "Patrones ya aprobados en ADN (no pendientes).",
      });
    } else {
      identityValue =
        "Sin consolidar: añade contexto corporativo en Conocimiento o analiza documentos CORE (el resumen no inventa identidad).";
      identityTier = "default";
      identityConf = "low";
      identitySources.push({
        kind: "empty_fallback",
        path: "knowledge.corporateContext",
        note: "Sin corporateContext ni approvedPatterns.",
      });
    }
  }

  // --- Tono ---
  const traitsRaw = assets.strategy.languageTraits;
  const legacyTraits = traitsRaw.filter((t) => LEGACY_LANGUAGE_TRAITS_EXACT.has(t.trim().toLowerCase()));
  const traitsClean = filterLegacyLanguageTraits(traitsRaw);
  const coreDocsAnalyzed = assets.knowledge.documents.filter(
    (d) => (d.scope ?? "core") !== "context" && d.status === "Analizado",
  );
  let toneValue = "";
  let toneTier: BrainSourceTier = "default";
  let toneConf: BrainSourceConfidence = "low";
  const toneSources: BrandSummarySourceRecord[] = [
    { kind: "language_traits", path: "strategy.languageTraits", note: "Rasgos de voz configurados." },
  ];
  const toneWarnings: string[] = [];
  const toneProv = assets.strategy.fieldProvenance?.tone;
  if (legacyTraits.length && traitsClean.length) {
    toneValue = traitsClean.slice(0, 8).join(" · ");
    toneTier = toneProv?.sourceTier && toneProv.sourceTier !== "unknown" ? toneProv.sourceTier : "heuristic";
    toneConf = toneProv?.sourceConfidence ?? "medium";
    toneWarnings.push(`Se ocultaron rasgos demo en inglés no confirmados: ${legacyTraits.join(", ")}.`);
  } else if (legacyTraits.length && !traitsClean.length) {
    toneValue =
      "Default sin confirmar: los rasgos guardados son solo seed demo en inglés. Sustitúyelos en «Voz y tono» con señales reales.";
    toneTier = "legacy";
    toneConf = "low";
    toneWarnings.push("Tono marcado como legacy: solo quedaban rasgos EN demo.");
  } else if (traitsClean.length) {
    toneValue = traitsClean.slice(0, 8).join(" · ");
    toneTier =
      toneProv?.sourceTier && toneProv.sourceTier !== "unknown"
        ? toneProv.sourceTier
        : coreDocsAnalyzed.length > 0
          ? "core_document"
          : "heuristic";
    toneConf = coreDocsAnalyzed.length > 0 ? "medium" : "low";
  } else {
    toneValue = "Pendiente de análisis: añade rasgos de voz o analiza documentos CORE.";
    toneTier = "pending";
    toneConf = "low";
  }

  // --- Mensajes embudo ---
  const funnel = assets.strategy.funnelMessages;
  const legacyMsgs = funnel.filter((m) => isLegacyDemoFunnelText(m.text ?? ""));
  const cleanMsgs = filterLegacyFunnelMessages(funnel);
  let msgValue = "";
  let msgTier: BrainSourceTier = "default";
  let msgConf: BrainSourceConfidence = "low";
  const msgSources: BrandSummarySourceRecord[] = [
    { kind: "funnel_messages", path: "strategy.funnelMessages", note: "Mensajes por etapa (no son ADN hasta revisión)." },
  ];
  const msgWarnings: string[] = [];
  const msgProv = assets.strategy.fieldProvenance?.messages;
  if (legacyMsgs.length && cleanMsgs.length) {
    msgValue = cleanMsgs
      .slice(0, 3)
      .map((m) => m.text)
      .join(" · ");
    msgTier = msgProv?.sourceTier && msgProv.sourceTier !== "unknown" ? msgProv.sourceTier : "heuristic";
    msgConf = "medium";
    msgWarnings.push(`${legacyMsgs.length} mensaje(s) tipo demo Foldder (inglés) excluidos del resumen principal.`);
  } else if (legacyMsgs.length && !cleanMsgs.length) {
    msgValue =
      "Legacy filtrado: los mensajes guardados son solo copy demo en inglés. No se muestran como mensaje principal.";
    msgTier = "legacy";
    msgConf = "low";
    msgWarnings.push("Ningún mensaje del embudo pasó el filtro anti-demo.");
  } else if (cleanMsgs.length) {
    msgValue = cleanMsgs
      .slice(0, 3)
      .map((m) => m.text)
      .join(" · ");
    msgTier =
      msgProv?.sourceTier && msgProv.sourceTier !== "unknown"
        ? msgProv.sourceTier
        : coreDocsAnalyzed.length > 0
          ? "core_document"
          : "heuristic";
    msgConf = coreDocsAnalyzed.length > 0 ? "medium" : "low";
  } else {
    msgValue = "Sin consolidar: define mensajes por etapa o analiza documentos CORE.";
    msgTier = "default";
    msgConf = "low";
  }

  // --- Dirección visual ---
  const visualSources: BrandSummarySourceRecord[] = [];
  const visualWarnings: string[] = [];
  let visualValue = "";
  let visualTier: BrainSourceTier = "default";
  let visualConf: BrainSourceConfidence = "low";
  const visualProv = assets.strategy.fieldProvenance?.visualDirection;

  if (trusted.length) {
    const agg = aggregateVisualPatterns(trusted);
    const { text, usedFields } = buildSpanishTrustedVisualNarrative(trusted, agg);
    visualValue = text;
    visualTier =
      visualProv?.sourceTier && visualProv.sourceTier !== "unknown" ? visualProv.sourceTier : "visual_real";
    visualConf = visualProv?.sourceConfidence ?? "high";
    const genericTrusted = trusted.filter((a) => validateVisualAnalysisSpecificity(a) === "too_generic");
    if (genericTrusted.length) {
      visualWarnings.push(
        `${genericTrusted.length} referencia(s) con visión remota siguen siendo demasiado genéricas para inferencias finas (re-estudio o prompt).`,
      );
    }
    visualSources.push({
      kind: "visual_reference_analysis",
      path: "strategy.visualReferenceAnalysis.analyses",
      provider: dominantVisionProvider(trusted),
      fallbackUsed: false,
      analyzedImages: trusted.length,
      usedAssetIds: trusted.map((a) => a.sourceAssetId),
      usedFields,
      inferredRemoteJson: true,
      note: "Solo filas analyzed + gemini-vision|openai-vision sin fallback.",
    });
  } else if (mockLike.length || analyses.some((a) => a.analysisStatus === "analyzed")) {
    const analyzed = analyses.filter((a) => a.analysisStatus === "analyzed");
    const agg = aggregateVisualPatterns(analyzed);
    const ps = agg.patternSummary?.trim() || agg.narrativeSummary?.trim() || "";
    visualValue = ps
      ? `[Provisional: heurística o visión simulada — no es lectura remota fiable] ${ps}`
      : "Provisional: hay filas de análisis, pero ninguna con visión remota sin fallback; reanaliza con Gemini/OpenAI.";
    visualTier = "mock";
    visualConf = "low";
    visualWarnings.push(
      trusted.length === 0
        ? "Ninguna imagen con proveedor gemini-vision/openai-vision y fallbackUsed=false."
        : "",
    );
    visualSources.push({
      kind: "visual_reference_analysis",
      path: "strategy.visualReferenceAnalysis.analyses",
      provider: mockLike.some((m) => m.visionProviderId === "mock") ? "mock" : "mixed",
      fallbackUsed: mockLike.some((m) => m.fallbackUsed === true),
      analyzedImages: analyzed.length,
      usedAssetIds: analyzed.map((a) => a.sourceAssetId),
      inferredRemoteJson: false,
      note: "Agregado incluye mock/fallback o metadatos no remotos.",
    });
  } else {
    const slotBits = [assets.strategy.visualStyle.protagonist.description, assets.strategy.visualStyle.environment.description]
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .join(" · ");
    if (slotBits) {
      visualValue = `Inferido desde slots (sin visión remota aún): ${slotBits}`;
      visualTier = "heuristic";
      visualConf = "low";
      visualSources.push({
        kind: "visual_style_slots",
        path: "strategy.visualStyle.*.description",
        note: "Slots de estilo; no sustituyen análisis de imagen.",
      });
    } else {
      visualValue =
        "Default sin confirmar: sube referencias y reanaliza con visión remota; no se muestran plantillas de slot como dirección real.";
      visualTier = "default";
      visualConf = "low";
      visualSources.push({ kind: "empty_fallback", note: "Sin analyses analizadas ni slots de estilo." });
    }
  }

  if (warningsGlobal.length) {
    /* reserved */
  }

  const allDocs = assets.knowledge.documents ?? [];
  const coreAnalyzed = allDocs
    .filter((d) => (d.scope ?? "core") !== "context" && d.status === "Analizado")
    .map((d) => ({ id: d.id, name: (d.name ?? "Sin nombre").trim() || "Sin nombre", status: d.status }));
  const contextAnalyzed = allDocs
    .filter((d) => d.scope === "context" && d.status === "Analizado")
    .map((d) => ({ id: d.id, name: (d.name ?? "Sin nombre").trim() || "Sin nombre", status: d.status }));
  const coreTotal = allDocs.filter((d) => (d.scope ?? "core") !== "context").length;
  const coreUploadedNotAnalyzed = allDocs.filter(
    (d) => (d.scope ?? "core") !== "context" && d.status !== "Analizado" && d.status !== "Error",
  ).length;

  const visualFailed = analyses.filter((a) => a.analysisStatus === "failed").length;
  const visualAnalyzedNonTrusted = analyses.filter(
    (a) => a.analysisStatus === "analyzed" && !isTrustedRemoteVisionAnalysis(a),
  ).length;

  const visualRows: BrandSummaryDiagnosticsVisualRow[] = analyses.map((a) => ({
    sourceAssetId: a.sourceAssetId,
    sourceLabel: a.sourceLabel,
    visionProviderId: a.visionProviderId,
    analysisStatus: a.analysisStatus,
    fallbackUsed: a.fallbackUsed === true,
    analysisQuality: a.analysisQuality,
  }));

  const diagnostics: BrandSummaryDiagnostics = {
    generatedAt: new Date().toISOString(),
    inventory: {
      funnelMessagesTotal: funnel.length,
      funnelLegacyExcluded: legacyMsgs.length,
      languageTraitsTotal: traitsRaw.length,
      languageTraitsLegacyExcluded: legacyTraits.length,
      visualAnalysesTotal: analyses.length,
      visualTrustedRemote: trusted.length,
      visualTrustedTooGeneric: trusted.filter((a) => validateVisualAnalysisSpecificity(a) === "too_generic").length,
      visualMockOrFallback: mockLike.length,
      visualFailed,
      visualAnalyzedNonTrusted,
    },
    documents: {
      coreAnalyzed,
      contextAnalyzed,
      coreTotal,
      coreUploadedNotAnalyzed,
    },
    funnel: {
      totalInStrategy: funnel.length,
      legacyExcludedFromSummary: legacyMsgs.length,
      cleanRemainingCount: cleanMsgs.length,
    },
    toneTraits: {
      totalInStrategy: traitsRaw.length,
      legacyExcludedFromSummary: legacyTraits.length,
      cleanRemainingCount: traitsClean.length,
    },
    identity: {
      usesCorporateContext: corp.length > 0,
      usesApprovedPatternsFallback: !corp && assets.strategy.approvedPatterns.some((x) => String(x).trim().length > 0),
      corporateContextChars: corp.length,
    },
    visualRows,
    visualLastAnalyzedAt: assets.strategy.visualReferenceAnalysis?.lastAnalyzedAt?.trim() || null,
    sections: {
      identityNarrative: {
        function: "buildBrainBrandSummary",
        inputs: ["knowledge.corporateContext", "strategy.approvedPatterns"],
        usesVisualReferenceAnalysis: false,
        usesPendingLearnings: false,
        usesMockFallback: false,
        usesHardcodedExamples: false,
        sources: identitySources,
        warnings: identityWarnings,
      },
      tone: {
        function: "buildBrainBrandSummary",
        inputs: ["strategy.languageTraits"],
        usesVisualReferenceAnalysis: false,
        usesPendingLearnings: false,
        usesMockFallback: false,
        usesHardcodedExamples: false,
        legacyFilter: "LEGACY_LANGUAGE_TRAITS_EXACT",
        sources: toneSources,
        warnings: toneWarnings,
      },
      messages: {
        function: "buildBrainBrandSummary",
        inputs: ["strategy.funnelMessages"],
        usesVisualReferenceAnalysis: false,
        usesPendingLearnings: false,
        usesMockFallback: false,
        usesHardcodedExamples: false,
        legacyFilter: "LEGACY_FUNNEL_TEXT_MARKERS",
        sources: msgSources,
        warnings: msgWarnings,
      },
      visualDirection: {
        function: "buildBrainBrandSummary + aggregateVisualPatterns + buildSpanishTrustedVisualNarrative",
        inputs: ["strategy.visualReferenceAnalysis.analyses", "strategy.visualStyle (solo si no hay analyses remotas)"],
        usesMetadataAssets: true,
        usesVisualReferenceAnalysis: true,
        usesPendingLearnings: false,
        usesMockFallback: visualTier === "mock",
        usesHardcodedExamples: visualTier === "mock",
        prioritizesRealVision: trusted.length > 0,
        patternSummaryUsed: trusted.length === 0 && Boolean(analyses.filter((a) => a.analysisStatus === "analyzed").length),
        sources: visualSources,
        warnings: visualWarnings.filter(Boolean),
      },
    },
  };

  const mixLegacyTone = legacyTraits.length > 0 && traitsClean.length > 0;
  const mixLegacyMsg = legacyMsgs.length > 0 && cleanMsgs.length > 0;

  return {
    identityNarrative: section(
      "identityNarrative",
      "Identidad y narrativa",
      identityValue,
      identityTier,
      identityConf,
      identitySources,
      identityWarnings,
    ),
    tone: section("tone", "Tono detectado en señales", toneValue, toneTier, toneConf, toneSources, toneWarnings, mixLegacyTone),
    messages: section("messages", "Mensajes que Brain recuerda", msgValue, msgTier, msgConf, msgSources, msgWarnings, mixLegacyMsg),
    visualDirection: section(
      "visualDirection",
      "Dirección visual",
      visualValue,
      visualTier,
      visualConf,
      visualSources,
      visualWarnings,
    ),
    diagnostics,
  };
}
