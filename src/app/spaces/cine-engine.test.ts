import { describe, expect, it } from "vitest";

import {
  analyzeCineScript,
  applyCineImageStudioResult,
  buildCineCharacterSheetPrompt,
  cleanScriptText,
  getCineFrameReferenceAssetIds,
  getEffectiveCharacterSheetAsset,
  validateAndNormalizeCineAIAnalysis,
} from "./cine-engine";
import { createEmptyCineNodeData, type CineBackground, type CineCharacter, type CineImageStudioSession, type CineScene } from "./cine-types";

const SARA_SCRIPT = `
**Voz en off:** En la vida, cada escalón puede ser un desafío, un miedo que debemos superar. Para Sara, hoy es la escalera de su edificio.
**Texto en pantalla:** **Paso a Paso**
**Notas visuales:**
- **Duración: 0:10** Vista de la escalera de madera desde arriba, mostrando su altura y antigüedad.

**Voz en off:** Sara respira hondo. Cada escalón cruje bajo sus pies, pero ella decide seguir bajando.
**Texto en pantalla:** *Un paso más cerca de ser libre.*
**Notas visuales:**
- **Duración: 0:20** Primer plano de Sara en la escalera, agarrando la barandilla con determinación.

**Voz en off:** Hace un tiempo, en una entrevista de trabajo, Sara sintió que podía empezar de nuevo.
**Texto en pantalla:** Entrevista
**Notas visuales:**
- **Duración: 0:12** Sala de entrevista sobria, Sara nerviosa pero aliviada, luz suave de oficina.

**Voz en off:** El recuerdo de la pérdida todavía pesa, pero ya no la paraliza.
**Texto en pantalla:** Coraje
**Notas visuales:**
- **Duración: 0:11** Espacio de recuerdo íntimo y silencioso, Sara en un momento de reflexión.

**Voz en off:** Sara llega al último tramo de la escalera. Sonríe, con una bolsa de basura en la mano.
**Texto en pantalla:** Hoy
**Notas visuales:**
- **Duración: 0:14** Sara llegando al final de la escalera, con gesto de victoria tranquila.

**Voz en off:** Al abrir la puerta, la luz del sol le devuelve el rostro. Sara camina hacia la salida.
**Texto en pantalla:** Salida
**Notas visuales:**
- **Duración: 0:09** Puerta de salida y hall iluminado, luz cálida entrando sobre el rostro de Sara.
`;

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectText);
  return [];
}

describe("Cine analyzer V1.7", () => {
  it("cleans markdown without losing label content", () => {
    expect(cleanScriptText("**Paso a Paso**")).toBe("Paso a Paso");
    expect(cleanScriptText("*Un paso más cerca de ser libre.*")).toBe("Un paso más cerca de ser libre.");
    expect(cleanScriptText("**Duración: 0:10** Vista de la escalera")).toBe("Duración: 0:10 Vista de la escalera");
  });

  it("parses Sara's audiovisual script into useful storyboard data", () => {
    const result = analyzeCineScript(SARA_SCRIPT);
    const characterNames = result.characters.map((character) => character.name);
    const sceneWithInterview = result.scenes.find((scene) => /entrevista/i.test(scene.sourceText ?? ""));
    const sceneWithLoss = result.scenes.find((scene) => /pérdida|perdida/i.test(scene.sourceText ?? ""));

    expect(result.scenes.length).toBeGreaterThanOrEqual(5);
    expect(result.scenes.length).toBeLessThanOrEqual(6);
    expect(result.characters).toHaveLength(1);
    expect(characterNames).toEqual(["Sara"]);
    expect(characterNames).not.toContain("Paso");
    expect(characterNames).not.toContain("Cada");
    expect(characterNames).not.toContain("Hoy");
    expect(result.scenes[0]?.visualNotes).toContain("escalera de madera");
    expect(result.scenes[0]?.durationSeconds).toBe(10);
    expect(result.scenes[0]?.onScreenText).toContain("Paso a Paso");
    expect(result.scenes[1]?.durationSeconds).toBe(20);
    expect(sceneWithInterview?.sceneKind).toBe("flashback");
    expect(sceneWithLoss?.sceneKind).toBe("memory");
    expect(result.backgrounds.map((background) => background.name)).toEqual(
      expect.arrayContaining([
        "Escalera antigua del edificio",
        "Sala de entrevista",
        "Espacio de recuerdo / reflexión",
        "Hall o puerta de salida iluminada",
      ]),
    );
    expect(result.scenes.every((scene) => (scene.characters ?? []).every((characterId) => result.characters.some((character) => character.id === characterId)))).toBe(true);
    expect(collectText(result).some((text) => text.includes("**"))).toBe(false);
  });

  it("normalizes AI analysis into usable Cine data", () => {
    const result = validateAndNormalizeCineAIAnalysis({
      logline: "**Puffy descubre una pirámide secreta.**",
      summary: "Puffy, Mateo y Cristóbal avanzan desde casa hasta el interior de una pirámide.",
      tone: "aventura luminosa",
      visualStyle: "cine familiar de aventura",
      characters: [
        { id: "puffy", name: "Puffy", role: "protagonist", description: "Perro protagonista curioso." },
        { id: "mateo", name: "Mateo", role: "secondary", description: "Coprotagonista humano." },
        { id: "cristobal", name: "Cristóbal", role: "secondary", description: "Coprotagonista humano." },
        { id: "voz", name: "Voz", role: "secondary" },
      ],
      backgrounds: [
        { id: "casa", name: "Casa soleada en el pueblo", type: "interior" },
        { id: "bosque", name: "Sendero del bosque", type: "natural" },
        { id: "piramide", name: "Interior de la pirámide", type: "interior" },
      ],
      scenes: [
        {
          id: "descubrimiento",
          order: 1,
          title: "**Descubrimiento inesperado**",
          visualSummary: "Puffy, Mateo y Cristóbal llegan a un claro con una pirámide escondida.",
          visualNotes: "Claro del bosque con pirámide antigua entre vegetación.",
          durationSeconds: "0:08",
          characters: ["puffy", "mateo", "cristobal"],
          backgroundId: "bosque",
          shot: { shotType: "wide", action: "El grupo observa la pirámide." },
        },
      ],
    }, "Puffy camina con Mateo y Cristóbal hacia una pirámide en el bosque.");

    expect(result.characters.map((character) => character.name)).toEqual(["Puffy", "Mateo", "Cristóbal"]);
    expect(result.scenes[0]?.durationSeconds).toBe(8);
    expect(result.scenes[0]?.framesMode).toBe("single");
    expect(result.scenes[0]?.status).toBe("draft");
    expect(result.scenes[0]?.characters).toHaveLength(3);
    expect(result.scenes[0]?.backgroundId).toBeTruthy();
    expect(collectText(result).some((text) => text.includes("**"))).toBe(false);
  });

  it("keeps and enriches narrative backgrounds from AI scenes", () => {
    const result = validateAndNormalizeCineAIAnalysis({
      logline: "Puffy encuentra una pirámide.",
      characters: [
        { id: "puffy", name: "Puffy", role: "protagonist" },
        { id: "mateo", name: "Mateo", role: "secondary" },
        { id: "cristobal", name: "Cristóbal", role: "secondary" },
      ],
      backgrounds: [
        { id: "generic", name: "Interior narrativo", type: "interior" },
      ],
      scenes: [
        {
          order: 1,
          title: "Inicio",
          visualNotes: "Mañana soleada en casa del pueblo con Puffy, Mateo y Cristóbal preparándose.",
          characters: ["puffy", "mateo", "cristobal"],
        },
        {
          order: 2,
          title: "Camino",
          visualNotes: "Puffy se comporta extraño en un sendero rodeado de árboles.",
          characters: ["puffy", "mateo", "cristobal"],
        },
        {
          order: 3,
          title: "Hallazgo",
          visualNotes: "Llegan a un claro del bosque y aparece una pirámide escondida entre vegetación.",
          characters: ["puffy", "mateo", "cristobal"],
        },
        {
          order: 4,
          title: "Base",
          visualNotes: "El grupo observa la base de la pirámide antigua y su entrada de piedra.",
          characters: ["puffy", "mateo", "cristobal"],
        },
        {
          order: 5,
          title: "Interior",
          visualNotes: "Se adentran en la pirámide con linternas, oscuridad y paredes de piedra.",
          characters: ["puffy", "mateo", "cristobal"],
        },
      ],
    }, "Puffy, Mateo y Cristóbal salen de casa, cruzan el bosque y entran en una pirámide.");

    const backgroundNames = result.backgrounds.map((background) => background.name);
    expect(backgroundNames).toEqual(expect.arrayContaining([
      "Casa soleada en el pueblo",
      "Sendero del bosque",
      "Claro con pirámide escondida",
      "Base de la pirámide antigua",
      "Interior de la pirámide",
    ]));
    expect(new Set(backgroundNames.map((name) => String(name).toLowerCase())).size).toBe(backgroundNames.length);
    expect(result.scenes.every((scene) => Boolean(scene.backgroundId))).toBe(true);
    expect(result.scenes.map((scene) => scene.title)).toEqual(expect.arrayContaining([
      "Introducción en el pueblo",
      "El comportamiento extraño de Puffy",
      "Descubrimiento de la pirámide",
      "Exploración de la pirámide",
      "Entrada al interior",
    ]));
  });

  it("applies Nano handoff results to a Cine frame without approving automatically", () => {
    const analysis = validateAndNormalizeCineAIAnalysis({
      characters: [{ id: "puffy", name: "Puffy", role: "protagonist" }],
      backgrounds: [{ id: "casa", name: "Casa soleada en el pueblo", type: "interior" }],
      scenes: [{ id: "scene_1", order: 1, title: "Inicio", visualSummary: "Puffy en casa.", characters: ["puffy"], backgroundId: "casa" }],
    }, "Puffy en casa.");
    const data = {
      ...createEmptyCineNodeData(),
      characters: analysis.characters as CineCharacter[],
      backgrounds: analysis.backgrounds as CineBackground[],
      scenes: analysis.scenes as CineScene[],
    };
    const scene = data.scenes[0]!;
    const session: CineImageStudioSession = {
      cineNodeId: "cine_1",
      nanoNodeId: "nano_1",
      kind: "frame",
      sceneId: scene.id,
      frameRole: "single",
      prompt: "Create a cinematic frame.",
      returnTab: "storyboard",
      returnSceneId: scene.id,
      mode: "generate",
    };

    const next = applyCineImageStudioResult(data, session, { assetId: "asset://frame-1", mode: "generate" });

    expect(next.scenes[0]?.frames.single?.imageAssetId).toBe("asset://frame-1");
    expect(next.scenes[0]?.frames.single?.status).toBe("generated");
    expect(next.scenes[0]?.frames.single?.status).not.toBe("approved");
  });

  it("stores continuity sheets and uses them as frame references", () => {
    const data = createEmptyCineNodeData();
    data.characters = [
      { id: "puffy", name: "Puffy", role: "protagonist", description: "Golden dog", visualPrompt: "friendly golden dog", lockedTraits: [], generatedImageAssetId: "asset://puffy" },
      { id: "mateo", name: "Mateo", role: "secondary", description: "Young explorer", visualPrompt: "young explorer", lockedTraits: [], editedImageAssetId: "asset://mateo-edit" },
    ];
    data.backgrounds = [
      { id: "forest", name: "Sendero del bosque", type: "natural", description: "Forest path", visualPrompt: "forest path", generatedImageAssetId: "asset://forest" },
    ];
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Camino",
        sourceText: "",
        visualSummary: "They walk into the forest.",
        characters: ["puffy", "mateo"],
        backgroundId: "forest",
        shot: { shotType: "wide", durationSeconds: 5 },
        framesMode: "single",
        frames: {},
        status: "draft",
      },
    ];
    const sheetSession: CineImageStudioSession = {
      cineNodeId: "cine_1",
      nanoNodeId: "nano_1",
      kind: "character_sheet",
      prompt: buildCineCharacterSheetPrompt(data),
      returnTab: "reparto",
      mode: "generate",
    };

    const withSheet = applyCineImageStudioResult(data, sheetSession, { assetId: "asset://char-sheet", mode: "generate" });

    expect(getEffectiveCharacterSheetAsset(withSheet)).toBe("asset://char-sheet");
    expect(getCineFrameReferenceAssetIds(withSheet, "scene_1")).toEqual([
      "asset://char-sheet",
      "asset://puffy",
      "asset://mateo-edit",
      "asset://forest",
    ]);
  });
});
