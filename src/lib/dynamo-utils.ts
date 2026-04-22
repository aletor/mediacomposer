import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const AWS_REGION = process.env.AWS_REGION?.trim() || "us-east-1";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

const baseClient = new DynamoDBClient({
  region: AWS_REGION,
  ...(accessKeyId && secretAccessKey
    ? {
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      }
    : {}),
});

export const ddbClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export function isDynamoEnabled(tableEnvVar: string): boolean {
  const tableName = process.env[tableEnvVar]?.trim();
  if (!tableName) return false;
  if (process.env.FOLDDER_DDB_DISABLE === "1") return false;
  return true;
}
