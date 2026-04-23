import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbClient } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";

type SpaceNodeGraph = {
  createdAt?: string;
  edges?: unknown[];
  id: string;
  name: string;
  nodes?: unknown[];
  updatedAt?: string;
  [key: string]: unknown;
};

export type ProjectRecord = {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  rootSpaceId: string;
  spaces: Record<string, SpaceNodeGraph>;
  updatedAt: string;
};

export type ProjectListItem = {
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  rootSpaceId: string;
  spacesCount: number | null;
  updatedAt: string;
};

type SpacesMetaItem = {
  id: string;
  entityType: "project-meta";
  projectId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  name: string;
  ownerUserEmail?: string;
  ownerUserImage?: string | null;
  ownerUserName?: string | null;
  rootSpaceId: string;
  storageFormat: "chunks-v1";
  chunkCount: number;
  listPk?: string;
  listSk?: string;
  updatedAt: string;
};

type SpacesChunkItem = {
  id: string;
  entityType: "project-chunk";
  projectId: string;
  chunkIndex: number;
  chunkData: string;
  updatedAt: string;
};

type LegacyInlineProject = ProjectRecord & {
  entityType?: undefined;
};

const SPACES_CHUNK_CHAR_SIZE = 240_000;
const SPACES_LIST_PK = "PROJECTS";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isLegacyInlineProject(item: unknown): item is LegacyInlineProject {
  if (!isRecord(item)) return false;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.rootSpaceId === "string" &&
    isRecord(item.spaces)
  );
}

function isMetaItem(item: unknown): item is SpacesMetaItem {
  if (!isRecord(item)) return false;
  return item.entityType === "project-meta" && typeof item.projectId === "string";
}

function isChunkItem(item: unknown): item is SpacesChunkItem {
  if (!isRecord(item)) return false;
  return (
    item.entityType === "project-chunk" &&
    typeof item.projectId === "string" &&
    typeof item.chunkIndex === "number" &&
    typeof item.chunkData === "string"
  );
}

function splitBase64Chunks(base64: string): string[] {
  if (!base64) return [""];
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += SPACES_CHUNK_CHAR_SIZE) {
    chunks.push(base64.slice(i, i + SPACES_CHUNK_CHAR_SIZE));
  }
  return chunks;
}

function buildChunkKey(projectId: string, index: number): string {
  return `${projectId}#chunk#${index}`;
}

function buildListSortKey(updatedAt: string, projectId: string): string {
  return `${updatedAt}#${projectId}`;
}

function projectSortDesc(a: ProjectRecord, b: ProjectRecord): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function parseSpacesFromChunks(meta: SpacesMetaItem, chunks: SpacesChunkItem[]): Record<string, SpaceNodeGraph> {
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  if (ordered.length !== meta.chunkCount) {
    throw new Error(
      `[spaces-dynamo] chunk count mismatch for ${meta.projectId}. expected ${meta.chunkCount} got ${ordered.length}`,
    );
  }

  const joinedBase64 = ordered.map((c) => c.chunkData).join("");
  const spacesJson = Buffer.from(joinedBase64, "base64").toString("utf8");
  return JSON.parse(spacesJson) as Record<string, SpaceNodeGraph>;
}

async function scanAllItems(tableName: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    out.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

async function scanMetaItems(tableName: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "attribute_not_exists(#entityType) OR #entityType = :meta",
          ExpressionAttributeNames: {
            "#chunkCount": "chunkCount",
            "#createdAt": "createdAt",
            "#entityType": "entityType",
            "#metadata": "metadata",
            "#name": "name",
            "#ownerUserEmail": "ownerUserEmail",
            "#ownerUserImage": "ownerUserImage",
            "#ownerUserName": "ownerUserName",
            "#projectId": "projectId",
            "#rootSpaceId": "rootSpaceId",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":meta": "project-meta",
          },
          ProjectionExpression:
            "id, #projectId, #entityType, #name, #rootSpaceId, #metadata, #ownerUserEmail, #ownerUserName, #ownerUserImage, #createdAt, #updatedAt, #chunkCount",
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    out.push(...((response.Items ?? []) as Record<string, unknown>[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

async function scanChunksForProject(tableName: string, projectId: string): Promise<SpacesChunkItem[]> {
  const out: SpacesChunkItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "#entityType = :chunk AND #projectId = :projectId",
          ExpressionAttributeNames: {
            "#entityType": "entityType",
            "#projectId": "projectId",
          },
          ExpressionAttributeValues: {
            ":chunk": "project-chunk",
            ":projectId": projectId,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      ),
    );
    for (const item of response.Items ?? []) {
      if (isChunkItem(item)) out.push(item);
    }
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return out;
}

async function readMetaOrLegacy(tableName: string, id: string): Promise<SpacesMetaItem | LegacyInlineProject | null> {
  const response = await withDynamoRetry(() =>
    ddbClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id },
      }),
    ),
  );

  const item = response.Item;
  if (!item) return null;
  if (isMetaItem(item)) return item;
  if (isLegacyInlineProject(item)) return item;
  return null;
}

export async function readDdbProjectById(tableName: string, id: string): Promise<ProjectRecord | null> {
  const row = await readMetaOrLegacy(tableName, id);
  if (!row) return null;

  if (isLegacyInlineProject(row)) {
    return row;
  }

  const chunks = await scanChunksForProject(tableName, row.projectId);
  return {
    id: row.projectId,
    name: row.name,
    rootSpaceId: row.rootSpaceId,
    metadata: row.metadata ?? {},
    ownerUserEmail: row.ownerUserEmail,
    ownerUserName: row.ownerUserName,
    ownerUserImage: row.ownerUserImage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    spaces: parseSpacesFromChunks(row, chunks),
  };
}

export async function readAllDdbProjects(tableName: string): Promise<ProjectRecord[]> {
  const items = await scanAllItems(tableName);

  const projects: ProjectRecord[] = [];
  const metaByProjectId = new Map<string, SpacesMetaItem>();
  const chunksByProjectId = new Map<string, SpacesChunkItem[]>();

  for (const item of items) {
    if (isLegacyInlineProject(item)) {
      projects.push(item);
      continue;
    }
    if (isMetaItem(item)) {
      metaByProjectId.set(item.projectId, item);
      continue;
    }
    if (isChunkItem(item)) {
      const current = chunksByProjectId.get(item.projectId) ?? [];
      current.push(item);
      chunksByProjectId.set(item.projectId, current);
    }
  }

  for (const [projectId, meta] of metaByProjectId.entries()) {
    const chunks = chunksByProjectId.get(projectId) ?? [];
    try {
      projects.push({
        id: projectId,
        name: meta.name,
        rootSpaceId: meta.rootSpaceId,
        metadata: meta.metadata ?? {},
        ownerUserEmail: meta.ownerUserEmail,
        ownerUserName: meta.ownerUserName,
        ownerUserImage: meta.ownerUserImage,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        spaces: parseSpacesFromChunks(meta, chunks),
      });
    } catch (error) {
      console.error(`[spaces-dynamo] failed to rebuild project ${projectId}:`, error);
    }
  }

  return projects.sort(projectSortDesc);
}

export async function readAllDdbProjectsMeta(tableName: string): Promise<ProjectListItem[]> {
  const listGsi = process.env.FOLDDER_SPACES_DDB_LIST_GSI?.trim();
  const items = listGsi
    ? await (async () => {
        try {
          const out: Record<string, unknown>[] = [];
          let exclusiveStartKey: Record<string, unknown> | undefined;
          do {
            const response = await withDynamoRetry(() =>
              ddbClient.send(
                new QueryCommand({
                  TableName: tableName,
                  IndexName: listGsi,
                  KeyConditionExpression: "#listPk = :listPk",
                  ExpressionAttributeNames: {
                    "#chunkCount": "chunkCount",
                    "#createdAt": "createdAt",
                    "#entityType": "entityType",
                    "#listPk": "listPk",
                    "#metadata": "metadata",
                    "#name": "name",
                    "#ownerUserEmail": "ownerUserEmail",
                    "#ownerUserImage": "ownerUserImage",
                    "#ownerUserName": "ownerUserName",
                    "#projectId": "projectId",
                    "#rootSpaceId": "rootSpaceId",
                    "#updatedAt": "updatedAt",
                  },
                  ExpressionAttributeValues: {
                    ":listPk": SPACES_LIST_PK,
                  },
                  ProjectionExpression:
                    "id, #projectId, #entityType, #name, #rootSpaceId, #metadata, #ownerUserEmail, #ownerUserName, #ownerUserImage, #createdAt, #updatedAt, #chunkCount",
                  ScanIndexForward: false,
                  ExclusiveStartKey: exclusiveStartKey,
                }),
              ),
            );
            out.push(...((response.Items ?? []) as Record<string, unknown>[]));
            exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
          } while (exclusiveStartKey);
          if (out.length === 0) {
            return scanMetaItems(tableName);
          }
          return out;
        } catch (error) {
          console.error("[spaces-dynamo] readAllDdbProjectsMeta query failed, falling back to scan:", error);
          return scanMetaItems(tableName);
        }
      })()
    : await scanMetaItems(tableName);
  const projects: ProjectListItem[] = [];

  for (const item of items) {
    if (isMetaItem(item)) {
      projects.push({
        id: item.projectId,
        name: item.name,
        rootSpaceId: item.rootSpaceId,
        metadata: item.metadata ?? {},
        ownerUserEmail: item.ownerUserEmail,
        ownerUserName: item.ownerUserName,
        ownerUserImage: item.ownerUserImage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        spacesCount: null,
      });
      continue;
    }

    if (isLegacyInlineProject(item)) {
      projects.push({
        id: item.id,
        name: item.name,
        rootSpaceId: item.rootSpaceId,
        metadata: item.metadata ?? {},
        ownerUserEmail: item.ownerUserEmail,
        ownerUserName: item.ownerUserName,
        ownerUserImage: item.ownerUserImage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        spacesCount: Object.keys(item.spaces || {}).length,
      });
    }
  }

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertDdbProject(tableName: string, project: ProjectRecord): Promise<void> {
  const spacesJson = JSON.stringify(project.spaces || {});
  const spacesB64 = Buffer.from(spacesJson, "utf8").toString("base64");
  const chunks = splitBase64Chunks(spacesB64);

  const existing = await readMetaOrLegacy(tableName, project.id);
  const previousChunkCount = isMetaItem(existing) ? existing.chunkCount : 0;

  for (let i = 0; i < chunks.length; i++) {
    await ddbClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          id: buildChunkKey(project.id, i),
          entityType: "project-chunk",
          projectId: project.id,
          chunkIndex: i,
          chunkData: chunks[i],
          updatedAt: project.updatedAt,
        } as SpacesChunkItem,
      }),
    );
  }

  await ddbClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        id: project.id,
        entityType: "project-meta",
        projectId: project.id,
        createdAt: project.createdAt,
        listPk: SPACES_LIST_PK,
        listSk: buildListSortKey(project.updatedAt, project.id),
        metadata: project.metadata ?? {},
        name: project.name,
        ownerUserEmail: project.ownerUserEmail,
        ownerUserName: project.ownerUserName,
        ownerUserImage: project.ownerUserImage,
        rootSpaceId: project.rootSpaceId,
        storageFormat: "chunks-v1",
        chunkCount: chunks.length,
        updatedAt: project.updatedAt,
      } as SpacesMetaItem,
    }),
  );

  if (previousChunkCount > chunks.length) {
    for (let i = chunks.length; i < previousChunkCount; i++) {
      await ddbClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: buildChunkKey(project.id, i) },
        }),
      );
    }
  }
}

export async function deleteDdbProject(tableName: string, id: string): Promise<void> {
  const existing = await readMetaOrLegacy(tableName, id);
  if (isMetaItem(existing)) {
    for (let i = 0; i < existing.chunkCount; i++) {
      await ddbClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: buildChunkKey(id, i) },
        }),
      );
    }
  }

  await ddbClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id },
    }),
  );
}
