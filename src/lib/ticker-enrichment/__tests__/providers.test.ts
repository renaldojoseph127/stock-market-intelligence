import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../retry";
import { AlphaVantageMetadataProvider, FinnhubMetadataProvider, SecCompanyTickersProvider } from "../providers";

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("ticker metadata providers", () => {
  it("returns authoritative SEC reference fields and honest not-found results", async () => {
    const fetcher = vi.fn(async () => response({ fields: ["cik", "name", "ticker", "exchange"], data: [[320193, "Example Corp", "XYZ", "Nasdaq"], [7, "Fund Units", "FUND", "NYSE"]] }));
    const provider = new SecCompanyTickersProvider("market-intelligence test@example.com", fetcher as typeof fetch, async () => {});
    const results = await provider.batchLookup(["XYZ", "MISS"]);
    expect(results[0]).toMatchObject({ status: "partial", metadata: { company_name: "Example Corp", exchange: "NASDAQ", cik: "0000320193" } });
    expect(results[1].status).toBe("not_found");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("supplements ETF and warrant profiles and converts vendor millions to absolute values", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("stock/symbol")) return response([{ symbol: "FUND", description: "Example ETF", type: "ETP", mic: "XNAS", currency: "USD" }, { symbol: "XYZW", description: "Example Warrants", type: "Warrant", mic: "XASE", currency: "USD" }]);
      return value.includes("symbol=FUND")
        ? response({ name: "Example ETF", country: "US", currency: "USD", exchange: "NASDAQ", finnhubIndustry: "Asset Management", marketCapitalization: 125.5, shareOutstanding: 10, weburl: "https://example.com" })
        : response({ name: "Example Warrants", country: "US", currency: "USD", exchange: "NYSE AMERICAN", marketCapitalization: 2, shareOutstanding: 1 });
    });
    const provider = new FinnhubMetadataProvider("token", fetcher as typeof fetch, async () => {});
    const results = await provider.batchLookup(["FUND", "XYZW"]);
    expect(results[0].metadata).toMatchObject({ security_type: "ETF", market_cap: 125_500_000, shares_outstanding: 10_000_000, website: "https://example.com" });
    expect(results[1].metadata).toMatchObject({ security_type: "warrant", exchange: "NYSE American" });
  });

  it("bounds 429 retries", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 429, { "retry-after": "0" })).mockResolvedValueOnce(response({ ok: true }));
    const sleep = vi.fn(async () => {});
    const result = await fetchWithRetry("https://provider.test", {}, { fetcher, sleep, attempts: 3 });
    expect(await result.json()).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("reserves every HTTP retry and stops before a request when quota is exhausted", async () => {
    const fetcher = vi.fn(async () => response({}, 500));
    const sleep = vi.fn(async () => {});
    const beforeAttempt = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(fetchWithRetry("https://provider.test", {}, { fetcher, sleep, attempts: 3, beforeAttempt })).rejects.toThrow("Daily metadata API budget exhausted");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(beforeAttempt).toHaveBeenCalledTimes(2);
  });

  it("returns retryable failures without aborting a batch", async () => {
    const provider = new SecCompanyTickersProvider("app test@example.com", vi.fn(async () => { throw new TypeError("network unavailable"); }) as unknown as typeof fetch, async () => {});
    const results = await provider.batchLookup(["ONE", "TWO"]);
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.status === "failed" && item.retryable)).toBe(true);
  });
});

describe("Alpha Vantage metadata provider", () => {
  it("normalizes Company Overview data without exposing the credential", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => { void url; return response({ Symbol: "NVDA", Name: "NVIDIA Corporation", AssetType: "Common Stock", CIK: "1045810", Exchange: "NASDAQ", Currency: "USD", Country: "USA", Sector: "TECHNOLOGY", Industry: "SEMICONDUCTORS", MarketCapitalization: "4200000000000", SharesOutstanding: "24400000000", OfficialSite: "https://www.nvidia.com" }); });
    const provider = new AlphaVantageMetadataProvider("server-secret", fetcher as typeof fetch, async () => {});
    const result = await provider.lookupTicker("nvda");
    expect(result).toMatchObject({ status: "found", metadata: { company_name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "TECHNOLOGY", industry: "SEMICONDUCTORS", market_cap: 4_200_000_000_000, shares_outstanding: 24_400_000_000, cik: "0001045810", currency: "USD" } });
    expect(String(fetcher.mock.calls[0][0])).toContain("apikey=server-secret");
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("classifies empty and provider-limit responses without fabricating metadata", async () => {
    const missing = new AlphaVantageMetadataProvider("key", vi.fn(async () => response({})) as typeof fetch, async () => {});
    const limited = new AlphaVantageMetadataProvider("key", vi.fn(async () => response({ Note: "Thank you for using Alpha Vantage" })) as typeof fetch, async () => {});
    expect(await missing.lookupTicker("MISS")).toMatchObject({ status: "not_found", metadata: {} });
    expect(await limited.lookupTicker("NVDA")).toMatchObject({ status: "failed", errorType: "rate_limited", retryable: true, metadata: {} });
  });

  it("reports malformed responses and retries bounded 5xx/network failures", async () => {
    const malformed = new AlphaVantageMetadataProvider("key", vi.fn(async () => response({ unexpected: true })) as typeof fetch, async () => {});
    expect(await malformed.lookupTicker("NVDA")).toMatchObject({ status: "failed", errorType: "malformed_response", retryable: true });
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 500)).mockRejectedValueOnce(new TypeError("temporary network failure")).mockResolvedValueOnce(response({ Symbol: "AMD", Name: "Advanced Micro Devices", Exchange: "NASDAQ", Sector: "TECHNOLOGY", Industry: "SEMICONDUCTORS" }));
    const sleep = vi.fn(async () => {});
    const provider = new AlphaVantageMetadataProvider("key", fetcher as typeof fetch, sleep);
    expect(await provider.lookupTicker("AMD")).toMatchObject({ status: "found" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
