import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import { resolveLearningPendingAnchorNodeId } from "./brain-connected-signals-ui";
import { hasVisualLearningReviewBundle } from "./brain-visual-review-constants";
import type { BrainNodeType } from "./brain-telemetry";
import type { LearningCandidateType, StoredLearningCandidate } from "./learning-candidate-schema";

export function labelForBrainNodeSource(nodeType: BrainNodeType | "OTHER"): string {
  switch (nodeType) {
    case "OTHER":
      return "Otro nodo";
    case "DESIGNER":
      return "Designer";
    case "PHOTOROOM":
      return "Photoroom";
    case "ARTICLE_WRITER":
      return "Artículos";
    case "IMAGE_GENERATOR":
      return "Image Generator";
    case "VIDEO_NODE":
      return "Vídeo";
    case "PRESENTATION_NODE":
      return "Presentación";
    case "CUSTOM":
      return "Otro flujo";
    default:
      return "Creativo";
  }
}

const LEARNING_VALUE_UI_PREFIX_RES: readonly RegExp[] = [
  /^brain\s+ha\s+detectado\s+que\s+/i,
  /^parece\s+que\s+/i,
  /^el\s+sistema\s+ha\s+detectado\s+que\s+/i,
];

/** Quita prefijos de interfaz si el candidato los guardó por error o herencia. */
export function stripLearningValueUiPrefixes(value: string): string {
  let t = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of LEARNING_VALUE_UI_PREFIX_RES) {
      const next = t.replace(re, "").trim();
      if (next !== t) {
        t = next;
        changed = true;
      }
    }
  }
  return t;
}

function normalizeLookupText(value: string): string {
  return stripLearningValueUiPrefixes(value)
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatLearningReviewText(value: string): string {
  const body = stripLearningValueUiPrefixes(value);
  const key = normalizeLookupText(body);
  if (key === "repeated manual changes to brain length and tone presets in designer.") {
    return "sueles ajustar el tono y la longitud de las sugerencias de texto en Designer.";
  }
  if (key === "telemetry tied to this node/session suggests project-scoped copy tuning, not global brand.") {
    return "esta señal parece útil para este proyecto, pero todavía no debería cambiar la marca global.";
  }
  if (key === "mixed accept/ignore on same text slots—contextual only, not a preference.") {
    return "hay señales mezcladas en las sugerencias de texto; por ahora conviene tratarlo como contexto puntual, no como una preferencia estable.";
  }
  return body;
}

export function formatLearningReviewReasoning(reasoning: string): string {
  const key = normalizeLookupText(reasoning);
  if (key === "stronger signal from manualoverridecounts than from ignored suggestions alone.") {
    return "Brain lo propone porque has ajustado manualmente opciones de tono o longitud. Es una señal débil: sirve como pista, no como regla definitiva.";
  }
  if (key === "export/manual signals present; keep scoped until user confirms.") {
    return "Hay acciones recientes en este proyecto, pero no suficientes para tocar la marca. Por eso Brain sugiere guardarlo solo a nivel de proyecto si te encaja.";
  }
  if (key === "weak pattern from ignores; down-ranked per policy.") {
    return "La señal es poco clara porque has aceptado y descartado sugerencias parecidas. Lo más prudente es guardarlo como contexto puntual o descartarlo.";
  }
  return reasoning.trim();
}

export function formatLearningReviewExample(example: string): string {
  const clean = example.trim();
  const key = normalizeLookupText(clean);
  if (key === "manual:brain:lengthpreset") return "Cambiaste la longitud de una sugerencia de Brain.";
  if (key === "manual:brain:tonepreset") return "Cambiaste el tono de una sugerencia de Brain.";
  if (key.startsWith("manual:brain:lengthpreset=")) return "Cambios manuales en la longitud de sugerencias de Brain.";
  if (key.startsWith("manual:brain:tonepreset=")) return "Cambios manuales en el tono de sugerencias de Brain.";
  return clean;
}

/** Titular visible en «Por revisar»: prefijo de producto + aprendizaje almacenado (limpio). */
export function formatLearningReviewCardHeadline(value: string): string {
  const body = formatLearningReviewText(value);
  if (!body.length) return "Brain ha detectado que…";
  return `Brain ha detectado que ${body}`;
}

export function labelForLearningCard(candidateType: LearningCandidateType): string {
  switch (candidateType) {
    case "BRAND_DNA":
      return "Marca";
    case "PROJECT_MEMORY":
      return "Proyecto";
    case "CREATIVE_PREFERENCE":
      return "Estilo";
    case "VISUAL_MEMORY":
      return "Visual / Imagen";
    case "OUTLIER":
      return "Contexto puntual";
    case "CONTRADICTION":
      return "Conflicto con tu marca";
    default:
      return "Aprendizaje";
  }
}

/** Textos para “Ver por qué” sin vocabulario técnico interno. */
export function humanEvidenceBullets(row: StoredLearningCandidate): string[] {
  const ev = row.candidate.evidence;
  const out: string[] = [];
  const visualNodeBundle = hasVisualLearningReviewBundle(ev.eventCounts);
  const basadoExample = ev.examples?.find((x) => x.startsWith("Basado en:"));
  if (visualNodeBundle && basadoExample) {
    out.push(basadoExample.length > 220 ? `${basadoExample.slice(0, 217)}…` : basadoExample);
    const dUp = ev.eventCounts?.designer_user_upload_imported;
    const dUs = ev.eventCounts?.designer_user_upload_used;
    const vUp = ev.eventCounts?.visual_user_upload_imported;
    const vUs = ev.eventCounts?.visual_user_upload_used;
    if (typeof dUp === "number" && typeof dUs === "number") {
      out.push(`Telemetría visual: ${dUp} imágenes importadas y ${dUs} usadas con origen USER_UPLOAD en Designer.`);
    } else if (typeof vUp === "number" && typeof vUs === "number" && (vUp > 0 || vUs > 0)) {
      out.push(`Telemetría visual: ${vUp} imágenes importadas y ${vUs} usadas con origen USER_UPLOAD en nodos visuales.`);
    } else {
      const bits: string[] = [];
      const pie = (n: number, s: string, p: string) => (n === 1 ? `1 ${s}` : `${n} ${p}`);
      const prImp = ev.eventCounts?.photoroom_image_imported;
      const prEd = ev.eventCounts?.photoroom_image_edited;
      const prBg = ev.eventCounts?.photoroom_background_removed;
      const prMask = ev.eventCounts?.photoroom_mask_used;
      const prLay = ev.eventCounts?.photoroom_layers_used;
      const prCol = ev.eventCounts?.photoroom_color_used;
      const prSt = ev.eventCounts?.photoroom_style_applied;
      const prEx = ev.eventCounts?.photoroom_image_exported;
      const igGen = ev.eventCounts?.image_generator_generated;
      const igEx = ev.eventCounts?.image_generator_exported;
      const vf = ev.eventCounts?.video_frame_used;
      const vp = ev.eventCounts?.video_poster_used;
      if (typeof prImp === "number" && prImp > 0) bits.push(pie(prImp, "imagen cargada en Photoroom", "imágenes cargadas en Photoroom"));
      if (typeof prEd === "number" && prEd > 0) bits.push(pie(prEd, "imagen editada en Photoroom", "imágenes editadas en Photoroom"));
      if (typeof prBg === "number" && prBg > 0) bits.push(pie(prBg, "fondo eliminado", "fondos eliminados"));
      if (typeof prMask === "number" && prMask > 0) bits.push(pie(prMask, "máscara usada", "máscaras usadas"));
      if (typeof prLay === "number" && prLay > 0) bits.push(pie(prLay, "capa usada", "capas usadas"));
      if (typeof prCol === "number" && prCol > 0) bits.push(pie(prCol, "color usado", "colores usados"));
      if (typeof prSt === "number" && prSt > 0) bits.push(pie(prSt, "estilo aplicado", "estilos aplicados"));
      if (typeof prEx === "number" && prEx > 0) bits.push(pie(prEx, "imagen exportada desde Photoroom", "imágenes exportadas desde Photoroom"));
      if (typeof igGen === "number" && igGen > 0) bits.push(pie(igGen, "imagen generada", "imágenes generadas"));
      if (typeof igEx === "number" && igEx > 0) bits.push(pie(igEx, "imagen exportada desde generador", "imágenes exportadas desde generador"));
      if (typeof vf === "number" && vf > 0) bits.push(pie(vf, "frame de vídeo usado", "frames de vídeo usados"));
      if (typeof vp === "number" && vp > 0) bits.push(pie(vp, "póster de vídeo usado", "pósters de vídeo usados"));
      if (bits.length) out.push(`Telemetría visual: ${bits.join("; ")}.`);
    }
    const frames = ev.eventCounts?.designer_export_image_frames;
    const loose = ev.eventCounts?.designer_export_loose_images;
    if (typeof frames === "number" || typeof loose === "number") {
      out.push(
        `exportImagesSummary (exportación): marcos con contenido ${typeof frames === "number" ? frames : "—"}, imágenes sueltas ${typeof loose === "number" ? loose : "—"}.`,
      );
    }
  }
  if (ev.evidenceSource === "visual_reference") {
    const n = ev.eventCounts?.reference_images;
    const nTotal = ev.eventCounts?.reference_images_total;
    const core = ev.eventCounts?.core_visual_dna_candidates;
    if (typeof n === "number" && typeof nTotal === "number" && nTotal > n && n > 0) {
      out.push(`Basado en ${n} de ${nTotal} imágenes de referencia (el resto está excluido o sin peso en el agregado).`);
    } else if (typeof n === "number" && n > 0) {
      out.push(`Basado en ${n} imagen${n === 1 ? "" : "es"} de referencia en Brain.`);
    }
    if (typeof core === "number" && typeof n === "number" && n > 0) {
      out.push(`${core} de ${n} encajan como posible ADN visual (requiere tu revisión).`);
    }
    const sig = ev.examples?.find((x) => x.startsWith("Señales:"));
    if (sig) {
      out.push(sig.length > 200 ? `${sig.slice(0, 197)}…` : sig);
    }
  }
  const originNode = resolveLearningPendingAnchorNodeId(row);
  if (ev.evidenceSource !== "visual_reference" && originNode) {
    out.push("Origen: una acción reciente en un nodo conectado a Brain.");
  } else if (ev.evidenceSource === "visual_reference") {
    out.push(
      "Origen: cola generada desde Brain Studio · referencias visuales (revisa la procedencia en la tarjeta; inventario ≠ visión remota).",
    );
  }
  if (row.telemetryNodeType && ev.evidenceSource !== "visual_reference") {
    out.push(`Flujo: ${labelForBrainNodeSource(row.telemetryNodeType)}.`);
  }
  if (ev.relatedArtifactKinds?.length) {
    out.push(`Tipo de pieza o exportación: ${ev.relatedArtifactKinds.join(", ")}.`);
  }
  if (ev.evidenceSource !== "visual_reference" && ev.examples?.[0]) {
    const t = formatLearningReviewExample(ev.examples[0]);
    if (!t.startsWith("Basado en:")) {
      out.push(`Ejemplo: «${t.length > 180 ? `${t.slice(0, 177)}…` : t}».`);
    }
  }
  const uniqueAccepted = ev.eventCounts?.uniqueAccepted;
  const uniqueIgnored = ev.eventCounts?.uniqueIgnored;
  const uniqueShown = ev.eventCounts?.uniqueShown;
  if (
    typeof uniqueAccepted === "number" ||
    typeof uniqueIgnored === "number" ||
    typeof uniqueShown === "number"
  ) {
    const parts: string[] = [];
    if (typeof uniqueAccepted === "number") parts.push(`${uniqueAccepted} aceptada${uniqueAccepted === 1 ? "" : "s"}`);
    if (typeof uniqueIgnored === "number") parts.push(`${uniqueIgnored} descartada${uniqueIgnored === 1 ? "" : "s"}`);
    if (typeof uniqueShown === "number") parts.push(`${uniqueShown} mostrada${uniqueShown === 1 ? "" : "s"}`);
    out.push(`Señales observadas: ${parts.join(", ")}.`);
  } else {
    let nSignals = 0;
    if (ev.eventCounts) {
      for (const b of Object.values(ev.eventCounts)) {
        if (typeof b === "number" && Number.isFinite(b)) nSignals += b;
      }
    }
    if (nSignals > 0) {
      out.push(`Se apoya en ${nSignals} señales agrupadas del uso reciente.`);
    }
  }
  if (row.candidate.conflictWithDNA || row.candidate.type === "CONTRADICTION") {
    out.push("Puede chocar con reglas o mensajes que ya definiste para la marca.");
  }
  return out;
}

/**
 * Detalle para «Ver por qué» en revisión: evidencia humana + trazabilidad visual cuando hay `visualAnalyses`.
 */
export function learningReviewDiagnosticBullets(
  row: StoredLearningCandidate,
  opts?: { visualAnalyses?: BrainVisualImageAnalysis[] },
): string[] {
  const out = [...humanEvidenceBullets(row)];
  const ev = row.candidate.evidence;
  const bundle = hasVisualLearningReviewBundle(ev.eventCounts);
  const wantsVisualDetail = ev.evidenceSource === "visual_reference" || bundle;
  if (!wantsVisualDetail) return out;

  if (!opts?.visualAnalyses?.length) {
    out.push("No hay análisis visual real asociado a este aprendizaje.");
    return out;
  }

  const analyses = opts.visualAnalyses;
  const analyzedReal = analyses.filter(
    (a) => a.analysisStatus === "analyzed" && a.visionProviderId && a.visionProviderId !== "mock" && !a.fallbackUsed,
  );
  out.push(
    `Capa referencias: ${analyses.length} filas · Visión remota analizada (sin fallback): ${analyzedReal.length} · Con mock o fallback: ${analyses.length - analyzedReal.length}.`,
  );

  for (const a of analyses.slice(0, 12)) {
    const label = a.fileName?.trim() || a.sourceLabel?.trim() || a.sourceAssetId;
    const provider = a.visionProviderId ?? "—";
    const fb = a.fallbackUsed ? "sí" : "no";
    out.push(
      `Imagen «${label}»: estado ${a.analysisStatus ?? "—"} · proveedor ${provider} · fallback ${fb} · versión ${a.analyzerVersion ?? "—"}`,
    );
    out.push(
      `  · Sujetos: ${(a.subjectTags ?? []).slice(0, 12).join(", ") || "—"} · Estilo: ${(a.visualStyle ?? []).slice(0, 10).join(", ") || "—"} · Mood: ${(a.mood ?? []).slice(0, 8).join(", ") || "—"}`,
    );
    out.push(
      `  · Composición: ${(a.composition ?? []).slice(0, 8).join(", ") || "—"} · Paleta dominante: ${(a.colorPalette?.dominant ?? []).slice(0, 10).join(", ") || "—"}`,
    );
    out.push(
      `  · Personas: ${a.peopleDetail?.description ?? a.people ?? "—"} · Ropa: ${(a.clothingDetail?.style ?? []).slice(0, 6).join(", ") || a.clothingStyle || "—"}`,
    );
    out.push(
      `  · Gráfico: ${(a.graphicDetail?.layout ?? []).slice(0, 6).join(", ") || a.graphicStyle || "—"} · Mensaje: ${(a.visualMessage ?? []).slice(0, 3).join(" · ") || "—"}`,
    );
  }

  if (ev.eventCounts && Object.keys(ev.eventCounts).length) {
    const ec = ev.eventCounts as Record<string, number | string | undefined>;
    const pairs = Object.entries(ec)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .slice(0, 14);
    if (pairs.length) out.push(`Contadores de evidencia: ${pairs.join(" · ")}.`);
  }
  if (ev.sourceNodeIds?.length) {
    out.push(`sourceNodeIds: ${ev.sourceNodeIds.slice(0, 12).join(", ")}`);
  }
  return out;
}
