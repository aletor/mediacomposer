import fs from "fs/promises";
import path from "path";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient } from "../src/lib/dynamo-utils";
import { readJsonStore } from "../src/lib/json-persistence";
import type { PresenterShareRecord } from "../src/lib/presenter-share-types";
import { readDdbProjectById, upsertDdbProject } from "../src/lib/spaces-dynamo-store";

type SpaceNodeGraph = {
  id: string;
  name: string;
  [key: string]: unknown;
};

type ProjectRecord = {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  rootSpaceId: string;
  spaces: Record<string, SpaceNodeGraph>;
  updatedAt: string;
};

type CliOptions = {
  commit: boolean;
  overwrite: boolean;
  skipPresenter: boolean;
  skipSpaces: boolean;
};

const spacesStore = {
  createEmpty: (): ProjectRecord[] => [],
  defaultS3Key: "foldder-meta/spaces-db.json",
  localPath: path.join(process.cwd(), "data", "spaces-db.json"),
  s3KeyEnv: "FOLDDER_SPACES_DB_S3_KEY",
};

const presenterShareStore = {
  createEmpty: (): PresenterShareRecord[] => [],
  defaultS3Key: "foldder-meta/presenter-shares.json",
  localPath: path.join(process.cwd(), "data", "presenter-shares.json"),
  s3KeyEnv: "FOLDDER_PRESENTER_SHARES_S3_KEY",
};

function parseOptions(argv: string[]): CliOptions {
  const commit = argv.includes("--commit");
  const overwrite = argv.includes("--overwrite");
  const skipSpaces = argv.includes("--skip-spaces");
  const skipPresenter = argv.includes("--skip-presenter");
  return { commit, overwrite, skipSpaces, skipPresenter };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === "string" && o.id.length > 0;
}

function isPresenterShareRecord(value: unknown): value is PresenterShareRecord {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.token === "string" && o.token.length > 0;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function migrateProjects(
  tableName: string,
  projects: ProjectRecord[],
  options: CliOptions,
): Promise<void> {
  console.log(`[migrate] spaces: ${projects.length} records -> ${tableName}`);
  if (!options.commit) return;

  for (const row of projects) {
    if (!options.overwrite) {
      const existing = await readDdbProjectById(tableName, row.id);
      if (existing) {
        throw new Error(`[migrate] spaces row already exists and overwrite is disabled: ${row.id}`);
      }
    }

    await upsertDdbProject(tableName, row);
  }
}

async function migratePresenterShares(
  tableName: string,
  shares: PresenterShareRecord[],
  options: CliOptions,
): Promise<void> {
  console.log(`[migrate] presenter-shares: ${shares.length} records -> ${tableName}`);
  if (!options.commit) return;

  for (const row of shares) {
    await ddbClient.send(
      new PutCommand({
        TableName: tableName,
        Item: row,
        ...(options.overwrite
          ? {}
          : {
              ConditionExpression: "attribute_not_exists(#token)",
              ExpressionAttributeNames: { "#token": "token" },
            }),
      }),
    );
  }
}

async function readSources(): Promise<{ projects: ProjectRecord[]; shares: PresenterShareRecord[] }> {
  const hasLocalSpaces = await fileExists(spacesStore.localPath);
  const hasLocalShares = await fileExists(presenterShareStore.localPath);

  const projectsRaw = await readJsonStore(spacesStore);
  const sharesRaw = await readJsonStore(presenterShareStore);

  const projects = projectsRaw.filter(isProjectRecord);
  const shares = sharesRaw.filter(isPresenterShareRecord);

  console.log("[migrate] source resolution:");
  console.log(`  - spaces local file exists: ${hasLocalSpaces}`);
  console.log(`  - presenter local file exists: ${hasLocalShares}`);
  console.log("  - readJsonStore will use S3 first when AWS creds + bucket are configured");

  return { projects, shares };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const spacesTable = options.skipSpaces ? "" : requireEnv("FOLDDER_SPACES_DDB_TABLE");
  const sharesTable = options.skipPresenter ? "" : requireEnv("FOLDDER_PRESENTER_SHARES_DDB_TABLE");

  const { projects, shares } = await readSources();

  if (projects.length === 0 && shares.length === 0) {
    console.log("[migrate] no records found. Nothing to migrate.");
    return;
  }

  console.log("[migrate] mode:", options.commit ? "commit" : "dry-run");
  if (!options.commit) {
    console.log("[migrate] dry-run only. Re-run with --commit to write to DynamoDB.");
  }
  if (options.overwrite) {
    console.log("[migrate] overwrite enabled: existing items may be replaced.");
  }

  if (!options.skipSpaces) {
    await migrateProjects(spacesTable, projects, options);
  } else {
    console.log("[migrate] skipping spaces migration (--skip-spaces)");
  }

  if (!options.skipPresenter) {
    await migratePresenterShares(sharesTable, shares, options);
  } else {
    console.log("[migrate] skipping presenter-shares migration (--skip-presenter)");
  }

  console.log("[migrate] done");
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exitCode = 1;
});
