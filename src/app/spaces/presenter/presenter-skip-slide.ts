import type { DesignerPageState } from "../designer/DesignerNode";

export function isPresenterSlideSkipped(p: DesignerPageState): boolean {
  return p.presenterSkipSlide === true;
}

export function nextPlayableIndex(pages: DesignerPageState[], from: number): number | null {
  for (let j = from + 1; j < pages.length; j++) {
    if (!isPresenterSlideSkipped(pages[j])) return j;
  }
  return null;
}

export function prevPlayableIndex(pages: DesignerPageState[], from: number): number | null {
  for (let j = from - 1; j >= 0; j--) {
    if (!isPresenterSlideSkipped(pages[j])) return j;
  }
  return null;
}

export function firstPlayableIndex(pages: DesignerPageState[]): number | null {
  for (let j = 0; j < pages.length; j++) {
    if (!isPresenterSlideSkipped(pages[j])) return j;
  }
  return null;
}

export function lastPlayableIndex(pages: DesignerPageState[]): number | null {
  for (let j = pages.length - 1; j >= 0; j--) {
    if (!isPresenterSlideSkipped(pages[j])) return j;
  }
  return null;
}
