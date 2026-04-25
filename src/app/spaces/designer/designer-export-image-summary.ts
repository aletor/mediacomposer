import type { FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";

export type DesignerExportImageCounts = {
  imageFramesWithContent: number;
  looseImageObjects: number;
};

function walkObjects(objects: FreehandObject[] | undefined, visit: (o: FreehandObject) => void): void {
  if (!objects?.length) return;
  for (const o of objects) {
    visit(o);
    if (o.type === "booleanGroup" && Array.isArray(o.children)) {
      walkObjects(o.children, visit);
    } else if (o.type === "clippingContainer") {
      walkObjects([o.mask as FreehandObject], visit);
      walkObjects(o.content, visit);
    }
  }
}

/** Conteo de imágenes en el documento al exportar (marcos con contenido + capas imagen sueltas). */
export function countDesignerImagesInPages(pages: DesignerPageState[]): DesignerExportImageCounts {
  let imageFramesWithContent = 0;
  let looseImageObjects = 0;
  for (const page of pages) {
    walkObjects(page.objects, (o) => {
      if (o.type === "rect" && o.isImageFrame) {
        const src = (o as { imageFrameContent?: { src?: string } }).imageFrameContent?.src?.trim();
        if (src) imageFramesWithContent += 1;
      }
      if (o.type === "image") {
        const src = (o as { src?: string }).src?.trim();
        if (src) looseImageObjects += 1;
      }
    });
  }
  return { imageFramesWithContent, looseImageObjects };
}
