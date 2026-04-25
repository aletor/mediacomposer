/**
 * Logs de diagnóstico Brain: solo desarrollo o si NEXT_PUBLIC_BRAIN_DEBUG=1.
 * No usar en rutas calientes sin guard; mensajes breves.
 */
function brainDebugEnabled(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_BRAIN_DEBUG === "1") return true;
  return false;
}

export function brainDevLog(tag: string, message: string, extra?: Record<string, unknown>): void {
  if (!brainDebugEnabled()) return;
  if (extra && Object.keys(extra).length) {
    console.info(`[Brain:${tag}]`, message, extra);
  } else {
    console.info(`[Brain:${tag}]`, message);
  }
}
