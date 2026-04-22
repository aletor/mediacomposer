import { BudgetsClient, CreateBudgetCommand, DescribeBudgetCommand, UpdateBudgetCommand } from "@aws-sdk/client-budgets";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

const region = process.env.AWS_REGION?.trim() || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

const APP_SERVICES = [
  "Amazon Route 53",
  "Amazon Simple Storage Service",
  "Amazon DynamoDB",
  "AmazonCloudWatch",
  "AWS Lambda",
  "Amazon API Gateway",
];

function readArg(name: string): string | undefined {
  const idx = process.argv.findIndex((v) => v === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const amountUsd = Number(readArg("amount-usd") ?? "5.90");
  const budgetName = readArg("name") ?? "foldder-app-monthly-budget";

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`Invalid --amount-usd value: ${amountUsd}`);
  }

  const creds =
    accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        }
      : {};

  const sts = new STSClient({ region, ...creds });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  if (!accountId) throw new Error("Unable to resolve AWS account ID from STS");

  const budgets = new BudgetsClient({ region: "us-east-1", ...creds });

  const budget = {
    BudgetName: budgetName,
    BudgetType: "COST",
    TimeUnit: "MONTHLY",
    BudgetLimit: { Amount: amountUsd.toFixed(2), Unit: "USD" },
    CostFilters: {
      Service: APP_SERVICES,
    },
    CostTypes: {
      IncludeCredit: false,
      IncludeDiscount: true,
      IncludeOtherSubscription: true,
      IncludeRecurring: true,
      IncludeRefund: false,
      IncludeSubscription: true,
      IncludeSupport: true,
      IncludeTax: false,
      IncludeUpfront: true,
      UseAmortized: false,
      UseBlended: false,
    },
  } as const;

  let exists = false;
  try {
    await budgets.send(new DescribeBudgetCommand({ AccountId: accountId, BudgetName: budgetName }));
    exists = true;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name !== "NotFoundException") throw error;
  }

  if (exists) {
    await budgets.send(
      new UpdateBudgetCommand({
        AccountId: accountId,
        NewBudget: budget,
      }),
    );
    console.log(`[budget] updated "${budgetName}" to USD ${amountUsd.toFixed(2)}`);
  } else {
    await budgets.send(
      new CreateBudgetCommand({
        AccountId: accountId,
        Budget: budget,
      }),
    );
    console.log(`[budget] created "${budgetName}" at USD ${amountUsd.toFixed(2)}`);
  }

  console.log(`[budget] account: ${accountId}`);
  console.log(`[budget] services: ${APP_SERVICES.join(", ")}`);
}

main().catch((error) => {
  console.error("[budget] failed:", error);
  process.exitCode = 1;
});

