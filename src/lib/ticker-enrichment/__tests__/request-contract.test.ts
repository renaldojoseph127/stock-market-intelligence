import { describe, expect, it } from "vitest";
import { metadataRequestMessage, toMetadataRequestResponse } from "../request-contract";
import type { MetadataResolution, MetadataResolutionReason } from "../types";

function resolution(reason: MetadataResolutionReason, overrides: Partial<MetadataResolution> = {}): MetadataResolution {
  return {
    ticker: { symbol: "NVDA" }, state: "complete", requiredFields: [], missingFields: [],
    cacheHit: false, queued: false, providerCallsMade: 0, reason,
    nextRefreshAt: "2026-09-01T00:00:00.000Z", message: "internal", ...overrides,
  };
}

describe("metadata request API contract", () => {
  it("returns a numeric queueCount and never presents queued boolean as a count", () => {
    expect(toMetadataRequestResponse(resolution("queued", { queued: true }))).toMatchObject({
      queued: true, queueCount: 1, cacheHit: false, reason: "queued", ticker: "NVDA",
      message: "NVDA queued for metadata enrichment.",
    });
    const cache = toMetadataRequestResponse(resolution("cache_hit", { cacheHit: true }));
    expect(cache.queueCount).toBe(0);
    expect(cache.message).toBe("NVDA metadata is already cached. No provider call required.");
    expect(cache.message).not.toContain("false ticker request");
  });

  it.each([
    ["refresh_queued", "NVDA metadata refresh queued."],
    ["budget_exhausted", "Daily provider budget reached. NVDA has been deferred."],
    ["provider_unavailable", "Provider unavailable. Existing cached metadata remains available."],
  ] as const)("presents %s distinctly", (reason, message) => {
    expect(metadataRequestMessage(toMetadataRequestResponse(resolution(reason)))).toBe(message);
  });

  it("reports the next refresh for a current manual request", () => {
    expect(toMetadataRequestResponse(resolution("refresh_not_due", { cacheHit: true })).message)
      .toBe("NVDA metadata is current. Next refresh: Sep 1, 2026.");
  });
});
