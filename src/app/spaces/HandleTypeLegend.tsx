"use client";

import { HANDLE_TYPE_LEGEND } from "./handle-type-colors";

const legendChromeClass =
  "rounded-xl bg-white/[0.08] px-2 py-1 shadow-sm backdrop-blur-xl";

function LegendRow({ items }: { items: typeof HANDLE_TYPE_LEGEND }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
      {items.map(({ id, label, color }) => (
        <li key={id} className="flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/20"
            style={{ backgroundColor: color }}
          />
          <span className="whitespace-nowrap font-mono text-[6px] leading-none text-zinc-300">{label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Leyenda pequeña de colores por tipo de conexión (abajo izquierda del lienzo). */
export function HandleTypeLegend() {
  const half = Math.ceil(HANDLE_TYPE_LEGEND.length / 2);
  const rowA = HANDLE_TYPE_LEGEND.slice(0, half);
  const rowB = HANDLE_TYPE_LEGEND.slice(half);

  return (
    <div
      className={`pointer-events-none fixed bottom-3 left-3 z-[89] max-w-[min(calc(100vw-1.5rem),20rem)] ${legendChromeClass}`}
      role="note"
      aria-label="Leyenda de colores por tipo de conexión"
    >
      <p className="mb-1 font-mono text-[5px] font-semibold uppercase tracking-wider text-zinc-500">
        Tipos de conexión
      </p>
      <div className="flex flex-col gap-y-1">
        <LegendRow items={rowA} />
        <LegendRow items={rowB} />
      </div>
    </div>
  );
}
