"use client";

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/**
 * Genera un PDF vectorial a partir del markup SVG ya preparado para export
 * (mismo string que se usa para descargar .svg).
 */
export async function downloadSvgAsVectorPdf(svgMarkup: string, filename: string): Promise<void> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("SVG inválido para export PDF");
  }
  const svgRoot = parsed.documentElement;
  const w = Math.max(1, parseFloat(svgRoot.getAttribute("width") || "1"));
  const h = Math.max(1, parseFloat(svgRoot.getAttribute("height") || "1"));
  const wPt = (w * 72) / 96;
  const hPt = (h * 72) / 96;

  const pdf = new jsPDF({
    unit: "pt",
    format: [wPt, hPt],
    orientation: wPt >= hPt ? "landscape" : "portrait",
    compress: true,
  });

  await svg2pdf(svgRoot, pdf, { x: 0, y: 0, width: wPt, height: hPt });
  pdf.save(filename);
}

/** Misma pipeline que `downloadSvgAsVectorPdf` pero devuelve el PDF como Blob (ZIP / lote). */
export async function svgMarkupToPdfBlob(svgMarkup: string): Promise<Blob> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("SVG inválido para export PDF");
  }
  const svgRoot = parsed.documentElement;
  const w = Math.max(1, parseFloat(svgRoot.getAttribute("width") || "1"));
  const h = Math.max(1, parseFloat(svgRoot.getAttribute("height") || "1"));
  const wPt = (w * 72) / 96;
  const hPt = (h * 72) / 96;

  const pdf = new jsPDF({
    unit: "pt",
    format: [wPt, hPt],
    orientation: wPt >= hPt ? "landscape" : "portrait",
    compress: true,
  });

  await svg2pdf(svgRoot, pdf, { x: 0, y: 0, width: wPt, height: hPt });
  return pdf.output("blob") as Blob;
}

/**
 * Une varias páginas SVG (ya preparadas para PDF, p. ej. con texto como trazos) en un solo PDF vectorial.
 */
export async function downloadMultiPageVectorPdf(
  svgMarkups: string[],
  filename: string,
): Promise<void> {
  if (svgMarkups.length === 0) return;
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (let i = 0; i < svgMarkups.length; i++) {
    const svgMarkup = svgMarkups[i]!;
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
    if (parsed.querySelector("parsererror")) continue;
    const svgRoot = parsed.documentElement;
    const w = Math.max(1, parseFloat(svgRoot.getAttribute("width") || "1"));
    const h = Math.max(1, parseFloat(svgRoot.getAttribute("height") || "1"));
    const wPt = (w * 72) / 96;
    const hPt = (h * 72) / 96;
    const orientation = wPt >= hPt ? "landscape" : "portrait";
    if (i === 0) {
      pdf = new jsPDF({
        unit: "pt",
        format: [wPt, hPt],
        orientation,
        compress: true,
      });
    } else {
      pdf!.addPage([wPt, hPt], orientation);
    }
    await svg2pdf(svgRoot, pdf!, { x: 0, y: 0, width: wPt, height: hPt });
  }
  if (pdf) pdf.save(filename);
}
