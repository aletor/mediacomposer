import { NextRequest, NextResponse } from "next/server";
import { deleteFromS3 } from "@/lib/s3-utils";
import { auth } from "@/lib/auth";
import path from "path";
import { isDynamoEnabled } from "@/lib/dynamo-utils";
import { readJsonStore } from "@/lib/json-persistence";
import { collectS3KeysFromProjectSpaces } from "@/lib/s3-media-hydrate";
import {
  readAllDdbProjects as readAllDdbProjectsStore,
  type ProjectRecord,
} from "@/lib/spaces-dynamo-store";

const PREFIX = "knowledge-files/";
const SPACES_DDB_TABLE_ENV = "FOLDDER_SPACES_DDB_TABLE";

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

function normalizeOwnerEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function isSpacesDdbEnabled(): boolean {
  return isDynamoEnabled(SPACES_DDB_TABLE_ENV);
}

function spacesTableName(): string {
  return process.env[SPACES_DDB_TABLE_ENV]?.trim() || "";
}

async function readProjects(): Promise<ProjectRecord[]> {
  if (isSpacesDdbEnabled()) {
    return readAllDdbProjectsStore(spacesTableName());
  }
  return readJsonStore(spacesStore);
}

/**
 * Borra objetos en S3 por clave (solo prefijo permitido).
 * Usado al eliminar nodos/proyectos o al sustituir un asset por uno nuevo.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const ownerEmail = normalizeOwnerEmail(session?.user?.email);
    if (!ownerEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { keys?: unknown };
    const raw = body.keys;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "keys must be an array" }, { status: 400 });
    }
    const candidateKeys = raw.filter(
      (k): k is string =>
        typeof k === "string" && k.startsWith(PREFIX) && !k.includes(".."),
    );
    if (candidateKeys.length === 0) {
      return NextResponse.json({ deleted: 0, skipped: raw.length });
    }

    const ownedProjects = (await readProjects()).filter(
      (p) => normalizeOwnerEmail(p.ownerUserEmail) === ownerEmail,
    );
    const allowed = new Set<string>();
    for (const project of ownedProjects) {
      for (const key of collectS3KeysFromProjectSpaces(project.spaces || {})) {
        allowed.add(key);
      }
    }

    const unique = [...new Set(candidateKeys)].filter((k) => allowed.has(k));
    if (unique.length === 0) {
      return NextResponse.json({ deleted: 0, skipped: candidateKeys.length });
    }

    let deleted = 0;
    const errors: string[] = [];
    for (const key of unique) {
      try {
        await deleteFromS3(key);
        deleted += 1;
      } catch (e) {
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return NextResponse.json({ deleted, requested: unique.length, errors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("[s3-delete]", e);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
