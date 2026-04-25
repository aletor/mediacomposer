export type PineconeNamespace = "visual_memory" | "outliers" | "copy_embeddings";

export type VisualMemoryRecord = {
  id: string;
  projectId: string;
  workspaceId?: string;
  assetRef: string;
  dominantPalette?: string[];
  layoutFingerprint?: string;
  updatedAt: string;
};

export type OutlierSignal = {
  id: string;
  projectId: string;
  workspaceId?: string;
  description: string;
  vectorDims?: number;
  sparseFeatures?: Record<string, number>;
  createdAt: string;
};

export type SemanticUpsertPayload = VisualMemoryRecord | OutlierSignal;

export interface BrainSemanticIndexClient {
  upsertVisualMemory(_records: VisualMemoryRecord[]): Promise<void>;
  upsertOutliers(_records: OutlierSignal[]): Promise<void>;
  deleteByIds(_namespace: PineconeNamespace, _ids: string[]): Promise<void>;
}
