/** Bajo el cursor del cliente: primer nodo/grupo React Flow (`.react-flow__node`) en el stack de pintado. */
export function getReactFlowNodeIdAtClientPoint(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined") return null;
  try {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      if (!(el instanceof Element)) continue;
      const wrap = el.closest(".react-flow__node");
      if (!wrap) continue;
      const id =
        wrap.getAttribute("data-id") || (wrap instanceof HTMLElement && wrap.id ? wrap.id : null);
      if (id) return id;
    }
  } catch {
    /* elementsFromPoint puede fallar en coordenadas inválidas */
  }
  return null;
}
