import { createHash } from "node:crypto";
import { extractArchive } from "./archive/extract-archive";
import { extractPdf } from "./pdf/extract-pdf";
import { TesseractOcrProvider, type OcrProvider } from "./pdf/ocr";
import { parseReport } from "./pdf/parse-report";
import type { PreviewPayload } from "./types";

export async function buildPreview(
  name: string,
  buffer: Buffer,
  knownHashes: Set<string> = new Set(),
  suppliedOcr?: OcrProvider,
): Promise<PreviewPayload> {
  const files = await extractArchive(name, buffer);
  if (!files.length) throw new Error("No supported PDF files were found.");

  const ocr = suppliedOcr ?? new TesseractOcrProvider();
  const ownsOcr = !suppliedOcr;
  const reports: PreviewPayload["reports"] = [];
  const duplicates: string[] = [];
  const seenHashes = new Set(knownHashes);

  try {
    for (const file of files) {
      const hash = createHash("sha256").update(file.buffer).digest("hex");
      if (seenHashes.has(hash)) {
        duplicates.push(file.filename);
        continue;
      }
      seenHashes.add(hash);

      try {
        reports.push(
          parseReport(
            file.filename,
            hash,
            await extractPdf(file.buffer, ocr),
            file.metadataDate,
          ),
        );
      } catch (error) {
        reports.push({
          filename: file.filename,
          fileHash: hash,
          reportDate: null,
          extractionMethod: "unknown",
          extractionConfidence: null,
          pageCount: 0,
          categories: [],
          rows: [],
          issues: [
            {
              issueType: "page_failure",
              message:
                error instanceof Error
                  ? error.message
                  : "PDF extraction failed.",
              severity: "error",
            },
          ],
        });
      }
    }
  } finally {
    if (ownsOcr) await ocr.close?.();
  }

  const dates = reports
    .map((report) => report.reportDate)
    .filter((date): date is string => Boolean(date))
    .sort();
  const issues = reports.flatMap((report) => report.issues);

  return {
    name,
    reports,
    duplicates,
    summary: {
      filesDetected: files.length,
      reportsDetected: reports.length,
      earliestDate: dates[0] ?? null,
      latestDate: dates.at(-1) ?? null,
      categories: [...new Set(reports.flatMap((report) => report.categories))],
      expectedRows: reports.reduce(
        (count, report) => count + report.rows.length,
        0,
      ),
      potentialDuplicates: duplicates.length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      errors: issues.filter((issue) => issue.severity === "error").length,
    },
  };
}
