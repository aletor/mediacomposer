import { describe, expect, it } from "vitest";
import { telemetryCountsToSummaryLine } from "./brain-telemetry-summary-format";

describe("telemetryCountsToSummaryLine", () => {
  it("devuelve null sin eventos", () => {
    expect(telemetryCountsToSummaryLine({})).toBeNull();
  });

  it("usa singular y plural en español", () => {
    expect(telemetryCountsToSummaryLine({ CONTENT_EXPORTED: 1 })).toBe("1 exportación");
    expect(telemetryCountsToSummaryLine({ CONTENT_EXPORTED: 2 })).toBe("2 exportaciones");
    expect(telemetryCountsToSummaryLine({ MANUAL_OVERRIDE: 1 })).toBe("1 texto manual");
    expect(telemetryCountsToSummaryLine({ MANUAL_OVERRIDE: 2 })).toBe("2 textos manuales");
    expect(telemetryCountsToSummaryLine({ SUGGESTION_ACCEPTED: 1 })).toBe("1 sugerencia aceptada");
    expect(telemetryCountsToSummaryLine({ SUGGESTION_SHOWN: 3 })).toBe("3 sugerencias mostradas");
    expect(telemetryCountsToSummaryLine({ IMAGE_USED: 3 })).toBe("3 imágenes usadas");
    expect(telemetryCountsToSummaryLine({ IMAGE_IMPORTED: 1 })).toBe("1 imagen importada");
    expect(telemetryCountsToSummaryLine({ IMAGE_IMPORTED: 2 })).toBe("2 imágenes importadas");
    expect(telemetryCountsToSummaryLine({ COLOR_USED: 4 })).toBe("4 colores usados");
    expect(telemetryCountsToSummaryLine({ STYLE_APPLIED: 1 })).toBe("1 estilo aplicado");
    expect(telemetryCountsToSummaryLine({ TEXT_FINALIZED: 2 })).toBe("2 textos finales");
    expect(telemetryCountsToSummaryLine({ LAYOUT_FINALIZED: 1 })).toBe("1 layout final");
  });

  it("ordena por importancia (exportación antes que sugerencias mostradas aunque haya menos)", () => {
    const line = telemetryCountsToSummaryLine({
      SUGGESTION_SHOWN: 99,
      CONTENT_EXPORTED: 1,
    });
    expect(line).toMatch(/^1 exportación/);
  });

  it("limita a 3 señales y añade +N más por tipos omitidos", () => {
    const line = telemetryCountsToSummaryLine(
      {
        SUGGESTION_SHOWN: 9,
        COLOR_USED: 2,
        CONTENT_EXPORTED: 5,
        IMAGE_USED: 3,
        STYLE_APPLIED: 1,
      },
      3,
    );
    expect(line).toBe("5 exportaciones · 3 imágenes usadas · 2 colores usados · +2 más");
  });

  it("respeta maxParts personalizado", () => {
    const line = telemetryCountsToSummaryLine({ COLOR_USED: 1, STYLE_APPLIED: 1 }, 5);
    expect(line).not.toContain("más");
    expect(line).toContain("1 color usado");
    expect(line).toContain("1 estilo aplicado");
  });

  it("resume flujo Designer típico: exportación + importación + uso en documento", () => {
    const line = telemetryCountsToSummaryLine({
      CONTENT_EXPORTED: 1,
      IMAGE_IMPORTED: 1,
      IMAGE_USED: 1,
    });
    expect(line).toBe("1 exportación · 1 imagen importada · 1 imagen usada");
  });

  it("resume flujo Photoroom típico: importación + edición + exportación (maxParts)", () => {
    const line = telemetryCountsToSummaryLine(
      {
        IMAGE_IMPORTED: 1,
        IMAGE_EDITED: 1,
        IMAGE_EXPORTED: 1,
      },
      5,
    );
    expect(line).toBe("1 imagen importada · 1 imagen editada · 1 imagen exportada");
  });
});
