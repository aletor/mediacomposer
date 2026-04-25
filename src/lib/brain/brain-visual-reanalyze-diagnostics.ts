import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";
import type { BrainVisualAssetRef } from "@/lib/brain/brain-visual-analysis";
import type { BrainVisionProvider } from "@/lib/brain/brain-vision-provider";

export type VisualReanalyzeDiagnosticRow = {
  visual_analysis_completed: true;
  assetId: string;
  assetRef: string | null;
  fileName: string | null;
  hasDataUrl: boolean;
  hasHttpsUrl: boolean;
  imageUrlForVisionExists: boolean;
  providerSelected: BrainVisionProvider["id"];
  providerReturnedJson: boolean;
  providerError: string | null;
  fallbackUsed: boolean;
  analysisStatus: BrainVisualImageAnalysis["analysisStatus"];
  visionProviderId: BrainVisualImageAnalysis["visionProviderId"];
  visionProviderAttempted: BrainVisualImageAnalysis["visionProviderAttempted"];
  subjectTags: string[];
  visualStyle: string[];
  /** Total de candidatos generados en el mismo lote de reanálisis (solo en modo debug). */
  candidatesCreated?: number;
};

export function buildVisualReanalyzeDiagnosticRow(
  asset: BrainVisualAssetRef,
  providerId: BrainVisionProvider["id"],
  analysis: BrainVisualImageAnalysis,
  extras?: { candidatesCreated?: number },
): VisualReanalyzeDiagnosticRow {
  const url = asset.imageUrlForVision?.trim() ?? "";
  const providerReturnedJson =
    analysis.analysisStatus === "analyzed" &&
    analysis.visionProviderId !== "mock" &&
    analysis.fallbackUsed !== true;

  return {
    visual_analysis_completed: true,
    assetId: asset.id,
    assetRef: asset.assetRef?.trim() || null,
    fileName: asset.fileName?.trim() || null,
    hasDataUrl: url.startsWith("data:"),
    hasHttpsUrl: /^https:\/\//i.test(url),
    imageUrlForVisionExists: Boolean(url),
    providerSelected: providerId,
    providerReturnedJson,
    providerError: analysis.failureReason?.trim() || null,
    fallbackUsed: Boolean(analysis.fallbackUsed),
    analysisStatus: analysis.analysisStatus,
    visionProviderId: analysis.visionProviderId,
    visionProviderAttempted: analysis.visionProviderAttempted,
    subjectTags: [...(analysis.subjectTags ?? [])].slice(0, 24),
    visualStyle: [...(analysis.visualStyle ?? [])].slice(0, 24),
    ...(typeof extras?.candidatesCreated === "number" ? { candidatesCreated: extras.candidatesCreated } : {}),
  };
}
