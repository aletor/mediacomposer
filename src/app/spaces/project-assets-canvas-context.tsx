"use client";

import type { Node } from "@xyflow/react";
import { createContext, useContext } from "react";
import type { ProjectFilesMetadata } from "./project-files";

export type ProjectAssetsCanvasContextValue = {
  /** Nodos del grafo actual (para inventario multimedia en la tarjeta). */
  flowNodes: Node[];
  assetsMetadata: unknown;
  projectFiles?: ProjectFilesMetadata;
  /** Aislamiento por proyecto para evitar mezclar assets/caché entre proyectos. */
  projectScopeId: string;
  openProjectAssets: () => void;
};

export const ProjectAssetsCanvasContext = createContext<ProjectAssetsCanvasContextValue | null>(null);

export function useProjectAssetsCanvas(): ProjectAssetsCanvasContextValue | null {
  return useContext(ProjectAssetsCanvasContext);
}
