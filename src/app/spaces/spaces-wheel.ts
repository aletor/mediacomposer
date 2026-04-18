/** Alineado con @xyflow/system (wheelDelta en createPanOnScrollHandler). */
export function foldderIsMacOs(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

/**
 * Distingue rueda física vs trackpad (no hay API estándar).
 * - Línea/página → casi siempre ratón (zoom).
 * - Píxeles, delta grande en un eje → rueda rápida (zoom).
 * - Píxeles, deltas pequeños y eventos muy seguidos (~60 Hz) → scroll suave del trackpad (pan).
 * - Píxeles, deltas pequeños y ticks separados → rueda lenta (zoom); el umbral fijo ~40 fallaba aquí.
 *
 * @param dtFromPreviousMs tiempo desde el último wheel en el lienzo (∞ si no hay anterior).
 */
export function foldderWheelLooksLikeMouse(e: WheelEvent, dtFromPreviousMs: number): boolean {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE || e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);

  if (ax >= 4 && ay >= 4) return false;

  if (ax >= 6 && ay < 4) return false;

  if (ax < 3 && ay >= 40) return true;
  if (ay < 3 && ax >= 40) return true;

  const smallDeltas = ax < 36 && ay < 36 && Math.max(ax, ay) <= 12;
  const trackpadBurst =
    Number.isFinite(dtFromPreviousMs) &&
    dtFromPreviousMs > 0 &&
    dtFromPreviousMs < 42 &&
    smallDeltas;
  if (trackpadBurst) return false;

  return true;
}
