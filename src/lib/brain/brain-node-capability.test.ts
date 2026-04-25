import { describe, expect, it } from "vitest";
import { BRAIN_NODE_CAPABILITIES, getBrainNodeCapability } from "./brain-node-capability";

describe("BrainNodeCapability", () => {
  it("declara contexto y señales por cada BrainNodeType", () => {
    for (const cap of Object.values(BRAIN_NODE_CAPABILITIES)) {
      expect(cap.nodeType).toBeDefined();
      expect(cap.contextKeysAccepted.length).toBeGreaterThan(0);
      expect(cap.signalsEmitted.length).toBeGreaterThan(0);
    }
  });

  it("Designer y Photoroom difieren en señales y exports declarados", () => {
    const d = getBrainNodeCapability("DESIGNER");
    const p = getBrainNodeCapability("PHOTOROOM");
    expect(d.signalsEmitted).toContain("LAYOUT_FINALIZED");
    expect(p.signalsEmitted).not.toContain("LAYOUT_FINALIZED");
    expect(p.supportedExportKinds?.join(",")).toContain("png");
  });
});
