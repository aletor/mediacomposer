import { describe, expect, it } from "vitest";

import {
  analyzeCineScript,
  approveCineFrame,
  applyCineImageStudioResult,
  buildCineCharacterSheetNegativePrompt,
  buildCineCharacterSheetPrompt,
  buildCineFramePrompt,
  buildCineLocationSheetNegativePrompt,
  buildCineLocationSheetPrompt,
  buildCineMediaListOutput,
  buildCineVisualDirectionPrompt,
  buildVideoPromptForScene,
  cleanScriptText,
  getCineFrameReferenceAssetIds,
  getEffectiveCharacterSheetAsset,
  getEffectiveCineFrameAsset,
  getEffectiveSceneVisualDirection,
  prepareSceneForVideo,
  validateAndNormalizeCineAIAnalysis,
} from "./cine-engine";
import { createEmptyCineNodeData, normalizeCineData, type CineBackground, type CineCharacter, type CineImageStudioSession, type CineScene } from "./cine-types";

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

  it("builds strict grid prompts for continuity sheets", () => {
    const data = createEmptyCineNodeData();
    data.characters = [
      { id: "puffy", name: "Puffy", role: "protagonist", description: "Golden dog", visualPrompt: "friendly golden dog", lockedTraits: [] },
      { id: "mateo", name: "Mateo", role: "secondary", description: "Young explorer", visualPrompt: "young explorer", lockedTraits: [] },
    ];
    data.backgrounds = [
      { id: "house", name: "Casa soleada", type: "exterior", description: "Village house", visualPrompt: "sunny village house" },
      { id: "forest", name: "Sendero del bosque", type: "natural", description: "Forest path", visualPrompt: "forest path" },
      { id: "pyramid", name: "Interior de la pirámide", type: "interior", description: "Ancient pyramid interior", visualPrompt: "dark ancient pyramid interior" },
    ];

    const characterPrompt = buildCineCharacterSheetPrompt(data);
    const locationPrompt = buildCineLocationSheetPrompt(data);
    const characterNegative = buildCineCharacterSheetNegativePrompt();
    const locationNegative = buildCineLocationSheetNegativePrompt();

    expect(characterPrompt).toContain("strict technical contact-sheet grid");
    expect(characterPrompt).toContain("visible neutral gutters");
    expect(characterPrompt).toContain("slightly wider vertical gutters between different characters");
    expect(characterPrompt).toContain("Do not place a large hero image");
    expect(locationPrompt).toContain("The canvas must be divided into equal clean rectangular cells");
    expect(locationPrompt).toContain("one location per cell");
    expect(locationPrompt).toContain("Do not blend, overlay, double expose, fade, stack or merge locations together");
    expect(characterNegative).toContain("images crossing cell boundaries");
    expect(characterNegative).toContain("large hero background");
    expect(locationNegative).toContain("overlapping panels");
    expect(locationNegative).toContain("overflowing architecture");
  });

  it("approves a Cine frame without deleting generated or edited assets", () => {
    const data = createEmptyCineNodeData();
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Frame test",
        sourceText: "",
        visualSummary: "A cinematic frame.",
        characters: [],
        shot: { shotType: "wide", durationSeconds: 5 },
        framesMode: "single",
        frames: {
          single: {
            id: "frame_1",
            role: "single",
            prompt: "Create a cinematic frame.",
            status: "edited",
            imageAssetId: "asset://generated",
            editedImageAssetId: "asset://edited",
            approvedImageAssetId: "asset://old-approved",
          },
        },
        status: "frame_generated",
      },
    ];

    const next = approveCineFrame(data, "scene_1", "single");
    const frame = next.scenes[0]?.frames.single;

    expect(frame?.approvedImageAssetId).toBe("asset://edited");
    expect(frame?.imageAssetId).toBe("asset://generated");
    expect(frame?.editedImageAssetId).toBe("asset://edited");
    expect(frame?.status).toBe("approved");
    expect(getEffectiveCineFrameAsset(frame)).toBe("asset://edited");
  });

  it("includes camera movement intent in frame and video prompts", () => {
    const data = createEmptyCineNodeData();
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Descubrimiento",
        sourceText: "Puffy detecta algo extraño.",
        visualSummary: "Puffy mira hacia una pirámide escondida.",
        visualNotes: "Claro del bosque con una pirámide antigua revelándose.",
        characters: [],
        shot: {
          shotType: "wide",
          cameraMovementType: "push_in",
          cameraDescription: "slow push-in towards Puffy and the pyramid",
          durationSeconds: 8,
        },
        framesMode: "single",
        frames: {},
        status: "draft",
      },
    ];

    const framePrompt = buildCineFramePrompt({ data, sceneId: "scene_1", frameRole: "single", cineNodeId: "cine_1" });
    const videoPrompt = buildVideoPromptForScene(data, "scene_1");

    expect(framePrompt).toContain("slow push-in towards Puffy and the pyramid");
    expect(framePrompt).toContain("Composition should suggest a slow push-in");
    expect(videoPrompt).toContain("Camera movement: Slow push-in camera movement toward the main subject.");
    expect(videoPrompt).toContain("Specific direction: slow push-in towards Puffy and the pyramid.");
  });

  it("prepares a V3 video plan with overlays, voiceover and references", () => {
    const data = createEmptyCineNodeData();
    data.continuity = {
      useCharacterSheetForFrames: true,
      useLocationSheetForFrames: true,
      characterSheet: {
        id: "sheet_char",
        cineNodeId: "cine_1",
        characterIds: ["puffy"],
        assetId: "asset://char-sheet",
        status: "ready",
        layout: "single",
        prompt: "sheet",
      },
      locationSheet: {
        id: "sheet_location",
        cineNodeId: "cine_1",
        backgroundIds: ["forest"],
        assetId: "asset://location-sheet",
        status: "ready",
        layout: "grid",
        prompt: "sheet",
      },
    };
    data.characters = [
      { id: "puffy", name: "Puffy", role: "protagonist", description: "Dog", visualPrompt: "golden dog", lockedTraits: [], approvedImageAssetId: "asset://puffy" },
    ];
    data.backgrounds = [
      { id: "forest", name: "Sendero del bosque", type: "natural", description: "Forest path", visualPrompt: "forest path", approvedImageAssetId: "asset://forest" },
    ];
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Camino",
        sourceText: "Puffy entra en el bosque.",
        visualSummary: "Puffy avanza por el sendero.",
        visualNotes: "Sendero del bosque con luz suave.",
        voiceOver: "Puffy sabe que algo está cerca.",
        onScreenText: ["Continuará"],
        characters: ["puffy"],
        backgroundId: "forest",
        shot: { shotType: "wide", cameraMovementType: "tracking_forward", durationSeconds: 6 },
        framesMode: "single",
        frames: {
          single: {
            id: "frame_1",
            role: "single",
            prompt: "frame",
            imageAssetId: "asset://frame",
            status: "generated",
          },
        },
        status: "frame_generated",
      },
    ];

    const plan = prepareSceneForVideo(data, "scene_1", "cine_1");

    expect(plan.status).toBe("prepared");
    expect(plan.mode).toBe("image_to_video");
    expect(plan.singleFrameAssetId).toBe("asset://frame");
    expect(plan.overlayTextPlan).toEqual({ texts: ["Continuará"], timingHint: "separate overlay after video generation", shouldRenderInVideo: false });
    expect(plan.voiceoverPlan?.text).toContain("Puffy sabe");
    expect(plan.referenceAssetIds).toEqual(["asset://char-sheet", "asset://location-sheet", "asset://puffy", "asset://forest", "asset://frame"]);
    expect(plan.prompt).toContain("Do not render any written text");
  });

  it("normalizes Cine visual direction defaults for old nodes", () => {
    const data = normalizeCineData({
      mode: "advertising",
      visualDirection: {
        aspectRatio: "9:16",
      },
    });

    expect(data.visualDirection.mode).toBe("advertising");
    expect(data.visualDirection.visualStyle).toBe("naturalistic_realistic");
    expect(data.visualDirection.colorGrading).toBe("film_emulation_kodak_fuji");
    expect(data.visualDirection.lightingStyle).toBe("normal");
  });

  it("uses visual direction and scene overrides in frame and video prompts", () => {
    const data = createEmptyCineNodeData();
    data.visualDirection = {
      ...data.visualDirection,
      mode: "fashion_film",
      visualStyle: "commercial_cinematic",
      colorGrading: "golden_hour_warm",
      lightingStyle: "bright",
      globalStylePrompt: "Elegant editorial pacing.",
    };
    data.scenes = [
      {
        id: "scene_noir",
        order: 1,
        title: "Recuerdo",
        sourceText: "Sara recuerda una pérdida.",
        visualSummary: "Sara quieta en un pasillo.",
        visualNotes: "Pasillo estrecho con sombras marcadas.",
        sceneKind: "memory",
        visualOverride: {
          visualStyle: "black_white_noir",
          colorGrading: "monochrome_color_cast",
          lightingStyle: "dark",
        },
        characters: [],
        shot: { shotType: "medium", durationSeconds: 6 },
        framesMode: "single",
        frames: {},
        status: "draft",
      },
    ];

    const effective = getEffectiveSceneVisualDirection(data, data.scenes[0]);
    const framePrompt = buildCineFramePrompt({ data, sceneId: "scene_noir", frameRole: "single", cineNodeId: "cine_1" });
    const videoPrompt = buildVideoPromptForScene(data, "scene_noir");

    expect(effective.visualStyle).toBe("black_white_noir");
    expect(buildCineVisualDirectionPrompt(effective)).toContain("Black and white noir");
    expect(framePrompt).toContain("This scene has its own visual direction override");
    expect(framePrompt).toContain("Black and white noir");
    expect(videoPrompt).toContain("This scene has its own visual direction override");
    expect(videoPrompt).toContain("Dark low-key lighting");
  });

  it("lets the local analyzer inherit Cine direction as fallback context", () => {
    const data = createEmptyCineNodeData();
    data.visualDirection = {
      ...data.visualDirection,
      mode: "documentary",
      visualStyle: "raw_documentary",
      colorGrading: "cool_blue_desaturated",
      lightingStyle: "dark",
    };

    const analysis = analyzeCineScript("Puffy camina por una calle de noche buscando una puerta.", {
      mode: data.visualDirection.mode,
      visualDirection: data.visualDirection,
    });

    expect(analysis.suggestedMode).toBe("documentary");
    expect(analysis.visualStyle).toContain("Raw documentary");
    expect(analysis.scenes[0]?.shot?.lighting).toContain("Dark low-key lighting");
    expect(analysis.scenes[0]?.shot?.mood).toContain("Documental crudo");
  });

  it("marks V3 video plans as missing_frames when storyboard assets are absent", () => {
    const data = createEmptyCineNodeData();
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Entrada",
        sourceText: "",
        visualSummary: "Entrada a la pirámide.",
        characters: [],
        shot: { shotType: "wide", durationSeconds: 5 },
        framesMode: "start_end",
        frames: {
          start: { id: "start", role: "start", prompt: "start", imageAssetId: "asset://start", status: "generated" },
        },
        status: "frame_generated",
      },
    ];

    const plan = prepareSceneForVideo(data, "scene_1", "cine_1");

    expect(plan.status).toBe("missing_frames");
    expect(plan.missingFrames).toEqual(["end"]);
    expect(plan.startFrameAssetId).toBe("asset://start");
    expect(plan.endFrameAssetId).toBeUndefined();
  });

  it("builds an empty media_list for a Cine node without script", () => {
    const output = buildCineMediaListOutput(createEmptyCineNodeData(), "cine_1");

    expect(output.kind).toBe("media_list");
    expect(output.sourceNodeId).toBe("cine_1");
    expect(output.status).toBe("empty");
    expect(output.items).toHaveLength(0);
  });

  it("builds storyboard placeholders when scenes exist without frames", () => {
    const data = createEmptyCineNodeData();
    data.manualScript = "Puffy sale de casa.";
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Casa",
        sourceText: "Puffy sale de casa.",
        visualSummary: "Casa soleada.",
        visualNotes: "Casa soleada en el pueblo.",
        voiceOver: "Empieza la aventura.",
        onScreenText: ["Puffy"],
        characters: ["puffy"],
        backgroundId: "house",
        shot: { shotType: "wide", cameraMovementType: "static_subtle", durationSeconds: 6 },
        framesMode: "single",
        frames: {},
        status: "draft",
      },
    ];

    const output = buildCineMediaListOutput(data, "cine_1");

    expect(output.status).toBe("storyboard_ready");
    expect(output.items).toHaveLength(1);
    expect(output.items[0]?.mediaType).toBe("placeholder");
    expect(output.items[0]?.role).toBe("storyboard_placeholder");
    expect(output.items[0]?.metadata?.onScreenText).toEqual(["Puffy"]);
  });

  it("builds a partial frames media_list with generated frames and missing placeholders", () => {
    const data = createEmptyCineNodeData();
    data.manualScript = "Dos escenas.";
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Casa",
        sourceText: "",
        visualSummary: "Casa soleada.",
        characters: [],
        shot: { shotType: "wide", durationSeconds: 6 },
        framesMode: "single",
        frames: { single: { id: "frame_1", role: "single", prompt: "frame", imageAssetId: "asset://frame-1", status: "generated" } },
        status: "frame_generated",
      },
      {
        id: "scene_2",
        order: 2,
        title: "Bosque",
        sourceText: "",
        visualSummary: "Bosque.",
        characters: [],
        shot: { shotType: "wide", durationSeconds: 5 },
        framesMode: "single",
        frames: {},
        status: "draft",
      },
    ];

    const output = buildCineMediaListOutput(data, "cine_1");

    expect(output.status).toBe("frames_partial");
    expect(output.items.some((item) => item.role === "storyboard_frame" && item.assetId === "asset://frame-1")).toBe(true);
    expect(output.items.some((item) => item.role === "storyboard_placeholder" && item.sceneId === "scene_2")).toBe(true);
  });

  it("prioritizes approved videos in media_list output", () => {
    const data = createEmptyCineNodeData();
    data.mediaListOutputConfig = {
      ...data.mediaListOutputConfig,
      includeOnlyApprovedVideos: true,
    };
    data.scenes = [
      {
        id: "scene_1",
        order: 1,
        title: "Casa",
        sourceText: "",
        visualSummary: "Casa soleada.",
        characters: [],
        shot: { shotType: "wide", durationSeconds: 6 },
        framesMode: "single",
        frames: { single: { id: "frame_1", role: "single", prompt: "frame", imageAssetId: "asset://frame-1", status: "generated" } },
        video: {
          sceneId: "scene_1",
          mode: "image_to_video",
          status: "generated",
          durationSeconds: 6,
          aspectRatio: "16:9",
          singleFrameAssetId: "asset://frame-1",
          prompt: "video",
          characters: [],
          referenceAssetIds: [],
          generatedVideoAssetId: "asset://video-generated",
          approvedVideoAssetId: "asset://video-approved",
        },
        status: "ready_for_video",
      },
    ];

    const output = buildCineMediaListOutput(data, "cine_1");

    expect(output.status).toBe("approved_ready");
    expect(output.items).toHaveLength(1);
    expect(output.items[0]?.role).toBe("approved_scene_video");
    expect(output.items[0]?.assetId).toBe("asset://video-approved");
  });
});
