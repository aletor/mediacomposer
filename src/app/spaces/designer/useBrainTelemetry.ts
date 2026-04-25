"use client";

export {
  useBrainNodeTelemetry,
  type UseBrainNodeTelemetryOptions,
  type UseBrainNodeTelemetryResult,
} from "@/lib/brain/use-brain-node-telemetry";

export type { BrainNodeTelemetryApi } from "@/lib/brain/brain-telemetry";

/** @deprecated Use `useBrainNodeTelemetry` from `@/lib/brain/use-brain-node-telemetry`. */
export { useBrainNodeTelemetry as useBrainTelemetry } from "@/lib/brain/use-brain-node-telemetry";

export type UseBrainTelemetryResult = import("@/lib/brain/use-brain-node-telemetry").UseBrainNodeTelemetryResult;
