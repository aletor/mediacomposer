import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";
import { applyCanvasGroupExpand, ungroupCanvasGroup } from "../canvas-group-logic";

type SetNodes = Dispatch<SetStateAction<Node[]>>;
type SetEdges = Dispatch<SetStateAction<Edge[]>>;

/**
 * Desagrupar `canvasGroup` desde menú contextual, atajo o botón del nodo; escucha `foldder-canvas-ungroup`.
 */
export function useSpacesCanvasUngroup(
  setNodes: SetNodes,
  setEdges: SetEdges,
  liveNodesRef: MutableRefObject<Node[]>,
  liveEdgesRef: MutableRefObject<Edge[]>,
  takeSnapshot: () => void,
) {
  const performCanvasUngroup = useCallback(
    (groupId: string) => {
      let n = liveNodesRef.current;
      let e = liveEdgesRef.current;
      const cur = n.find((x) => x.id === groupId);
      if ((cur?.data as { collapsed?: boolean })?.collapsed) {
        const ex = applyCanvasGroupExpand(groupId, n, e);
        if (ex) {
          n = ex.nodes;
          e = ex.edges;
        }
      }
      takeSnapshot();
      const r = ungroupCanvasGroup(groupId, n);
      if (!r) return;
      setNodes(r.nodes);
      setEdges(e);
    },
    [setNodes, setEdges, takeSnapshot, liveNodesRef, liveEdgesRef],
  );

  useEffect(() => {
    const handler = (ev: Event) => {
      const gid = (ev as CustomEvent<{ groupId?: string }>).detail?.groupId;
      if (!gid) return;
      performCanvasUngroup(gid);
    };
    window.addEventListener("foldder-canvas-ungroup", handler as EventListener);
    return () => window.removeEventListener("foldder-canvas-ungroup", handler as EventListener);
  }, [performCanvasUngroup]);

  return performCanvasUngroup;
}
