"use client";

import React, { useCallback } from "react";
import { getColorFromDragEvent, isFoldderColorDrag } from "./color-drag";

type Props = {
  children: React.ReactNode;
  onApplyHex: (hex: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "onDragOver" | "onDrop" | "className" | "style">;

/** Acepta arrastres desde muestras de color (`setColorDragData`) y aplica el hex. */
export function ColorDropTarget({
  children,
  onApplyHex,
  disabled,
  className = "",
  style,
  ...passThrough
}: Props) {
  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !isFoldderColorDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!isFoldderColorDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const hex = getColorFromDragEvent(e);
      if (hex) onApplyHex(hex);
    },
    [disabled, onApplyHex],
  );

  if (disabled) return <>{children}</>;

  return (
    <div {...passThrough} className={className} style={style} onDragOver={onDragOver} onDrop={onDrop}>
      {children}
    </div>
  );
}
