import type { TimelineAudioRequest } from "./video-editor-types";

export type TimelineAudioGenerationResult =
  | {
      ok: true;
      generatedAssetIds: string[];
    }
  | {
      ok: false;
      errorCode: "provider_not_configured" | "generation_failed";
      errorMessage: string;
    };

export async function generateTimelineAudio(request: TimelineAudioRequest): Promise<TimelineAudioGenerationResult> {
  void request;
  return {
    ok: false,
    errorCode: "provider_not_configured",
    errorMessage: "No hay proveedor de audio configurado todavía para Video Editor.",
  };
}
