import { catalystConfig } from "./config";
import { SupabaseEventSourceCache } from "./cache";
import { SecEdgarProvider } from "./sec-provider";
import { linkEventToMover } from "./temporal";
import {
  CATALYST_CLASSIFICATION_VERSION,
  CATALYST_CLASSIFIER_ID,
  type EventProvider,
  type EventProviderResult,
  type NormalizedCatalystEvent,
} from "./types";

const rpc = async (db: any, name: string, args: Record<string, unknown>) => {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
};
const failure = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function persistEvent(
  db: any,
  sourceId: string,
  event: NormalizedCatalystEvent,
) {
  const existing = await db
    .from("ticker_events")
    .select(
      "id,normalized_headline,normalized_description,event_subtype,classification_version",
    )
    .eq("source_id", sourceId)
    .eq("external_event_id", event.externalEventId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  let eventId: string;
  let inserted = false;
  if (existing.data) {
    eventId = String(existing.data.id);
    const { error } = await db
      .from("ticker_events")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
  } else {
    const payload = {
      ticker_id: event.tickerId,
      event_date: event.eventDate,
      event_type: event.eventType,
      headline: event.headline,
      description: event.description,
      source_url: event.sourceUrl,
      source_id: sourceId,
      external_event_id: event.externalEventId,
      event_subtype: event.eventSubtype,
      published_at: event.publishedAt,
      effective_at: event.effectiveAt,
      source_name: event.sourceName,
      source_type: event.sourceType,
      source_document_url: event.sourceDocumentUrl,
      source_document_type: event.sourceDocumentType,
      sec_accession_number: event.sec?.accessionNumber ?? null,
      sec_form_type: event.sec?.formType ?? null,
      sec_cik: event.sec?.cik ?? null,
      event_status: "normalized",
      event_confidence: event.eventConfidence,
      ingestion_method: event.ingestionMethod,
      raw_title: event.rawTitle,
      raw_summary: event.rawSummary,
      normalized_headline: event.normalizedHeadline,
      normalized_description: event.normalizedDescription,
      is_primary_source: event.isPrimarySource,
      market_session: event.marketSession,
      classification_version: CATALYST_CLASSIFICATION_VERSION,
      last_seen_at: new Date().toISOString(),
      metadata: event.metadata,
    };
    const stored = await db
      .from("ticker_events")
      .insert(payload)
      .select("id")
      .single();
    if (stored.error) throw new Error(stored.error.message);
    eventId = String(stored.data.id);
    inserted = true;
  }

  if (event.sec) {
    const filing = await db.from("sec_filings").upsert(
      {
        event_id: eventId,
        ticker_id: event.tickerId,
        cik: event.sec.cik,
        accession_number: event.sec.accessionNumber,
        form_type: event.sec.formType,
        filing_date: event.sec.filingDate,
        report_date: event.sec.reportDate,
        accepted_at: event.sec.acceptedAt,
        primary_document: event.sec.primaryDocument,
        filing_url: event.sec.filingUrl,
        primary_document_url: event.sec.primaryDocumentUrl,
        items: event.sec.items,
        description: event.sec.description,
        is_amendment: event.sec.isAmendment,
        raw_metadata: event.sec.rawMetadata,
      },
      { onConflict: "accession_number", ignoreDuplicates: true },
    );
    if (filing.error) throw new Error(filing.error.message);
  }

  const current = await db
    .from("event_classification_evidence")
    .select("candidate_type,candidate_subtype")
    .eq("event_id", eventId)
    .eq("classifier_id", CATALYST_CLASSIFIER_ID)
    .eq("classification_version", CATALYST_CLASSIFICATION_VERSION);
  if (current.error) throw new Error(current.error.message);
  const keys = new Set(
    (current.data ?? []).map(
      (row: any) => `${row.candidate_type}:${row.candidate_subtype ?? ""}`,
    ),
  );
  const missing = event.classifications.filter(
    (candidate) =>
      !keys.has(
        `${candidate.candidateType}:${candidate.candidateSubtype ?? ""}`,
      ),
  );
  if (missing.length) {
    const classifications = await db
      .from("event_classification_evidence")
      .insert(
        missing.map((candidate) => ({
          event_id: eventId,
          classifier_id: CATALYST_CLASSIFIER_ID,
          classification_version: CATALYST_CLASSIFICATION_VERSION,
          candidate_type: candidate.candidateType,
          candidate_subtype: candidate.candidateSubtype,
          confidence: candidate.confidence,
          reason: candidate.reason,
          evidence: candidate.evidence,
        })),
      );
    if (classifications.error) throw new Error(classifications.error.message);
  }
  await rpc(db, "refresh_catalyst_search_document", { p_event_id: eventId });
  return { id: eventId, inserted };
}

async function linkEvents(
  db: any,
  events: Array<{ id: string; event: NormalizedCatalystEvent }>,
  tickerId: string,
  dateFrom: string,
  dateTo: string,
) {
  const appearances = await db
    .from("market_mover_appearances")
    .select("id,report_date")
    .eq("ticker_id", tickerId)
    .gte("report_date", dateFrom)
    .lte("report_date", dateTo)
    .order("report_date");
  if (appearances.error) throw new Error(appearances.error.message);
  let links = 0;
  for (const stored of events)
    for (const appearance of appearances.data ?? []) {
      const candidate = stored.event.classifications.find(
        (value) => value.candidateType !== "sec_filing",
      );
      const link = linkEventToMover({
        eventAt: stored.event.publishedAt,
        eventDate: stored.event.eventDate,
        moverDate: appearance.report_date,
        isPrimarySource: stored.event.isPrimarySource,
        specificClassification: Boolean(candidate),
        formType: stored.event.sec?.formType,
      });
      const relationship = await db
        .from("event_mover_relationships")
        .upsert(
          {
            event_id: stored.id,
            appearance_id: appearance.id,
            ticker_id: tickerId,
            relationship_type: link.relationshipType,
            event_at: link.eventAt,
            mover_date: link.moverDate,
            minutes_before_move: link.minutesBeforeMove,
            hours_before_move: link.hoursBeforeMove,
            days_before_move: link.daysBeforeMove,
            temporal_bucket: link.temporalBucket,
            confidence: link.confidence,
            catalyst_relevance: link.catalystRelevance,
            reason: link.reason,
            score_evidence: link.scoreEvidence,
          },
          { onConflict: "event_id,appearance_id", ignoreDuplicates: true },
        )
        .select("id");
      if (relationship.error) throw new Error(relationship.error.message);
      links += relationship.data?.length ?? 0;
    }
  if (events.length) {
    const update = await db
      .from("ticker_events")
      .update({ event_status: links ? "linked" : "normalized" })
      .in(
        "id",
        events.map((value) => value.id),
      )
      .neq("classification_version", "manual-correction-v1");
    if (update.error) throw new Error(update.error.message);
  }
  return links;
}

async function resolveTickerCik(db: any, ticker: any, provider: EventProvider) {
  if (ticker.cik)
    return {
      cik: ticker.cik,
      limitation: null,
      requestsMade: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  const cached = await db
    .from("cik_resolution_cache")
    .select("*")
    .eq("normalized_symbol", String(ticker.symbol).toUpperCase())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached.error) throw new Error(cached.error.message);
  if (cached.data)
    return {
      cik:
        cached.data.resolution_status === "resolved" ? cached.data.cik : null,
      limitation: `SEC CIK fallback mapping status: ${cached.data.resolution_status}.`,
      requestsMade: 0,
      cacheHits: 1,
      cacheMisses: 0,
    };
  if (!provider.resolveCik)
    return {
      cik: null,
      limitation:
        "The configured provider does not support authoritative CIK fallback resolution.",
      requestsMade: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  const result = await provider.resolveCik(ticker.symbol);
  const status = ["resolved", "not_found", "ambiguous", "unresolved"].includes(
    result.status,
  )
    ? result.status
    : "unresolved";
  const mapping = await db
    .from("cik_resolution_cache")
    .upsert(
      {
        symbol: ticker.symbol,
        normalized_symbol: String(ticker.symbol).toUpperCase(),
        cik: result.cik,
        company_name: result.companyName,
        resolution_status: status,
        candidate_count: result.candidateCount,
        source_url: result.sourceUrl,
        raw_mapping: result.rawMapping,
        retrieved_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        last_error: result.error ?? null,
      },
      { onConflict: "normalized_symbol" },
    );
  if (mapping.error) throw new Error(mapping.error.message);
  return {
    cik: result.status === "resolved" ? result.cik : null,
    limitation:
      result.status === "resolved"
        ? "CIK was resolved from the authoritative SEC ticker mapping and cached without changing ticker identity."
        : `SEC ticker/CIK mapping status is ${result.status}; no issuer was guessed.`,
    requestsMade: result.requestsMade,
    cacheHits: result.cacheHits,
    cacheMisses: result.cacheMisses,
  };
}

async function saveCoverage(
  db: any,
  item: any,
  result: EventProviderResult,
  extraLimitations: string[],
) {
  const required = Array.isArray(item.required_sources)
    ? item.required_sources.map((value: unknown) => String(value).toLowerCase())
    : ["sec"];
  const onlySec = required.every((value: string) => value === "sec");
  const complete = result.status === "completed" && onlySec;
  const status = complete
    ? "complete_for_configured_sources"
    : result.status === "failed"
      ? "failed"
      : "partial";
  const limitations = [...result.limitations, ...extraLimitations];
  if (!onlySec)
    limitations.push(
      "Only the SEC EDGAR adapter is configured in Phase 2B; requested news or company-IR coverage remains partial until an optional source is configured.",
    );
  const payload = {
    ticker_id: item.ticker_id,
    date_from: item.date_from,
    date_to: item.date_to,
    source_scope_key: item.source_scope_key,
    sources_checked: [
      {
        source: "sec",
        provider: result.provider,
        status: result.status,
        health: result.providerHealth,
        requestsMade: result.requestsMade,
        cacheHits: result.cacheHits,
        cacheMisses: result.cacheMisses,
      },
    ],
    last_researched_at: new Date().toISOString(),
    sec_checked:
      result.status !== "not_configured" &&
      (result.requestsMade > 0 || result.cacheHits > 0),
    news_checked: false,
    company_ir_checked: false,
    events_found: result.events.length,
    coverage_status: status,
    limitations: [...new Set(limitations)],
  };
  const stored = await db
    .from("ticker_catalyst_coverage")
    .upsert(payload, {
      onConflict: "ticker_id,date_from,date_to,source_scope_key",
    });
  if (stored.error) throw new Error(stored.error.message);
  return status;
}

async function persistFailure(
  db: any,
  item: any,
  sourceId: string,
  result: EventProviderResult,
  availableAfter: string | null,
) {
  if (!result.error) return;
  const stored = await db
    .from("catalyst_provider_failures")
    .insert({
      queue_id: item.id,
      ticker_id: item.ticker_id,
      source_id: sourceId,
      date_from: item.date_from,
      date_to: item.date_to,
      attempt: Math.max(1, Number(item.attempts) || 1),
      http_status: result.httpStatus ?? null,
      error_type: result.errorType ?? "provider_failure",
      error_message: result.error,
      retryable: Boolean(result.retryable),
      available_after: availableAfter,
    });
  if (stored.error) throw new Error(stored.error.message);
}

export async function processCatalystQueueItem(
  db: any,
  item: any,
  provider?: EventProvider,
) {
  const startedAt = new Date();
  const [tickerResult, sourceResult] = await Promise.all([
    db
      .from("tickers")
      .select("id,symbol,cik,security_type")
      .eq("id", item.ticker_id)
      .maybeSingle(),
    db.from("event_sources").select("id").eq("name", "SEC EDGAR").maybeSingle(),
  ]);
  if (
    tickerResult.error ||
    sourceResult.error ||
    !tickerResult.data ||
    !sourceResult.data
  )
    throw new Error(
      tickerResult.error?.message ??
        sourceResult.error?.message ??
        "Ticker or SEC source registry row is unavailable",
    );
  const ticker = tickerResult.data;
  const source = sourceResult.data;
  const activeProvider =
    provider ??
    new SecEdgarProvider({
      cache: new SupabaseEventSourceCache(db, source.id),
    });
  let result: EventProviderResult | null = null;
  let inserted = 0;
  let duplicates = 0;
  let relationships = 0;
  const extraLimitations: string[] = [];
  try {
    const resolution = await resolveTickerCik(db, ticker, activeProvider);
    if (resolution.limitation) extraLimitations.push(resolution.limitation);
    if (
      ["ETF", "ETN", "fund", "warrant", "unit"].includes(
        String(ticker.security_type ?? ""),
      )
    )
      extraLimitations.push(
        `Security type ${ticker.security_type} may not have operating-company catalyst coverage; issuer mapping and SEC evidence are reported without forcing operating-company assumptions.`,
      );
    result = await activeProvider.searchTickerEvents({
      tickerId: ticker.id,
      symbol: ticker.symbol,
      cik: resolution.cik,
      dateFrom: item.date_from,
      dateTo: item.date_to,
    });
    result.requestsMade += resolution.requestsMade;
    result.cacheHits += resolution.cacheHits;
    result.cacheMisses += resolution.cacheMisses;
    const stored: Array<{ id: string; event: NormalizedCatalystEvent }> = [];
    for (const event of result.events) {
      const persisted = await persistEvent(db, source.id, event);
      stored.push({ id: persisted.id, event });
      if (persisted.inserted) inserted++;
      else duplicates++;
    }
    relationships = await linkEvents(
      db,
      stored,
      ticker.id,
      item.date_from,
      item.date_to,
    );
    const coverage = await saveCoverage(db, item, result, extraLimitations);
    const retryable =
      Boolean(result.retryable) &&
      Number(item.attempts) < catalystConfig.queueMaxAttempts;
    const delayMinutes =
      result.providerHealth === "rate_limited"
        ? 15
        : Math.min(60, 5 * 2 ** Math.max(0, Number(item.attempts) - 1));
    const availableAfter = retryable
      ? new Date(Date.now() + delayMinutes * 60_000).toISOString()
      : null;
    await persistFailure(db, item, source.id, result, availableAfter);
    const queueStatus = retryable
      ? "deferred"
      : coverage === "complete_for_configured_sources"
        ? "completed"
        : result.status === "failed"
          ? "failed"
          : "partial";
    await rpc(db, "finish_catalyst_research_queue", {
      p_queue_id: item.id,
      p_status: queueStatus,
      p_error: result.error ?? null,
      p_available_after: availableAfter,
    });
    const run = await db
      .from("catalyst_provider_runs")
      .insert({
        queue_id: item.id,
        ticker_id: ticker.id,
        source_id: source.id,
        provider: result.provider,
        status:
          queueStatus === "deferred"
            ? "deferred"
            : result.status === "not_configured"
              ? "unconfigured"
              : queueStatus,
        requests_made: result.requestsMade,
        cache_hits: result.cacheHits,
        cache_misses: result.cacheMisses,
        rate_limited_count: result.providerHealth === "rate_limited" ? 1 : 0,
        events_inserted: inserted,
        duplicates_detected: duplicates,
        relationships_created: relationships,
        duration_ms: Date.now() - startedAt.getTime(),
        error_type: result.errorType ?? null,
        error_message: result.error ?? null,
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
      });
    if (run.error) throw new Error(run.error.message);
    return {
      queueId: item.id,
      status: queueStatus,
      eventsStored: stored.length,
      eventsInserted: inserted,
      duplicatesDetected: duplicates,
      relationshipsStored: relationships,
      provider: result.provider,
      providerHealth: result.providerHealth,
      requestsMade: result.requestsMade,
      cacheHits: result.cacheHits,
      cacheMisses: result.cacheMisses,
      coverageStatus: coverage,
      limitations: [...result.limitations, ...extraLimitations],
    };
  } catch (error) {
    const message = failure(error);
    try {
      await db
        .from("catalyst_provider_failures")
        .insert({
          queue_id: item.id,
          ticker_id: ticker.id,
          source_id: source.id,
          date_from: item.date_from,
          date_to: item.date_to,
          attempt: Math.max(1, Number(item.attempts) || 1),
          error_type: "worker_failure",
          error_message: message,
          retryable: false,
        });
      await db
        .from("catalyst_provider_runs")
        .insert({
          queue_id: item.id,
          ticker_id: ticker.id,
          source_id: source.id,
          provider: result?.provider ?? activeProvider.name,
          status: "failed",
          requests_made: result?.requestsMade ?? 0,
          cache_hits: result?.cacheHits ?? 0,
          cache_misses: result?.cacheMisses ?? 0,
          events_inserted: inserted,
          duplicates_detected: duplicates,
          relationships_created: relationships,
          duration_ms: Date.now() - startedAt.getTime(),
          error_type: "worker_failure",
          error_message: message,
          started_at: startedAt.toISOString(),
          completed_at: new Date().toISOString(),
        });
      await rpc(db, "finish_catalyst_research_queue", {
        p_queue_id: item.id,
        p_status: "failed",
        p_error: message,
        p_available_after: null,
      });
    } catch {}
    throw error;
  }
}

export async function processCatalystQueue(
  db: any,
  options: {
    queueId?: string;
    limit?: number;
    providerFactory?: (item: any) => EventProvider;
  } = {},
) {
  const claimed = (await rpc(db, "claim_catalyst_research_queue", {
    p_limit: Math.max(
      1,
      Math.min(options.limit ?? catalystConfig.queueBatchSize, 5),
    ),
    p_queue_id: options.queueId ?? null,
  })) as any[];
  const results = [] as any[];
  for (const item of claimed) {
    try {
      results.push(
        await processCatalystQueueItem(
          db,
          item,
          options.providerFactory?.(item),
        ),
      );
    } catch (error) {
      results.push({
        queueId: item.id,
        status: "failed",
        error: failure(error),
      });
    }
  }
  return { claimed: claimed.length, processed: results.length, results };
}
