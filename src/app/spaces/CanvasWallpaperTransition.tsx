"use client";

import React, { useEffect, useMemo, useState } from "react";

type BgOption = { id: string; label: string; url: string };

type Props = {
  activeId: string;
  options: BgOption[];
};

const bgLayerStyle = (url: string): React.CSSProperties => ({
  backgroundColor: "#f8fafc",
  backgroundImage: `url("${url}")`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
});

/**
 * Fondo del lienzo con transición al cambiar de imagen: entrada tipo “distorsión”
 * (blur + saturación + escala + ligero hue-rotate que converge a la imagen nítida).
 */
export function CanvasWallpaperTransition({ activeId, options }: Props) {
  const targetUrl = useMemo(
    () => (options.find((o) => o.id === activeId) ?? options[0]).url,
    [activeId, options],
  );

  const [displayUrl, setDisplayUrl] = useState(targetUrl);
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (targetUrl === displayUrl) return;
    if (incomingUrl === targetUrl) return;
    setAnimKey((k) => k + 1);
    setIncomingUrl(targetUrl);
  }, [targetUrl, displayUrl, incomingUrl]);

  const onIncomingEnd = () => {
    setIncomingUrl((cur) => {
      if (cur) setDisplayUrl(cur);
      return null;
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-0 isolate">
      <div style={bgLayerStyle(displayUrl)} className="absolute inset-0" aria-hidden />
      {incomingUrl ? (
        <div
          key={animKey}
          className="foldder-canvas-bg-incoming pointer-events-none absolute inset-0"
          style={bgLayerStyle(incomingUrl)}
          onAnimationEnd={onIncomingEnd}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
