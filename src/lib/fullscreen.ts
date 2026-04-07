/**
 * Fullscreen API con prefijos (Safari webkit, Firefox moz, IE/Edge legacy ms).
 * iOS Safari suele no permitir fullscreen de documento; se intenta y se ignora el fallo.
 */

export function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

export function isDocumentFullscreen(): boolean {
  return getFullscreenElement() !== null;
}

export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<void> {
  const node = el as HTMLElement & {
    webkitRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    msRequestFullscreen?: () => void;
  };
  if (typeof node.requestFullscreen === 'function') {
    await node.requestFullscreen();
  } else if (typeof node.webkitRequestFullscreen === 'function') {
    node.webkitRequestFullscreen();
  } else if (typeof node.mozRequestFullScreen === 'function') {
    node.mozRequestFullScreen();
  } else if (typeof node.msRequestFullscreen === 'function') {
    node.msRequestFullscreen();
  } else {
    throw new Error('Fullscreen API not supported');
  }
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => void;
    mozCancelFullScreen?: () => void;
    msExitFullscreen?: () => void;
  };
  if (typeof document.exitFullscreen === 'function') {
    await document.exitFullscreen();
  } else if (typeof doc.webkitExitFullscreen === 'function') {
    doc.webkitExitFullscreen();
  } else if (typeof doc.mozCancelFullScreen === 'function') {
    doc.mozCancelFullScreen();
  } else if (typeof doc.msExitFullscreen === 'function') {
    doc.msExitFullscreen();
  }
}

export async function toggleDocumentFullscreen(): Promise<void> {
  if (getFullscreenElement()) {
    await exitFullscreen();
  } else {
    await enterFullscreen(document.documentElement);
  }
}

/** Registrar todos los eventos que disparan los distintos motores al entrar/salir. */
export function subscribeFullscreenChange(cb: () => void): () => void {
  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange',
  ] as const;
  for (const ev of events) {
    document.addEventListener(ev, cb);
  }
  return () => {
    for (const ev of events) {
      document.removeEventListener(ev, cb);
    }
  };
}
