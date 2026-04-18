"use client";

import React from "react";

type Props = {
  showWelcome: boolean;
  onWelcomeAnimationEnd: () => void;
};

export function SpacesWelcomeChrome({ showWelcome, onWelcomeAnimationEnd }: Props) {
  if (!showWelcome) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        animation: "welcomeFade 4s ease forwards",
      }}
      onAnimationEnd={onWelcomeAnimationEnd}
    >
      <style>{`
            @keyframes welcomeFade {
              0%   { opacity: 0; transform: scale(0.94); }
              15%  { opacity: 1; transform: scale(1); }
              80%  { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(1.03); }
            }
          `}</style>
      <span
        style={{
          fontSize: "clamp(48px,8vw,96px)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          color: "transparent",
          backgroundImage: "linear-gradient(135deg,#fff 0%,rgba(255,255,255,0.35) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          userSelect: "none",
        }}
      >
        Bienvenido
      </span>
    </div>
  );
}
