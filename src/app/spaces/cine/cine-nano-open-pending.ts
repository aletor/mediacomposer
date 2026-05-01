import type { CineImageStudioSession } from "../cine-types";

const pending = new Map<string, CineImageStudioSession>();

export function registerPendingNanoStudioOpenFromCine(
  nanoNodeId: string,
  session: CineImageStudioSession,
): void {
  pending.set(nanoNodeId, session);
}

export function takePendingNanoStudioOpenFromCine(
  nanoNodeId: string,
): CineImageStudioSession | null {
  const session = pending.get(nanoNodeId);
  if (!session) return null;
  pending.delete(nanoNodeId);
  return session;
}

export function dispatchOpenNanoStudioFromCine(
  nanoNodeId: string,
  session: CineImageStudioSession,
): void {
  window.dispatchEvent(
    new CustomEvent("foldder-open-nano-studio-from-cine", {
      detail: { nanoNodeId, session },
    }),
  );
}
