import type { BrainVisualAssetRef } from "./brain-visual-analysis";
import type { BrainVisualImageAnalysis } from "@/app/spaces/project-assets-metadata";

/**
 * Contrato para sustituir el mock por Gemini Vision u OpenAI Vision.
 * Implementaciones deben validar JSON con `parseVisionAnalysisJson` y fusionar con `mergeVisionJsonIntoAnalysis`.
 */
export type BrainVisionProvider = {
  readonly id: "gemini-vision" | "openai-vision" | "mock";
  analyzeImage(input: {
    projectId: string;
    asset: BrainVisualAssetRef;
    /** Base64 data URL o URL https accesible por el proveedor. */
    imageUrl?: string;
    userEmail?: string;
    /** Ruta HTTP para `recordApiUsage` (p. ej. `/api/spaces/brain/visual/reanalyze`). */
    route?: string;
  }): Promise<BrainVisualImageAnalysis>;
};
