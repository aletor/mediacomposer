import type { CSSProperties } from "react";
import {
  getFoldderNodeHeaderTintColor,
  getFoldderNodeOutputBorderColor,
} from "./handle-type-colors";

export function sortNodesCardsOrder<T extends { id: string; position: { x: number; y: number } }>(
  arr: T[],
): T[] {
  return [...arr].sort(
    (a, b) =>
      a.position.y !== b.position.y ? a.position.y - b.position.y : a.position.x - b.position.x,
  );
}

/** `--foldder-node-output-color`: aristas/handles. `--foldder-node-header-tint-color`: vidrio+cabecera+botón (como Export; logo azul solo imagen/vídeo). */
export function mergeNodeOutputBorderStyle(
  node: { style?: CSSProperties; type?: string; data?: Record<string, unknown> | null },
  extra?: CSSProperties,
): CSSProperties {
  const borderColor = getFoldderNodeOutputBorderColor(node);
  const headerTintColor = getFoldderNodeHeaderTintColor(node);
  return {
    ...(node.style || {}),
    ...(extra || {}),
    ["--foldder-node-output-color" as string]: borderColor,
    ["--foldder-node-header-tint-color" as string]: headerTintColor,
  };
}
