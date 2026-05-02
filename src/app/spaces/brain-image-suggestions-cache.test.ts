import { afterEach, describe, expect, it, vi } from "vitest";

import {
  brainSuggestionsKeyForField,
  ensureBrainImageSuggestions,
  getLatestBrainImageSuggestionEntryForField,
} from "./brain-image-suggestions-cache";

describe("brain image suggestions cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("recovers the latest suggestions for the same image frame when the prompt fingerprint changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ output: "data:image/png;base64,AAAA" }),
      })),
    );

    const oldKey = brainSuggestionsKeyForField("project_a", "designer_1", "image_frame_1", "old-context");

    await ensureBrainImageSuggestions({
      key: oldKey,
      plans: [{ id: "brain-img-1", label: "Visual editorial", prompt: "Generate image" }],
      aspectRatio: "16:9",
      logoRefs: [],
    });

    const latest = getLatestBrainImageSuggestionEntryForField("project_a", "designer_1", "image_frame_1");

    expect(latest?.suggestions).toHaveLength(1);
    expect(latest?.suggestions[0]?.src).toBe("data:image/png;base64,AAAA");
  });
});
