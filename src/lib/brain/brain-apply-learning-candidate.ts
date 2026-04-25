import type {
  BrainContextualMemoryEntry,
  BrainProjectMemoryEntry,
  ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import { normalizeProjectAssets } from "@/app/spaces/project-assets-metadata";
import type { LearningCandidateTopic, LearningResolutionAction } from "@/lib/brain/learning-candidate-schema";
import type { StoredLearningCandidate } from "@/lib/brain/learning-candidate-schema";
import { resolveLearningCandidateTopic } from "@/lib/brain/learning-candidate-schema";
import { stripLearningValueUiPrefixes } from "@/lib/brain/brain-review-labels";
import type { BrainFieldSourceInfo, BrainStrategyFieldProvenance } from "@/lib/brain/brain-field-provenance";

function cloneAssets(assets: ProjectAssetsMetadata): ProjectAssetsMetadata {
  return normalizeProjectAssets(JSON.parse(JSON.stringify(assets)) as unknown);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mergeProvenance(
  prev: BrainStrategyFieldProvenance | undefined,
  key: string,
  info: BrainFieldSourceInfo,
): BrainStrategyFieldProvenance {
  return { ...(prev ?? {}), [key]: info };
}

function learningSourceInfo(row: StoredLearningCandidate, label: string, changedPath?: string): BrainFieldSourceInfo {
  return {
    label,
    sourceTier: "confirmed",
    sourceConfidence: "high",
    updatedAt: nowIso(),
    learningIds: [row.id],
    documentIds: row.candidate.evidence.sourceArtifactIds?.filter((x): x is string => typeof x === "string"),
    imageIds: row.candidate.evidence.examples?.filter((x): x is string => typeof x === "string" && x.startsWith("img")),
    ...(changedPath ? { changedPath } : {}),
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function dedupePush(arr: string[], v: string, changed: string[], path: string): void {
  const t = v.trim();
  if (!t) return;
  const exists = arr.some((x) => norm(x) === norm(t));
  if (exists) return;
  arr.push(t);
  changed.push(path);
}

/** Destino de escritura en `strategy` / conocimiento a partir de un topic canónico. */
export type StrategyWriteKind =
  | "languageTraits"
  | "tabooPhrases"
  | "forbiddenTerms"
  | "approvedPhrases"
  | "preferredTerms"
  | "approvedPatterns"
  | "funnelMessages"
  | "messageBlueprints"
  | "factsAndEvidence"
  | "personas"
  | "confirmedVisualPatterns"
  | "projectOnlyMemories"
  | "contextualMemories";

export type InferStrategyWriteTargetResult =
  | { kind: StrategyWriteKind }
  | { kind: "unknown"; reason: string };

export function inferStrategyWriteTargetFromCanonical(topic: LearningCandidateTopic): InferStrategyWriteTargetResult {
  switch (topic) {
    case "tone":
      return { kind: "languageTraits" };
    case "taboo_phrase":
      return { kind: "tabooPhrases" };
    case "forbidden_term":
      return { kind: "forbiddenTerms" };
    case "approved_phrase":
      return { kind: "approvedPhrases" };
    case "preferred_term":
      return { kind: "preferredTerms" };
    case "layout_preference":
    case "creative_preference":
      return { kind: "approvedPatterns" };
    case "message":
      return { kind: "funnelMessages" };
    case "claim":
      return { kind: "messageBlueprints" };
    case "fact":
      return { kind: "factsAndEvidence" };
    case "persona":
      return { kind: "personas" };
    case "visual_direction":
    case "visual_pattern":
    case "image_preference":
      return { kind: "confirmedVisualPatterns" };
    case "project_memory":
      return { kind: "projectOnlyMemories" };
    case "contextual_memory":
      return { kind: "contextualMemories" };
    default:
      return { kind: "unknown", reason: `Topic canónico sin ruta de aplicación: ${topic}` };
  }
}

/**
 * Resuelve alias legacy y devuelve el destino de escritura en estrategia.
 * Si el topic no es canónico (ni alias), devuelve `unknown` — no aplicar a ADN automáticamente.
 */
export function inferStrategyWriteTarget(topic: string): InferStrategyWriteTargetResult {
  const canon = resolveLearningCandidateTopic(topic);
  if (!canon) {
    return {
      kind: "unknown",
      reason: `Topic no canónico ni alias conocido: "${topic.trim().slice(0, 80)}${topic.trim().length > 80 ? "…" : ""}"`,
    };
  }
  return inferStrategyWriteTargetFromCanonical(canon);
}

export type ApplyLearningCandidateResult = {
  nextAssets: ProjectAssetsMetadata;
  applied: boolean;
  changedPaths: string[];
  warnings: string[];
};

/**
 * Aplica un aprendizaje resuelto a `metadata.assets` del proyecto (fuente de verdad en UI).
 * Llamar tras `POST /learning/resolve` exitoso para mutaciones que deben persistir al guardar el proyecto.
 */
export function applyLearningCandidateToProjectAssets(
  assets: ProjectAssetsMetadata,
  row: StoredLearningCandidate,
  action: LearningResolutionAction,
): ApplyLearningCandidateResult {
  const warnings: string[] = [];
  const changedPaths: string[] = [];
  if (action === "DISMISS") {
    return { nextAssets: assets, applied: false, changedPaths: [], warnings: [] };
  }

  const next = cloneAssets(assets);
  const c = row.candidate;
  const value = stripLearningValueUiPrefixes(c.value).trim().slice(0, 500);
  if (!value) {
    warnings.push("Valor vacío tras limpiar prefijos UI.");
    return { nextAssets: assets, applied: false, changedPaths: [], warnings };
  }

  const stamp = learningSourceInfo(row, `Aprendizaje ${row.id}`);

  if (action === "KEEP_IN_PROJECT") {
    if (c.type !== "PROJECT_MEMORY" && c.type !== "CREATIVE_PREFERENCE") {
      warnings.push("KEEP_IN_PROJECT: tipo inesperado; se guarda igual en memoria de proyecto.");
    }
    const entries = [...(next.knowledge.projectOnlyMemories ?? [])];
    const id = `pm-${row.id}`;
    if (!entries.some((e) => e.sourceLearningId === row.id)) {
      const entry: BrainProjectMemoryEntry = {
        id,
        topic: (() => {
          const r = resolveLearningCandidateTopic(c.topic);
          if (r) return r;
          const raw = c.topic.trim().slice(0, 120);
          return raw || "project_memory";
        })(),
        value,
        createdAt: nowIso(),
        sourceLearningId: row.id,
      };
      entries.push(entry);
      next.knowledge = { ...next.knowledge, projectOnlyMemories: entries };
      changedPaths.push("knowledge.projectOnlyMemories");
    }
    next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "projectMemory", {
      ...stamp,
      label: "Memoria solo proyecto",
      changedPath: "knowledge.projectOnlyMemories",
    });
    return { nextAssets: normalizeProjectAssets(next), applied: true, changedPaths, warnings };
  }

  if (action === "SAVE_AS_CONTEXT" || action === "MARK_OUTLIER") {
    const entries = [...(next.knowledge.contextualMemories ?? [])];
    if (!entries.some((e) => e.sourceLearningId === row.id)) {
      const entry: BrainContextualMemoryEntry = {
        id: `ctx-${row.id}`,
        topic: (() => {
          const r = resolveLearningCandidateTopic(c.topic);
          if (r) return r;
          const raw = c.topic.trim().slice(0, 120);
          return raw || "contextual_memory";
        })(),
        value,
        createdAt: nowIso(),
        sourceLearningId: row.id,
        isOutlier: action === "MARK_OUTLIER",
      };
      entries.push(entry);
      next.knowledge = { ...next.knowledge, contextualMemories: entries };
      changedPaths.push("knowledge.contextualMemories");
    }
    next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "contextualMemory", {
      ...stamp,
      label: action === "MARK_OUTLIER" ? "Contexto puntual (outlier)" : "Contexto puntual",
      changedPath: "knowledge.contextualMemories",
    });
    return { nextAssets: normalizeProjectAssets(next), applied: true, changedPaths, warnings };
  }

  if (action !== "PROMOTE_TO_DNA") {
    warnings.push(`Acción no soportada para assets: ${action}`);
    return { nextAssets: assets, applied: false, changedPaths: [], warnings };
  }

  // --- PROMOTE_TO_DNA ---
  if (c.type === "PROJECT_MEMORY") {
    warnings.push(
      "PROJECT_MEMORY: «Guardar en ADN» guarda en memoria de este proyecto (no sustituye ADN de marca corporativa).",
    );
    const entries = [...(next.knowledge.projectOnlyMemories ?? [])];
    const id = `pm-${row.id}`;
    if (!entries.some((e) => e.sourceLearningId === row.id)) {
      const entry: BrainProjectMemoryEntry = {
        id,
        topic: (() => {
          const r = resolveLearningCandidateTopic(c.topic);
          if (r) return r;
          const raw = c.topic.trim().slice(0, 120);
          return raw || "project_memory";
        })(),
        value,
        createdAt: nowIso(),
        sourceLearningId: row.id,
      };
      entries.push(entry);
      next.knowledge = { ...next.knowledge, projectOnlyMemories: entries };
      changedPaths.push("knowledge.projectOnlyMemories");
    }
    next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "projectMemory", {
      ...stamp,
      label: "Memoria de proyecto",
      sourceTier: "confirmed",
      changedPath: "knowledge.projectOnlyMemories",
    });
    return { nextAssets: normalizeProjectAssets(next), applied: true, changedPaths, warnings };
  }

  if (c.type === "VISUAL_MEMORY") {
    const layer = { ...(next.strategy.visualReferenceAnalysis ?? { analyses: [] }) };
    const patterns = [...(layer.confirmedVisualPatterns ?? [])];
    dedupePush(patterns, value, changedPaths, "strategy.visualReferenceAnalysis.confirmedVisualPatterns");
    next.strategy.visualReferenceAnalysis = { ...layer, confirmedVisualPatterns: patterns };
    next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "visualDirection", {
      ...stamp,
      label: "ADN visual confirmado (aprendizaje)",
      changedPath: "strategy.visualReferenceAnalysis.confirmedVisualPatterns",
    });
    return { nextAssets: normalizeProjectAssets(next), applied: changedPaths.length > 0, changedPaths, warnings };
  }

  if (c.type === "CREATIVE_PREFERENCE") {
    dedupePush(next.strategy.approvedPhrases, `Preferencia: ${value}`, changedPaths, "strategy.approvedPhrases");
    next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "creativePreference", {
      ...stamp,
      label: "Preferencia creativa",
      changedPath: "strategy.approvedPhrases",
    });
    return { nextAssets: normalizeProjectAssets(next), applied: true, changedPaths, warnings };
  }

  if (c.type === "BRAND_DNA" || c.type === "CONTRADICTION") {
    if (c.type === "CONTRADICTION") {
      dedupePush(next.strategy.rejectedPatterns, value, changedPaths, "strategy.rejectedPatterns");
      next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "contradiction", {
        ...stamp,
        label: "Contradicción archivada en rechazados",
        sourceTier: "confirmed",
        sourceConfidence: "medium",
        changedPath: "strategy.rejectedPatterns",
      });
      return { nextAssets: normalizeProjectAssets(next), applied: true, changedPaths, warnings };
    }

    const target = inferStrategyWriteTarget(c.topic);
    if (target.kind === "unknown") {
      warnings.push(
        `${target.reason} No se aplicó al ADN; asigne un topic canónico o use otra acción (memoria / contexto).`,
      );
      return { nextAssets: assets, applied: false, changedPaths: [], warnings };
    }

    switch (target.kind) {
      case "languageTraits":
        dedupePush(next.strategy.languageTraits, value, changedPaths, "strategy.languageTraits");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "tone", {
          ...stamp,
          label: "Tono (aprendizaje)",
          changedPath: "strategy.languageTraits",
        });
        break;
      case "tabooPhrases":
        dedupePush(next.strategy.tabooPhrases, value, changedPaths, "strategy.tabooPhrases");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "tone", {
          ...stamp,
          label: "Tabú (aprendizaje)",
          changedPath: "strategy.tabooPhrases",
        });
        break;
      case "forbiddenTerms":
        dedupePush(next.strategy.forbiddenTerms, value, changedPaths, "strategy.forbiddenTerms");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "tone", {
          ...stamp,
          label: "Término prohibido (aprendizaje)",
          changedPath: "strategy.forbiddenTerms",
        });
        break;
      case "approvedPhrases":
        dedupePush(next.strategy.approvedPhrases, value, changedPaths, "strategy.approvedPhrases");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "messages", {
          ...stamp,
          label: "Frase aprobada (aprendizaje)",
          changedPath: "strategy.approvedPhrases",
        });
        break;
      case "preferredTerms":
        dedupePush(next.strategy.preferredTerms, value, changedPaths, "strategy.preferredTerms");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "tone", {
          ...stamp,
          label: "Término preferido (aprendizaje)",
          changedPath: "strategy.preferredTerms",
        });
        break;
      case "approvedPatterns":
        dedupePush(next.strategy.approvedPatterns, value, changedPaths, "strategy.approvedPatterns");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "identityNarrative", {
          ...stamp,
          label: "Patrón / preferencia (aprendizaje)",
          changedPath: "strategy.approvedPatterns",
        });
        break;
      case "funnelMessages":
        next.strategy.funnelMessages = [...next.strategy.funnelMessages];
        next.strategy.funnelMessages.push({
          id: `fm-${row.id.slice(0, 10)}`,
          stage: "awareness",
          text: value,
        });
        changedPaths.push("strategy.funnelMessages");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "messages", {
          ...stamp,
          label: "Mensaje embudo (aprendizaje)",
          changedPath: "strategy.funnelMessages",
        });
        break;
      case "messageBlueprints":
        next.strategy.messageBlueprints = [...next.strategy.messageBlueprints];
        next.strategy.messageBlueprints.push({
          id: `mb-${row.id.slice(0, 10)}`,
          claim: value,
          support: resolveLearningCandidateTopic(c.topic) ?? c.topic.slice(0, 120),
          audience: "general",
          channel: "multi",
          stage: "awareness",
          cta: "",
          evidence: [],
        });
        changedPaths.push("strategy.messageBlueprints");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "messages", {
          ...stamp,
          label: "Blueprint / claim (aprendizaje)",
          changedPath: "strategy.messageBlueprints",
        });
        break;
      case "factsAndEvidence":
        next.strategy.factsAndEvidence = [...next.strategy.factsAndEvidence];
        next.strategy.factsAndEvidence.push({
          id: `fe-${row.id.slice(0, 10)}`,
          claim: value,
          evidence: [],
          sourceDocIds: [],
          strength: "media",
          verified: false,
          interpreted: true,
        });
        changedPaths.push("strategy.factsAndEvidence");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "identityNarrative", {
          ...stamp,
          label: "Hecho / evidencia (aprendizaje)",
          changedPath: "strategy.factsAndEvidence",
        });
        break;
      case "personas":
        next.strategy.personas = [...next.strategy.personas];
        next.strategy.personas.push({
          id: `per-${row.id.slice(0, 8)}`,
          name: value.slice(0, 80),
          pain: "",
          channel: "multi",
          sophistication: "Media",
          tags: ["desde aprendizaje"],
        });
        changedPaths.push("strategy.personas");
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "identityNarrative", {
          ...stamp,
          label: "Persona (aprendizaje)",
          changedPath: "strategy.personas",
        });
        break;
      case "confirmedVisualPatterns": {
        const layer = { ...(next.strategy.visualReferenceAnalysis ?? { analyses: [] }) };
        const patterns = [...(layer.confirmedVisualPatterns ?? [])];
        dedupePush(patterns, value, changedPaths, "strategy.visualReferenceAnalysis.confirmedVisualPatterns");
        next.strategy.visualReferenceAnalysis = { ...layer, confirmedVisualPatterns: patterns };
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "visualDirection", {
          ...stamp,
          label: "ADN visual confirmado (aprendizaje)",
          changedPath: "strategy.visualReferenceAnalysis.confirmedVisualPatterns",
        });
        break;
      }
      case "projectOnlyMemories": {
        const entries = [...(next.knowledge.projectOnlyMemories ?? [])];
        const id = `pm-${row.id}`;
        if (!entries.some((e) => e.sourceLearningId === row.id)) {
          entries.push({
            id,
            topic: resolveLearningCandidateTopic(c.topic) ?? "project_memory",
            value,
            createdAt: nowIso(),
            sourceLearningId: row.id,
          });
          next.knowledge = { ...next.knowledge, projectOnlyMemories: entries };
          changedPaths.push("knowledge.projectOnlyMemories");
        }
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "projectMemory", {
          ...stamp,
          label: "Memoria de proyecto (desde topic)",
          changedPath: "knowledge.projectOnlyMemories",
        });
        break;
      }
      case "contextualMemories": {
        const entries = [...(next.knowledge.contextualMemories ?? [])];
        if (!entries.some((e) => e.sourceLearningId === row.id)) {
          entries.push({
            id: `ctx-${row.id}`,
            topic: resolveLearningCandidateTopic(c.topic) ?? "contextual_memory",
            value,
            createdAt: nowIso(),
            sourceLearningId: row.id,
            isOutlier: false,
          });
          next.knowledge = { ...next.knowledge, contextualMemories: entries };
          changedPaths.push("knowledge.contextualMemories");
        }
        next.strategy.fieldProvenance = mergeProvenance(next.strategy.fieldProvenance, "contextualMemory", {
          ...stamp,
          label: "Memoria contextual (desde topic)",
          changedPath: "knowledge.contextualMemories",
        });
        break;
      }
      default:
        break;
    }
    return { nextAssets: normalizeProjectAssets(next), applied: changedPaths.length > 0, changedPaths, warnings };
  }

  if (c.type === "OUTLIER") {
    warnings.push("OUTLIER: usa SAVE_AS_CONTEXT o MARK_OUTLIER; no se aplicó a ADN.");
    return { nextAssets: assets, applied: false, changedPaths: [], warnings };
  }

  warnings.push(`Tipo de candidato no aplicado a assets: ${c.type}`);
  return { nextAssets: assets, applied: false, changedPaths: [], warnings };
}
