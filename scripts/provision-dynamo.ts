import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION?.trim() || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

const spacesTable = process.env.FOLDDER_SPACES_DDB_TABLE?.trim() || "foldder-prod-spaces";
const spacesListGsi =
  process.env.FOLDDER_SPACES_DDB_LIST_GSI?.trim() || "listPk-listSk-index";
const sharesTable =
  process.env.FOLDDER_PRESENTER_SHARES_DDB_TABLE?.trim() || "foldder-prod-presenter-shares";
const sharesDeckGsi =
  process.env.FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI?.trim() || "deckKey-createdAt-index";

const client = new DynamoDBClient({
  region,
  ...(accessKeyId && secretAccessKey
    ? {
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      }
    : {}),
});

async function ensureTable(params: {
  tableName: string;
  create: () => Promise<void>;
}): Promise<void> {
  try {
    const d = await client.send(new DescribeTableCommand({ TableName: params.tableName }));
    const status = d.Table?.TableStatus || "UNKNOWN";
    console.log(`[provision] table exists: ${params.tableName} (${status})`);
    return;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name !== "ResourceNotFoundException") throw error;
  }

  console.log(`[provision] creating table: ${params.tableName}`);
  await params.create();
  await waitUntilTableExists(
    { client, maxWaitTime: 180 },
    { TableName: params.tableName },
  );
  console.log(`[provision] table ready: ${params.tableName}`);
}

async function ensureSpacesTable(): Promise<void> {
  await ensureTable({
    tableName: spacesTable,
    create: async () => {
      await client.send(
        new CreateTableCommand({
          TableName: spacesTable,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      );
    },
  });

  const describe = await client.send(new DescribeTableCommand({ TableName: spacesTable }));
  const currentGsis = describe.Table?.GlobalSecondaryIndexes ?? [];
  const hasListGsi = currentGsis.some((gsi) => gsi.IndexName === spacesListGsi);

  if (!hasListGsi) {
    console.log(`[provision] adding spaces list GSI: ${spacesListGsi}`);
    await client.send(
      new UpdateTableCommand({
        TableName: spacesTable,
        AttributeDefinitions: [
          { AttributeName: "listPk", AttributeType: "S" },
          { AttributeName: "listSk", AttributeType: "S" },
        ],
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: spacesListGsi,
              KeySchema: [
                { AttributeName: "listPk", KeyType: "HASH" },
                { AttributeName: "listSk", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          },
        ],
      }),
    );

    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const d = await client.send(new DescribeTableCommand({ TableName: spacesTable }));
      const gsi = d.Table?.GlobalSecondaryIndexes?.find((x) => x.IndexName === spacesListGsi);
      const status = gsi?.IndexStatus ?? "UNKNOWN";
      if (status === "ACTIVE") break;
      console.log(`[provision] waiting for spaces list GSI (${spacesListGsi}) status=${status}`);
    }
    console.log(`[provision] spaces list GSI ready: ${spacesListGsi}`);
  } else {
    console.log(`[provision] spaces list GSI exists: ${spacesListGsi}`);
  }
}

async function ensureSharesTable(): Promise<void> {
  await ensureTable({
    tableName: sharesTable,
    create: async () => {
      await client.send(
        new CreateTableCommand({
          TableName: sharesTable,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "token", AttributeType: "S" },
            { AttributeName: "deckKey", AttributeType: "S" },
            { AttributeName: "createdAt", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "token", KeyType: "HASH" }],
          GlobalSecondaryIndexes: [
            {
              IndexName: sharesDeckGsi,
              KeySchema: [
                { AttributeName: "deckKey", KeyType: "HASH" },
                { AttributeName: "createdAt", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
        }),
      );
    },
  });
}

async function main(): Promise<void> {
  console.log(`[provision] region: ${region}`);
  console.log(`[provision] spaces table: ${spacesTable}`);
  console.log(`[provision] spaces list GSI: ${spacesListGsi}`);
  console.log(`[provision] presenter table: ${sharesTable}`);
  console.log(`[provision] presenter GSI: ${sharesDeckGsi}`);

  await ensureSpacesTable();
  await ensureSharesTable();

  console.log("[provision] done");
  console.log(`[provision] export FOLDDER_SPACES_DDB_TABLE=${spacesTable}`);
  console.log(`[provision] export FOLDDER_SPACES_DDB_LIST_GSI=${spacesListGsi}`);
  console.log(`[provision] export FOLDDER_PRESENTER_SHARES_DDB_TABLE=${sharesTable}`);
  console.log(`[provision] export FOLDDER_PRESENTER_SHARES_DDB_DECK_GSI=${sharesDeckGsi}`);
}

main().catch((error) => {
  console.error("[provision] failed:", error);
  process.exitCode = 1;
});
