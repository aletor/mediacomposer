"use client";

export const FOLDDER_EXPORT_CREATED_EVENT = "foldder:export-created";

export type FoldderExportCreatedDetail = {
  name: string;
  extension: string;
  sourceNodeId?: string;
  sourceFileId?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  exportedFrom?: string;
  exportFormat?: string;
  metadata?: Record<string, unknown>;
};

export function dispatchFoldderExportCreated(detail: FoldderExportCreatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOLDDER_EXPORT_CREATED_EVENT, { detail }));
}
