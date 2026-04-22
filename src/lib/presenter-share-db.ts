import path from "path";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { PresenterShareRecord } from "./presenter-share-types";
import { ddbClient, isDynamoEnabled } from "./dynamo-utils";
import { withDynamoRetry } from "./dynamo-retry";
import { updateJsonStore, readJsonStore } from "./json-persistence";
import { runPresenterShareExclusive } from "./presenter-share-queue";

const presenterShareStore = {
  createEmpty: (): PresenterShareRecord[] => [],
  defaultS3Key: "foldder-meta/presenter-shares.json",
  localPath: path.join(process.cwd(), "data", "presenter-shares.json"),
  s3KeyEnv: "FOLDDER_PRESENTER_SHARES_S3_KEY",
};

const PRESENTER_SHARES_DDB_TABLE_ENV = "FOLDDER_PRESENTER_SHARES_DDB_TABLE";
const PRESENTER_SHARES_DDB_DECK_GSI_ENV = "FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI";

function isPresenterSharesDdbEnabled(): boolean {
  return isDynamoEnabled(PRESENTER_SHARES_DDB_TABLE_ENV);
}

function presenterSharesTableName(): string {
  return process.env[PRESENTER_SHARES_DDB_TABLE_ENV]?.trim() || "";
}

function presenterSharesDeckGsiName(): string {
  return process.env[PRESENTER_SHARES_DDB_DECK_GSI_ENV]?.trim() || "";
}

async function scanPresenterShares(
  params: {
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    FilterExpression?: string;
  } = {},
): Promise<PresenterShareRecord[]> {
  const tableName = presenterSharesTableName();
  const rows: PresenterShareRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
          ...params,
        }),
      ),
    );
    for (const item of (response.Items ?? []) as PresenterShareRecord[]) {
      rows.push(item);
    }
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPresenterShare(row: PresenterShareRecord): Promise<void> {
  if (!isPresenterSharesDdbEnabled()) {
    await withPresenterShares(async (rows) => {
      rows.push(row);
      await writePresenterShares(rows);
    });
    return;
  }

  const tableName = presenterSharesTableName();
  try {
    await ddbClient.send(
      new PutCommand({
        TableName: tableName,
        Item: row,
        ConditionExpression: "attribute_not_exists(#token)",
        ExpressionAttributeNames: { "#token": "token" },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new Error("Presenter share token collision");
    }
    throw error;
  }
}

export async function readPresenterShares(): Promise<PresenterShareRecord[]> {
  if (!isPresenterSharesDdbEnabled()) {
    return readJsonStore(presenterShareStore);
  }

  return scanPresenterShares();
}

export async function listPresenterShares(deckKey?: string): Promise<PresenterShareRecord[]> {
  if (!deckKey?.trim()) {
    return readPresenterShares();
  }

  if (!isPresenterSharesDdbEnabled()) {
    const rows = await readPresenterShares();
    return rows.filter((row) => row.deckKey === deckKey);
  }

  const tableName = presenterSharesTableName();
  const gsiName = presenterSharesDeckGsiName();
  if (gsiName) {
    const rows: PresenterShareRecord[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await withDynamoRetry(() =>
        ddbClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: gsiName,
            KeyConditionExpression: "#deckKey = :deckKey",
            ExpressionAttributeNames: { "#deckKey": "deckKey" },
            ExpressionAttributeValues: { ":deckKey": deckKey },
            ExclusiveStartKey: exclusiveStartKey,
          }),
        ),
      );
      rows.push(...((response.Items ?? []) as PresenterShareRecord[]));
      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return scanPresenterShares({
    FilterExpression: "#deckKey = :deckKey",
    ExpressionAttributeNames: { "#deckKey": "deckKey" },
    ExpressionAttributeValues: { ":deckKey": deckKey },
  });
}

export async function writePresenterShares(rows: PresenterShareRecord[]): Promise<void> {
  if (isPresenterSharesDdbEnabled()) {
    throw new Error("writePresenterShares is not supported with DynamoDB enabled");
  }
  await updateJsonStore(presenterShareStore, async () => rows);
}

export async function withPresenterShares<T>(
  fn: (rows: PresenterShareRecord[]) => Promise<T>,
): Promise<T> {
  if (isPresenterSharesDdbEnabled()) {
    throw new Error("withPresenterShares is not supported with DynamoDB enabled");
  }

  return runPresenterShareExclusive(async () => {
    const rows = await readJsonStore(presenterShareStore);
    return fn(rows);
  });
}

export async function findShareByToken(token: string): Promise<PresenterShareRecord | undefined> {
  if (isPresenterSharesDdbEnabled()) {
    const tableName = presenterSharesTableName();
    const response = await withDynamoRetry(() =>
      ddbClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { token },
        }),
      ),
    );
    return response.Item as PresenterShareRecord | undefined;
  }

  const rows = await readPresenterShares();
  return rows.find((row) => row.token === token);
}

export async function incrementPresenterShareVisits(token: string): Promise<number | null> {
  if (!isPresenterSharesDdbEnabled()) {
    let visits = 0;
    let found = false;
    await withPresenterShares(async (rows) => {
      const i = rows.findIndex((r) => r.token === token);
      if (i === -1) return;
      found = true;
      rows[i] = { ...rows[i], visits: rows[i].visits + 1 };
      visits = rows[i].visits;
      await writePresenterShares(rows);
    });
    return found ? visits : null;
  }

  const tableName = presenterSharesTableName();
  const response = await ddbClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { token },
      UpdateExpression: "SET #visits = if_not_exists(#visits, :zero) + :inc",
      ExpressionAttributeNames: {
        "#token": "token",
        "#visits": "visits",
      },
      ExpressionAttributeValues: {
        ":zero": 0,
        ":inc": 1,
      },
      ConditionExpression: "attribute_exists(#token)",
      ReturnValues: "UPDATED_NEW",
    }),
  ).catch((error) => {
    if (error instanceof ConditionalCheckFailedException) return null;
    throw error;
  });

  if (!response) return null;
  const value = (response.Attributes as { visits?: number } | undefined)?.visits;
  return typeof value === "number" ? value : 0;
}
