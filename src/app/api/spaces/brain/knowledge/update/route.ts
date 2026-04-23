import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildReadableCorporateContext } from "@/lib/brain-knowledge-utils";

type BrainDoc = {
  id: string;
  name: string;
  size: number;
  mime: string;
  s3Path?: string;
  type?: "document" | "image";
  format?: "pdf" | "docx" | "txt" | "url" | "image";
  status?: "Subido" | "Analizado" | "Error";
  uploadedAt?: string;
  extractedContext?: string;
  originalSourceUrl?: string;
  embedding?: number[];
  errorMessage?: string;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { id, context, documents } = (await req.json()) as {
      id?: string;
      context?: unknown;
      documents?: BrainDoc[];
    };

    if (!id || !context || !Array.isArray(documents)) {
      return NextResponse.json({ error: "Missing id, context or documents" }, { status: 400 });
    }

    const nextDocs = [...documents];
    const idx = nextDocs.findIndex((d) => d.id === id);
    if (idx === -1) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const contextString = typeof context === "string" ? context : JSON.stringify(context, null, 2);
    nextDocs[idx] = { ...nextDocs[idx], extractedContext: contextString, status: "Analizado", errorMessage: undefined };

    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: contextString,
      });
      nextDocs[idx].embedding = embeddingResponse.data[0]?.embedding;
    } catch (embErr) {
      console.error("[brain/knowledge/update] embedding failed:", embErr);
    }

    const corporateContext = buildReadableCorporateContext(nextDocs);
    return NextResponse.json({
      success: true,
      message: "Contexto actualizado correctamente",
      documents: nextDocs,
      corporateContext,
    });
  } catch (error) {
    console.error("[brain/knowledge/update]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

