export const FOLDDER_OPEN_STUDIO_EVENT = "foldder:open-studio";
export const FOLDDER_STUDIO_OPENED_EVENT = "foldder:studio-opened";
export const FOLDDER_STUDIO_CLOSED_EVENT = "foldder:studio-closed";
export const FOLDDER_MINIMIZE_STUDIO_EVENT = "foldder:minimize-studio";
export const FOLDDER_RESTORE_STUDIO_EVENT = "foldder:restore-studio";
export const FOLDDER_CLOSE_STUDIO_EVENT = "foldder:close-studio";
export const FOLDDER_STANDARD_STUDIO_SAVE_AS_REQUEST_EVENT = "foldder:standard-studio-save-as-request";
export const FOLDDER_STANDARD_STUDIO_MINIMIZE_REQUEST_EVENT = "foldder:standard-studio-minimize-request";
export const FOLDDER_STANDARD_STUDIO_CLOSE_REQUEST_EVENT = "foldder:standard-studio-close-request";

/** Compatibilidad con los primeros adaptadores añadidos antes de normalizar el namespace. */
export const FOLDDER_LEGACY_OPEN_NODE_STUDIO_EVENT = "foldder-open-node-studio";
export const FOLDDER_LEGACY_CLOSE_NODE_STUDIO_EVENT = "foldder-close-node-studio";

export type FoldderStudioEventDetail = {
  nodeId?: string;
  nodeType?: string;
  fileId?: string;
  appId?: string;
  standardShell?: {
    appLabel: string;
    fileName?: string;
    canSaveAs?: boolean;
  };
};

export function dispatchFoldderStudioEvent(name: string, detail: FoldderStudioEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
