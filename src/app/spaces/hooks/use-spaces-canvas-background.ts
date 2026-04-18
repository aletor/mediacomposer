import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CANVAS_BACKGROUNDS, CANVAS_BG_STORAGE_KEY } from "../canvas-backgrounds";

export function useSpacesCanvasBackground() {
  const [canvasBgId, setCanvasBgId] = useState<string>("studio");
  const [canvasBgMenuOpen, setCanvasBgMenuOpen] = useState(false);
  const canvasBgMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CANVAS_BG_STORAGE_KEY);
      if (v && CANVAS_BACKGROUNDS.some((b) => b.id === v)) setCanvasBgId(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_BG_STORAGE_KEY, canvasBgId);
    } catch {
      /* ignore */
    }
  }, [canvasBgId]);

  useEffect(() => {
    if (!canvasBgMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof globalThis.Node)) return;
      if (canvasBgMenuRef.current && !canvasBgMenuRef.current.contains(t)) {
        setCanvasBgMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [canvasBgMenuOpen]);

  /** Fondo en `CanvasWallpaperTransition`; el lienzo XY Flow va transparente para ver la transición. */
  const reactFlowCanvasStyle = useMemo(
    (): CSSProperties => ({
      backgroundColor: "transparent",
    }),
    [],
  );

  return {
    canvasBgId,
    setCanvasBgId,
    canvasBgMenuOpen,
    setCanvasBgMenuOpen,
    canvasBgMenuRef,
    reactFlowCanvasStyle,
  };
}
