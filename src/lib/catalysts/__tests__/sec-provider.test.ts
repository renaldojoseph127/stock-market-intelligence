import { describe, expect, it, vi } from "vitest";
import { SecEdgarProvider } from "../sec-provider";
import type { ProviderResponseCache } from "../types";

const fixture = {
  cik: "1045810",
  name: "NVIDIA CORP",
  filings: {
    recent: {
      accessionNumber: ["0001045810-26-000111", "0001045810-26-000099"],
      filingDate: ["2026-06-15", "2026-05-01"],
      reportDate: ["2026-06-15", "2026-04-30"],
      acceptanceDateTime: ["20260615081500", "20260501170000"],
      form: ["8-K", "10-Q"],
      items: ["2.02,9.01", ""],
      primaryDocument: ["nvda-20260615.htm", "nvda-20260430.htm"],
      primaryDocDescription: ["Results of Operations", "Quarterly report"],
    },
    files: [],
  },
};

class MemoryCache implements ProviderResponseCache {
  value: Awaited<ReturnType<ProviderResponseCache["get"]>> = null;
  touches = 0;
  failures: unknown[] = [];
  async get() {
    return this.value;
  }
  async set(
    _: string,
    __: string,
    payload: unknown,
    ___: number,
    headers?: { etag?: string | null; lastModified?: string | null },
  ) {
    this.value = {
      payload,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "success",
      etag: headers?.etag,
      lastModified: headers?.lastModified,
    };
  }
  async touch() {
    this.touches++;
  }
  async recordFailure(...args: unknown[]) {
    this.failures.push(args);
  }
}

const input = {
  tickerId: "10000000-0000-0000-0000-000000000001",
  symbol: "NVDA",
  cik: "1045810",
  dateFrom: "2026-06-01",
  dateTo: "2026-06-20",
};

describe("SEC EDGAR submissions provider", () => {
  it("requires a declared application/contact user agent", async () => {
    const fetcher = vi.fn();
    const result = await new SecEdgarProvider({
      userAgent: "",
      fetcher,
    }).searchTickerEvents(input);
    expect(result.status).toBe("not_configured");
    expect(result.providerHealth).toBe("unconfigured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the declared user agent, bounds by date, and normalizes accession identity", async () => {
    const fetcher = vi.fn(
      async (_: Parameters<typeof fetch>[0], init?: RequestInit) => {
        expect(new Headers(init?.headers).get("user-agent")).toContain(
          "research@example.com",
        );
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { etag: '"fixture"' },
        });
      },
    );
    const provider = new SecEdgarProvider({
      userAgent: "Market Intelligence research@example.com",
      fetcher,
      sleep: async () => {},
      requestsPerSecond: 9,
    });
    const result = await provider.searchTickerEvents(input);
    expect(result).toMatchObject({
      status: "completed",
      requestsMade: 1,
      cacheHits: 0,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      externalEventId: "0001045810-26-000111",
      eventType: "sec_filing",
      eventSubtype: "financial_results",
      isPrimarySource: true,
      marketSession: "pre_market",
    });
    expect(result.events[0].sec?.items).toEqual(["2.02", "9.01"]);
    expect(
      result.events[0].classifications.some(
        (row) => row.candidateSubtype === "financial_results",
      ),
    ).toBe(true);
  });

  it("uses cached submissions without another SEC request", async () => {
    const cache = new MemoryCache();
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    );
    const provider = new SecEdgarProvider({
      userAgent: "Market Intelligence research@example.com",
      fetcher,
      cache,
      sleep: async () => {},
    });
    await provider.searchTickerEvents(input);
    const second = await provider.searchTickerEvents(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second.cacheHits).toBe(1);
    expect(second.requestsMade).toBe(0);
  });

  it("conditionally revalidates expired cache entries and accepts HTTP 304", async () => {
    const cache = new MemoryCache();
    cache.value = {
      payload: fixture,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      status: "success",
      etag: '"old"',
    };
    const fetcher = vi.fn(
      async (_: Parameters<typeof fetch>[0], init?: RequestInit) => {
        expect(new Headers(init?.headers).get("if-none-match")).toBe('"old"');
        return new Response(null, { status: 304 });
      },
    );
    const result = await new SecEdgarProvider({
      userAgent: "Market Intelligence research@example.com",
      fetcher,
      cache,
      sleep: async () => {},
    }).searchTickerEvents(input);
    expect(result).toMatchObject({
      status: "completed",
      requestsMade: 1,
      cacheHits: 1,
    });
    expect(result.events).toHaveLength(1);
    expect(cache.touches).toBe(1);
  });

  it("preserves stale cache and rate-limited health after a bounded 429 failure", async () => {
    const cache = new MemoryCache();
    cache.value = {
      payload: fixture,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      status: "success",
    };
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { "retry-after": "0" } }),
    );
    const result = await new SecEdgarProvider({
      userAgent: "Market Intelligence research@example.com",
      fetcher,
      cache,
      maxRetries: 1,
      sleep: async () => {},
    }).searchTickerEvents(input);
    expect(result).toMatchObject({
      status: "partial",
      providerHealth: "rate_limited",
      errorType: "rate_limited",
      retryable: true,
    });
    expect(result.events).toHaveLength(1);
    expect(cache.failures).toHaveLength(1);
  });

  it("resolves, refuses ambiguous, and preserves missing authoritative CIK mappings", async () => {
    const mapping = {
      0: { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
      1: { cik_str: 1, ticker: "DUPE", title: "First" },
      2: { cik_str: 2, ticker: "DUPE", title: "Second" },
    };
    const provider = new SecEdgarProvider({
      userAgent: "Market Intelligence research@example.com",
      fetcher: vi.fn(
        async () => new Response(JSON.stringify(mapping), { status: 200 }),
      ),
      sleep: async () => {},
    });
    await expect(provider.resolveCik("NVDA")).resolves.toMatchObject({
      status: "resolved",
      cik: "0001045810",
      candidateCount: 1,
    });
    await expect(provider.resolveCik("DUPE")).resolves.toMatchObject({
      status: "ambiguous",
      cik: null,
      candidateCount: 2,
    });
    await expect(provider.resolveCik("MISSING")).resolves.toMatchObject({
      status: "not_found",
      cik: null,
      candidateCount: 0,
    });
  });

  it("reports missing CIK as partial coverage without a request", async () => {
    const fetcher = vi.fn();
    const result = await new SecEdgarProvider({
      userAgent: "Market Intelligence research@example.com",
      fetcher,
    }).searchTickerEvents({ ...input, cik: null });
    expect(result.status).toBe("partial");
    expect(result.limitations.join(" ")).toMatch(/no cached CIK/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
