"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPageDimensions } from "@/app/spaces/indesign/page-formats";
import { PresenterSlideStage, resolveIncomingTransition } from "@/app/spaces/presenter/PresenterSlideStage";
import type { PlayRevealState } from "@/app/spaces/presenter/DesignerPageCanvasView";
import { mergeStepsWithPage, presenterStepKey } from "@/app/spaces/presenter/presenter-group-animations";
import type { SlideTransitionId } from "@/app/spaces/presenter/slide-transition-types";
import type { PresenterShareRecord } from "@/lib/presenter-share-types";

type PendingAnim = {
  from: number;
  to: number;
  transition: SlideTransitionId;
  dir: 1 | -1;
};

type Props = {
  initial: PresenterShareRecord;
};

export function PublicPresenterClient({ initial }: Props) {
  const pages = initial.payload.pages;
  const transitionsByPageId = initial.payload.transitionsByPageId ?? {};

  const [gatePass, setGatePass] = useState(
    () => !initial.options.requirePasscode || !initial.options.passcodePlain?.trim(),
  );
  const [passInput, setPassInput] = useState("");
  const [gateEmail, setGateEmail] = useState(
    () => !initial.options.requireVisitorEmail,
  );
  const [emailInput, setEmailInput] = useState("");

  const [activeIdx, setActiveIdx] = useState(0);
  const [pendingAnim, setPendingAnim] = useState<PendingAnim | null>(null);
  const [playRevealCount, setPlayRevealCount] = useState(0);
  const [animateEnterTargetKey, setAnimateEnterTargetKey] = useState<string | null>(null);
  const playAnimTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void fetch("/api/presenter-share/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: initial.token }),
    });
  }, [initial.token]);

  const maxIdx = Math.max(0, pages.length - 1);

  const onAnimationEnd = useCallback(() => {
    setPendingAnim((p) => {
      if (!p) return null;
      setActiveIdx(p.to);
      return null;
    });
  }, []);

  const goToIdx = useCallback(
    (nextIdx: number) => {
      if (pendingAnim) return;
      const safe = Math.min(Math.max(0, nextIdx), maxIdx);
      if (safe === activeIdx) return;
      const incomingT = resolveIncomingTransition(pages, safe, transitionsByPageId);
      const dir: 1 | -1 = safe > activeIdx ? 1 : -1;
      if (incomingT === "none") {
        setActiveIdx(safe);
        return;
      }
      setPendingAnim({ from: activeIdx, to: safe, transition: incomingT, dir });
    },
    [activeIdx, maxIdx, pages, pendingAnim, transitionsByPageId],
  );

  useEffect(() => {
    setPlayRevealCount(0);
    setAnimateEnterTargetKey(null);
  }, [activeIdx]);

  const playRevealComputed = useMemo((): PlayRevealState | null => {
    const pg = pages[activeIdx];
    if (!pg) return null;
    const steps = mergeStepsWithPage(pg);
    if (!steps.length) return null;
    return { revealCount: playRevealCount, steps };
  }, [pages, activeIdx, playRevealCount]);

  const playAdvanceRight = useCallback(() => {
    if (pendingAnim) return;
    const page = pages[activeIdx];
    if (!page) return;
    const steps = mergeStepsWithPage(page);
    if (steps.length > 0 && playRevealCount < steps.length) {
      const next = playRevealCount + 1;
      const step = steps[next - 1];
      const k = step ? presenterStepKey(step) : null;
      setPlayRevealCount(next);
      if (playAnimTimerRef.current) clearTimeout(playAnimTimerRef.current);
      setAnimateEnterTargetKey(k);
      playAnimTimerRef.current = window.setTimeout(() => setAnimateEnterTargetKey(null), 520);
      return;
    }
    if (activeIdx < maxIdx) {
      goToIdx(activeIdx + 1);
      setPlayRevealCount(0);
      setAnimateEnterTargetKey(null);
    }
  }, [activeIdx, pages, playRevealCount, maxIdx, goToIdx, pendingAnim]);

  const playAdvanceLeft = useCallback(() => {
    if (pendingAnim) return;
    if (playRevealCount > 0) {
      setPlayRevealCount((c) => c - 1);
      setAnimateEnterTargetKey(null);
      return;
    }
    if (activeIdx > 0) goToIdx(activeIdx - 1);
  }, [playRevealCount, activeIdx, goToIdx, pendingAnim]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gatePass || !gateEmail) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        playAdvanceRight();
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        playAdvanceLeft();
      }
      if (e.key === "Home") {
        e.preventDefault();
        goToIdx(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        goToIdx(maxIdx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gateEmail, gatePass, playAdvanceRight, playAdvanceLeft, goToIdx, maxIdx]);

  const tryPass = () => {
    if (!initial.options.requirePasscode) {
      setGatePass(true);
      return;
    }
    if (passInput === initial.options.passcodePlain) setGatePass(true);
  };

  const tryEmail = () => {
    if (!initial.options.requireVisitorEmail) {
      setGateEmail(true);
      return;
    }
    if (emailInput.includes("@")) setGateEmail(true);
  };

  if (!gatePass) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-4 text-white">
        <p className="text-sm font-semibold">Este enlace requiere código de acceso</p>
        <input
          type="password"
          value={passInput}
          onChange={(e) => setPassInput(e.target.value)}
          className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
          placeholder="Código"
        />
        <button
          type="button"
          onClick={tryPass}
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500"
        >
          Continuar
        </button>
      </div>
    );
  }

  if (!gateEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d10] px-4 text-white">
        <p className="text-sm font-semibold">Introduce tu email para continuar</p>
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          className="w-full max-w-xs rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/50"
          placeholder="nombre@ejemplo.com"
        />
        <button
          type="button"
          onClick={tryEmail}
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500"
        >
          Continuar
        </button>
      </div>
    );
  }

  const page = pages[activeIdx];
  const dims = page ? getPageDimensions(page) : { width: 16, height: 9 };
  const stepsLen = page ? mergeStepsWithPage(page).length : 0;

  return (
    <div
      className="relative min-h-screen w-full cursor-pointer bg-black"
      onClick={() => playAdvanceRight()}
      title="Clic para avanzar · flechas: grupos y slides"
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="relative w-full max-w-[min(96vw,calc(85vh*16/9))] overflow-hidden rounded-lg bg-[#fafafa] shadow-2xl"
          style={{
            aspectRatio: `${Math.max(1, dims.width)} / ${Math.max(1, dims.height)}`,
          }}
        >
          <PresenterSlideStage
            pages={pages}
            activeIdx={activeIdx}
            pendingAnim={pendingAnim}
            onAnimationEnd={onAnimationEnd}
            playReveal={playRevealComputed}
            animateEnterTargetKey={animateEnterTargetKey}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center">
        <div className="rounded-full border border-white/10 bg-black/50 px-4 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur-md">
          Slide {activeIdx + 1} / {pages.length}
          {stepsLen > 0 ? (
            <span className="text-white/60"> · Paso {playRevealCount} / {stepsLen}</span>
          ) : null}
        </div>
      </div>

      {initial.options.allowPdfDownload && (
        <div
          className="pointer-events-auto absolute bottom-6 right-6"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-[10px] text-zinc-400">
            PDF (próximamente)
          </span>
        </div>
      )}
    </div>
  );
}
