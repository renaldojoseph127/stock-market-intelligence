import { describe, expect, it } from "vitest";
import { processMetadataQueue, resolveMetadataRequest } from "../on-demand";
import type { ProviderRequestOptions, ProviderResult, TickerMetadataProvider } from "../types";

class FixtureProvider implements TickerMetadataProvider {
  readonly name = "fixture";
  readonly supportedFields = ["company_name", "exchange"] as const;
  calls = 0;
  readiness() { return { name: this.name, configured: true, role: "reference" as const, message: "ready", rateLimit: "fixture", coverage: "fixture", missingFields: [] }; }
  classifyExchange() { return "NASDAQ" as const; }
  validateResponse() { return true; }
  normalizeSecurity() { return {}; }
  async handleRateLimit() {}
  async lookupTicker(symbol: string, options?: ProviderRequestOptions): Promise<ProviderResult> {
    if (options?.beforeExternalCall && !await options.beforeExternalCall()) {
      return { symbol, provider: this.name, status: "failed", metadata: {}, errorType: "quota_exhausted", errorMessage: "Daily metadata API budget exhausted", retryable: false };
    }
    this.calls++;
    return { symbol, provider: this.name, status: "found", metadata: { company_name: "NVIDIA Corporation", exchange: "NASDAQ" } };
  }
  async batchLookup(symbols: string[]) { return Promise.all(symbols.map((symbol) => this.lookupTicker(symbol))); }
}

class MemoryDb {
  ticker: Record<string, any> = {
    id: "ticker-1", symbol: "NVDA", company_name: null, exchange: null, primary_exchange: null,
    sector: null, industry: null, market_cap: null, float_shares: null, shares_outstanding: null,
    country: null, website: null, security_type: null, cik: null, isin: null, cusip: null, currency: null,
    active: null, delisted: null, enrichment_source: null, enrichment_status: "pending", metadata_version: null,
    metadata_updated_at: null, next_metadata_refresh_at: null, metadata_refresh_attempts: 0, metadata_priority: 0,
    metadata_last_requested_at: null, enrichment_error: null, last_not_found_at: null, next_retry_at: null, failure_reason: null,
  };
  queue: Record<string, any> | null = null;
  cacheHits = 0;
  cacheMisses = 0;
  callsReserved = 0;
  budgetAvailable = true;

  from(table: string) {
    const state: any = { table, update: null };
    const chain: any = {};
    chain.select = () => chain;
    chain.update = (values: Record<string, unknown>) => { state.update = values; return chain; };
    chain.eq = () => {
      if (state.update && table === "tickers") Object.assign(this.ticker, state.update);
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "tickers") return { data: { ...this.ticker }, error: null };
      if (table === "metadata_provider_health") return { data: null, error: null };
      return { data: null, error: null };
    };
    chain.single = async () => table === "tickers" ? { data: { ...this.ticker }, error: null } : { data: null, error: null };
    return chain;
  }

  async rpc(name: string, args: any) {
    if (name === "track_ticker_popularity") return { data: 1, error: null };
    if (name === "record_metadata_cache_event") {
      if (args.p_hit) this.cacheHits++;
      else this.cacheMisses++;
      return { data: null, error: null };
    }
    if (name === "calculate_ticker_metadata_priority") return { data: 70, error: null };
    if (name === "queue_ticker_metadata") {
      if (!this.queue) this.queue = { id: "queue-1", ticker_id: this.ticker.id, priority: args.p_priority ?? 70, reason: args.p_reason, reasons: [args.p_reason], required_fields: args.p_required_fields, status: "pending", attempts: 0 };
      return { data: this.queue.id, error: null };
    }
    if (name === "claim_ticker_metadata_queue") {
      if (!this.queue || this.queue.status !== "pending") return { data: [], error: null };
      this.queue.status = "processing";
      this.queue.attempts++;
      return { data: [{ ...this.queue }], error: null };
    }
    if (name === "reserve_metadata_provider_call") { this.callsReserved++; return { data: this.budgetAvailable, error: null }; }
    if (name === "finish_metadata_provider_call") return { data: null, error: null };
    if (name === "apply_ticker_metadata_queue_result") {
      Object.assign(this.ticker, args.p_metadata, { enrichment_source: args.p_provider, enrichment_status: "complete", metadata_updated_at: "2026-08-13T00:00:00Z", next_metadata_refresh_at: "2027-01-01T00:00:00Z" });
      return { data: { status: "complete" }, error: null };
    }
    if (name === "refresh_ticker_research_documents") return { data: 1, error: null };
    if (name === "finish_ticker_metadata_queue") {
      if (this.queue) this.queue.status = args.p_status;
      return { data: { ...this.queue }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

describe("cache-first on-demand orchestration", () => {
  it("calls a provider once, then serves repeated required-field lookups from cache", async () => {
    const db = new MemoryDb();
    const provider = new FixtureProvider();
    const first = await resolveMetadataRequest(db, { tickerId: "ticker-1", reason: "ticker_search", sync: false });
    expect(first).toMatchObject({ queued: true, cacheHit: false, missingFields: ["company_name", "exchange"] });
    expect(provider.calls).toBe(0);

    const processed = await processMetadataQueue(db, { limit: 1, providers: [provider] });
    expect(processed).toMatchObject({ claimed: 1, processed: 1 });
    expect(provider.calls).toBe(1);
    expect(db.callsReserved).toBe(1);

    for (let request = 0; request < 100; request++) {
      const result = await resolveMetadataRequest(db, { tickerId: "ticker-1", reason: "ticker_search", sync: true });
      expect(result).toMatchObject({ cacheHit: true, queued: false, providerCallsMade: 0, missingFields: [] });
    }
    expect(provider.calls).toBe(1);
    expect(db.cacheHits).toBe(100);
    expect(db.cacheMisses).toBe(1);
  });

  it("defers persisted work without a provider call when the hard daily budget is exhausted", async () => {
    const db = new MemoryDb();
    const provider = new FixtureProvider();
    db.budgetAvailable = false;
    await resolveMetadataRequest(db, { tickerId: "ticker-1", reason: "ticker_page", sync: false });
    const result = await processMetadataQueue(db, { limit: 1, providers: [provider] });
    expect(result.results[0]).toMatchObject({ status: "deferred", reason: "quota", calls: 0 });
    expect(provider.calls).toBe(0);
    expect(db.queue?.status).toBe("deferred");
  });

  it("performs a real provider refresh for manual or stale requests even when fields are cached", async () => {
    const db = new MemoryDb();
    const provider = new FixtureProvider();
    Object.assign(db.ticker, {
      company_name: "Cached NVIDIA",
      exchange: "NASDAQ",
      metadata_updated_at: "2026-08-01T00:00:00Z",
      next_metadata_refresh_at: "2027-01-01T00:00:00Z",
      enrichment_status: "complete",
    });
    const requested = await resolveMetadataRequest(db, { tickerId: "ticker-1", reason: "manual", force: true, sync: false });
    expect(requested).toMatchObject({ queued: true, cacheHit: false });
    await processMetadataQueue(db, { limit: 1, providers: [provider] });
    expect(provider.calls).toBe(1);
    expect(db.ticker.company_name).toBe("NVIDIA Corporation");
  });

  it("serves a current selected-ticker request from cache without reserving provider budget", async () => {
    const db = new MemoryDb();
    Object.assign(db.ticker, {
      company_name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "TECHNOLOGY", industry: "SEMICONDUCTORS",
      market_cap: 1, shares_outstanding: 1, country: "USA", website: "https://www.nvidia.com",
      security_type: "common_stock", cik: "0001045810", currency: "USD",
      metadata_updated_at: "2026-08-01T00:00:00Z", next_metadata_refresh_at: "2027-01-01T00:00:00Z",
      enrichment_status: "complete", enrichment_source: "alpha_vantage",
    });
    const before = db.callsReserved;
    const result = await resolveMetadataRequest(db, { tickerId: "ticker-1", reason: "manual", force: false, sync: true });
    expect(result).toMatchObject({ reason: "refresh_not_due", cacheHit: true, queued: false, providerCallsMade: 0 });
    expect(db.callsReserved).toBe(before);
    expect(db.queue).toBeNull();
  });
});
