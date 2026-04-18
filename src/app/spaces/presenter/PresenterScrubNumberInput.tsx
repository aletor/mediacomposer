"use client";

import React from "react";
import { ScrubNumberInput } from "../ScrubNumberInput";

const DEFAULT_TITLE = "Arrastra horizontalmente para cambiar el valor · Mayús = ×10 · Clic para escribir";

type Props = Omit<React.ComponentProps<typeof ScrubNumberInput>, "className"> & {
  className?: string;
};

/**
 * Mismo comportamiento que los numéricos del Designer (`ScrubNumberInput`): arrastre horizontal para variar el valor.
 * Usar en todos los campos numéricos del nodo Presenter.
 */
export function PresenterScrubNumberInput({ className, title, ...rest }: Props) {
  return (
    <ScrubNumberInput
      title={title ?? DEFAULT_TITLE}
      className={[
        "w-full cursor-ew-resize rounded-[4px] border border-white/[0.1] bg-[#0e1014] px-2 py-1.5 font-mono text-[12px] text-zinc-100 outline-none focus:border-violet-500/40",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
