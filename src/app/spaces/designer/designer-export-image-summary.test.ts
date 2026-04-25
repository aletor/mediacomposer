import { describe, expect, it } from "vitest";
import type { DesignerPageState } from "./DesignerNode";
import { countDesignerImagesInPages } from "./designer-export-image-summary";

describe("countDesignerImagesInPages", () => {
  it("cuenta marcos con imagen y capas imagen sueltas", () => {
    const pages: DesignerPageState[] = [
      {
        id: "p1",
        format: "a4v",
        objects: [
          {
            id: "f1",
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            isImageFrame: true,
            imageFrameContent: { src: "https://x.test/a.png", originalWidth: 10, originalHeight: 10, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, fittingMode: "fill-proportional" },
          } as unknown as DesignerPageState["objects"][number],
          {
            id: "i1",
            type: "image",
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            src: "data:image/png;base64,xx",
            intrinsicRatio: 1,
            fill: { type: "solid", color: "#000" },
            stroke: "none",
            strokeWidth: 0,
          } as unknown as DesignerPageState["objects"][number],
        ],
      },
    ];
    expect(countDesignerImagesInPages(pages)).toEqual({
      imageFramesWithContent: 1,
      looseImageObjects: 1,
    });
  });
});
