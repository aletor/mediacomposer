import path from "path";
import { readJsonStore, updateJsonStore } from "@/lib/json-persistence";
import { USAGE_SERVICES, type UsageServiceId } from "@/lib/api-usage";

export type ApiServiceControl = {
  id: UsageServiceId;
  label: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

type ControlsStore = {
  services: Record<string, ApiServiceControl>;
};

const controlsStoreConfig = {
  createEmpty: (): ControlsStore => ({ services: {} }),
  defaultS3Key: "foldder-meta/api-service-controls.json",
  localPath: path.join(process.cwd(), "data", "api-service-controls.json"),
  s3KeyEnv: "FOLDDER_API_CONTROLS_S3_KEY",
};

function nowIso(): string {
  return new Date().toISOString();
}

function defaultControl(serviceId: UsageServiceId): ApiServiceControl {
  const service = USAGE_SERVICES.find((s) => s.id === serviceId)!;
  return {
    id: service.id,
    label: service.label,
    enabled: true,
    updatedAt: nowIso(),
    updatedBy: "system-default",
  };
}

function normalizeControls(store: ControlsStore): Record<UsageServiceId, ApiServiceControl> {
  const out = {} as Record<UsageServiceId, ApiServiceControl>;
  for (const service of USAGE_SERVICES) {
    const existing = store.services[service.id];
    out[service.id] = existing
      ? { ...existing, id: service.id, label: service.label }
      : defaultControl(service.id);
  }
  return out;
}

export class ApiServiceDisabledError extends Error {
  constructor(
    public serviceId: UsageServiceId,
    public label: string,
  ) {
    super(`Service disabled: ${serviceId}`);
    this.name = "ApiServiceDisabledError";
  }
}

export async function getApiServiceControls(): Promise<Record<UsageServiceId, ApiServiceControl>> {
  const store = await readJsonStore(controlsStoreConfig);
  return normalizeControls(store);
}

export async function setApiServiceEnabled(
  serviceId: UsageServiceId,
  enabled: boolean,
  updatedBy: string,
): Promise<Record<UsageServiceId, ApiServiceControl>> {
  const next = await updateJsonStore(controlsStoreConfig, async (current) => {
    const normalized = normalizeControls(current);
    normalized[serviceId] = {
      ...normalized[serviceId],
      enabled,
      updatedAt: nowIso(),
      updatedBy,
    };
    return { services: normalized };
  });
  return normalizeControls(next);
}

export async function assertApiServiceEnabled(serviceId: UsageServiceId): Promise<void> {
  const controls = await getApiServiceControls();
  const row = controls[serviceId];
  if (!row?.enabled) {
    throw new ApiServiceDisabledError(serviceId, row?.label || serviceId);
  }
}

