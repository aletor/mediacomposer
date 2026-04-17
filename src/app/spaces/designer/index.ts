/**
 * Designer: nodo en el canvas, studio multipágina, export `.de`, pipeline de imágenes y reglas del lienzo.
 *
 * Importante: `FreehandStudio` no debe importar este barrel (dependencia circular con `DesignerStudio`).
 * Para reglas del lienzo usar `./designer/DesignerCanvasRulers`. Para el nodo en el grafo, `./designer/DesignerNode`.
 */
export {
  DesignerNode,
  type DesignerNodeData,
  type DesignerPageState,
} from "./DesignerNode";
export { default as DesignerStudio, designerCanvasSessionKey } from "./DesignerStudio";
export { DesignerPagePreview } from "./DesignerPagePreview";
export {
  DESIGNER_RULER_THICKNESS,
  DesignerRulerCorner,
  DesignerRulerHorizontal,
  DesignerRulerVertical,
  type DesignerViewport,
} from "./DesignerCanvasRulers";
