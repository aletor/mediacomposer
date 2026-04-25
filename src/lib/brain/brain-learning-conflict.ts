import type { BrandDNA } from "./brain-models";
import { prohibitionText } from "./brain-models";
import type { LearningCandidate } from "./learning-candidate-schema";

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Heurística: el candidato sugiere algo que choca con prohibiciones o claims bloqueados del ADN actual. */
export function learningContradictsBrandDna(candidate: LearningCandidate, dna: BrandDNA): boolean {
  const v = normalize(candidate.value);
  if (v.length < 8) return false;

  for (const p of dna.prohibitions) {
    const pt = normalize(prohibitionText(p));
    if (pt.length < 6) continue;
    if (v.includes(pt) || pt.includes(v.slice(0, Math.min(v.length, 48)))) return true;
  }

  for (const claim of dna.claims) {
    if (!claim.locked) continue;
    const ct = normalize(claim.text);
    if (ct.length < 8) continue;
    const neg =
      /\b(no|nunca|sin|evitar|prohibido|jamás|never|not)\b/i.test(candidate.value) ||
      /\b(no|nunca|sin|evitar|prohibido)\b/i.test(candidate.topic);
    if (neg && ct.length >= 8 && v.includes(ct.slice(0, Math.min(ct.length, 40)))) return true;
  }

  return false;
}

export function annotateCandidateDnaConflict(candidate: LearningCandidate, dna: BrandDNA): LearningCandidate {
  const inferred = learningContradictsBrandDna(candidate, dna);
  const explicit = candidate.type === "CONTRADICTION" || candidate.conflictWithDNA === true;
  if (!inferred && !explicit) return candidate;
  return { ...candidate, conflictWithDNA: true };
}

export type BrainLockViolation = { code: string; message: string };

/** Promoción a ADN: no permitir pisar prohibiciones, claims o slots bloqueados sin flujo explícito aparte. */
export function checkPromoteRespectsLocks(candidate: LearningCandidate, dna: BrandDNA): BrainLockViolation | null {
  const promoted = normalize(candidate.value);
  if (!promoted) return null;

  for (const p of dna.prohibitions) {
    if (!p.locked) continue;
    const t = normalize(prohibitionText(p));
    if (t.length >= 6 && promoted.includes(t)) {
      return { code: "LOCKED_PROHIBITION", message: "El aprendizaje contradice una prohibición bloqueada del ADN." };
    }
  }

  for (const claim of dna.claims) {
    if (!claim.locked) continue;
    const t = normalize(claim.text);
    if (t.length >= 10 && promoted.includes(t.slice(0, Math.min(t.length, 60)))) {
      return { code: "LOCKED_CLAIM", message: "El aprendizaje solapa un claim bloqueado del ADN." };
    }
  }

  for (const slot of dna.typography) {
    if (!slot.locked) continue;
    const fam = normalize(slot.family);
    if (fam.length >= 4 && promoted.includes(fam)) {
      return { code: "LOCKED_TYPOGRAPHY", message: "El aprendizaje menciona una tipografía bloqueada." };
    }
  }

  for (const pal of dna.palettes) {
    if (!pal.locked) continue;
    for (const hex of pal.swatches) {
      const h = String(hex).toLowerCase();
      if (h.length >= 4 && promoted.includes(h)) {
        return { code: "LOCKED_PALETTE", message: "El aprendizaje menciona un color de paleta bloqueada." };
      }
    }
  }

  return null;
}
