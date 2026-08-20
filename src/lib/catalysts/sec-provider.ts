import { ProviderHttpError, fetchWithRetry } from "../ticker-enrichment/retry";
import { catalystConfig, validSecUserAgent } from "./config";
import { classifySecFiling, primaryClassification } from "./classification";
import { marketSessionFor } from "./temporal";
import type {
  CatalystSearchInput,
  CikResolutionResult,
  EventProvider,
  EventProviderResult,
  NormalizedCatalystEvent,
  ProviderHealthState,
  ProviderResponseCache,
} from "./types";

type FilingRow = {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  act?: string;
  form: string;
  fileNumber?: string;
  filmNumber?: string;
  items?: string;
  size?: number;
  isXBRL?: number;
  isInlineXBRL?: number;
  primaryDocument?: string;
  primaryDocDescription?: string;
};
type SubmissionPayload = {
  cik?: string;
  name?: string;
  filings?: {
    recent?: Record<string, unknown[]>;
    files?: Array<{ name: string; filingFrom?: string; filingTo?: string }>;
  };
} & Record<string, unknown>;

function columnarRows(value: unknown): FilingRow[] {
  if (!value || typeof value !== "object") return [];
  const columns = value as Record<string, unknown[]>;
  const count = Math.max(
    0,
    ...Object.values(columns)
      .filter(Array.isArray)
      .map((x) => x.length),
  );
  return Array.from(
    { length: count },
    (_, index) =>
      Object.fromEntries(
        Object.entries(columns).map(([key, values]) => [
          key,
          Array.isArray(values) ? values[index] : undefined,
        ]),
      ) as FilingRow,
  ).filter((row) => row.accessionNumber && row.form && row.filingDate);
}
function dateOverlap(
  from: string | undefined,
  to: string | undefined,
  wantedFrom: string,
  wantedTo: string,
) {
  return (!from || from <= wantedTo) && (!to || to >= wantedFrom);
}
function clean(value: unknown) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}
function normalizeCik(value: string) {
  return value.replace(/\D/g, "").padStart(10, "0");
}
function archiveCik(value: string) {
  return String(Number(normalizeCik(value)));
}
function acceptedTimestamp(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const time = Date.parse(text);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!compact) return null;
  const day = `${compact[1]}-${compact[2]}-${compact[3]}`;
  const probe = new Date(`${day}T12:00:00Z`);
  const zone =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
    })
      .formatToParts(probe)
      .find((x) => x.type === "timeZoneName")?.value ?? "GMT-5";
  const match = zone.match(/GMT([+-])(\d{1,2})/);
  const offset = match
    ? `${match[1]}${match[2].padStart(2, "0")}:00`
    : "-05:00";
  const parsed = Date.parse(
    `${day}T${compact[4]}:${compact[5]}:${compact[6]}${offset}`,
  );
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

class SecRateLimiter {
  private nextAt = 0;
  constructor(
    private requestsPerSecond: number,
    private sleep: (milliseconds: number) => Promise<void>,
  ) {}
  async wait() {
    const interval = Math.ceil(1000 / this.requestsPerSecond);
    const now = Date.now();
    const delay = Math.max(0, this.nextAt - now);
    this.nextAt = Math.max(now, this.nextAt) + interval;
    if (delay) await this.sleep(delay);
  }
  status() {
    return {
      requestsPerSecond: this.requestsPerSecond,
      nextRequestAt: this.nextAt,
    };
  }
}

const sharedLimiters = new Map<number, SecRateLimiter>();
const errorDetails = (error: unknown) => {
  if (error instanceof ProviderHttpError) {
    return {
      errorType:
        error.status === 429
          ? "rate_limited"
          : error.retryable
            ? "provider_http_temporary"
            : error.status === 404
              ? "not_found"
              : "provider_http_failure",
      httpStatus: error.status,
      retryable: error.retryable,
      health: (error.status === 429
        ? "rate_limited"
        : error.retryable
          ? "degraded"
          : "unavailable") as ProviderHealthState,
    };
  }
  const timeout = error instanceof DOMException && error.name === "AbortError";
  return {
    errorType: timeout ? "timeout" : "network_failure",
    httpStatus: undefined,
    retryable: true,
    health: "degraded" as ProviderHealthState,
  };
};

export class SecEdgarProvider implements EventProvider {
  readonly name = "sec_edgar";
  readonly sourceType = "sec";
  private limiter: SecRateLimiter;
  private requests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private staleFallbacks = 0;
  private fallbackFailure: {
    error: string;
    errorType: string;
    httpStatus?: number;
    retryable: boolean;
  } | null = null;
  private health: ProviderHealthState = "degraded";

  constructor(
    private options: {
      userAgent?: string;
      requestsPerSecond?: number;
      cacheTtlHours?: number;
      maxRetries?: number;
      fetcher?: typeof fetch;
      sleep?: (milliseconds: number) => Promise<void>;
      cache?: ProviderResponseCache;
    } = {},
  ) {
    const requestsPerSecond = Math.max(
      1,
      Math.min(
        options.requestsPerSecond ?? catalystConfig.secRequestsPerSecond,
        9,
      ),
    );
    const sleep =
      options.sleep ??
      ((milliseconds: number) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    if (options.fetcher || options.sleep)
      this.limiter = new SecRateLimiter(requestsPerSecond, sleep);
    else {
      const existing = sharedLimiters.get(requestsPerSecond);
      this.limiter = existing ?? new SecRateLimiter(requestsPerSecond, sleep);
      sharedLimiters.set(requestsPerSecond, this.limiter);
    }
  }

  private get userAgent() {
    return this.options.userAgent ?? catalystConfig.secUserAgent;
  }
  private resetMetrics() {
    this.requests = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.staleFallbacks = 0;
    this.fallbackFailure = null;
  }
  healthCheck() {
    const configured = validSecUserAgent(this.userAgent);
    if (!configured)
      return {
        configured: false,
        status: "unconfigured" as const,
        message:
          "Set SEC_USER_AGENT to an application name plus a genuine contact email or URL.",
      };
    return {
      configured: true,
      status: this.health,
      message:
        this.health === "healthy"
          ? "SEC EDGAR is responding normally."
          : "SEC EDGAR is configured; provider state reflects the latest request outcome.",
    };
  }
  rateLimitStatus() {
    return this.limiter.status();
  }

  private async payload(url: string, signal?: AbortSignal) {
    const key = `sec:${url}`;
    const cached = await this.options.cache?.get(key);
    const fresh = cached && Date.parse(cached.expiresAt) > Date.now();
    if (
      fresh &&
      (cached.status === "success" || cached.status == null) &&
      cached.payload
    ) {
      this.cacheHits++;
      return cached.payload as SubmissionPayload;
    }
    if (fresh && cached.status === "not_found" && !cached.payload) {
      this.cacheHits++;
      throw new ProviderHttpError(
        cached.errorMessage ?? "SEC resource was not found",
        cached.httpStatus ?? 404,
        false,
      );
    }
    this.cacheMisses++;
    const headers = new Headers({
      "User-Agent": this.userAgent,
      "Accept-Encoding": "gzip, deflate",
      Accept: "application/json",
    });
    if (cached?.etag) headers.set("If-None-Match", cached.etag);
    if (cached?.lastModified)
      headers.set("If-Modified-Since", cached.lastModified);
    try {
      const response = await fetchWithRetry(
        url,
        { headers, signal },
        {
          fetcher: this.options.fetcher ?? fetch,
          sleep: this.options.sleep,
          attempts: this.options.maxRetries ?? catalystConfig.secMaxRetries,
          beforeAttempt: async () => {
            await this.limiter.wait();
            this.requests++;
            return true;
          },
        },
      );
      if (response.status === 304 && cached?.payload) {
        this.cacheHits++;
        await this.options.cache?.touch?.(
          key,
          this.options.cacheTtlHours ?? catalystConfig.secCacheTtlHours,
        );
        return cached.payload as SubmissionPayload;
      }
      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");
      const data = await response.json();
      if (!data || typeof data !== "object")
        throw new Error("SEC submissions response was not a JSON object");
      await this.options.cache?.set(
        key,
        url,
        data,
        this.options.cacheTtlHours ?? catalystConfig.secCacheTtlHours,
        { etag, lastModified },
      );
      return data as SubmissionPayload;
    } catch (error) {
      const details = errorDetails(error);
      this.health = details.health;
      await this.options.cache?.recordFailure?.(key, url, {
        status:
          details.errorType === "not_found"
            ? "not_found"
            : details.retryable
              ? "temporary_failure"
              : "failure",
        httpStatus: details.httpStatus,
        errorType: details.errorType,
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable: details.retryable,
        ttlMinutes: details.retryable ? 5 : 60,
      });
      if (cached?.payload && details.retryable) {
        this.cacheHits++;
        this.staleFallbacks++;
        this.fallbackFailure = {
          error: error instanceof Error ? error.message : String(error),
          errorType: details.errorType,
          httpStatus: details.httpStatus,
          retryable: true,
        };
        return cached.payload as SubmissionPayload;
      }
      throw error;
    }
  }

  async resolveCik(symbol: string): Promise<CikResolutionResult> {
    this.resetMetrics();
    const sourceUrl = "https://www.sec.gov/files/company_tickers.json";
    const normalized = symbol.trim().toUpperCase();
    if (!this.healthCheck().configured)
      return {
        status: "unconfigured",
        symbol: normalized,
        cik: null,
        companyName: null,
        candidateCount: 0,
        rawMapping: {},
        sourceUrl,
        requestsMade: 0,
        cacheHits: 0,
        cacheMisses: 0,
      };
    try {
      const payload = await this.payload(sourceUrl);
      const candidates = Object.values(payload).filter(
        (value): value is Record<string, unknown> =>
          Boolean(
            value &&
              typeof value === "object" &&
              String(
                (value as Record<string, unknown>).ticker ?? "",
              ).toUpperCase() === normalized,
          ),
      );
      const status =
        candidates.length === 1
          ? "resolved"
          : candidates.length > 1
            ? "ambiguous"
            : "not_found";
      const candidate = candidates[0] ?? {};
      if (!this.staleFallbacks) this.health = "healthy";
      return {
        status,
        symbol: normalized,
        cik:
          status === "resolved"
            ? normalizeCik(String(candidate.cik_str ?? ""))
            : null,
        companyName: clean(candidate.title),
        candidateCount: candidates.length,
        rawMapping: candidate,
        sourceUrl,
        requestsMade: this.requests,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
      };
    } catch (error) {
      const details = errorDetails(error);
      return {
        status: "failed",
        symbol: normalized,
        cik: null,
        companyName: null,
        candidateCount: 0,
        rawMapping: {},
        sourceUrl,
        requestsMade: this.requests,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        error: `${details.errorType}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async searchTickerEvents(
    input: CatalystSearchInput,
  ): Promise<EventProviderResult> {
    this.resetMetrics();
    if (!this.healthCheck().configured)
      return {
        provider: this.name,
        status: "not_configured",
        events: [],
        requestsMade: 0,
        cacheHits: 0,
        cacheMisses: 0,
        limitations: [
          "SEC filing research was not run because a declared SEC_USER_AGENT is not configured.",
        ],
        providerHealth: "unconfigured",
        retryable: false,
      };
    if (!input.cik)
      return {
        provider: this.name,
        status: "partial",
        events: [],
        requestsMade: 0,
        cacheHits: 0,
        cacheMisses: 0,
        limitations: [
          "SEC filing research was not run because this ticker has no cached CIK or authoritatively resolved CIK.",
        ],
        providerHealth: this.health,
        retryable: false,
      };
    try {
      const cik = normalizeCik(input.cik);
      const rootUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
      const root = await this.payload(rootUrl, input.signal);
      const rows = [...columnarRows(root.filings?.recent)];
      for (const file of root.filings?.files ?? []) {
        if (
          !file.name ||
          !dateOverlap(
            file.filingFrom,
            file.filingTo,
            input.dateFrom,
            input.dateTo,
          )
        )
          continue;
        const older = await this.payload(
          `https://data.sec.gov/submissions/${encodeURIComponent(file.name)}`,
          input.signal,
        );
        rows.push(
          ...columnarRows(
            (older as SubmissionPayload).filings?.recent ?? older,
          ),
        );
      }
      const seen = new Set<string>();
      const events = rows
        .filter(
          (row) =>
            row.filingDate >= input.dateFrom &&
            row.filingDate <= input.dateTo &&
            !seen.has(row.accessionNumber) &&
            seen.add(row.accessionNumber),
        )
        .map((row) =>
          this.normalizeEvent({ ...row, cik, tickerId: input.tickerId }, input),
        )
        .filter(Boolean) as NormalizedCatalystEvent[];
      if (!this.staleFallbacks) this.health = "healthy";
      return {
        provider: this.name,
        status: this.staleFallbacks ? "partial" : "completed",
        events,
        requestsMade: this.requests,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        providerHealth: this.health,
        ...(this.fallbackFailure ?? {}),
        limitations: [
          "Coverage includes SEC submissions metadata for the requested CIK and date window.",
          "Form and item classifications describe filing evidence and do not establish that a filing caused a market move.",
          "Filing document contents are not inferred when item metadata is unavailable.",
          ...(this.staleFallbacks
            ? [
                "A temporary SEC failure occurred; preserved stale cached metadata was used and coverage is marked partial.",
              ]
            : []),
        ],
      };
    } catch (error) {
      const details = errorDetails(error);
      this.health = details.health;
      return {
        provider: this.name,
        status: "failed",
        events: [],
        requestsMade: this.requests,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        limitations: [
          "SEC coverage is incomplete because the configured request failed.",
        ],
        error: error instanceof Error ? error.message : String(error),
        errorType: details.errorType,
        httpStatus: details.httpStatus,
        retryable: details.retryable,
        providerHealth: details.health,
      };
    }
  }

  async fetchEvent(externalEventId: string, input: CatalystSearchInput) {
    const result = await this.searchTickerEvents(input);
    return (
      result.events.find(
        (event) => event.externalEventId === externalEventId,
      ) ?? null
    );
  }

  normalizeEvent(
    raw: unknown,
    input: CatalystSearchInput,
  ): NormalizedCatalystEvent | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as FilingRow & { cik: string; tickerId: string };
    if (!row.accessionNumber || !row.form || !row.filingDate) return null;
    const cik = normalizeCik(row.cik);
    const accession = row.accessionNumber;
    const accessionPath = accession.replaceAll("-", "");
    const base = `https://www.sec.gov/Archives/edgar/data/${archiveCik(cik)}/${accessionPath}`;
    const primary = clean(row.primaryDocument);
    const filingUrl = `${base}/${accession}-index.html`;
    const primaryUrl = primary
      ? `${base}/${encodeURIComponent(primary)}`
      : null;
    const acceptedAt = acceptedTimestamp(row.acceptanceDateTime);
    const items = String(row.items ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const description = clean(row.primaryDocDescription);
    const classifications = classifySecFiling({
      formType: row.form,
      items,
      description,
    });
    const classification =
      primaryClassification(
        classifications.filter((value) => value.candidateType !== "sec_filing"),
      ) ?? primaryClassification(classifications);
    const headline = `${row.form.toUpperCase()} filing${description ? `: ${description}` : ""}`;
    return {
      externalEventId: accession,
      tickerId: row.tickerId,
      eventDate: acceptedAt ?? `${row.filingDate}T00:00:00.000Z`,
      eventType: "sec_filing",
      eventSubtype:
        classification?.candidateType === "sec_filing"
          ? null
          : (classification?.candidateSubtype ??
            classification?.candidateType ??
            null),
      headline,
      description,
      publishedAt: acceptedAt,
      effectiveAt: null,
      marketSession: marketSessionFor(acceptedAt),
      sourceName: "SEC EDGAR",
      sourceType: "sec",
      sourceUrl: filingUrl,
      sourceDocumentUrl: primaryUrl,
      sourceDocumentType: row.form.toUpperCase(),
      rawTitle: description,
      rawSummary: null,
      normalizedHeadline: headline,
      normalizedDescription: description,
      isPrimarySource: true,
      ingestionMethod: "sec_submissions_api",
      eventConfidence: 1,
      sec: {
        cik,
        accessionNumber: accession,
        formType: row.form.toUpperCase(),
        filingDate: row.filingDate,
        reportDate: clean(row.reportDate),
        acceptedAt,
        primaryDocument: primary,
        filingUrl,
        primaryDocumentUrl: primaryUrl,
        items,
        description,
        isAmendment: /\/A$/i.test(row.form),
        rawMetadata: { ...row },
      },
      classifications,
      metadata: {
        provider: "sec_edgar",
        classificationVersion: "catalyst-v1",
        classifierId: "sec-form-items",
        timestampPrecision: acceptedAt ? "timestamp" : "date",
        companyNameUnavailableInRow: true,
        requestedSymbol: input.symbol,
      },
    };
  }
}
