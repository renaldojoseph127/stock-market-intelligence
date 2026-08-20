import { parseCategory } from "../parsers/parse-category";
import { parseDate, parseFilenameDate } from "../parsers/parse-date";
import { parseMarketRow } from "../parsers/parse-market-row";
import { validateReport } from "../validation/validate-report";
import { validateRow } from "../validation/validate-row";
import type { ParsedReport } from "../types";
import { MIN_OCR_CONFIDENCE } from "./extract-pdf";

export function parseReport(
  filename: string,
  fileHash: string,
  extracted: Awaited<ReturnType<typeof import("./extract-pdf").extractPdf>>,
  metadataDate: string | null = null,
): ParsedReport {
  let current: string | null = null;
  const categories = new Set<string>();
  const rows: ParsedReport["rows"] = [];
  const issues = [...extracted.issues];
  let printedDate: string | null = null;

  for (const page of extracted.pages) {
    // OCR output remains available in the preview/provenance, but unreliable
    // text is never allowed to create dates, headings, or database rows.
    if (
      page.method === "ocr" &&
      (page.confidence ?? 0) < MIN_OCR_CONFIDENCE
    ) {
      continue;
    }

    printedDate ??= parseDate(page.text);
    for (const line of page.text.split(/\r?\n/)) {
      const category = parseCategory(line);
      if (category) {
        current = category;
        categories.add(category);
        continue;
      }

      if (!current) continue;
      const parsed = parseMarketRow(line, current, page.pageNumber);
      if (parsed.row) {
        parsed.row.rawValues = {
          ...parsed.row.rawValues,
          sourcePageNumber: String(page.pageNumber),
          extractionMethod: page.method,
          extractionConfidence:
            page.confidence == null ? "" : page.confidence.toFixed(4),
          ocrPageProvenance: page.provenance
            ? JSON.stringify(page.provenance)
            : "",
        };
        rows.push(parsed.row);
        issues.push(...parsed.issues, ...validateRow(parsed.row));
      } else {
        issues.push(...parsed.issues);
      }
    }
  }

  const filenameDate = parseFilenameDate(filename);
  const chosen = printedDate ?? filenameDate ?? metadataDate;
  if (printedDate && filenameDate && printedDate !== filenameDate) {
    issues.push({
      issueType: "low_confidence",
      fieldName: "report_date",
      rawValue: filenameDate,
      message: `Filename date ${filenameDate} disagrees with printed date ${printedDate}; printed date was used.`,
      severity: "warning",
    });
  }
  if (
    !printedDate &&
    filenameDate &&
    metadataDate &&
    filenameDate !== metadataDate
  ) {
    issues.push({
      issueType: "low_confidence",
      fieldName: "report_date",
      rawValue: metadataDate,
      message: `Archive-folder date ${metadataDate} disagrees with filename date ${filenameDate}; filename date was used.`,
      severity: "warning",
    });
  }

  const report = {
    filename,
    fileHash,
    reportDate: chosen,
    sourceDate: filenameDate ?? metadataDate,
    extractionMethod: extracted.extractionMethod,
    extractionConfidence: extracted.confidence,
    pageCount: extracted.pageCount,
    categories: [...categories],
    rows,
    issues,
    extractionDiagnostics: {
      pages: extracted.pages.map((page) => ({
        pageNumber: page.pageNumber,
        method: page.method,
        confidence: page.confidence,
        renderDimensions: page.provenance
          ? {
              width: page.provenance.renderedWidth,
              height: page.provenance.renderedHeight,
            }
          : null,
        detectedCrop: page.provenance?.crop ?? null,
        normalizedDimensions: page.provenance
          ? {
              width: page.provenance.normalizedWidth,
              height: page.provenance.normalizedHeight,
            }
          : null,
        selectedPass: page.provenance?.selectedPass ?? null,
        fallbackTriggered: (page.provenance?.attempts.length ?? 0) > 1,
        fallbackReason:
          page.provenance?.attempts[0]?.quality.validationFailures ?? [],
        segmentCount: page.provenance?.segments.length ?? 0,
        tableRegionCount: page.provenance?.tableRegions.length ?? 0,
        preprocessingPath:
          page.provenance?.attempts.map((attempt) => ({
            pass: attempt.pass,
            psm: attempt.psm,
            preprocessing: attempt.preprocessing,
            targetWidth: attempt.targetWidth,
            scaleFactor: attempt.scaleFactor,
            nativePdfRerender: attempt.nativePdfRerender,
          })) ?? [],
        attempts: page.provenance?.attempts ?? [],
        quality: page.provenance?.quality ?? null,
        debugArtifactsSaved:
          page.provenance?.debugArtifactsSaved ?? false,
      })),
      validationFailures: [] as string[],
    },
  } satisfies ParsedReport;
  report.issues.push(...validateReport(report));
  report.extractionDiagnostics.validationFailures = report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  return report;
}
