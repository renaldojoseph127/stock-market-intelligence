import { describe, expect, it } from "vitest";
import { buildTickerResearchBrief } from "../report";

describe("ticker research brief foundation", () => {
  it("keeps all required sections and states unavailable social evidence honestly", () => {
    const brief = buildTickerResearchBrief({
      symbol: "NVDA",
      summary: {
        company_name: "NVIDIA Corporation",
        metadata_status: "complete",
        metadata_provider: "alpha_vantage",
        market_appearances: 220,
        market_days: 180,
        quality_status: "flagged",
        quality_finding_count: 47,
        quality_repaired_fields: 3,
      },
      timeline: [],
      socialCoverageState: "awaiting_provider_approval",
      socialCoverageExplanation:
        "Reddit provider disabled pending access approval; this window has not been researched.",
      dataMode: "raw",
    });
    expect(brief.title).toBe("NVDA Ticker Research Brief");
    expect(brief.historicalMoverSummary).toMatchObject({ appearances: 220, dataMode: "raw" });
    expect(brief.socialCoverage).toMatchObject({ state: "awaiting_provider_approval" });
    expect(brief.dataQuality).toMatchObject({ status: "flagged", findingCount: 47, approvedRepairFields: 3 });
    expect(brief.researchLimitations.join(" ")).toMatch(/not been researched|RAW|not a prediction/i);
  });
});
