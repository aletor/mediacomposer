import type { DragEvent as ReactDragEvent } from "react";
import { normalizeHexColor } from "./extract-document-colors";

export const FOLDDER_COLOR_DRAG_MIME = "application/x-foldder-hex-color";

export function setColorDragData(e: ReactDragEvent, hex: string) {
  const n = normalizeHexColor(hex) ?? hex;
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData("text/plain", n);
  e.dataTransfer.setData(FOLDDER_COLOR_DRAG_MIME, n);
}

/** Útil también para `DragEvent` nativo en listeners del contenedor. */
export function isFoldderColorDataTransfer(dt: DataTransfer | null): boolean {
  if (!dt?.types) return false;
  const types = dt.types as unknown as string[];
  if (types.includes(FOLDDER_COLOR_DRAG_MIME)) return true;
  if (types.includes("text/plain") && !types.includes("Files")) return true;
  return false;
}

export function isFoldderColorDrag(e: ReactDragEvent): boolean {
  return isFoldderColorDataTransfer(e.dataTransfer);
}

export function getColorFromDragEvent(e: ReactDragEvent): string | null {
  const raw =
    e.dataTransfer.getData(FOLDDER_COLOR_DRAG_MIME) || e.dataTransfer.getData("text/plain");
  return normalizeHexColor(raw.trim());
}
