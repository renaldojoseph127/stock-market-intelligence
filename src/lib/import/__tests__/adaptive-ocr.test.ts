import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  detectTableRegions,
  evaluateOcrQuality,
} from "../pdf/ocr";
import { extractPdf } from "../pdf/extract-pdf";
import { parseReport } from "../pdf/parse-report";
import { OCR_PASS_B_WIDTH } from "../pdf/render-pages";
import { makeRealNarrowIosScreenshotPdf } from "./fixtures/ios-screenshot-pdf";

describe("adaptive high-magnification OCR", () => {
  it("treats high character confidence with empty parsed output as inadequate", () => {
    const quality = evaluateOcrQuality("navigation footer account login", 0.97);
    expect(quality).toMatchObject({
      validDate: false,
      categoryCount: 0,
      rowCount: 0,
      confidence: 0.97,
      adequate: false,
    });
    expect(quality.validationFailures).toEqual(
      expect.arrayContaining([
        "No valid printed report date.",
        "No supported market category.",
      ]),
    );
  });

  it("detects ordered category-anchored table regions", () => {
    const regions = detectTableRegions(
      [
        { text: "NASDAQ Most Active", confidence: 0.9, x: 0, y: 500 },
        { text: "1 ABCD $4.25 +8%", confidence: 0.9, x: 0, y: 650 },
        {
          text: "NASDAQ Biggest Gainers",
          confidence: 0.9,
          x: 0,
          y: 1_500,
        },
        { text: "1 WXYZ $2.00 +20%", confidence: 0.9, x: 0, y: 1_650 },
        {
          text: "NYSE Most Active",
          confidence: 0.9,
          x: 0,
          y: 2_500,
        },
      ],
      5_000,
    );
    expect(regions.map((region) => region.category)).toEqual([
      "NASDAQ Most Active",
      "NASDAQ Biggest Gainers",
      "NYSE Most Active",
    ]);
    expect(regions[0].top).toBeLessThan(regions[1].top);
    expect(regions.every((region) => region.height >= 500)).toBe(true);
  });

  it(
    "falls back to 3000px OCR for real narrow geometry and recovers a complete report",
    async () => {
      const pdf = await makeRealNarrowIosScreenshotPdf();
      const extracted = await extractPdf(pdf);
      const report = parseReport(
        "1 Screenshot 14.pdf",
        createHash("sha256").update(pdf).digest("hex"),
        extracted,
      );
      const provenance = extracted.pages[0].provenance!;

      expect(provenance.attempts.map((attempt) => attempt.pass)).toContain("B");
      expect(
        provenance.attempts.find((attempt) => attempt.pass === "B")
          ?.normalizedWidth,
      ).toBe(OCR_PASS_B_WIDTH);
      expect(provenance.selectedPass).toMatch(/[BC]/);
      expect(report.reportDate).toBe("2025-08-10");
      expect(report.categories.length).toBeGreaterThanOrEqual(8);
      expect(report.rows.length).toBeGreaterThanOrEqual(24);
      expect(report.rows.some((row) => (row.changePercent ?? 0) < 0)).toBe(true);
      expect(report.extractionDiagnostics?.pages[0]).toMatchObject({
        selectedPass: provenance.selectedPass,
      });
    },
    300_000,
  );
});
