import type { BrainNodeType } from "./brain-telemetry";

export type BrainNodeTypeOrOther = BrainNodeType | "OTHER";

/** Resumen legible de actividad hacia Brain (sin API real aún). */
export type BrainNodeSignalMock = {
  receivesFromBrain: string[];
  sentToBrain: string[];
  recentSignals: string[];
  generatedLearningsCount: number;
};

/**
 * Datos de demostración legados (tests o prototipos). La UI principal usa
 * `GET /api/spaces/brain/telemetry/summary` y `connectedNodeSignalsCopy` en lugar de esto.
 */
export function mockBrainNodeSignals(nodeType: BrainNodeTypeOrOther): BrainNodeSignalMock {
  switch (nodeType) {
    case "OTHER":
      return {
        receivesFromBrain: ["ADN de marca", "Contexto del proyecto"],
        sentToBrain: ["Actividad del nodo (cuando exista integración)"],
        recentSignals: ["Nodo conectado · Brain listo para aprender de tu uso"],
        generatedLearningsCount: 0,
      };
    case "DESIGNER":
      return {
        receivesFromBrain: ["ADN de marca", "Tono", "Paleta", "Referencias visuales", "Mensajes", "Personas", "Hechos"],
        sentToBrain: [
          "Sugerencias mostradas en el lienzo",
          "Aceptaciones de sugerencias",
          "Textos editados a mano",
          "Exportaciones PDF o .de",
          "Colores aplicados en el diseño",
        ],
        recentSignals: [
          "Hace poco · actividad en el lienzo",
          "Cuando exportes, Brain recibirá una señal de entrega",
        ],
        generatedLearningsCount: 0,
      };
    case "PHOTOROOM":
      return {
        receivesFromBrain: ["ADN de marca", "Paleta", "Referencias visuales", "Tono visual sugerido"],
        sentToBrain: ["Imágenes editadas", "Exportaciones", "Colores usados en ajustes", "Estilos aplicados"],
        recentSignals: ["Conectado · listo para registrar tu flujo de edición"],
        generatedLearningsCount: 0,
      };
    case "ARTICLE_WRITER":
      return {
        receivesFromBrain: ["ADN de marca", "Tono editorial", "Mensajes", "Hechos", "Personas"],
        sentToBrain: ["Títulos generados", "Ediciones manuales", "Exportaciones de artículo", "Temas tratados"],
        recentSignals: ["Sin señales recientes en esta sesión"],
        generatedLearningsCount: 0,
      };
    default:
      return {
        receivesFromBrain: ["ADN de marca", "Contexto del proyecto"],
        sentToBrain: ["Actividad del nodo (cuando exista integración)"],
        recentSignals: ["Nodo conectado · Brain listo para aprender de tu uso"],
        generatedLearningsCount: 0,
      };
  }
}
