import { describe, expect, it } from "vitest";

import { assertFfmpegAvailable } from "./video-editor-render-service";

describe("video editor render service", () => {
  it("reports ffmpeg_missing when the binary is unavailable", async () => {
    await expect(assertFfmpegAvailable("__foldder_missing_ffmpeg_binary__")).rejects.toThrow("ffmpeg_missing");
  });
});
