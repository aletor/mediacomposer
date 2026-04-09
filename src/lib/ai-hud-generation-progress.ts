/**
 * Progreso 0–100 para el HUD inferior del lienzo («Petición IA» + barra).
 * Usa un trabajo explícito por `nodeId` para que el % siga visible al cambiar de espacio
 * o al desmontar el nodo Nano Banana mientras la petición sigue en curso.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

/** null = sin trabajo activo en el HUD */
let trackedJob: { nodeId: string; pct: number } | null = null;

function notify() {
  listeners.forEach((l) => l());
}

export function aiHudNanoBananaJobStart(nodeId: string) {
  trackedJob = { nodeId, pct: 0 };
  notify();
}

export function aiHudNanoBananaJobProgress(nodeId: string, pct: number) {
  if (!trackedJob || trackedJob.nodeId !== nodeId) return;
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  if (trackedJob.pct === v) return;
  trackedJob = { nodeId, pct: v };
  notify();
}

export function aiHudNanoBananaJobEnd(nodeId: string) {
  if (!trackedJob || trackedJob.nodeId !== nodeId) return;
  trackedJob = null;
  notify();
}

/** @deprecated Preferir aiHudNanoBananaJob*; se mantiene por si algún caller antiguo */
export function setAiHudGenerationProgress(value: number | null) {
  if (value === null) {
    trackedJob = null;
    notify();
    return;
  }
  if (!trackedJob) return;
  const v = Math.min(100, Math.max(0, Math.round(value)));
  if (trackedJob.pct === v) return;
  trackedJob = { ...trackedJob, pct: v };
  notify();
}

export function getAiHudGenerationProgressSnapshot(): number | null {
  return trackedJob?.pct ?? null;
}

/** Para rehidratar la barra del nodo al volver al espacio mientras la petición sigue en curso. */
export function getAiHudNanoBananaJobProgressForNode(nodeId: string): number | null {
  if (!trackedJob || trackedJob.nodeId !== nodeId) return null;
  return trackedJob.pct;
}

export function subscribeAiHudGenerationProgress(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
