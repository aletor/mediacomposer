export function withFoldderCanvasIntro(
  nodeType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (nodeType === "canvasGroup") return { ...data };
  return { ...data, _foldderCanvasIntro: true };
}
