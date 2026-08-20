import { describe, expect, it } from "vitest";
import { MetadataDecisionEngine } from "../decision-engine";

describe("MetadataDecisionEngine", () => {
  const engine = new MetadataDecisionEngine(180);

  it("is required-field aware and treats sufficient fresh metadata as a cache hit", () => {
    const ticker = {
      company_name: "NVIDIA Corporation",
      exchange: "NASDAQ",
      sector: null,
      industry: null,
      market_cap: null,
      metadata_updated_at: "2026-08-01T00:00:00Z",
      next_metadata_refresh_at: "2027-01-01T00:00:00Z",
      enrichment_status: "partial",
    };
    const watchlist = engine.determineRequiredFields("watchlist");
    const aiSearch = engine.determineRequiredFields("ai_search");

    expect(engine.resolveCacheState(ticker, watchlist, new Date("2026-08-13T00:00:00Z"))).toMatchObject({
      state: "complete",
      missing: [],
      usable: true,
    });
    expect(engine.shouldEnrichTicker(ticker, watchlist)).toBe(false);
    expect(engine.resolveCacheState(ticker, aiSearch, new Date("2026-08-13T00:00:00Z")).missing).toEqual([
      "sector",
      "industry",
      "market_cap",
    ]);
  });

  it("keeps stale metadata usable while identifying refresh work", () => {
    const ticker = {
      company_name: "Apple Inc.",
      exchange: "NASDAQ",
      sector: "Technology",
      industry: "Consumer Electronics",
      metadata_updated_at: "2025-01-01T00:00:00Z",
      next_metadata_refresh_at: "2025-07-01T00:00:00Z",
      enrichment_status: "complete",
    };
    const state = engine.resolveCacheState(ticker, engine.determineRequiredFields("ticker_page"), new Date("2026-08-13T00:00:00Z"));
    expect(state).toMatchObject({ state: "stale", missing: [], usable: true });
    expect(engine.shouldRefreshTicker(ticker, new Date("2026-08-13T00:00:00Z"))).toBe(true);
  });

  it("uses the documented transparent priority weights", () => {
    expect(engine.calculatePriority("ai_search")).toBe(100);
    expect(engine.calculatePriority("watchlist")).toBe(90);
    expect(engine.calculatePriority("recent_market_mover")).toBe(70);
    expect(engine.calculatePriority("stale_refresh")).toBe(20);
    expect(engine.calculatePriority("ticker_page", {
      watchlisted: true,
      recentMover: true,
      activeAlert: true,
      patternActivity: true,
      popularityScore: 200,
      aiSearchCount: 50,
    })).toBe(150);
  });

  it("does not bypass ticker cooldown for manual refresh", () => {
    const ticker = {
      company_name: null,
      exchange: null,
      next_retry_at: "2099-01-01T00:00:00Z",
      last_not_found_at: "2026-08-13T00:00:00Z",
      enrichment_status: "not_found",
    };
    const required = engine.determineRequiredFields("manual");
    expect(engine.resolveCacheState(ticker, required).state).toBe("not_found");
    expect(engine.shouldEnrichTicker(ticker, required, true)).toBe(false);
  });
});
