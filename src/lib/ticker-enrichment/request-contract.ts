import type { MetadataResolution, MetadataResolutionReason } from "./types";

export interface MetadataRequestResponse {
  queued: boolean;
  queueCount: number;
  cacheHit: boolean;
  reason: MetadataResolutionReason;
  ticker: string;
  nextRefreshAt: string | null;
  providerCallsMade: number;
  message: string;
  metadata: Record<string, unknown>;
  queueId?: string;
}

function readableDate(value: string | null) {
  if (!value) return "the scheduled refresh date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function metadataRequestMessage(response: Pick<MetadataRequestResponse, "ticker" | "reason" | "nextRefreshAt">) {
  const { ticker, reason, nextRefreshAt } = response;
  switch (reason) {
    case "queued": return `${ticker} queued for metadata enrichment.`;
    case "cache_hit": return `${ticker} metadata is already cached. No provider call required.`;
    case "refresh_not_due": return `${ticker} metadata is current. Next refresh: ${readableDate(nextRefreshAt)}.`;
    case "refresh_queued": return `${ticker} metadata refresh queued.`;
    case "budget_exhausted": return `Daily provider budget reached. ${ticker} has been deferred.`;
    case "provider_unavailable": return "Provider unavailable. Existing cached metadata remains available.";
    case "refresh_completed": return `${ticker} metadata refreshed and cached.`;
    case "enriched": return `${ticker} metadata enriched and cached.`;
    case "partial": return `${ticker} metadata refresh completed with partial provider coverage.`;
    case "not_found": return `No configured provider found ${ticker}. Retry cooldown is active.`;
  }
}

export function toMetadataRequestResponse(resolution: MetadataResolution): MetadataRequestResponse {
  const response: MetadataRequestResponse = {
    queued: resolution.queued,
    queueCount: resolution.queued ? 1 : 0,
    cacheHit: resolution.cacheHit,
    reason: resolution.reason,
    ticker: String(resolution.ticker.symbol ?? "UNKNOWN"),
    nextRefreshAt: resolution.nextRefreshAt,
    providerCallsMade: resolution.providerCallsMade,
    message: "",
    metadata: resolution.ticker,
    ...(resolution.queueId ? { queueId: resolution.queueId } : {}),
  };
  response.message = metadataRequestMessage(response);
  return response;
}
