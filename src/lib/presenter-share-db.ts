import fs from "fs";
import path from "path";
import type { PresenterShareRecord } from "./presenter-share-types";
import { runPresenterShareExclusive } from "./presenter-share-queue";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "presenter-shares.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readPresenterSharesSync(): PresenterShareRecord[] {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, "[]", "utf8");
    return [];
  }
  try {
    const data = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePresenterSharesSync(rows: PresenterShareRecord[]) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(rows, null, 2), "utf8");
}

export async function withPresenterShares<T>(fn: (rows: PresenterShareRecord[]) => Promise<T>): Promise<T> {
  return runPresenterShareExclusive(async () => {
    const rows = readPresenterSharesSync();
    return fn(rows);
  });
}

export function findShareByTokenSync(token: string): PresenterShareRecord | undefined {
  return readPresenterSharesSync().find((r) => r.token === token);
}
