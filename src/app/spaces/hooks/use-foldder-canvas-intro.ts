import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";
import { FOLDDER_CANVAS_INTRO_CLEAR_MS } from "../spaces-view-constants";

type SetNodes = Dispatch<SetStateAction<Node[]>>;
type UpdateNodeInternals = (id: string) => void;

export function useFoldderCanvasIntro(
  nodes: Node[],
  setNodes: SetNodes,
  liveNodesRef: MutableRefObject<Node[]>,
  liveEdgesRef: MutableRefObject<Edge[]>,
  updateNodeInternals: UpdateNodeInternals,
) {

  const scheduleFoldderCanvasIntroEnd = useCallback(
    (nodeId: string) => {
      window.setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            if (!n.data || typeof n.data !== "object") return n;
            const { _foldderCanvasIntro: _drop, ...rest } = n.data as Record<string, unknown>;
            return { ...n, data: rest };
          }),
        );
        requestAnimationFrame(() => {
          updateNodeInternals(nodeId);
          for (const e of liveEdgesRef.current) {
            if (e.source === nodeId) updateNodeInternals(e.target);
            if (e.target === nodeId) updateNodeInternals(e.source);
          }
        });
      }, FOLDDER_CANVAS_INTRO_CLEAR_MS);
    },
    [setNodes, updateNodeInternals, liveEdgesRef],
  );

  /**
   * Durante el zoom CSS de intro, los handles se mueven frame a frame; React Flow no remide solo.
   * Refrescamos internals en cada rAF mientras haya nodos con `_foldderCanvasIntro`.
   */
  useEffect(() => {
    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const introIds = liveNodesRef.current
        .filter((n: Node) => (n.data as { _foldderCanvasIntro?: boolean } | undefined)?._foldderCanvasIntro)
        .map((n: Node) => n.id as string);
      if (introIds.length === 0) return;

      const refresh = new Set<string>(introIds);
      for (const e of liveEdgesRef.current) {
        if (introIds.includes(e.source)) {
          refresh.add(e.source);
          refresh.add(e.target);
        }
        if (introIds.includes(e.target)) {
          refresh.add(e.source);
          refresh.add(e.target);
        }
      }
      for (const id of refresh) updateNodeInternals(id);

      if (!stopped) rafId = requestAnimationFrame(tick);
    };

    if (nodes.some((n: Node) => (n.data as { _foldderCanvasIntro?: boolean } | undefined)?._foldderCanvasIntro)) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [nodes, updateNodeInternals, liveNodesRef, liveEdgesRef]);

  return { scheduleFoldderCanvasIntroEnd };
}
