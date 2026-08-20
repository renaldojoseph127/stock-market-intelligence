import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildPreview } from "../importer";
import { extractPdf } from "../pdf/extract-pdf";
import { parseReport } from "../pdf/parse-report";
import { mergeTextSegments, type OcrProvider } from "../pdf/ocr";
import {
  OCR_RENDER_DPI,
  planVerticalSegments,
  prepareOcrPage,
} from "../pdf/render-pages";
import { CANONICAL_CATEGORIES } from "../parsers/category-map";
import {
  fixtureOcrText,
  makeIosScreenshotPdf,
} from "./fixtures/ios-screenshot-pdf";

describe("iOS Scanz screenshot PDF preprocessing", () => {
  it("plans ordered overlapping regions without gaps", () => {
    const segments = planVerticalSegments(8_200, 2_400, 240);
    expect(segments.length).toBeGreaterThan(3);
    expect(segments[0]).toMatchObject({ top: 0, keepTop: 0 });
    expect(segments.at(-1)!.top + segments.at(-1)!.height).toBe(8_200);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].top).toBeLessThan(
        segments[index - 1].top + segments[index - 1].height,
      );
      expect(segments[index].top).toBeGreaterThan(segments[index - 1].top);
    }
  });

  it("deduplicates plain-text overlap while preserving top-to-bottom order", () => {
    expect(
      mergeTextSegments([
        "NASDAQ Biggest Gainers\n1 ABCD $4.25 1.35 +46%",
        "1 ABCD $4.25 1.35 +46%\nNYSE Most Active",
      ]),
    ).toBe(
      "NASDAQ Biggest Gainers\n1 ABCD $4.25 1.35 +46%\nNYSE Most Active",
    );
  });

  it(
    "renders at 360 DPI, crops the white letter margins, upscales, and segments the tall screenshot",
    async () => {
      const prepared = await prepareOcrPage(await makeIosScreenshotPdf(), 1);
      expect(prepared.provenance.renderDpi).toBe(OCR_RENDER_DPI);
      expect(prepared.provenance.renderedWidth).toBeGreaterThanOrEqual(3_000);
      expect(prepared.provenance.renderedHeight).toBeGreaterThanOrEqual(3_900);
      expect(prepared.provenance.whiteMarginCropped).toBe(true);
      expect(prepared.provenance.crop.width).toBeLessThan(
        prepared.provenance.renderedWidth / 3,
      );
      expect(prepared.provenance.crop.left).toBeGreaterThan(900);
      expect(prepared.provenance.normalizedWidth).toBeGreaterThanOrEqual(1_200);
      expect(prepared.provenance.normalizedHeight).toBeGreaterThan(7_000);
      expect(prepared.regions.length).toBeGreaterThan(3);
    },
    60_000,
  );

  it(
    "extracts the representative 1 Screenshot 14.pdf geometry into a date, categories, and usable rows",
    async () => {
      const pdf = await makeIosScreenshotPdf();
      const extracted = await extractPdf(pdf);
      const report = parseReport(
        "1 Screenshot 14.pdf",
        createHash("sha256").update(pdf).digest("hex"),
        extracted,
      );

      expect(extracted.extractionMethod).toBe("ocr");
      expect(extracted.pages[0].provenance?.renderDpi).toBe(360);
      expect(extracted.pages[0].provenance?.segments.length).toBeGreaterThan(3);
      expect(report.reportDate).toBe("2025-08-10");
      expect(report.categories.length).toBeGreaterThanOrEqual(8);
      expect(report.rows.length).toBeGreaterThanOrEqual(24);
      expect(report.rows[0].rawValues.ocrPageProvenance).toContain(
        '"renderDpi":360',
      );
    },
    180_000,
  );

  it("does not parse a high-looking text payload below the confidence gate", async () => {
    const pdf = await makeIosScreenshotPdf();
    const lowConfidence: OcrProvider = {
      recognize: async () => ({ text: fixtureOcrText(), confidence: 0.4 }),
    };
    const extracted = await extractPdf(pdf, lowConfidence);
    const report = parseReport("1 Screenshot 14.pdf", "low-confidence", extracted);
    expect(report).toMatchObject({ reportDate: null, categories: [], rows: [] });
    expect(report.issues).toContainEqual(
      expect.objectContaining({ issueType: "low_confidence" }),
    );
  });

  it(
    "previews a 224-PDF archive with realistic aggregate rows using a deterministic OCR provider",
    async () => {
      const basePdf = await makeIosScreenshotPdf();
      const archive: Record<string, Uint8Array> = {};
      for (let index = 1; index <= 224; index += 1) {
        archive[`${index} Screenshot 14.pdf`] = Buffer.concat([
          basePdf,
          Buffer.from(`\n% fixture report ${index}\n`),
        ]);
      }
      const provider: OcrProvider = {
        recognize: async () => ({ text: fixtureOcrText(2), confidence: 0.93 }),
      };
      const preview = await buildPreview(
        "Scanz iOS screenshots.zip",
        Buffer.from(zipSync(archive)),
        new Set(),
        provider,
      );

      expect(preview.summary.filesDetected).toBe(224);
      expect(preview.summary.reportsDetected).toBe(224);
      expect(preview.summary.categories).toEqual(
        expect.arrayContaining([...CANONICAL_CATEGORIES]),
      );
      expect(preview.summary.expectedRows).toBe(224 * 12 * 2);
      expect(preview.summary.expectedRows).toBeGreaterThan(8);
      expect(preview.summary.errors).toBe(0);
    },
    120_000,
  );
});
