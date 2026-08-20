import { extractText } from "./extract-text";
import {
  TesseractOcrProvider,
  type OcrProvenance,
  type OcrProvider,
} from "./ocr";
import type { ExtractionMethod, Issue } from "../types";

const MIN_USABLE_CHARS = 80;
export const MIN_OCR_CONFIDENCE = 0.65;

export type ExtractedPdfPage = {
  pageNumber: number;
  text: string;
  confidence: number | null;
  method: "pdf_text" | "ocr";
  provenance?: OcrProvenance;
};

export async function extractPdf(buffer: Buffer, suppliedOcr?: OcrProvider) {
  const ocr = suppliedOcr ?? new TesseractOcrProvider();
  const ownsOcr = !suppliedOcr;

  try {
    const standard = await extractText(buffer);
    const pages: ExtractedPdfPage[] = [];
    const issues: Issue[] = [];

    for (const page of standard.pages) {
      if (page.text.replace(/\s/g, "").length >= MIN_USABLE_CHARS) {
        pages.push({ ...page, confidence: null, method: "pdf_text" });
        continue;
      }

      try {
        const result = await ocr.recognize(buffer, page.pageNumber);
        pages.push({
          pageNumber: page.pageNumber,
          text: result.text,
          confidence: result.confidence,
          method: "ocr",
          provenance: result.provenance,
        });
        if (result.confidence < MIN_OCR_CONFIDENCE) {
          issues.push({
            pageNumber: page.pageNumber,
            issueType: "low_confidence",
            message: `OCR confidence was ${Math.round(result.confidence * 100)}%; this page was not used to create market-mover rows.`,
            severity: "warning",
          });
        }
        if (result.quality && !result.quality.adequate) {
          issues.push({
            pageNumber: page.pageNumber,
            issueType: "suspicious_ocr_output",
            message: `Adaptive OCR exhausted pass ${result.provenance?.selectedPass ?? "unknown"} without a complete extraction: ${result.quality.validationFailures.join(" ")}`,
            severity: "error",
          });
        }
      } catch (error) {
        pages.push({ ...page, confidence: null, method: "pdf_text" });
        issues.push({
          pageNumber: page.pageNumber,
          issueType: "ocr_failure",
          message: error instanceof Error ? error.message : "OCR failed.",
          severity: "error",
        });
      }
    }

    const methods = new Set(pages.map((page) => page.method));
    const extractionMethod: ExtractionMethod =
      methods.size > 1
        ? "hybrid"
        : methods.has("ocr")
          ? "ocr"
          : "pdf_text";
    const scores = pages
      .map((page) => page.confidence)
      .filter((score): score is number => score != null);

    return {
      pageCount: standard.pageCount,
      pages,
      issues,
      extractionMethod,
      confidence: scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : extractionMethod === "pdf_text"
          ? 1
          : null,
    };
  } finally {
    if (ownsOcr) await ocr.close?.();
  }
}
