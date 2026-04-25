"use client";

import { createContext, useContext } from "react";
import type { BrainFlowEdgeLite, BrainFlowNodeLite } from "@/lib/brain/brain-canvas-brain-links";

export type ProjectBrainCanvasContextValue = {
  assetsMetadata: unknown;
  /** Aislamiento por proyecto para evitar mezclar contexto entre proyectos. */
  projectScopeId: string;
  openProjectBrain: () => void;
  /** Abre el panel Brain en «Por revisar». */
  openProjectBrainReview?: () => void;
  /** Grafo actual (para resumen de nodos conectados en la tarjeta del lienzo). */
  flowNodes?: BrainFlowNodeLite[] | null;
  flowEdges?: BrainFlowEdgeLite[] | null;
};

export const ProjectBrainCanvasContext = createContext<ProjectBrainCanvasContextValue | null>(null);

export function useProjectBrainCanvas(): ProjectBrainCanvasContextValue | null {
  return useContext(ProjectBrainCanvasContext);
}
