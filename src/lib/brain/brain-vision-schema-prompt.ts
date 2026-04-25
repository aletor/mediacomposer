/**
 * Instrucciones para que el modelo devuelva JSON válido frente a `parseVisionAnalysisJson`.
 * Español; campos en inglés para estabilidad del parser.
 */
export const BRAIN_VISION_JSON_SCHEMA_USER_PROMPT = `Analiza la imagen y responde con UN SOLO objeto JSON (sin markdown) con esta forma exacta de claves:
{
  "subject": ["objetos y elementos CONCRETOS visibles: muebles, dispositivos (portátil, tablet), papelería (bocetos, notas), materiales (madera, tela), fuentes de luz, arquitectura, etc."],
  "visualStyle": ["adjetivos de estética anclados a lo que se ve (p. ej. editorial cálida, documental doméstica); evita solo palabras vacías como «minimalista» o «lifestyle» sin sustento en la escena"],
  "mood": ["tono emocional"],
  "composition": ["plano, encuadre, disposición, profundidad"],
  "colorPalette": {
    "dominant": ["colores en texto (crema, beige, #hex si aplica)"],
    "secondary": ["opcional"],
    "temperature": "warm|neutral|cool",
    "saturation": "low|medium|high",
    "contrast": "texto breve"
  },
  "people": {
    "present": true|false,
    "description": "si hay personas, qué hacen y actitud",
    "attitude": ["opcional"],
    "pose": ["opcional"],
    "energy": ["opcional"],
    "relationToCamera": "opcional"
  },
  "clothingStyle": {
    "present": true|false,
    "style": ["ropa y nivel de formalidad"],
    "colors": ["tonos de vestuario"],
    "textures": ["opcional"],
    "formality": "casual|casual_premium|formal|technical|sport|mixed"
  },
  "graphicStyle": {
    "present": true|false,
    "typography": [],
    "shapes": [],
    "iconography": [],
    "layout": ["elementos gráficos o de superficie"],
    "texture": ["papel, madera, digital, etc."]
  },
  "brandSignals": ["lecturas de marca que sugiere la imagen"],
  "visualMessage": ["frases sobre mensaje visual (máx. 3)"],
  "possibleUse": ["moodboard","dirección de arte","Photoroom","Designer","campañas","artículos","generación de imágenes"],
  "classification": "PROJECT_VISUAL_REFERENCE|CORE_VISUAL_DNA|CONTEXTUAL_VISUAL_MEMORY|RAW_ASSET_ONLY",
  "confidence": 0.0-1.0,
  "reasoning": "1-3 frases sobre por qué clasificas así (en español)"
}

Reglas:
- subject DEBE incluir al menos 4 elementos concretos observables (sustantivos visibles). Prohibido rellenar subject solo con palabras genéricas («personas», «contexto», «espacio», «lifestyle», «calma») sin objetos o materiales identificables.
- En people.description, clothingStyle.style y graphicStyle.layout describe hechos visibles (postura, texturas de ropa, objetos sobre la mesa), no inferencias de marketing.
- subject, visualStyle, mood, composition y colorPalette.dominant no pueden ir vacíos.
- classification: usa CORE_VISUAL_DNA solo si la imagen define claramente identidad visual central; RAW_ASSET_ONLY si es casi solo logo aislado o recurso sin narrativa; CONTEXTUAL_VISUAL_MEMORY si es muy distinta a un moodboard de marca; en la mayoría de referencias de proyecto usa PROJECT_VISUAL_REFERENCE.
- confidence realista (0.45-0.9).
- Razonamiento breve en español citando 2–3 detalles concretos de la escena.`;
