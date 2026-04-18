"use client";

import React from "react";
import { useClampedFixedPosition } from "@/lib/use-clamped-fixed-position";

/** Menú contextual del grafo: posición fija ajustada al viewport (mismas clases que `spaces.css`). */
export function GraphContextMenuShell({
  x,
  y,
  remeasureKey,
  onMouseLeave,
  children,
}: {
  x: number;
  y: number;
  remeasureKey: string | number;
  onMouseLeave: () => void;
  children: React.ReactNode;
}) {
  const { ref, style } = useClampedFixedPosition(x, y, true, remeasureKey);
  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ ...style, position: "fixed" }}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
