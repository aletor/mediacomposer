"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getPageDimensions } from "../indesign/page-formats";
import type { DesignerPageState } from "../designer/DesignerNode";
import { DesignerPageCanvasView, type PickPresenterInteraction, type PlayRevealState } from "./DesignerPageCanvasView";
import type { SlideTransitionId } from "./slide-transition-types";
import { DEFAULT_SLIDE_TRANSITION } from "./slide-transition-types";

const TRANSITION_MS = 420;

function getSlideMotion(
  t: SlideTransitionId,
  dir: 1 | -1,
): {
  incomingStart: React.CSSProperties;
  incomingEnd: React.CSSProperties;
  outgoingStart: React.CSSProperties;
  outgoingEnd: React.CSSProperties;
} {
  const inv = dir === -1;
  switch (t) {
    case "none":
      return {
        incomingStart: {},
        incomingEnd: {},
        outgoingStart: {},
        outgoingEnd: {},
      };
    case "fade":
      return {
        incomingStart: { opacity: 0 },
        incomingEnd: { opacity: 1 },
        outgoingStart: { opacity: 1 },
        outgoingEnd: { opacity: 0 },
      };
    case "slideLeft": {
      const inFrom = inv ? "-100%" : "100%";
      const outTo = inv ? "100%" : "-100%";
      return {
        incomingStart: { transform: `translateX(${inFrom})` },
        incomingEnd: { transform: "translateX(0)" },
        outgoingStart: { transform: "translateX(0)" },
        outgoingEnd: { transform: `translateX(${outTo})` },
      };
    }
    case "slideRight": {
      const inFrom = inv ? "100%" : "-100%";
      const outTo = inv ? "-100%" : "100%";
      return {
        incomingStart: { transform: `translateX(${inFrom})` },
        incomingEnd: { transform: "translateX(0)" },
        outgoingStart: { transform: "translateX(0)" },
        outgoingEnd: { transform: `translateX(${outTo})` },
      };
    }
    case "slideUp": {
      const inFrom = inv ? "-100%" : "100%";
      const outTo = inv ? "100%" : "-100%";
      return {
        incomingStart: { transform: `translateY(${inFrom})` },
        incomingEnd: { transform: "translateY(0)" },
        outgoingStart: { transform: "translateY(0)" },
        outgoingEnd: { transform: `translateY(${outTo})` },
      };
    }
    case "slideDown": {
      const inFrom = inv ? "100%" : "-100%";
      const outTo = inv ? "-100%" : "100%";
      return {
        incomingStart: { transform: `translateY(${inFrom})` },
        incomingEnd: { transform: "translateY(0)" },
        outgoingStart: { transform: "translateY(0)" },
        outgoingEnd: { transform: `translateY(${outTo})` },
      };
    }
    default:
      return {
        incomingStart: { opacity: 0 },
        incomingEnd: { opacity: 1 },
        outgoingStart: { opacity: 1 },
        outgoingEnd: { opacity: 0 },
      };
  }
}

type PendingAnim = {
  from: number;
  to: number;
  transition: SlideTransitionId;
  dir: 1 | -1;
};

type Props = {
  pages: DesignerPageState[];
  activeIdx: number;
  pendingAnim: PendingAnim | null;
  onAnimationEnd: () => void;
  /** Revelado por grupos (modo Play); no aplica durante transición entre slides (doble capa). */
  playReveal?: PlayRevealState | null;
  animateEnterTargetKey?: string | null;
  /** Clic en el slide para elegir elementos (vista edición del Presenter). */
  pickInteraction?: PickPresenterInteraction | null;
  /** Vista previa de entrada en editor: no bloquear la selección en el lienzo. */
  allowPickDuringReveal?: boolean;
};

export function PresenterSlideStage({
  pages,
  activeIdx,
  pendingAnim,
  onAnimationEnd,
  playReveal = null,
  animateEnterTargetKey = null,
  pickInteraction = null,
  allowPickDuringReveal = false,
}: Props) {
  const [play, setPlay] = useState(false);
  const timerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!pendingAnim) {
      setPlay(false);
      return;
    }
    setPlay(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPlay(true));
    });
    return () => cancelAnimationFrame(id);
  }, [pendingAnim]);

  useEffect(() => {
    if (!pendingAnim || pendingAnim.transition === "none") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onAnimationEnd();
    }, TRANSITION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pendingAnim, onAnimationEnd]);

  const showDual =
    pendingAnim &&
    pendingAnim.transition !== "none" &&
    pages[pendingAnim.from] &&
    pages[pendingAnim.to];

  if (showDual && pendingAnim) {
    const fromPage = pages[pendingAnim.from];
    const toPage = pages[pendingAnim.to];
    const d0 = getPageDimensions(fromPage);
    const d1 = getPageDimensions(toPage);
    const motion = getSlideMotion(pendingAnim.transition, pendingAnim.dir);
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    const trans = `${TRANSITION_MS}ms ${ease}`;
    const commonTrans = {
      transition: `transform ${trans}, opacity ${trans}`,
      willChange: "transform, opacity" as const,
    };

    return (
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div className="relative h-full w-full max-h-full max-w-full overflow-hidden">
          <div
            className="absolute inset-0 z-0 flex items-center justify-center"
            style={{
              ...motion.outgoingStart,
              ...(play ? motion.outgoingEnd : {}),
              ...commonTrans,
            }}
          >
            <div
              className="h-full w-full max-h-full max-w-full"
              style={{ aspectRatio: `${Math.max(1, d0.width)} / ${Math.max(1, d0.height)}` }}
            >
              <DesignerPageCanvasView
                objects={fromPage.objects ?? []}
                pageWidth={d0.width}
                pageHeight={d0.height}
                playReveal={null}
              />
            </div>
          </div>
          <div
            className="absolute inset-0 z-[1] flex items-center justify-center"
            style={{
              ...motion.incomingStart,
              ...(play ? motion.incomingEnd : {}),
              ...commonTrans,
            }}
          >
            <div
              className="h-full w-full max-h-full max-w-full"
              style={{ aspectRatio: `${Math.max(1, d1.width)} / ${Math.max(1, d1.height)}` }}
            >
              <DesignerPageCanvasView
                objects={toPage.objects ?? []}
                pageWidth={d1.width}
                pageHeight={d1.height}
                playReveal={null}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const page = pages[activeIdx];
  if (!page) return null;
  const dims = getPageDimensions(page);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-2">
      <div
        className="h-full w-full max-h-full max-w-full"
        style={{
          aspectRatio: `${Math.max(1, dims.width)} / ${Math.max(1, dims.height)}`,
        }}
      >
        <DesignerPageCanvasView
          objects={page.objects ?? []}
          pageWidth={dims.width}
          pageHeight={dims.height}
          playReveal={playReveal}
          animateEnterTargetKey={animateEnterTargetKey}
          pickInteraction={pickInteraction}
          allowPickDuringReveal={allowPickDuringReveal}
        />
      </div>
    </div>
  );
}

export function resolveIncomingTransition(
  pages: DesignerPageState[],
  toIdx: number,
  transitionsByPageId: Record<string, SlideTransitionId>,
): SlideTransitionId {
  const p = pages[toIdx];
  if (!p) return DEFAULT_SLIDE_TRANSITION;
  return transitionsByPageId[p.id] ?? DEFAULT_SLIDE_TRANSITION;
}
