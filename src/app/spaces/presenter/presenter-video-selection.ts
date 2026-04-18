import type { FreehandObject } from "../FreehandStudio";
import { flattenObjectsForGradientDefs } from "../FreehandStudio";
import type { DesignerPageState } from "../designer/DesignerNode";
import { revealTargetKey } from "./presenter-group-animations";
import type { PresenterImageVideoPlacement } from "./presenter-image-video-types";

/**
 * Coloca un vídeo anclado a imagen cuya clave de lienzo coincide con la selección actual (object/group/máscara).
 */
export function findVideoPlacementForCanvasSelection(
  page: DesignerPageState | null,
  selectedKeys: string[],
  placementsOnPage: PresenterImageVideoPlacement[],
): PresenterImageVideoPlacement | null {
  if (!page || selectedKeys.length === 0) return null;
  const flat = flattenObjectsForGradientDefs(page.objects ?? []) as FreehandObject[];
  for (const key of selectedKeys) {
    for (const pl of placementsOnPage) {
      if (!pl.videoUrl?.trim()) continue;
      const o = flat.find((x) => x.id === pl.imageObjectId);
      if (!o) continue;
      if (revealTargetKey(o) === key) return pl;
    }
  }
  return null;
}
