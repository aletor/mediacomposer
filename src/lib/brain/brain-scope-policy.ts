export type BrainWriteScope = "brand" | "project" | "capsule";

export type BrainScopePolicyAssetsLike = {
  brainMeta?: {
    brandLocked?: boolean;
  } | null;
};

export type BrainScopePolicyLearningLike = {
  suggestedBrainScope?: BrainWriteScope;
  candidate?: {
    scope?: string;
    evidence?: {
      evidenceSource?: string;
    };
  };
};

export const BRAIN_BRAND_LOCKED_MESSAGE =
  "La marca está bloqueada. Brain puede usarla, pero no modificarla.";

export function isBrainBrandLocked(assets: BrainScopePolicyAssetsLike | null | undefined): boolean {
  return assets?.brainMeta?.brandLocked === true;
}

export function canWriteBrainScope(
  scope: BrainWriteScope,
  assets: BrainScopePolicyAssetsLike | null | undefined,
): boolean {
  return !(scope === "brand" && isBrainBrandLocked(assets));
}

export function getBrainScopeWriteBlockReason(
  scope: BrainWriteScope,
  assets: BrainScopePolicyAssetsLike | null | undefined,
): string | null {
  if (canWriteBrainScope(scope, assets)) return null;
  return BRAIN_BRAND_LOCKED_MESSAGE;
}

export function assertCanWriteBrainScope(
  scope: BrainWriteScope,
  assets: BrainScopePolicyAssetsLike | null | undefined,
): void {
  const reason = getBrainScopeWriteBlockReason(scope, assets);
  if (reason) throw new Error(reason);
}

export function resolveLearningCandidateBrainScope(row: BrainScopePolicyLearningLike): BrainWriteScope {
  if (row.suggestedBrainScope === "brand" || row.suggestedBrainScope === "project" || row.suggestedBrainScope === "capsule") {
    return row.suggestedBrainScope;
  }
  if (row.candidate?.evidence?.evidenceSource === "visual_reference") return "capsule";
  return row.candidate?.scope === "BRAND" ? "brand" : "project";
}
