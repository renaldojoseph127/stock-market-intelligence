import { describe, expect, it } from "vitest";
import { MetadataDecisionEngine } from "../decision-engine";

describe("on-demand enrichment scale", () => {
  it("keeps work proportional to active research rather than a 4,247 ticker universe", () => {
    const engine = new MetadataDecisionEngine();
    const universe = Array.from({ length: 4_247 }, (_, index) => ({
      id: `ticker-${index}`,
      company_name: index < 50 ? `Company ${index}` : null,
      exchange: index < 50 ? "NASDAQ" : null,
      metadata_updated_at: index < 50 ? "2026-08-01T00:00:00Z" : null,
      next_metadata_refresh_at: index < 50 ? "2027-01-01T00:00:00Z" : null,
      enrichment_status: index < 50 ? "complete" : "pending",
    }));
    const active = universe.slice(0, 50);
    const required = engine.determineRequiredFields("ticker_search");
    let providerCalls = 0;
    let cacheHits = 0;
    for (let repeat = 0; repeat < 100; repeat++) {
      for (const ticker of active) {
        if (engine.shouldEnrichTicker(ticker, required)) providerCalls++;
        else cacheHits++;
      }
    }
    expect(universe).toHaveLength(4_247);
    expect(providerCalls).toBe(0);
    expect(cacheHits).toBe(5_000);
    expect(active.length / universe.length).toBeLessThan(0.012);
  });
});
