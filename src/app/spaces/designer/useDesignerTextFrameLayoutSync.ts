"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { DesignerStudioApi, FreehandObject } from "../FreehandStudio";
import type { DesignerPageState } from "./DesignerNode";
import { layoutPageStories } from "../indesign/text-layout";
import type { Story, Typography } from "../indesign/text-model";
import { serializeStoryContent, sliceStoryContent } from "../indesign/text-model";
import { buildRichSpansForFrame } from "./designer-studio-pure";

type Params = {
  studioApiRef: MutableRefObject<DesignerStudioApi | null>;
  pagesRef: MutableRefObject<DesignerPageState[]>;
  activeIdxRef: MutableRefObject<number>;
  pages: DesignerPageState[];
  activePageIndex: number;
};

/**
 * Reparto de texto entre marcos encadenados, overflow y `_designerRichSpans` en el lienzo.
 * Expone ref para forzar sync antes del PDF multipágina (el efecto va con ~60 ms de debounce).
 */
export function useDesignerTextFrameLayoutSync({
  studioApiRef,
  pagesRef,
  activeIdxRef,
  pages,
  activePageIndex,
}: Params): { syncTextFrameLayoutsRef: MutableRefObject<() => void> } {
  const layoutSyncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncTextFrameLayoutsRef = useRef<() => void>(() => {});

  const syncTextFrameLayouts = useCallback(() => {
    const api = studioApiRef.current;
    if (!api) return;
    const ap = pagesRef.current[activeIdxRef.current];
    if (!ap) return;

    const stories = ap.stories ?? [];
    const textFrames = ap.textFrames ?? [];
    if (stories.length === 0) return;

    const editingId = api.getTextEditingId();

    const currentObjs = api.getObjects();

    const textFramesForLayout = textFrames.map((tf) => {
      const o = currentObjs.find((c) => c.id === tf.id && (c as { isTextFrame?: boolean }).isTextFrame);
      if (!o) return tf;
      return {
        ...tf,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
      };
    });

    const typographyForLayout = (s: Story): Typography => {
      const typo = s.typography;
      for (const fid of s.frames) {
        const o = currentObjs.find((c) => c.id === fid && (c as { isTextFrame?: boolean }).isTextFrame);
        if (!o) continue;
        const ox = o as FreehandObject & {
          fontFamily?: string;
          fontSize?: number;
          lineHeight?: number;
          letterSpacing?: number;
          textAlign?: string;
          paragraphIndent?: number;
          fontKerning?: string;
          fontVariantCaps?: string;
          fontWeight?: number | string;
          fontStyle?: string;
          fontFeatureSettings?: string;
          fill?: unknown;
        };
        if (
          ox.fontSize !== typo.fontSize ||
          ox.fontFamily !== typo.fontFamily ||
          ox.lineHeight !== typo.lineHeight ||
          ox.letterSpacing !== typo.letterSpacing
        ) {
          const ta = ox.textAlign;
          const align: Typography["align"] =
            ta === "left" || ta === "center" || ta === "right" || ta === "justify" ? ta : typo.align;
          const fillStr =
            typeof ox.fill === "string"
              ? ox.fill
              : (ox.fill as { type?: string; color?: string } | undefined)?.type === "solid"
                ? (ox.fill as { color?: string }).color
                : null;
          const color = fillStr && fillStr !== "none" ? fillStr : typo.color;
          return {
            ...typo,
            fontFamily: ox.fontFamily ?? typo.fontFamily,
            fontSize: typeof ox.fontSize === "number" ? ox.fontSize : typo.fontSize,
            lineHeight: typeof ox.lineHeight === "number" ? ox.lineHeight : typo.lineHeight,
            letterSpacing: typeof ox.letterSpacing === "number" ? ox.letterSpacing : typo.letterSpacing,
            align,
            color,
            fontWeight: ox.fontWeight != null ? String(ox.fontWeight) : typo.fontWeight,
            fontStyle: ox.fontStyle ?? typo.fontStyle,
            paragraphIndent: typeof ox.paragraphIndent === "number" ? ox.paragraphIndent : typo.paragraphIndent,
            fontKerning: (ox.fontKerning === "none" || ox.fontKerning === "auto" ? ox.fontKerning : null) ?? typo.fontKerning,
            fontVariantCaps:
              ox.fontVariantCaps === "normal" || ox.fontVariantCaps === "small-caps" ? ox.fontVariantCaps : typo.fontVariantCaps,
            fontFeatureSettings: ox.fontFeatureSettings ?? typo.fontFeatureSettings,
          };
        }
      }
      return typo;
    };

    const storiesForLayout = stories.map((s) => ({ ...s, typography: typographyForLayout(s) }));
    const layouts = layoutPageStories(storiesForLayout, textFramesForLayout);

    const selectedFrameId = (() => {
      for (const o of currentObjs) {
        if (!o.isTextFrame) continue;
        const sid = (o as { storyId?: string }).storyId as string | undefined;
        if (!sid) continue;
        const s = stories.find((st) => st.id === sid);
        if (!s) continue;
        const typo = s.typography;
        const a = o as FreehandObject & {
          fontSize?: number;
          fontFamily?: string;
          lineHeight?: number;
          letterSpacing?: number;
        };
        if (
          a.fontSize !== typo.fontSize ||
          a.fontFamily !== typo.fontFamily ||
          a.lineHeight !== typo.lineHeight ||
          a.letterSpacing !== typo.letterSpacing
        ) {
          return o.id;
        }
      }
      return null;
    })();

    let liveTypoSource: Record<string, unknown> | null = null;
    let liveTypoStoryId: string | null = null;
    if (selectedFrameId) {
      const obj = currentObjs.find((o) => o.id === selectedFrameId) as FreehandObject & {
        storyId?: string;
        fontFamily?: string;
        fontSize?: number;
        lineHeight?: number;
        letterSpacing?: number;
        textAlign?: string;
        fontKerning?: string;
        paragraphIndent?: number;
        fontVariantCaps?: string;
        fontFeatureSettings?: string;
        fill?: unknown;
      };
      if (obj) {
        liveTypoStoryId = obj.storyId ?? null;
        const fillStr =
          typeof obj.fill === "string" ? obj.fill : (obj.fill as { type?: string; color?: string })?.type === "solid"
            ? (obj.fill as { color?: string }).color
            : null;
        liveTypoSource = {
          fontFamily: obj.fontFamily,
          fontSize: obj.fontSize,
          lineHeight: obj.lineHeight,
          letterSpacing: obj.letterSpacing,
          textAlign: obj.textAlign,
          fontKerning: obj.fontKerning,
          paragraphIndent: obj.paragraphIndent,
          fontVariantCaps: obj.fontVariantCaps,
          fontFeatureSettings: obj.fontFeatureSettings,
          ...(fillStr && fillStr !== "none" ? { fill: fillStr } : {}),
        };
      }
    }

    for (const fl of layouts) {
      const story = stories.find((s) => s.id === fl.storyId);
      const total = story?.frames.length ?? 1;
      const index = story ? story.frames.indexOf(fl.frameId) : 0;
      const threadInfo = total > 1 ? { index: Math.max(0, index), total } : undefined;

      const typoPatch: Record<string, unknown> = {};
      if (story && story.frames.length > 1 && fl.frameId !== selectedFrameId) {
        const src = liveTypoStoryId === story.id && liveTypoSource ? liveTypoSource : null;
        if (src) {
          const obj = currentObjs.find((o) => o.id === fl.frameId) as FreehandObject & {
            fontFamily?: string;
            fontSize?: number;
            lineHeight?: number;
            letterSpacing?: number;
            textAlign?: string;
            fontKerning?: string;
            paragraphIndent?: number;
            fontVariantCaps?: string;
            fontFeatureSettings?: string;
            fill?: unknown;
          };
          if (obj) {
            if (src.fontFamily != null && obj.fontFamily !== src.fontFamily) typoPatch.fontFamily = src.fontFamily;
            if (src.fontSize != null && obj.fontSize !== src.fontSize) typoPatch.fontSize = src.fontSize;
            if (src.lineHeight != null && obj.lineHeight !== src.lineHeight) typoPatch.lineHeight = src.lineHeight;
            if (src.letterSpacing != null && obj.letterSpacing !== src.letterSpacing) typoPatch.letterSpacing = src.letterSpacing;
            if (src.textAlign != null && obj.textAlign !== src.textAlign) typoPatch.textAlign = src.textAlign;
            if (src.fontKerning != null && obj.fontKerning !== src.fontKerning) typoPatch.fontKerning = src.fontKerning;
            if (src.paragraphIndent != null && obj.paragraphIndent !== src.paragraphIndent)
              typoPatch.paragraphIndent = src.paragraphIndent;
            if (src.fontVariantCaps != null && obj.fontVariantCaps !== src.fontVariantCaps)
              typoPatch.fontVariantCaps = src.fontVariantCaps;
            if (src.fontFeatureSettings != null && obj.fontFeatureSettings !== src.fontFeatureSettings)
              typoPatch.fontFeatureSettings = src.fontFeatureSettings;
            if (src.fill != null) {
              const objFill =
                typeof obj.fill === "string" ? obj.fill : (obj.fill as { type?: string; color?: string })?.type === "solid"
                  ? (obj.fill as { color?: string }).color
                  : null;
              if (objFill !== src.fill) typoPatch.fill = { type: "solid", color: src.fill };
            }
          }
        }
      }

      if (fl.frameId === editingId) {
        api.patchObject(fl.frameId, { _designerOverflow: fl.hasOverflow, _designerThreadInfo: threadInfo });
        continue;
      }
      if (story) {
        const frameContent = sliceStoryContent(story.content, fl.contentRange.start, fl.contentRange.end);
        const frameText = serializeStoryContent(frameContent);
        const richSpans = buildRichSpansForFrame(frameContent);
        api.patchObject(fl.frameId, {
          text: frameText,
          _designerOverflow: fl.hasOverflow,
          _designerThreadInfo: threadInfo,
          _designerRichSpans: richSpans,
          ...typoPatch,
        });
      } else {
        api.patchObject(fl.frameId, { _designerOverflow: fl.hasOverflow, _designerThreadInfo: threadInfo });
      }
    }
  }, [studioApiRef, pagesRef, activeIdxRef]);

  syncTextFrameLayoutsRef.current = syncTextFrameLayouts;

  useEffect(() => {
    clearTimeout(layoutSyncTimerRef.current);
    layoutSyncTimerRef.current = setTimeout(syncTextFrameLayouts, 60);
    return () => clearTimeout(layoutSyncTimerRef.current);
  }, [pages, activePageIndex, syncTextFrameLayouts]);

  return { syncTextFrameLayoutsRef };
}
