import PDFParser from "pdf2json";
import mammoth from "mammoth";
import * as cheerio from "cheerio";

export async function parseBrainDocument(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  try {
    const ext = filename.split(".").pop()?.toLowerCase() || "";

    if (mimeType === "application/pdf" || ext === "pdf") {
      return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, true);
        pdfParser.on("pdfParser_dataReady", () => {
          resolve((pdfParser as { getRawTextContent: () => string }).getRawTextContent());
        });
        pdfParser.on("pdfParser_dataError", (errData: Error | { parserError: Error }) => {
          const parserErr =
            errData instanceof Error
              ? errData.message
              : errData?.parserError instanceof Error
              ? errData.parserError.message
              : "PDF parse error";
          reject(new Error(parserErr));
        });
        pdfParser.parseBuffer(fileBuffer);
      });
    }

    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }

    if (
      mimeType === "application/msword" ||
      mimeType === "application/rtf" ||
      mimeType === "text/rtf" ||
      mimeType.startsWith("text/") ||
      ["txt", "md", "rtf"].includes(ext)
    ) {
      if (mimeType === "text/html" || mimeType === "application/xhtml+xml" || ext === "html" || ext === "htm") {
        const html = fileBuffer.toString("utf-8");
        const $ = cheerio.load(html);
        $("script, style, nav, footer, header, noscript").remove();
        const title = $("title").text().trim();
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const merged = [title, bodyText].filter(Boolean).join("\n\n");
        return merged || $.root().text().replace(/\s+/g, " ").trim();
      }
      return fileBuffer.toString("utf-8");
    }

    throw new Error(`Unsupported file type: ${mimeType || "unknown"} / ${ext || "no-ext"}`);
  } catch (error) {
    throw new Error(
      `Failed to parse document ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
