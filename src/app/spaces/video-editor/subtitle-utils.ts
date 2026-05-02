import { createDefaultSubtitleStyle, type FoldderSubtitleDocument, type RenderSubtitleMode, type SubtitleSegment, type SubtitleStyle, type SubtitleWord } from "./subtitles-types";

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toSeconds(value: string): number {
  const clean = value.trim().replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(clean) || 0;
}

function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(",", ".");
}

function stripCueNoise(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSubtitleText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export type SubtitleComposerOptions = {
  maxCharsPerLine?: number;
  maxLines?: number;
  minSegmentDuration?: number;
  maxSegmentDuration?: number;
  respectPauses?: boolean;
  avoidWidows?: boolean;
  targetFormat?: "16:9" | "9:16" | "1:1";
};

function shouldBreakSubtitleSegment(
  currentWords: SubtitleWord[],
  nextWord: SubtitleWord,
  options: Required<Omit<SubtitleComposerOptions, "targetFormat">>,
): boolean {
  if (!currentWords.length) return false;
  const text = [...currentWords, nextWord].map((word) => word.text).join(" ");
  const duration = nextWord.end - currentWords[0]!.start;
  const previous = currentWords[currentWords.length - 1]!;
  const pause = nextWord.start - previous.end;
  const endsSentence = /[.!?…]$/.test(previous.text);
  if (options.respectPauses && pause >= 0.42) return true;
  if (endsSentence && duration >= options.minSegmentDuration) return true;
  if (text.length > options.maxCharsPerLine * options.maxLines) return true;
  return duration >= options.maxSegmentDuration;
}

function segmentFromWords(words: SubtitleWord[]): SubtitleSegment {
  const safeWords = words.filter((word) => normalizeSubtitleText(word.text));
  const start = Math.max(0, safeWords[0]?.start ?? 0);
  const end = Math.max(start + 0.3, safeWords[safeWords.length - 1]?.end ?? start + 1.2);
  return {
    id: id("sub"),
    start,
    end,
    text: normalizeSubtitleText(safeWords.map((word) => word.text).join(" ")),
    words: safeWords.map((word, index) => ({
      id: word.id || id("word"),
      text: normalizeSubtitleText(word.text),
      start: Math.max(start, Number.isFinite(word.start) ? word.start : start),
      end: Math.max(Number.isFinite(word.end) ? word.end : start + (index + 1) * 0.3, start + 0.1),
      confidence: word.confidence,
      emphasis: word.emphasis ?? "none",
    })),
  };
}

export function composeSegmentsFromWords(words: SubtitleWord[], rawOptions: SubtitleComposerOptions = {}): SubtitleSegment[] {
  const options = {
    maxCharsPerLine: rawOptions.maxCharsPerLine ?? (rawOptions.targetFormat === "9:16" ? 26 : 34),
    maxLines: rawOptions.maxLines ?? 2,
    minSegmentDuration: rawOptions.minSegmentDuration ?? 1.0,
    maxSegmentDuration: rawOptions.maxSegmentDuration ?? 4.2,
    respectPauses: rawOptions.respectPauses ?? true,
    avoidWidows: rawOptions.avoidWidows ?? true,
  };
  const ordered = words
    .map((word) => ({
      ...word,
      text: normalizeSubtitleText(word.text),
      start: Math.max(0, Number(word.start) || 0),
      end: Math.max(Math.max(0, Number(word.start) || 0) + 0.05, Number(word.end) || 0),
      emphasis: word.emphasis ?? "none" as const,
    }))
    .filter((word) => word.text)
    .sort((a, b) => a.start - b.start);
  const segments: SubtitleSegment[] = [];
  let current: SubtitleWord[] = [];
  for (const word of ordered) {
    if (shouldBreakSubtitleSegment(current, word, options)) {
      if (options.avoidWidows && current.length === 1 && segments.length) {
        const previous = segments[segments.length - 1]!;
        const mergedWords = [...previous.words, ...current];
        segments[segments.length - 1] = segmentFromWords(mergedWords);
      } else if (current.length) {
        segments.push(segmentFromWords(current));
      }
      current = [];
    }
    current.push(word);
  }
  if (current.length) {
    if (options.avoidWidows && current.length === 1 && segments.length) {
      const previous = segments[segments.length - 1]!;
      segments[segments.length - 1] = segmentFromWords([...previous.words, ...current]);
    } else {
      segments.push(segmentFromWords(current));
    }
  }
  return segments.filter((segment) => segment.text);
}

export function createSubtitleDocumentFromSegments(args: {
  segments: SubtitleSegment[];
  durationSeconds?: number;
  sourceAssetId?: string;
  timelineId?: string;
  mode?: RenderSubtitleMode;
  language?: string;
  style?: SubtitleStyle;
  status?: FoldderSubtitleDocument["status"];
}): FoldderSubtitleDocument {
  const now = new Date().toISOString();
  return {
    id: id("subtitle_doc"),
    sourceAssetId: args.sourceAssetId || "timeline",
    timelineId: args.timelineId,
    language: args.language || "es",
    mode: args.mode || "lines",
    status: args.status || "synced",
    durationSeconds: args.durationSeconds,
    segments: args.segments,
    style: args.style || createDefaultSubtitleStyle("creator"),
    createdAt: now,
    updatedAt: now,
  };
}

export function parseSubtitleText(input: string): SubtitleSegment[] {
  const source = input.replace(/\r/g, "").trim();
  if (!source) return [];
  const cueRegex = /(?:(?:^|\n)\s*\d+\s*\n)?\s*(\d{1,2}:\d{2}(?::\d{2})?[\.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[\.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n{2,}(?:\d+\s*\n)?\s*\d{1,2}:\d{2}|\n*$)/g;
  const segments: SubtitleSegment[] = [];
  let match: RegExpExecArray | null;
  while ((match = cueRegex.exec(source))) {
    const text = stripCueNoise(match[3].split("\n").join(" "));
    if (!text) continue;
    segments.push({
      id: id("sub"),
      start: toSeconds(match[1]),
      end: Math.max(toSeconds(match[2]), toSeconds(match[1]) + 0.4),
      text,
      words: text.split(/\s+/).map((word, index, words) => {
        const start = toSeconds(match![1]);
        const end = Math.max(toSeconds(match![2]), start + 0.4);
        const step = (end - start) / Math.max(1, words.length);
        return { id: id("word"), text: word, start: start + index * step, end: start + (index + 1) * step, emphasis: "none" };
      }),
    });
  }
  return segments;
}

export function segmentsFromPlainText(input: string, durationSeconds: number): SubtitleSegment[] {
  const lines = input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const chunks = lines.length ? lines : input.match(/[^.!?]+[.!?]*/g)?.map((line) => line.trim()).filter(Boolean) ?? [];
  const safeDuration = Math.max(1, durationSeconds || chunks.length * 3);
  const segmentDuration = Math.max(1.4, safeDuration / Math.max(1, chunks.length));
  return chunks.map((text, index) => {
    const start = Math.min(safeDuration, index * segmentDuration);
    const end = Math.min(safeDuration, Math.max(start + 1.2, (index + 1) * segmentDuration));
    const words = text.split(/\s+/).filter(Boolean);
    return {
      id: id("sub"),
      start,
      end,
      text,
      words: words.map((word, wordIndex) => {
        const step = (end - start) / Math.max(1, words.length);
        return { id: id("word"), text: word, start: start + wordIndex * step, end: start + (wordIndex + 1) * step, emphasis: "none" };
      }),
    };
  });
}

export function createSubtitleDocumentFromText(args: {
  text: string;
  durationSeconds: number;
  sourceAssetId?: string;
  timelineId?: string;
  mode?: RenderSubtitleMode;
  language?: string;
  style?: SubtitleStyle;
}): FoldderSubtitleDocument {
  const parsed = parseSubtitleText(args.text);
  const segments = parsed.length ? parsed : segmentsFromPlainText(args.text, args.durationSeconds);
  const now = new Date().toISOString();
  return {
    id: id("subtitle_doc"),
    sourceAssetId: args.sourceAssetId || "timeline",
    timelineId: args.timelineId,
    language: args.language || "es",
    mode: args.mode || "lines",
    status: parsed.length ? "synced" : "draft",
    durationSeconds: args.durationSeconds,
    segments,
    style: args.style || createDefaultSubtitleStyle("creator"),
    createdAt: now,
    updatedAt: now,
  };
}

export function exportSubtitleDocumentToSrt(document: FoldderSubtitleDocument): string {
  return document.segments
    .map((segment, index) => `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text.trim()}\n`)
    .join("\n");
}

export function exportSubtitleDocumentToVtt(document: FoldderSubtitleDocument): string {
  return `WEBVTT\n\n${document.segments
    .map((segment) => `${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)}\n${segment.text.trim()}\n`)
    .join("\n")}`;
}

function assColor(hex: string, alpha = 0): string {
  const clean = hex.replace("#", "").padEnd(6, "f").slice(0, 6);
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  const aa = Math.max(0, Math.min(255, Math.round(alpha * 255))).toString(16).padStart(2, "0");
  return `&H${aa}${bb}${gg}${rr}`;
}

function assTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
}

export function exportSubtitleDocumentToAss(document: FoldderSubtitleDocument, width = 1920, height = 1080): string {
  const style = document.style || createDefaultSubtitleStyle("creator");
  const marginV = Math.max(20, Math.round((100 - style.position.y) / 100 * height));
  const outline = style.background?.enabled ? 4 : 1;
  const shadow = style.background?.enabled ? 1 : 0;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.fontFamily || "Arial"},${style.fontSize || 54},${assColor(style.color || "#ffffff")},${assColor(style.activeColor || "#ffe66d")},${assColor(style.background?.color || "#000000", 1 - (style.background?.opacity ?? 0.55))},&H00000000,${style.fontWeight >= 700 ? -1 : 0},0,0,0,100,100,0,0,1,${outline},${shadow},2,80,80,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...document.segments.map((segment) => `Dialogue: 0,${assTime(segment.start)},${assTime(segment.end)},Default,,0,0,0,,${escapeAssText(segment.text)}`),
    "",
  ].join("\n");
}
