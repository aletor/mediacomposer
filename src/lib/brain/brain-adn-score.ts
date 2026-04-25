import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";

/** Tooltip / title compartido: el ADN del nodo no es calidad semántica absoluta. */
export const BRAIN_ADN_COMPLETENESS_TOOLTIP_ES =
  "Completitud del Brain basada en señales cargadas (voz, personas, mensajes y documentos de contexto analizados). No es una puntuación de calidad creativa absoluta.";

export type BrainAdnScore = {
  total: number;
  voiceScore: number;
  personasScore: number;
  msgScore: number;
  marketScore: number;
};

export type NormalizedProjectAssets = ReturnType<typeof normalizeProjectAssets>;

/** Misma heurística que el panel Brain fullscreen (ADN 0–100). */
export function computeAdnScore(assets: NormalizedProjectAssets): BrainAdnScore {
  const totalVoiceSignals =
    assets.strategy.voiceExamples.length +
    assets.strategy.approvedPhrases.length +
    assets.strategy.tabooPhrases.length;
  const voiceScore = Math.min(100, Math.round((totalVoiceSignals / 10) * 100));
  const personasScore = Math.min(100, Math.round((assets.strategy.personas.length / 4) * 100));
  const msgScore = Math.min(100, Math.round((assets.strategy.funnelMessages.length / 8) * 100));
  const marketSignals = assets.knowledge.documents.filter(
    (d) => d.scope === "context" && d.status === "Analizado",
  ).length;
  const marketScore = Math.min(100, Math.round((marketSignals / 6) * 100));
  const total = Math.round((voiceScore + personasScore + msgScore + marketScore) / 4);
  return { total, voiceScore, personasScore, msgScore, marketScore };
}
