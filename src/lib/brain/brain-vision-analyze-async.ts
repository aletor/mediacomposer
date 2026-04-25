import type {
  BrainVisualImageAnalysis,
  BrainVisualReferenceLayer,
  ProjectAssetsMetadata,
} from "@/app/spaces/project-assets-metadata";
import {
  aggregateVisualPatterns,
  analysisDedupeKeyFromAnalysis,
  analysisDedupeKeyFromRef,
  collectVisualImageAssetRefs,
  mergeVisualReferenceLayer,
  type BrainVisualAssetRef,
} from "./brain-visual-analysis";
import type { BrainVisionProvider } from "./brain-vision-provider";
import { createDefaultBrainVisionProvider } from "./brain-vision-providers-impl";
import { brainDevLog } from "./brain-dev-log";
import { buildVisualReanalyzeDiagnosticRow, type VisualReanalyzeDiagnosticRow } from "./brain-visual-reanalyze-diagnostics";

export async function analyzeBrainImageAssetAsync(
  projectId: string,
  asset: BrainVisualAssetRef,
  opts: {
    existing?: readonly BrainVisualImageAnalysis[];
    provider?: BrainVisionProvider;
    userEmail?: string;
    route?: string;
    /** Ignora cache de filas ya analizadas con visión remota fiable (re-estudio completo). */
    forceRestudy?: boolean;
  } = {},
): Promise<BrainVisualImageAnalysis> {
  const k = analysisDedupeKeyFromRef(asset);
  const existing = opts.existing ?? [];
  const hit = existing.find((a) => analysisDedupeKeyFromAnalysis(a) === k);
  if (!opts.forceRestudy && hit?.analysisStatus === "analyzed") {
    const usedRealRemote =
      hit.visionProviderId === "gemini-vision" || hit.visionProviderId === "openai-vision";
    const trustedRemote = usedRealRemote && hit.fallbackUsed !== true;
    if (trustedRemote) {
      return { ...hit };
    }
  }

  const url0 = asset.imageUrlForVision?.trim() ?? "";
  brainDevLog("brain-visual-reanalyze", "visual_analysis_started", {
    assetId: asset.id,
    assetRef: asset.assetRef ?? null,
    fileName: asset.fileName ?? null,
    hasDataUrl: url0.startsWith("data:"),
    hasHttpsUrl: /^https:\/\//i.test(url0),
    imageUrlForVisionExists: Boolean(url0),
  });

  const provider = opts.provider ?? createDefaultBrainVisionProvider();
  const analysis = await provider.analyzeImage({
    projectId,
    asset,
    imageUrl: asset.imageUrlForVision,
    userEmail: opts.userEmail,
    route: opts.route,
  });
  const diag = buildVisualReanalyzeDiagnosticRow(asset, provider.id, analysis);
  brainDevLog("brain-visual-reanalyze", "visual_analysis_completed", diag as unknown as Record<string, unknown>);
  return analysis;
}

export async function analyzeBrainImageBatchAsync(
  projectId: string,
  assets: BrainVisualAssetRef[],
  opts: {
    existingAnalyses?: readonly BrainVisualImageAnalysis[];
    maxImages?: number;
    provider?: BrainVisionProvider;
    userEmail?: string;
    route?: string;
    forceRestudy?: boolean;
  } = {},
): Promise<BrainVisualImageAnalysis[]> {
  const existing = opts.existingAnalyses ?? [];
  const max = opts.maxImages ?? 32;
  const uniq: BrainVisualAssetRef[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    const k = analysisDedupeKeyFromRef(a);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(a);
    if (uniq.length >= max) break;
  }
  const out: BrainVisualImageAnalysis[] = [];
  for (const ref of uniq) {
    out.push(
      await analyzeBrainImageAssetAsync(projectId, ref, {
        existing: [...existing, ...out],
        provider: opts.provider,
        userEmail: opts.userEmail,
        route: opts.route,
        forceRestudy: opts.forceRestudy,
      }),
    );
  }
  return out;
}

export async function reanalyzeVisualReferencesAsync(
  projectId: string,
  assets: ProjectAssetsMetadata,
  opts?: {
    provider?: BrainVisionProvider;
    userEmail?: string;
    route?: string;
    debug?: boolean;
    forceRestudy?: boolean;
  },
): Promise<{
  layer: BrainVisualReferenceLayer;
  providerId: BrainVisionProvider["id"];
  diagnostics?: VisualReanalyzeDiagnosticRow[];
}> {
  const provider = opts?.provider ?? createDefaultBrainVisionProvider();
  const refs = collectVisualImageAssetRefs(assets);
  const existing = assets.strategy.visualReferenceAnalysis?.analyses ?? [];
  const analyses: BrainVisualImageAnalysis[] = [];
  const diagnostics: VisualReanalyzeDiagnosticRow[] = [];
  for (const ref of refs) {
    const analysis = await analyzeBrainImageAssetAsync(projectId, ref, {
      existing: [...existing, ...analyses],
      provider,
      userEmail: opts?.userEmail,
      route: opts?.route,
      forceRestudy: opts?.forceRestudy,
    });
    analyses.push(analysis);
    if (opts?.debug) {
      diagnostics.push(buildVisualReanalyzeDiagnosticRow(ref, provider.id, analysis));
    }
  }
  const aggregated = aggregateVisualPatterns(analyses);
  const analyzerVersion = provider.id === "mock" ? "mock-1" : `${provider.id}-v1`;
  const layer = mergeVisualReferenceLayer(assets.strategy.visualReferenceAnalysis, analyses, aggregated, analyzerVersion, {
    visionProviderId: provider.id,
  });
  return { layer, providerId: provider.id, ...(opts?.debug && diagnostics.length ? { diagnostics } : {}) };
}
