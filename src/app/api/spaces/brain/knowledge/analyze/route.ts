import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getFromS3 } from "@/lib/s3-utils";
import { parseBrainDocument } from "@/lib/brain-parser-utils";
import {
  buildReadableCorporateContext,
  extractDnaFromImageRobust,
  extractDnaFromTextRobust,
} from "@/lib/brain-knowledge-utils";
import {
  AUDIENCE_PERSONA_CATALOG,
  type BrainFactEvidence,
  type BrainFunnelMessage,
  type BrainMessageBlueprint,
  type BrainPersona,
  type BrainStrategy,
  type BrainVoiceExample,
} from "@/app/spaces/project-assets-metadata";

type BrainDoc = {
  id: string;
  name: string;
  size: number;
  mime: string;
  scope?: "core" | "context";
  s3Path?: string;
  type?: "document" | "image";
  format?: "pdf" | "docx" | "txt" | "html" | "url" | "image";
  status?: "Subido" | "Analizado" | "Error";
  uploadedAt?: string;
  extractedContext?: string;
  originalSourceUrl?: string;
  embedding?: number[];
  errorMessage?: string;
  insights?: {
    claims: string[];
    metrics: string[];
    potentialUse: string[];
    freshness: string;
    reliability: number;
    usedInPieces: string[];
  };
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type StrategyAutofill = {
  voiceExamples: BrainVoiceExample[];
  tabooPhrases: string[];
  approvedPhrases: string[];
  languageTraits: string[];
  syntaxPatterns: string[];
  preferredTerms: string[];
  forbiddenTerms: string[];
  channelIntensity: Array<{ channel: string; intensity: number }>;
  allowAbsoluteClaims: boolean;
  funnelMessages: BrainFunnelMessage[];
  messageBlueprints: BrainMessageBlueprint[];
  factsAndEvidence: BrainFactEvidence[];
  personaIds: string[];
};

const FUNNEL_STAGES: BrainFunnelMessage["stage"][] = [
  "awareness",
  "consideration",
  "conversion",
  "retention",
];

function cleanText(input: unknown, max = 260): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeVoiceExamples(raw: unknown): BrainVoiceExample[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainVoiceExample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const kind =
      x.kind === "approved_voice" ||
      x.kind === "forbidden_voice" ||
      x.kind === "good_piece" ||
      x.kind === "bad_piece"
        ? x.kind
        : "approved_voice";
    const text = cleanText(x.text, 420);
    if (!text) continue;
    out.push({
      id: crypto.randomUUID(),
      kind,
      label: cleanText(x.label, 60) || undefined,
      text,
    });
    if (out.length >= 18) break;
  }
  return out;
}

function sanitizeMessages(raw: unknown): BrainFunnelMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainFunnelMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const stage = FUNNEL_STAGES.includes(x.stage as BrainFunnelMessage["stage"])
      ? (x.stage as BrainFunnelMessage["stage"])
      : "awareness";
    const text = cleanText(x.text, 260);
    if (!text) continue;
    out.push({ id: crypto.randomUUID(), stage, text });
    if (out.length >= 16) break;
  }
  return out;
}

function uniqueStrings(values: string[], limit = 24): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = cleanText(value, 180);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function parseExtractedContext(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readStringArray(obj: Record<string, unknown> | null, key: string): string[] {
  if (!obj) return [];
  const value = obj[key];
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string").map((x) => cleanText(x, 220)).filter(Boolean)
    : [];
}

function freshnessLabel(uploadedAt?: string): string {
  if (!uploadedAt) return "sin fecha";
  const ts = Date.parse(uploadedAt);
  if (!Number.isFinite(ts)) return "sin fecha";
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 30) return "reciente";
  if (days <= 180) return "vigente";
  return "desactualizable";
}

function reliabilityScore(doc: BrainDoc, metricsCount: number): number {
  let score = 45;
  if (doc.scope !== "context") score += 20;
  if (doc.originalSourceUrl) score += 8;
  if (doc.status === "Analizado") score += 12;
  score += Math.min(15, metricsCount * 2);
  return Math.max(0, Math.min(100, score));
}

function inferPotentialUse(claims: string[], metrics: string[], scope?: "core" | "context"): string[] {
  const out: string[] = [];
  if (claims.length > 0) out.push("Narrativa de propuesta de valor");
  if (metrics.length > 0) out.push("Prueba numérica para claims");
  if (scope === "context") out.push("Benchmark de mercado y competencia");
  if (claims.some((c) => /funnel|conversion|retencion|awareness/i.test(c))) out.push("Mensajes por etapa de funnel");
  return uniqueStrings(out, 4);
}

function buildDocInsights(doc: BrainDoc, extractedData: Record<string, unknown>): BrainDoc["insights"] {
  const empresa = extractedData.empresa && typeof extractedData.empresa === "object"
    ? (extractedData.empresa as Record<string, unknown>)
    : null;
  const producto = extractedData.producto && typeof extractedData.producto === "object"
    ? (extractedData.producto as Record<string, unknown>)
    : null;
  const dataNumerica = Array.isArray(extractedData.data_relevante_numerica)
    ? extractedData.data_relevante_numerica.filter((x): x is string => typeof x === "string")
    : [];

  const claims = uniqueStrings(
    [
      cleanText(empresa?.propuesta_valor, 220),
      cleanText(extractedData.diferencial_competitivo, 220),
      ...readStringArray(empresa, "diferenciadores"),
      ...readStringArray(producto, "beneficios"),
    ].filter(Boolean) as string[],
    8,
  );
  const metrics = uniqueStrings(dataNumerica, 10);
  return {
    claims,
    metrics,
    potentialUse: inferPotentialUse(claims, metrics, doc.scope),
    freshness: freshnessLabel(doc.uploadedAt),
    reliability: reliabilityScore(doc, metrics.length),
    usedInPieces: [],
  };
}

function computeFactsAndEvidence(docs: BrainDoc[]): BrainFactEvidence[] {
  const facts: BrainFactEvidence[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    if (doc.status !== "Analizado" || typeof doc.extractedContext !== "string") continue;
    const parsed = parseExtractedContext(doc.extractedContext);
    if (!parsed) continue;

    const claims = [
      ...(doc.insights?.claims || []),
      ...readStringArray(parsed.empresa && typeof parsed.empresa === "object" ? (parsed.empresa as Record<string, unknown>) : null, "diferenciadores"),
      cleanText(parsed.diferencial_competitivo, 220),
      cleanText(parsed.empresa && typeof parsed.empresa === "object" ? (parsed.empresa as Record<string, unknown>).propuesta_valor : "", 220),
    ].filter(Boolean) as string[];
    const evidence = [
      ...(doc.insights?.metrics || []),
      ...readStringArray(parsed, "data_relevante_numerica"),
    ];

    for (const claim of uniqueStrings(claims, 12)) {
      const key = claim.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const hasEvidence = evidence.length > 0;
      const strength: BrainFactEvidence["strength"] = hasEvidence
        ? evidence.some((e) => /\d/.test(e))
          ? "fuerte"
          : "media"
        : "debil";
      facts.push({
        id: crypto.randomUUID(),
        claim,
        evidence: uniqueStrings(evidence, 4),
        sourceDocIds: [doc.id],
        strength,
        verified: hasEvidence,
        interpreted: !hasEvidence,
      });
      if (facts.length >= 60) return facts;
    }
  }
  return facts;
}

function sanitizeBlueprints(raw: unknown): BrainMessageBlueprint[] {
  if (!Array.isArray(raw)) return [];
  const out: BrainMessageBlueprint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const claim = cleanText(x.claim, 220);
    if (!claim) continue;
    out.push({
      id: crypto.randomUUID(),
      claim,
      support: cleanText(x.support, 220),
      audience: cleanText(x.audience, 120),
      channel: cleanText(x.channel, 80),
      stage:
        x.stage === "awareness" ||
        x.stage === "consideration" ||
        x.stage === "conversion" ||
        x.stage === "retention"
          ? x.stage
          : "awareness",
      cta: cleanText(x.cta, 120),
      evidence: Array.isArray(x.evidence)
        ? x.evidence.filter((y): y is string => typeof y === "string").map((y) => cleanText(y, 180)).filter(Boolean)
        : [],
    });
    if (out.length >= 30) break;
  }
  return out;
}

function tokenSet(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 4),
  );
}

function selectPersonaIdsFallback(docs: BrainDoc[]): string[] {
  const context = docs
    .filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string")
    .map((d) => `${d.name} ${d.extractedContext || ""}`)
    .join(" ");
  const ctxTokens = tokenSet(context);

  const scored = AUDIENCE_PERSONA_CATALOG.map((persona) => {
    const pTokens = tokenSet(
      [persona.name, persona.pain, persona.channel, persona.sophistication, ...persona.tags].join(" "),
    );
    let hits = 0;
    pTokens.forEach((t) => {
      if (ctxTokens.has(t)) hits += 1;
    });
    return { id: persona.id, score: hits };
  }).sort((a, b) => b.score - a.score);

  const picked = scored.filter((x) => x.score > 0).slice(0, 6).map((x) => x.id);
  if (picked.length >= 3) return picked;
  return [
    "persona-creative-director-ad",
    "persona-filmmaker-indie",
    "persona-marketing-manager-smb",
    "persona-b2b-demand-gen-manager",
  ];
}

function normalizePersonaIds(raw: unknown, docs: BrainDoc[]): string[] {
  const validIds = new Set(AUDIENCE_PERSONA_CATALOG.map((p) => p.id));
  if (!Array.isArray(raw)) return selectPersonaIdsFallback(docs);
  const ids = raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => validIds.has(x));
  return ids.length > 0 ? [...new Set(ids)].slice(0, 8) : selectPersonaIdsFallback(docs);
}

async function buildAutofillStrategy(docs: BrainDoc[]): Promise<StrategyAutofill> {
  const analyzed = docs.filter((d) => d.status === "Analizado" && typeof d.extractedContext === "string");
  if (analyzed.length === 0) {
    return {
      voiceExamples: [],
      tabooPhrases: [],
      approvedPhrases: [],
      languageTraits: [],
      syntaxPatterns: [],
      preferredTerms: [],
      forbiddenTerms: [],
      channelIntensity: [],
      allowAbsoluteClaims: false,
      funnelMessages: [],
      messageBlueprints: [],
      factsAndEvidence: computeFactsAndEvidence(docs),
      personaIds: selectPersonaIdsFallback(docs),
    };
  }

  const coreContext = analyzed
    .filter((d) => d.scope !== "context")
    .slice(0, 8)
    .map((d) => `### CORE: ${d.name}\n${(d.extractedContext || "").slice(0, 2800)}`)
    .join("\n\n");

  const marketContext = analyzed
    .filter((d) => d.scope === "context")
    .slice(0, 6)
    .map((d) => `### CONTEXTO: ${d.name}\n${(d.extractedContext || "").slice(0, 2400)}`)
    .join("\n\n");

  const catalogForPrompt = AUDIENCE_PERSONA_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    pain: p.pain,
    channel: p.channel,
    sophistication: p.sophistication,
    tags: p.tags,
  }));

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Eres estratega de marca. Debes autocompletar VOZ, PERSONAS y MENSAJES tras analizar documentos. Devuelve SOLO JSON con este shape: {\"voiceExamples\":[{\"kind\":\"approved_voice|forbidden_voice|good_piece|bad_piece\",\"label\":\"string\",\"text\":\"string\"}],\"tabooPhrases\":[\"string\"],\"approvedPhrases\":[\"string\"],\"languageTraits\":[\"string\"],\"syntaxPatterns\":[\"string\"],\"preferredTerms\":[\"string\"],\"forbiddenTerms\":[\"string\"],\"channelIntensity\":[{\"channel\":\"string\",\"intensity\":0}],\"allowAbsoluteClaims\":false,\"funnelMessages\":[{\"stage\":\"awareness|consideration|conversion|retention\",\"text\":\"string\"}],\"messageBlueprints\":[{\"claim\":\"string\",\"support\":\"string\",\"audience\":\"string\",\"channel\":\"string\",\"stage\":\"awareness|consideration|conversion|retention\",\"cta\":\"string\",\"evidence\":[\"string\"]}],\"personaIds\":[\"string\"]}. Reglas: 1) El tono sale de CORE, no de CONTEXTO. 2) CONTEXTO solo aporta mercado/benchmark. 3) Si faltan datos, deja arrays vacíos, no inventes claims.",
        },
        {
          role: "user",
          content: `CATÁLOGO DE PERSONAS DISPONIBLES (usar IDs exactos):\n${JSON.stringify(catalogForPrompt, null, 2)}\n\nCONTEXTO CORE:\n${coreContext || "(sin core)"}\n\nCONTEXTO EXTERNO:\n${marketContext || "(sin contexto externo)"}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      voiceExamples: sanitizeVoiceExamples(parsed.voiceExamples),
      tabooPhrases: uniqueStrings(Array.isArray(parsed.tabooPhrases) ? (parsed.tabooPhrases as string[]) : [], 24),
      approvedPhrases: uniqueStrings(
        Array.isArray(parsed.approvedPhrases) ? (parsed.approvedPhrases as string[]) : [],
        24,
      ),
      languageTraits: uniqueStrings(
        Array.isArray(parsed.languageTraits) ? (parsed.languageTraits as string[]) : [],
        20,
      ),
      syntaxPatterns: uniqueStrings(
        Array.isArray(parsed.syntaxPatterns) ? (parsed.syntaxPatterns as string[]) : [],
        20,
      ),
      preferredTerms: uniqueStrings(
        Array.isArray(parsed.preferredTerms) ? (parsed.preferredTerms as string[]) : [],
        30,
      ),
      forbiddenTerms: uniqueStrings(
        Array.isArray(parsed.forbiddenTerms) ? (parsed.forbiddenTerms as string[]) : [],
        30,
      ),
      channelIntensity: Array.isArray(parsed.channelIntensity)
        ? (parsed.channelIntensity as Array<Record<string, unknown>>)
            .map((x) => ({
              channel: cleanText(x.channel, 80),
              intensity: typeof x.intensity === "number" ? Math.max(0, Math.min(100, x.intensity)) : 50,
            }))
            .filter((x) => x.channel)
            .slice(0, 12)
        : [],
      allowAbsoluteClaims: Boolean(parsed.allowAbsoluteClaims),
      funnelMessages: sanitizeMessages(parsed.funnelMessages),
      messageBlueprints: sanitizeBlueprints(parsed.messageBlueprints),
      factsAndEvidence: computeFactsAndEvidence(docs),
      personaIds: normalizePersonaIds(parsed.personaIds, docs),
    };
  } catch (error) {
    console.error("[brain/knowledge/analyze] strategy autofill failed, using fallback:", error);
    return {
      voiceExamples: [],
      tabooPhrases: [],
      approvedPhrases: [],
      languageTraits: [],
      syntaxPatterns: [],
      preferredTerms: [],
      forbiddenTerms: [],
      channelIntensity: [],
      allowAbsoluteClaims: false,
      funnelMessages: [],
      messageBlueprints: [],
      factsAndEvidence: computeFactsAndEvidence(docs),
      personaIds: selectPersonaIdsFallback(docs),
    };
  }
}

function mergeStrategy(existing: BrainStrategy | undefined, autofill: StrategyAutofill): BrainStrategy {
  const previous = existing || {
    voiceExamples: [],
    tabooPhrases: [],
    approvedPhrases: [],
    languageTraits: [],
    syntaxPatterns: [],
    preferredTerms: [],
    forbiddenTerms: [],
    channelIntensity: [],
    allowAbsoluteClaims: false,
    personas: [],
    funnelMessages: [],
    messageBlueprints: [],
    factsAndEvidence: [],
    generatedPieces: [],
    approvedPatterns: [],
    rejectedPatterns: [],
  };

  const catalogMap = new Map(AUDIENCE_PERSONA_CATALOG.map((p) => [p.id, p]));
  const selectedCatalog = autofill.personaIds
    .map((id) => catalogMap.get(id))
    .filter((x): x is BrainPersona => Boolean(x));
  const existingCustom = previous.personas.filter((p) => !catalogMap.has(p.id));

  const voiceByKey = new Map<string, BrainVoiceExample>();
  for (const item of [...autofill.voiceExamples, ...previous.voiceExamples]) {
    const key = `${item.kind}:${item.text.trim().toLowerCase()}`;
    if (!item.text.trim() || voiceByKey.has(key)) continue;
    voiceByKey.set(key, item);
  }

  const msgByKey = new Map<string, BrainFunnelMessage>();
  for (const item of [...autofill.funnelMessages, ...previous.funnelMessages]) {
    const key = `${item.stage}:${item.text.trim().toLowerCase()}`;
    if (!item.text.trim() || msgByKey.has(key)) continue;
    msgByKey.set(key, item);
  }

  const blueprintByKey = new Map<string, BrainMessageBlueprint>();
  for (const item of [...autofill.messageBlueprints, ...previous.messageBlueprints]) {
    const key = `${item.claim.trim().toLowerCase()}|${item.channel.trim().toLowerCase()}|${item.stage}`;
    if (!item.claim.trim() || blueprintByKey.has(key)) continue;
    blueprintByKey.set(key, item);
  }

  const factByKey = new Map<string, BrainFactEvidence>();
  for (const item of [...autofill.factsAndEvidence, ...previous.factsAndEvidence]) {
    const key = item.claim.trim().toLowerCase();
    if (!item.claim.trim() || factByKey.has(key)) continue;
    factByKey.set(key, item);
  }

  return {
    ...previous,
    voiceExamples: [...voiceByKey.values()].slice(0, 24),
    tabooPhrases: uniqueStrings([...autofill.tabooPhrases, ...previous.tabooPhrases], 30),
    approvedPhrases: uniqueStrings([...autofill.approvedPhrases, ...previous.approvedPhrases], 30),
    languageTraits: uniqueStrings([...autofill.languageTraits, ...previous.languageTraits], 20),
    syntaxPatterns: uniqueStrings([...autofill.syntaxPatterns, ...previous.syntaxPatterns], 20),
    preferredTerms: uniqueStrings([...autofill.preferredTerms, ...previous.preferredTerms], 30),
    forbiddenTerms: uniqueStrings([...autofill.forbiddenTerms, ...previous.forbiddenTerms], 30),
    channelIntensity: [...autofill.channelIntensity, ...previous.channelIntensity]
      .filter((x, i, arr) => arr.findIndex((y) => y.channel.toLowerCase() === x.channel.toLowerCase()) === i)
      .slice(0, 12),
    allowAbsoluteClaims: autofill.allowAbsoluteClaims || previous.allowAbsoluteClaims,
    personas: [...selectedCatalog, ...existingCustom].slice(0, 20),
    funnelMessages: [...msgByKey.values()].slice(0, 20),
    messageBlueprints: [...blueprintByKey.values()].slice(0, 40),
    factsAndEvidence: [...factByKey.values()].slice(0, 80),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { documents?: BrainDoc[]; strategy?: BrainStrategy };
    const docs = Array.isArray(body.documents) ? body.documents : [];
    const nextDocs = [...docs];

    const pendingIdx = nextDocs
      .map((doc, idx) => ({ doc, idx }))
      .filter(({ doc }) => doc.status === "Subido" || doc.status === "Error");

    if (pendingIdx.length === 0) {
      const autofill = await buildAutofillStrategy(nextDocs);
      const strategy = mergeStrategy(body.strategy, autofill);
      return NextResponse.json({
        message: "No pending documents to analyze.",
        documents: nextDocs,
        corporateContext: buildReadableCorporateContext(nextDocs),
        strategy,
      });
    }

    const analyzedDocIds: string[] = [];
    for (const { idx } of pendingIdx) {
      const doc = nextDocs[idx];
      try {
        if (!doc.s3Path) throw new Error("Missing s3Path for analysis");
        const fileBuffer = await getFromS3(doc.s3Path);

        let extractedData: Record<string, unknown>;
        if (doc.type === "image" || doc.format === "image" || doc.mime.startsWith("image/")) {
          const b64 = fileBuffer.toString("base64");
          extractedData = (await extractDnaFromImageRobust(
            openai,
            b64,
            doc.mime || "image/png",
          )) as Record<string, unknown>;
        } else {
          const textContent = await parseBrainDocument(fileBuffer, doc.s3Path, doc.mime || "");
          extractedData = (await extractDnaFromTextRobust(openai, textContent)) as Record<string, unknown>;
        }

        const extractedJsonString = JSON.stringify(extractedData, null, 2);
        let embedding: number[] | undefined;
        try {
          const embResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: extractedJsonString,
          });
          embedding = embResponse.data[0]?.embedding;
        } catch (embErr) {
          console.error(`[brain/knowledge/analyze] embedding failed for ${doc.id}:`, embErr);
        }

        nextDocs[idx] = {
          ...doc,
          status: "Analizado",
          extractedContext: extractedJsonString,
          insights: buildDocInsights(doc, extractedData),
          embedding,
          errorMessage: undefined,
        };
        analyzedDocIds.push(doc.id);
      } catch (docError) {
        nextDocs[idx] = {
          ...doc,
          status: "Error",
          errorMessage: docError instanceof Error ? docError.message : "Unknown analysis error",
        };
      }
    }

    const corporateContext = buildReadableCorporateContext(nextDocs);
    const autofill = await buildAutofillStrategy(nextDocs);
    const strategy = mergeStrategy(body.strategy, autofill);
    return NextResponse.json({
      message: `Analyzed ${analyzedDocIds.length} documents.`,
      analyzedDocIds,
      documents: nextDocs,
      corporateContext,
      strategy,
    });
  } catch (error) {
    console.error("[brain/knowledge/analyze]", error);
    return NextResponse.json({ error: "Failed to run analysis." }, { status: 500 });
  }
}
