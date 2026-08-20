export const CATALYST_CLASSIFICATION_VERSION = "catalyst-v1";
export const CATALYST_CLASSIFIER_ID = "sec-form-items";

export type CatalystQueueReason =
  | "ticker_page"
  | "market_mover"
  | "ai_search"
  | "watchlist"
  | "manual"
  | "historical_backfill"
  | "research_workspace"
  | "pattern_match"
  | "retry";
export type TemporalBucket =
  | "same_session"
  | "pre_market_same_day"
  | "after_hours_previous_day"
  | "within_24h_before"
  | "1_to_3_days_before"
  | "4_to_7_days_before"
  | "8_to_30_days_before"
  | "after_move"
  | "unknown";
export type MarketSession =
  | "pre_market"
  | "regular_session"
  | "after_hours"
  | "unknown";
export type ProviderHealthState =
  | "healthy"
  | "degraded"
  | "rate_limited"
  | "unavailable"
  | "unconfigured";

export interface CatalystSearchInput {
  tickerId: string;
  symbol: string;
  cik?: string | null;
  dateFrom: string;
  dateTo: string;
  signal?: AbortSignal;
}

export interface CatalystClassificationCandidate {
  candidateType: string;
  candidateSubtype: string | null;
  confidence: number;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface NormalizedCatalystEvent {
  externalEventId: string;
  tickerId: string;
  eventDate: string;
  eventType:
    | "news"
    | "earnings"
    | "sec_filing"
    | "offering"
    | "reverse_split"
    | "stock_split"
    | "fda"
    | "contract"
    | "merger"
    | "acquisition"
    | "analyst"
    | "other";
  eventSubtype: string | null;
  headline: string;
  description: string | null;
  publishedAt: string | null;
  effectiveAt: string | null;
  marketSession: MarketSession;
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  sourceDocumentUrl: string | null;
  sourceDocumentType: string | null;
  rawTitle: string | null;
  rawSummary: string | null;
  normalizedHeadline: string;
  normalizedDescription: string | null;
  isPrimarySource: boolean;
  ingestionMethod: string;
  eventConfidence: number;
  sec?: {
    cik: string;
    accessionNumber: string;
    formType: string;
    filingDate: string;
    reportDate: string | null;
    acceptedAt: string | null;
    primaryDocument: string | null;
    filingUrl: string;
    primaryDocumentUrl: string | null;
    items: string[];
    description: string | null;
    isAmendment: boolean;
    rawMetadata: Record<string, unknown>;
  };
  classifications: CatalystClassificationCandidate[];
  metadata: Record<string, unknown>;
}

export interface EventProviderResult {
  provider: string;
  status: "completed" | "partial" | "not_configured" | "failed";
  events: NormalizedCatalystEvent[];
  requestsMade: number;
  cacheHits: number;
  cacheMisses: number;
  limitations: string[];
  error?: string;
  errorType?: string;
  httpStatus?: number;
  retryable?: boolean;
  providerHealth: ProviderHealthState;
}

export interface CikResolutionResult {
  status:
    | "resolved"
    | "not_found"
    | "ambiguous"
    | "unresolved"
    | "unconfigured"
    | "failed";
  symbol: string;
  cik: string | null;
  companyName: string | null;
  candidateCount: number;
  rawMapping: Record<string, unknown>;
  sourceUrl: string;
  requestsMade: number;
  cacheHits: number;
  cacheMisses: number;
  error?: string;
}

export interface EventProvider {
  readonly name: string;
  readonly sourceType: string;
  searchTickerEvents(input: CatalystSearchInput): Promise<EventProviderResult>;
  fetchEvent(
    externalEventId: string,
    input: CatalystSearchInput,
  ): Promise<NormalizedCatalystEvent | null>;
  normalizeEvent(
    raw: unknown,
    input: CatalystSearchInput,
  ): NormalizedCatalystEvent | null;
  rateLimitStatus(): { requestsPerSecond: number; nextRequestAt: number };
  healthCheck(): {
    configured: boolean;
    status: ProviderHealthState;
    message: string;
  };
  resolveCik?(symbol: string): Promise<CikResolutionResult>;
}

export interface NewsEventProvider extends EventProvider {
  readonly sourceType: "news_api" | "rss" | "company_ir";
}

export interface ProviderResponseCache {
  get(
    cacheKey: string,
  ): Promise<{
    payload: unknown | null;
    expiresAt: string;
    status?: "success" | "not_found" | "temporary_failure" | "failure";
    etag?: string | null;
    lastModified?: string | null;
    httpStatus?: number | null;
    errorMessage?: string | null;
  } | null>;
  set(
    cacheKey: string,
    requestUrl: string,
    payload: unknown,
    ttlHours: number,
    headers?: { etag?: string | null; lastModified?: string | null },
  ): Promise<void>;
  touch?(cacheKey: string, ttlHours: number): Promise<void>;
  recordFailure?(
    cacheKey: string,
    requestUrl: string,
    failure: {
      status: "not_found" | "temporary_failure" | "failure";
      httpStatus?: number | null;
      errorType: string;
      errorMessage: string;
      retryable: boolean;
      ttlMinutes: number;
    },
  ): Promise<void>;
}

export interface EventMoverLink {
  relationshipType:
    | "preceded_move"
    | "same_day"
    | "followed_move"
    | "near_move"
    | "historical_context";
  eventAt: string | null;
  moverDate: string;
  minutesBeforeMove: number | null;
  hoursBeforeMove: number | null;
  daysBeforeMove: number | null;
  temporalBucket: TemporalBucket;
  confidence: number;
  catalystRelevance: number;
  reason: string;
  scoreEvidence: Record<string, number | boolean | string>;
}
