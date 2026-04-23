import fs from "fs/promises";
import path from "path";
import { appendUsageLineToS3Queued, isUsageS3Enabled, readUsageLogFromS3 } from "@/lib/api-usage-s3";
import { USAGE_PERIOD_START_ISO } from "@/lib/usage-constants";
import { estimateGeminiUsd, estimateOpenAIUsd } from "@/lib/pricing-config";
import { auth } from "@/lib/auth";

export {
  estimateGeminiImageGenerationUsd,
  estimateGeminiUsd,
  estimateOpenAIUsd,
} from "@/lib/pricing-config";

export const DEFAULT_USAGE_SINCE_ISO = USAGE_PERIOD_START_ISO;

/** Filas fijas del panel: todas las APIs integradas en Foldder. */
export const USAGE_SERVICES = [
  { id: "gemini-nano", label: "Gemini · Nano Banana (imagen 3 Flash / Pro)" },
  { id: "gemini-veo", label: "Gemini · Veo 3.1 (vídeo)" },
  { id: "seedance-video", label: "Volcengine Ark · Seedance (vídeo)" },
  { id: "gemini-analyze", label: "Gemini · Análisis de áreas (2.5 Flash)" },
  { id: "gemini-search-verify", label: "Gemini · Verificación imágenes (búsqueda web)" },
  { id: "openai-assistant", label: "OpenAI · Asistente del lienzo (GPT-4o mini)" },
  { id: "openai-enhance", label: "OpenAI · Mejorar prompt (GPT-4o)" },
  { id: "openai-describe", label: "OpenAI · Describir imagen/vídeo (GPT-4o)" },
  { id: "grok-video", label: "xAI Grok · Vídeo (Imagine)" },
  { id: "runway-gen3", label: "Runway · Gen-3 Alpha Turbo" },
  { id: "replicate-bg", label: "Replicate · Quitar fondo" },
  { id: "replicate-vmatte", label: "Replicate · Video matte (RVM)" },
] as const;

export type UsageServiceId = (typeof USAGE_SERVICES)[number]["id"];

export type UsageProvider =
  | "gemini"
  | "openai"
  | "grok"
  | "runway"
  | "replicate"
  | "volcengine";

export type UsageRecordLine = {
  ts: string;
  provider: UsageProvider;
  userEmail?: string;
  /** Clave estable para agregación por fila del panel */
  serviceId?: UsageServiceId;
  route: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd: number;
  note?: string;
};

/** Local / servidor con disco persistente (mismo criterio que `spaces-db.json`). */
const USAGE_FILE_DATA = path.join(process.cwd(), "data", "api-usage.jsonl");
/** Vercel y muchos entornos serverless: solo `/tmp` es escribible. */
const USAGE_FILE_TMP = path.join("/tmp", "foldder-api-usage.jsonl");

function usageWritePaths(): string[] {
  if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return [USAGE_FILE_TMP, USAGE_FILE_DATA];
  }
  return [USAGE_FILE_DATA, USAGE_FILE_TMP];
}

function usageReadPaths(): string[] {
  return [USAGE_FILE_DATA, USAGE_FILE_TMP];
}

const SERVICE_IDS = new Set<string>(USAGE_SERVICES.map((s) => s.id));

function isUsageServiceId(id: string): id is UsageServiceId {
  return SERVICE_IDS.has(id);
}

/** Líneas antiguas sin `serviceId`: inferir desde ruta / proveedor. */
export function inferServiceIdFromRecord(r: UsageRecordLine): UsageServiceId {
  if (r.serviceId && isUsageServiceId(r.serviceId)) return r.serviceId;
  const routePath = r.route || "";
  if (routePath.includes("/gemini/generate")) return "gemini-nano";
  if (routePath.includes("/gemini/video")) return "gemini-veo";
  if (routePath.includes("/seedance/video")) return "seedance-video";
  if (routePath.includes("/analyze-areas")) return "gemini-analyze";
  if (routePath.includes("/assistant")) return "openai-assistant";
  if (routePath.includes("/enhance")) return "openai-enhance";
  if (routePath.includes("/describe")) return "openai-describe";
  if (routePath.includes("/grok/generate")) return "grok-video";
  if (routePath.includes("/runway/generate")) return "runway-gen3";
  if (routePath.includes("/video-matte")) return "replicate-vmatte";
  if (routePath.includes("/matte")) return "replicate-bg";
  if (r.provider === "gemini") return "gemini-nano";
  if (r.provider === "openai") return "openai-assistant";
  if (r.provider === "grok") return "grok-video";
  if (r.provider === "runway") return "runway-gen3";
  return "replicate-bg";
}

/**
 * Persiste un evento de uso (obligatorio para costes). Orden: S3 (cola + ETag) si hay credenciales,
 * más copia local en `data/` o `/tmp` como respaldo.
 */
export async function recordApiUsage(
  partial: Omit<UsageRecordLine, "ts" | "costUsd"> & { costUsd?: number } & { serviceId: UsageServiceId }
): Promise<void> {
  let costUsd = partial.costUsd;
  if (costUsd == null) {
    const it = partial.inputTokens ?? 0;
    const ot = partial.outputTokens ?? 0;
    if (partial.provider === "openai") {
      costUsd = estimateOpenAIUsd(partial.model, it, ot);
    } else if (partial.provider === "gemini") {
      costUsd = estimateGeminiUsd(partial.model, it, ot);
    } else {
      costUsd = 0;
    }
  }
  const line: UsageRecordLine = {
    ts: new Date().toISOString(),
    ...partial,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
  };
  const payload = JSON.stringify(line) + "\n";

  let s3Ok = false;
  if (isUsageS3Enabled()) {
    try {
      await appendUsageLineToS3Queued(payload);
      s3Ok = true;
    } catch (e) {
      console.error("[api-usage] fallo persistencia S3:", e);
    }
  }

  let localOk = false;
  let lastLocalErr: unknown;
  for (const file of usageWritePaths()) {
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, payload, "utf8");
      localOk = true;
      break;
    } catch (e) {
      lastLocalErr = e;
    }
  }

  if (!s3Ok && !localOk) {
    console.error(
      "[api-usage] CRITICAL: no se guardó el uso en S3 ni en disco. Revisa credenciales / permisos.",
      line,
      "último error local:",
      lastLocalErr
    );
  }
}

export async function resolveUsageUserEmailFromRequest(
  req: Request,
): Promise<string | undefined> {
  const devCode = req.headers.get("x-foldder-dev-passcode");
  if (process.env.NODE_ENV !== "production" && devCode === "6666") {
    return "dev-bypass@local.foldder";
  }
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  return email || undefined;
}

export type ServiceAgg = {
  id: UsageServiceId;
  label: string;
  calls: number;
  totalTokens: number;
  costUsd: number;
};

export async function aggregateUsageSince(sinceIso: string): Promise<{
  since: string;
  services: ServiceAgg[];
  totalCostUsd: number;
  totalTokens: number;
}> {
  const sinceMs = new Date(sinceIso).getTime();

  const byId: Record<UsageServiceId, ServiceAgg> = {} as Record<UsageServiceId, ServiceAgg>;
  for (const s of USAGE_SERVICES) {
    byId[s.id] = { id: s.id, label: s.label, calls: 0, totalTokens: 0, costUsd: 0 };
  }

  const lineSet = new Set<string>();

  if (isUsageS3Enabled()) {
    try {
      const s3 = await readUsageLogFromS3();
      for (const line of s3.split("\n")) {
        if (line.trim()) lineSet.add(line);
      }
    } catch (e) {
      console.error("[api-usage] lectura S3:", e);
    }
  }

  for (const file of usageReadPaths()) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split("\n")) {
        if (line.trim()) lineSet.add(line);
      }
    } catch {
      /* sin archivo */
    }
  }

  for (const line of lineSet) {
    try {
      const r = JSON.parse(line) as UsageRecordLine;
      if (new Date(r.ts).getTime() < sinceMs) continue;
      const sid = inferServiceIdFromRecord(r);
      if (!byId[sid]) continue;
      byId[sid].calls += 1;
      const tt =
        r.totalTokens ??
        (r.inputTokens != null || r.outputTokens != null
          ? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
          : 0);
      byId[sid].totalTokens += tt;
      byId[sid].costUsd += r.costUsd ?? 0;
    } catch {
      /* línea corrupta */
    }
  }

  const services = USAGE_SERVICES.map((s) => {
    const row = byId[s.id];
    return {
      ...row,
      costUsd: Math.round(row.costUsd * 1_000_000) / 1_000_000,
    };
  });

  let totalCostUsd = 0;
  let totalTokens = 0;
  for (const s of services) {
    totalCostUsd += s.costUsd;
    totalTokens += s.totalTokens;
  }

  return {
    since: sinceIso,
    services,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    totalTokens,
  };
}

export type UsageByService = {
  serviceId: UsageServiceId;
  label: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

export type UsageByUser = {
  userEmail: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

export type UsageByProviderModel = {
  provider: UsageProvider;
  model: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
};

export type UsageByDay = {
  day: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
  uniqueUsers: number;
};

export async function getUsageDeepReportSince(sinceIso: string): Promise<{
  since: string;
  totals: { calls: number; costUsd: number; totalTokens: number };
  byService: UsageByService[];
  byUser: UsageByUser[];
  byProviderModel: UsageByProviderModel[];
  byDay: UsageByDay[];
}> {
  const sinceMs = new Date(sinceIso).getTime();
  const lineSet = new Set<string>();

  if (isUsageS3Enabled()) {
    try {
      const s3 = await readUsageLogFromS3();
      for (const line of s3.split("\n")) if (line.trim()) lineSet.add(line);
    } catch (e) {
      console.error("[api-usage] deep report lectura S3:", e);
    }
  }

  for (const file of usageReadPaths()) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split("\n")) if (line.trim()) lineSet.add(line);
    } catch {
      /* ignore */
    }
  }

  const byService = new Map<UsageServiceId, UsageByService>();
  const byUser = new Map<string, UsageByUser>();
  const byProviderModel = new Map<string, UsageByProviderModel>();
  const byDay = new Map<
    string,
    { calls: number; costUsd: number; totalTokens: number; users: Set<string> }
  >();

  for (const s of USAGE_SERVICES) {
    byService.set(s.id, {
      serviceId: s.id,
      label: s.label,
      calls: 0,
      costUsd: 0,
      totalTokens: 0,
    });
  }

  let totalCalls = 0;
  let totalCost = 0;
  let totalTokens = 0;

  for (const line of lineSet) {
    try {
      const r = JSON.parse(line) as UsageRecordLine;
      const ts = new Date(r.ts).getTime();
      if (!Number.isFinite(ts) || ts < sinceMs) continue;
      const sid = inferServiceIdFromRecord(r);
      const cost = r.costUsd ?? 0;
      const tokens =
        r.totalTokens ??
        (r.inputTokens != null || r.outputTokens != null
          ? (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
          : 0);
      const userEmail = (r.userEmail || "unknown@unattributed").trim().toLowerCase();
      const provider = r.provider;
      const model = (r.model || "unknown").trim();
      const day = new Date(ts).toISOString().slice(0, 10);

      const svc = byService.get(sid);
      if (svc) {
        svc.calls += 1;
        svc.costUsd += cost;
        svc.totalTokens += tokens;
      }

      const u = byUser.get(userEmail) ?? {
        userEmail,
        calls: 0,
        costUsd: 0,
        totalTokens: 0,
      };
      u.calls += 1;
      u.costUsd += cost;
      u.totalTokens += tokens;
      byUser.set(userEmail, u);

      const pmKey = `${provider}::${model}`;
      const pm = byProviderModel.get(pmKey) ?? {
        provider,
        model,
        calls: 0,
        costUsd: 0,
        totalTokens: 0,
      };
      pm.calls += 1;
      pm.costUsd += cost;
      pm.totalTokens += tokens;
      byProviderModel.set(pmKey, pm);

      const d = byDay.get(day) ?? {
        calls: 0,
        costUsd: 0,
        totalTokens: 0,
        users: new Set<string>(),
      };
      d.calls += 1;
      d.costUsd += cost;
      d.totalTokens += tokens;
      d.users.add(userEmail);
      byDay.set(day, d);

      totalCalls += 1;
      totalCost += cost;
      totalTokens += tokens;
    } catch {
      /* corrupted line */
    }
  }

  const normMoney = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

  return {
    since: sinceIso,
    totals: {
      calls: totalCalls,
      costUsd: normMoney(totalCost),
      totalTokens,
    },
    byService: [...byService.values()]
      .map((r) => ({ ...r, costUsd: normMoney(r.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byUser: [...byUser.values()]
      .map((r) => ({ ...r, costUsd: normMoney(r.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byProviderModel: [...byProviderModel.values()]
      .map((r) => ({ ...r, costUsd: normMoney(r.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byDay: [...byDay.entries()]
      .map(([day, v]) => ({
        day,
        calls: v.calls,
        costUsd: normMoney(v.costUsd),
        totalTokens: v.totalTokens,
        uniqueUsers: v.users.size,
      }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export function parseGeminiUsageMetadata(data: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  const u = data.usageMetadata;
  if (!u) return null;
  const inputTokens = u.promptTokenCount ?? 0;
  const outputTokens = u.candidatesTokenCount ?? 0;
  const totalTokens = u.totalTokenCount ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
