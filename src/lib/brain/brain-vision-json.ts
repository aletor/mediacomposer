import type {
  BrainVisualClothingDetail,
  BrainVisualGraphicDetail,
  BrainVisualPeopleDetail,
  VisualImageClassification,
} from "@/app/spaces/project-assets-metadata";

/** Payload mínimo que puede fusionarse a BrainVisualImageAnalysis tras visión real. */
export type ParsedVisionAnalysisPayload = {
  subject: string[];
  visualStyle: string[];
  mood: string[];
  composition: string[];
  colorPalette: {
    dominant: string[];
    secondary?: string[];
    temperature?: string;
    saturation?: string;
    contrast?: string;
  };
  people: BrainVisualPeopleDetail;
  clothingStyle: BrainVisualClothingDetail;
  graphicStyle: BrainVisualGraphicDetail;
  brandSignals: string[];
  visualMessage: string[];
  possibleUse: string[];
  classification: VisualImageClassification;
  confidence: number;
  reasoning: string;
};

const CLASSIFICATIONS: readonly VisualImageClassification[] = [
  "CORE_VISUAL_DNA",
  "PROJECT_VISUAL_REFERENCE",
  "CONTEXTUAL_VISUAL_MEMORY",
  "RAW_ASSET_ONLY",
];

function strArr(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function readPeople(o: unknown): BrainVisualPeopleDetail {
  if (!o || typeof o !== "object") return { present: false };
  const p = o as Record<string, unknown>;
  return {
    present: p.present === true,
    ...(typeof p.description === "string" ? { description: p.description.trim().slice(0, 400) } : {}),
    ...(Array.isArray(p.attitude) ? { attitude: strArr(p.attitude, 12) } : {}),
    ...(Array.isArray(p.pose) ? { pose: strArr(p.pose, 12) } : {}),
    ...(Array.isArray(p.energy) ? { energy: strArr(p.energy, 12) } : {}),
    ...(typeof p.relationToCamera === "string"
      ? { relationToCamera: p.relationToCamera.trim().slice(0, 120) }
      : {}),
  };
}

function readClothing(o: unknown): BrainVisualClothingDetail {
  if (!o || typeof o !== "object") return { present: false };
  const p = o as Record<string, unknown>;
  const formality = p.formality;
  const okForm =
    formality === "casual" ||
    formality === "casual_premium" ||
    formality === "formal" ||
    formality === "technical" ||
    formality === "sport" ||
    formality === "mixed";
  return {
    present: p.present === true,
    ...(Array.isArray(p.style) ? { style: strArr(p.style, 16) } : {}),
    ...(Array.isArray(p.colors) ? { colors: strArr(p.colors, 16) } : {}),
    ...(Array.isArray(p.textures) ? { textures: strArr(p.textures, 12) } : {}),
    ...(okForm ? { formality } : {}),
  };
}

function readGraphic(o: unknown): BrainVisualGraphicDetail {
  if (!o || typeof o !== "object") return { present: false };
  const p = o as Record<string, unknown>;
  return {
    present: p.present === true,
    ...(Array.isArray(p.typography) ? { typography: strArr(p.typography, 12) } : {}),
    ...(Array.isArray(p.shapes) ? { shapes: strArr(p.shapes, 12) } : {}),
    ...(Array.isArray(p.iconography) ? { iconography: strArr(p.iconography, 12) } : {}),
    ...(Array.isArray(p.layout) ? { layout: strArr(p.layout, 12) } : {}),
    ...(Array.isArray(p.texture) ? { texture: strArr(p.texture, 12) } : {}),
  };
}

/**
 * Valida JSON de visión (sin Zod en dependencias): devuelve payload o null.
 */
export function parseVisionAnalysisJson(raw: unknown): ParsedVisionAnalysisPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const subject = strArr(o.subject);
  const visualStyle = strArr(o.visualStyle);
  const mood = strArr(o.mood);
  const composition = strArr(o.composition);
  if (!subject.length || !visualStyle.length || !mood.length || !composition.length) return null;

  const cpRaw = o.colorPalette;
  if (!cpRaw || typeof cpRaw !== "object") return null;
  const cp = cpRaw as Record<string, unknown>;
  const dominant = strArr(cp.dominant, 16);
  if (!dominant.length) return null;

  const cls = CLASSIFICATIONS.includes(o.classification as VisualImageClassification)
    ? (o.classification as VisualImageClassification)
    : null;
  if (!cls) return null;

  let confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : 0;
  confidence = Math.min(1, Math.max(0, confidence));
  const reasoning = typeof o.reasoning === "string" ? o.reasoning.trim().slice(0, 800) : "";
  if (!reasoning) return null;

  return {
    subject,
    visualStyle,
    mood,
    composition,
    colorPalette: {
      dominant,
      secondary: strArr(cp.secondary, 16),
      ...(typeof cp.temperature === "string" ? { temperature: cp.temperature } : {}),
      ...(typeof cp.saturation === "string" ? { saturation: cp.saturation } : {}),
      ...(typeof cp.contrast === "string" ? { contrast: cp.contrast } : {}),
    },
    people: readPeople(o.people),
    clothingStyle: readClothing(o.clothingStyle),
    graphicStyle: readGraphic(o.graphicStyle),
    brandSignals: strArr(o.brandSignals, 20),
    visualMessage: strArr(o.visualMessage, 12),
    possibleUse: strArr(o.possibleUse, 16),
    classification: cls,
    confidence,
    reasoning,
  };
}
