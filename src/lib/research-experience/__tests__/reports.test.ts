import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { researchBriefCSV, researchBriefHTML, researchBriefJSON, researchBriefPDF } from "../reports";
import type { ResearchBrief } from "../types";

const brief: ResearchBrief = {
  title: "NVDA Ticker Research Brief",
  briefType: "ticker",
  researchBriefVersion: "ticker-research-brief-v1",
  generatedAt: "2026-08-19T12:00:00.000Z",
  dataMode: "raw",
  executiveSummary: "NVDA appeared 220 times. Catalyst and social statements are limited to researched coverage.",
  sections: [
    { heading: "Ticker Metadata", rows: [{ symbol: "NVDA", provider: "alpha_vantage" }] },
    { heading: "Social Coverage", paragraphs: ["Social history not researched. Provider approval pending."], rows: [] },
  ],
  provenance: {
    tickerId: "ticker-id",
    sourceReportIds: ["report-id"],
    moverIds: ["mover-id"],
    eventIds: [],
    qualityState: "clean",
    catalystCoverageState: "researched",
    socialCoverageState: "not_researched",
    applicationReportVersion: "ticker-research-brief-v1",
  },
  limitations: ["Historical research only.", "RAW observations remain the default."],
};

describe("Phase 2C.2 research brief formats", () => {
  it("includes version, RAW mode, sections, provenance, and coverage limitations", () => {
    const json = JSON.parse(researchBriefJSON(brief));
    expect(json).toMatchObject({ research_brief_version: "ticker-research-brief-v1", data_mode: "raw" });
    expect(json.provenance.moverIds).toEqual(["mover-id"]);
    const html = researchBriefHTML(brief);
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Coverage &amp; Limitations");
    expect(html).toContain("RAW mode");
    const csv = researchBriefCSV(brief);
    expect(csv).toContain('"data_mode","raw"');
    expect(csv).toContain("Social history not researched");
  });

  it("creates a readable multi-section PDF without raw JSON output", async () => {
    const bytes = await researchBriefPDF(brief);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(1_000);
  });
});

