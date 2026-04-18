import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

const UNDO_REDO_DEPTH = 10;

type SetGraph = Dispatch<SetStateAction<Node[]>>;

export function useSpacesUndoRedo(
  setNodes: SetGraph,
  setEdges: Dispatch<SetStateAction<Edge[]>>,
  liveNodesRef: MutableRefObject<Node[]>,
  liveEdgesRef: MutableRefObject<Edge[]>,
) {
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const futureRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);

  const takeSnapshot = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-(UNDO_REDO_DEPTH - 1)),
      { nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] },
    ];
    futureRef.current = [];
  }, [liveNodesRef, liveEdgesRef]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    futureRef.current.unshift({ nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] });
    if (futureRef.current.length > UNDO_REDO_DEPTH) {
      futureRef.current.pop();
    }
    const prev = historyRef.current.pop()!;
    setNodes([...prev.nodes]);
    setEdges([...prev.edges]);
  }, [setNodes, setEdges, liveNodesRef, liveEdgesRef]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    historyRef.current = [
      ...historyRef.current.slice(-(UNDO_REDO_DEPTH - 1)),
      { nodes: [...liveNodesRef.current], edges: [...liveEdgesRef.current] },
    ];
    const next = futureRef.current.shift()!;
    setNodes([...next.nodes]);
    setEdges([...next.edges]);
  }, [setNodes, setEdges, liveNodesRef, liveEdgesRef]);

  return { takeSnapshot, undo, redo };
}
