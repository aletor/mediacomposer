import type {
  VisualDnaMosaicAdvice,
  VisualDnaMosaicIntelligence,
  VisualDnaSlot,
  VisualDnaSlotAsset,
} from "./types";

const SCHEMA_VERSION: VisualDnaMosaicIntelligence["schemaVersion"] = "visual_dna_mosaic_intelligence_v1";

export const VISUAL_DNA_MOSAIC_INTELLIGENCE_SYSTEM_PROMPT = [
  "Eres un analizador técnico de mosaicos visuales para Foldder.",
  "Tu tarea es leer un mosaico ADN ya generado y extraer consejos visuales reutilizables por categoría.",
  "No identifiques personas reales, celebridades, marcas, logos, artistas, obras, ubicaciones concretas ni propiedad intelectual.",
  "No transcribas textos o marcas visibles; si son relevantes, descríbelos como elementos gráficos o tipográficos.",
  "No conviertas etiquetas del mosaico, coordenadas o nombres de celda en contenido creativo.",
  "Separa estrictamente personas, entornos, texturas, objetos y looks generales.",
  "Devuelve únicamente JSON válido, sin markdown, sin comentarios y sin texto adicional.",
].join("\n");

export const VISUAL_DNA_MOSAIC_INTELLIGENCE_USER_PROMPT = [
  "Analiza la imagen adjunta como mosaico ADN visual.",
  "",
  "OBJETIVO",
  "Devuelve consejos útiles para que otros nodos puedan pedir imágenes con precisión.",
  "La respuesta debe ser más útil que una lista de tags: cada ejemplo debe explicar qué se ve, para qué sirve creativamente y cómo usarlo como dirección visual.",
  "",
  "REGLAS DE SEPARACIÓN",
  "- Personas: presencia humana, interacción, gesto, actitud, estilo de vida o vestuario genérico. No identidad ni rasgos sensibles.",
  "- Entornos: fondos, localizaciones, contexto espacial, arquitectura, escena, luz ambiental. No incluyas personas como núcleo del entorno.",
  "- Texturas: materiales, superficies, grano, tejido, metal, vapor, chispas, tactilidad visual.",
  "- Objetos: props, producto, utensilios, instrumentos, elementos físicos visibles. No incluyas personas.",
  "- Looks generales: dirección visual global, atmósfera editorial, composición, energía, contraste y uso creativo.",
  "",
  "IMPORTANTE",
  "- Si el mosaico muestra dos celdas por categoría, describe esas dos celdas concretas.",
  "- No respondas con frases genéricas como \"fondo amarillo\" si hay una escena o contexto más rico.",
  "- No respondas \"Objetos visibles en la sección OBJETOS\"; nombra los objetos genéricos observables.",
  "- Para entornos, explica el contexto espacial real: por ejemplo mercado nocturno, cocina metálica callejera, desierto con cactus, patio colonial, data center, etc.",
  "- Para texturas, describe materialidad real: metal usado, tejido rayado, estuco mate, humo, vapor, chispas, grano, etc.",
  "- Para objetos, lista objetos concretos genéricos: guitarra acústica, sombrero de paja, wok metálico, especieros, fideos, cubo plástico, smartphone, etc.",
  "",
  "Devuelve exactamente este JSON:",
  JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      source: "mosaic_image",
      people: [
        {
          id: "people_1",
          title: "ejemplo breve",
          observed: "qué se ve en la celda de personas",
          creativeUse: "cómo usarlo como dirección visual",
          promptHint: "instrucción visual segura para un generador",
          avoid: "qué no copiar o evitar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
        {
          id: "people_2",
          title: "ejemplo breve",
          observed: "qué se ve en la segunda celda de personas",
          creativeUse: "cómo usarlo como dirección visual",
          promptHint: "instrucción visual segura para un generador",
          avoid: "qué no copiar o evitar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
      ],
      environments: [
        {
          id: "environment_1",
          title: "ejemplo breve",
          observed: "qué fondo o entorno se ve",
          creativeUse: "cómo usarlo como dirección de entorno",
          promptHint: "instrucción visual segura de fondo/localización",
          avoid: "qué no mezclar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
        {
          id: "environment_2",
          title: "ejemplo breve",
          observed: "qué fondo o entorno se ve",
          creativeUse: "cómo usarlo como dirección de entorno",
          promptHint: "instrucción visual segura de fondo/localización",
          avoid: "qué no mezclar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
      ],
      textures: [
        {
          id: "texture_1",
          title: "ejemplo breve",
          observed: "qué textura/material se ve",
          creativeUse: "cómo usarlo como dirección táctil",
          promptHint: "instrucción visual segura de textura",
          avoid: "qué no mezclar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
        {
          id: "texture_2",
          title: "ejemplo breve",
          observed: "qué textura/material se ve",
          creativeUse: "cómo usarlo como dirección táctil",
          promptHint: "instrucción visual segura de textura",
          avoid: "qué no mezclar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
      ],
      objects: [
        {
          id: "object_1",
          title: "ejemplo breve",
          observed: "qué objeto físico se ve",
          creativeUse: "cómo usarlo como prop/producto",
          promptHint: "instrucción visual segura de objeto",
          avoid: "qué no mezclar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
        {
          id: "object_2",
          title: "ejemplo breve",
          observed: "qué objeto físico se ve",
          creativeUse: "cómo usarlo como prop/producto",
          promptHint: "instrucción visual segura de objeto",
          avoid: "qué no mezclar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
      ],
      generalLooks: [
        {
          id: "general_1",
          title: "look visual breve",
          observed: "dirección visual global observada",
          creativeUse: "uso creativo recomendado",
          promptHint: "instrucción de look completo",
          avoid: "qué no copiar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
        {
          id: "general_2",
          title: "look visual breve",
          observed: "segunda dirección visual global",
          creativeUse: "uso creativo recomendado",
          promptHint: "instrucción de look completo",
          avoid: "qué no copiar",
          visualKeywords: ["keyword"],
          confidence: 0.75,
        },
      ],
      globalCreativeDirection: {
        summary: "resumen visual global del mosaico",
        bestFor: ["usos creativos"],
        avoid: ["límites"],
        visualKeywords: ["keyword"],
      },
      confidence: 0.78,
    },
    null,
    2,
  ),
].join("\n");

function cleanString(value: unknown, max = 1200): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function confidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0.2, Math.min(0.98, value));
}

function cleanStringArray(value: unknown, maxItems = 10, maxChars = 80): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = cleanString(item, maxChars);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeAdviceRow(raw: unknown, fallbackId: string, fallbackTitle: string): VisualDnaMosaicAdvice | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const observed = cleanString(row.observed, 1200);
  const creativeUse = cleanString(row.creativeUse, 1200);
  const promptHint = cleanString(row.promptHint, 1600);
  const title = cleanString(row.title, 120) || fallbackTitle;
  if (!observed && !creativeUse && !promptHint) return null;
  return {
    id: cleanString(row.id, 80) || fallbackId,
    title,
    observed: observed || title,
    creativeUse: creativeUse || observed || title,
    promptHint: promptHint || creativeUse || observed || title,
    ...(cleanString(row.avoid, 500) ? { avoid: cleanString(row.avoid, 500) } : {}),
    visualKeywords: cleanStringArray(row.visualKeywords, 10, 60),
    ...(confidence(row.confidence) !== undefined ? { confidence: confidence(row.confidence) } : {}),
  };
}

function normalizeAdviceArray(raw: unknown, prefix: string, fallbackTitle: string): VisualDnaMosaicAdvice[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: VisualDnaMosaicAdvice[] = [];
  for (const row of rows) {
    const item = normalizeAdviceRow(row, `${prefix}_${out.length + 1}`, `${fallbackTitle} ${out.length + 1}`);
    if (!item) continue;
    out.push(item);
    if (out.length >= 2) break;
  }
  return out;
}

export function normalizeVisualDnaMosaicIntelligence(raw: unknown): VisualDnaMosaicIntelligence | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const globalRaw =
    root.globalCreativeDirection && typeof root.globalCreativeDirection === "object"
      ? (root.globalCreativeDirection as Record<string, unknown>)
      : {};
  const intelligence: VisualDnaMosaicIntelligence = {
    schemaVersion: SCHEMA_VERSION,
    source: "mosaic_image",
    analyzedAt: cleanString(root.analyzedAt, 60) || new Date().toISOString(),
    provider:
      root.provider === "gemini" || root.provider === "openai" || root.provider === "mock" || root.provider === "unknown"
        ? root.provider
        : "unknown",
    people: normalizeAdviceArray(root.people, "people", "Personas"),
    environments: normalizeAdviceArray(root.environments, "environment", "Entorno"),
    textures: normalizeAdviceArray(root.textures, "texture", "Textura"),
    objects: normalizeAdviceArray(root.objects, "object", "Objeto"),
    generalLooks: normalizeAdviceArray(root.generalLooks, "general", "Look general"),
    globalCreativeDirection: {
      ...(cleanString(globalRaw.summary, 1800) ? { summary: cleanString(globalRaw.summary, 1800) } : {}),
      bestFor: cleanStringArray(globalRaw.bestFor, 8, 120),
      avoid: cleanStringArray(globalRaw.avoid, 8, 120),
      visualKeywords: cleanStringArray(globalRaw.visualKeywords, 14, 80),
    },
    ...(confidence(root.confidence) !== undefined ? { confidence: confidence(root.confidence) } : {}),
    ...(cleanString(root.lastError, 800) ? { lastError: cleanString(root.lastError, 800) } : {}),
  };
  const hasAny =
    intelligence.people.length ||
    intelligence.environments.length ||
    intelligence.textures.length ||
    intelligence.objects.length ||
    intelligence.generalLooks.length;
  return hasAny ? intelligence : null;
}

function adviceDescription(advice: VisualDnaMosaicAdvice): string {
  return [advice.observed, advice.creativeUse].filter(Boolean).join(" · ").slice(0, 2200);
}

function advicePrompt(advice: VisualDnaMosaicAdvice, categoryLabel: string): string {
  const parts = [
    `Usa esta referencia de ${categoryLabel} del mosaico ADN: ${advice.promptHint}`,
    advice.avoid ? `Evita: ${advice.avoid}` : "",
    advice.visualKeywords.length ? `Claves visuales: ${advice.visualKeywords.join(", ")}.` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function assetFromAdvice(
  advice: VisualDnaMosaicAdvice | undefined,
  role: "same" | "similar",
  categoryLabel: string,
  imageUrl?: string,
): VisualDnaSlotAsset | undefined {
  if (!advice) return undefined;
  return {
    role,
    ...(imageUrl ? { imageUrl } : {}),
    description: adviceDescription(advice),
    prompt: advicePrompt(advice, categoryLabel),
    ...(typeof advice.confidence === "number" ? { confidence: advice.confidence } : {}),
  };
}

function adviceNotes(items: VisualDnaMosaicAdvice[]): string | undefined {
  const notes = items
    .map((item, index) => `${index + 1}. ${item.title}: ${item.observed} Uso: ${item.creativeUse}`)
    .join(" ");
  return notes.trim() ? notes.slice(0, 3000) : undefined;
}

export function applyMosaicIntelligenceToSlot(
  slot: VisualDnaSlot,
  intelligence: VisualDnaMosaicIntelligence,
): VisualDnaSlot {
  const imageUrl = slot.mosaic.imageUrl;
  const global = intelligence.globalCreativeDirection;
  const generalLooksSummary = adviceNotes(intelligence.generalLooks);
  const globalSummary = [global?.summary, generalLooksSummary].filter(Boolean).join(" ");
  return {
    ...slot,
    mosaicIntelligence: intelligence,
    updatedAt: new Date().toISOString(),
    confidence: typeof intelligence.confidence === "number" ? intelligence.confidence : slot.confidence,
    people: {
      same: assetFromAdvice(intelligence.people[0], "same", "personas/interacción", imageUrl),
      similar: assetFromAdvice(intelligence.people[1], "similar", "personas/interacción", imageUrl),
      notes: adviceNotes(intelligence.people) || slot.people.notes,
    },
    environments: {
      same: assetFromAdvice(intelligence.environments[0], "same", "entorno/fondo", imageUrl),
      similar: assetFromAdvice(intelligence.environments[1], "similar", "entorno/fondo", imageUrl),
      notes: adviceNotes(intelligence.environments) || slot.environments.notes,
    },
    textures: {
      same: assetFromAdvice(intelligence.textures[0], "same", "texturas/materialidad", imageUrl),
      similar: assetFromAdvice(intelligence.textures[1], "similar", "texturas/materialidad", imageUrl),
      notes: adviceNotes(intelligence.textures) || slot.textures.notes,
    },
    objects: {
      same: assetFromAdvice(intelligence.objects[0], "same", "objetos/producto", imageUrl),
      similar: assetFromAdvice(intelligence.objects[1], "similar", "objetos/producto", imageUrl),
      notes: adviceNotes(intelligence.objects) || slot.objects.notes,
    },
    generalStyle: {
      ...slot.generalStyle,
      summary: globalSummary || slot.generalStyle.summary,
      mood: global?.visualKeywords?.length ? global.visualKeywords.slice(0, 12) : slot.generalStyle.mood,
      avoid: global?.avoid?.length ? global.avoid.slice(0, 24) : slot.generalStyle.avoid,
    },
  };
}

export function visualDnaMosaicAdviceToSuggestion(
  slotId: string,
  kind: "person" | "environment" | "texture" | "object" | "hero",
  advice: VisualDnaMosaicAdvice,
  index: number,
  imageUrl?: string,
) {
  return {
    id: `${slotId}_${kind}_mosaic_${index + 1}`,
    kind,
    title: advice.title,
    ...(imageUrl ? { imageUrl } : {}),
    description: adviceDescription(advice),
    prompt: advicePrompt(
      advice,
      kind === "person"
        ? "personas/interacción"
        : kind === "environment"
          ? "entorno/fondo"
          : kind === "texture"
            ? "texturas/materialidad"
            : kind === "object"
              ? "objetos/producto"
              : "look completo",
    ),
  };
}

