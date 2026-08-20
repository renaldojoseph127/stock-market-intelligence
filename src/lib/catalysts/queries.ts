import { catalystConfig, validSecUserAgent } from "@/lib/catalysts/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getTickerCatalysts(tickerId: string) {
  const db: any = await createClient();
  const fallback = {
    events: [] as any[],
    appearances: [] as any[],
    coverage: [] as any[],
  };
  if (!db) return { data: fallback, configured: false, error: null };
  const [events, relationships, appearances, coverage] = await Promise.all([
    db
      .from("event_intelligence")
      .select("*")
      .eq("ticker_id", tickerId)
      .not("event_status", "in", "(duplicate,excluded,failed)")
      .order("event_date", { ascending: false })
      .limit(100),
    db
      .from("event_mover_relationships")
      .select(
        "event_id,appearance_id,relationship_type,temporal_bucket,catalyst_relevance,reason,mover_date",
      )
      .eq("ticker_id", tickerId)
      .order("catalyst_relevance", { ascending: false })
      .limit(500),
    db
      .from("market_mover_appearances_effective")
      .select(
        "id,report_date,category_name,raw_price,raw_change_percent,raw_volume",
      )
      .eq("ticker_id", tickerId)
      .order("report_date", { ascending: false })
      .limit(100),
    db
      .from("ticker_catalyst_coverage")
      .select("*")
      .eq("ticker_id", tickerId)
      .order("last_researched_at", { ascending: false })
      .limit(25),
  ]);
  const byEvent = Map.groupBy(
    relationships.data ?? [],
    (row: any) => row.event_id,
  );
  const enriched = (events.data ?? []).map((event: any) => ({
    ...event,
    relationships: byEvent.get(event.id) ?? [],
    top_relationship: byEvent.get(event.id)?.[0] ?? null,
  }));
  const error =
    events.error ?? relationships.error ?? appearances.error ?? coverage.error;
  return {
    data: {
      events: enriched,
      appearances: appearances.data ?? [],
      coverage: coverage.data ?? [],
    },
    configured: true,
    error: error?.message ?? null,
  };
}

export async function getMoverCatalysts(appearanceId: string) {
  const db: any = await createClient();
  const fallback = {
    status: null as any,
    events: [] as any[],
    coverage: [] as any[],
  };
  if (!db) return { data: fallback, configured: false, error: null };
  const [status, relationships] = await Promise.all([
    db
      .from("mover_catalyst_status")
      .select("*")
      .eq("appearance_id", appearanceId)
      .maybeSingle(),
    db
      .from("event_mover_relationships")
      .select("*")
      .eq("appearance_id", appearanceId)
      .order("catalyst_relevance", { ascending: false })
      .limit(100),
  ]);
  const ids = (relationships.data ?? []).map((row: any) => row.event_id);
  let events: any = { data: [], error: null };
  let coverage: any = { data: [], error: null };
  if (ids.length)
    events = await db.from("event_intelligence").select("*").in("id", ids);
  if (status.data)
    coverage = await db
      .from("ticker_catalyst_coverage")
      .select("*")
      .eq("ticker_id", status.data.ticker_id)
      .lte("date_from", status.data.report_date)
      .gte("date_to", status.data.report_date)
      .order("last_researched_at", { ascending: false })
      .limit(10);
  const byId = new Map(
    (events.data ?? []).map((event: any) => [event.id, event]),
  );
  const combined = (relationships.data ?? []).map((relationship: any) => ({
    ...relationship,
    event: byId.get(relationship.event_id),
  }));
  const error =
    status.error ?? relationships.error ?? events.error ?? coverage.error;
  return {
    data: {
      status: status.data,
      events: combined,
      coverage: coverage.data ?? [],
    },
    configured: true,
    error: error?.message ?? null,
  };
}

export async function getCatalystEvent(id: string) {
  const db: any = await createClient();
  if (!db) return { data: null as any, configured: false, error: null };
  const [
    event,
    filing,
    classifications,
    relationships,
    members,
    normalizationHistory,
    manualAudit,
    documentEvidence,
  ] = await Promise.all([
    db.from("event_intelligence").select("*").eq("id", id).maybeSingle(),
    db.from("sec_filings").select("*").eq("event_id", id).maybeSingle(),
    db
      .from("event_classification_evidence")
      .select("*")
      .eq("event_id", id)
      .order("confidence", { ascending: false }),
    db
      .from("event_mover_relationships")
      .select(
        "*,market_mover_appearances(report_date,rank,price,change_percent,volume,market_categories(name))",
      )
      .eq("event_id", id)
      .order("mover_date"),
    db
      .from("event_cluster_members")
      .select(
        "cluster_id,relationship_type,confidence,event_clusters(id,cluster_type,cluster_date,canonical_event_id,review_status,review_reason)",
      )
      .eq("event_id", id),
    db
      .from("event_normalization_history")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("manual_event_audit")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("filing_document_evidence")
      .select("*,sec_filings!inner(event_id)")
      .eq("sec_filings.event_id", id)
      .order("retrieved_at", { ascending: false })
      .limit(100),
  ]);
  if (event.error || !event.data)
    return {
      data: event.data,
      configured: true,
      error: event.error?.message ?? null,
    };
  const clusterIds = (members.data ?? []).map((row: any) => row.cluster_id);
  let related: any = { data: [], error: null };
  if (clusterIds.length)
    related = await db
      .from("event_cluster_members")
      .select(
        "cluster_id,event_id,relationship_type,confidence,ticker_events(id,event_date,event_type,event_subtype,headline,source_name,source_url,is_primary_source)",
      )
      .in("cluster_id", clusterIds)
      .neq("event_id", id);
  const error =
    filing.error ??
    classifications.error ??
    relationships.error ??
    members.error ??
    normalizationHistory.error ??
    manualAudit.error ??
    documentEvidence.error ??
    related.error;
  return {
    data: {
      ...event.data,
      filing: filing.data,
      classifications: classifications.data ?? [],
      relationships: relationships.data ?? [],
      clusters: members.data ?? [],
      related_events: related.data ?? [],
      normalization_history: normalizationHistory.data ?? [],
      manual_audit: manualAudit.data ?? [],
      document_evidence: documentEvidence.data ?? [],
    },
    configured: true,
    error: error?.message ?? null,
  };
}

export async function getCatalystAnalytics() {
  const db: any = await createClient();
  const fallback = {
    summary: null as any,
    universe: null as any,
    types: [] as any[],
    timing: [] as any[],
    exchanges: [] as any[],
    categories: [] as any[],
    beforeMove: [] as any[],
    combinations: [] as any[],
    repeats: [] as any[],
    forms: [] as any[],
    sources: [] as any[],
    secCoverage: null as any,
    monthly: [] as any[],
    yearly: [] as any[],
  };
  if (!db) return { data: fallback, configured: false, error: null };
  const results = await Promise.all([
    db.from("catalyst_analytics_summary").select("*").maybeSingle(),
    db.from("catalyst_analytics_universe").select("*").maybeSingle(),
    db
      .from("catalyst_type_performance")
      .select("*")
      .order("associated_appearances", { ascending: false })
      .limit(100),
    db
      .from("catalyst_timing_distribution")
      .select("*")
      .order("mover_appearances", { ascending: false }),
    db
      .from("catalyst_exchange_distribution")
      .select("*")
      .order("mover_appearances", { ascending: false }),
    db
      .from("catalyst_mover_category_distribution")
      .select("*")
      .order("mover_appearances", { ascending: false })
      .limit(100),
    db
      .from("catalyst_before_move_analysis")
      .select("*")
      .order("mover_appearances", { ascending: false })
      .limit(100),
    db
      .from("catalyst_combinations")
      .select("*")
      .order("appearance_count", { ascending: false })
      .limit(100),
    db
      .from("ticker_repeat_catalyst_behavior")
      .select("*")
      .gt("associated_mover_count", 0)
      .order("associated_mover_count", { ascending: false })
      .limit(100),
    db
      .from("sec_form_analytics")
      .select("*")
      .order("filings_linked_to_movers", { ascending: false })
      .limit(100),
    db
      .from("event_source_analytics")
      .select("*")
      .order("events_ingested", { ascending: false }),
    db.from("sec_ingestion_coverage").select("*").maybeSingle(),
    db
      .from("catalyst_monthly_distribution")
      .select("*")
      .order("event_month", { ascending: false })
      .limit(120),
    db
      .from("catalyst_yearly_distribution")
      .select("*")
      .order("event_year", { ascending: false })
      .limit(30),
  ]);
  const error = results.find((result) => result.error)?.error;
  return {
    data: {
      summary: results[0].data,
      universe: results[1].data,
      types: results[2].data ?? [],
      timing: results[3].data ?? [],
      exchanges: results[4].data ?? [],
      categories: results[5].data ?? [],
      beforeMove: results[6].data ?? [],
      combinations: results[7].data ?? [],
      repeats: results[8].data ?? [],
      forms: results[9].data ?? [],
      sources: results[10].data ?? [],
      secCoverage: results[11].data,
      monthly: results[12].data ?? [],
      yearly: results[13].data ?? [],
    },
    configured: true,
    error: error?.message ?? null,
  };
}

export async function getCatalystDrillDown(
  params: Record<string, string | undefined>,
) {
  const db: any = await createClient();
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.max(1, Math.min(Number(params.pageSize) || 50, 100));
  if (!db)
    return {
      data: [] as any[],
      configured: false,
      error: null,
      page,
      pageSize,
    };
  const kind = params.kind ?? "type";
  let query: any;
  if (kind === "no_identified")
    query = db
      .from("mover_catalyst_status")
      .select("*")
      .eq("catalyst_status", "no_identified_catalyst")
      .order("report_date", { ascending: false });
  else if (kind === "combination")
    query = db
      .from("catalyst_combination_detail")
      .select("*")
      .eq("combination", params.value ?? "")
      .order("report_date", { ascending: false });
  else if (kind === "source")
    query = db
      .from("event_intelligence")
      .select("*")
      .eq("registry_source_name", params.value ?? "")
      .order("event_date", { ascending: false });
  else {
    query = db
      .from("catalyst_before_move_detail")
      .select("*")
      .order("report_date", { ascending: false });
    const column = {
      type: "catalyst_type",
      form: "sec_form_type",
      timing: "temporal_bucket",
      exchange: "exchange",
      category: "category_name",
      ticker: "symbol",
    }[kind];
    if (column && params.value) query = query.eq(column, params.value);
    if (kind === "month" && /^\d{4}-\d{2}-\d{2}$/.test(params.value ?? "")) {
      const start = params.value!;
      const end = new Date(`${start}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1);
      query = query
        .gte("event_date", start)
        .lt("event_date", end.toISOString());
    }
    if (kind === "year" && /^\d{4}$/.test(params.value ?? ""))
      query = query
        .gte("event_date", `${params.value}-01-01`)
        .lt("event_date", `${Number(params.value) + 1}-01-01`);
  }
  const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
  return {
    data: result.data ?? [],
    configured: true,
    error: result.error?.message ?? null,
    page,
    pageSize,
  };
}

export async function getMoverQualityWarning(appearanceId: string) {
  const db: any = await createClient();
  if (!db) return { data: null as any, configured: false, error: null };
  const result = await db
    .from("market_data_quality_findings")
    .select("id,severity,finding_type,field_name,status")
    .eq("appearance_id", appearanceId)
    .in("severity", ["high", "critical"])
    .in("status", ["open", "proposed"])
    .limit(10);
  return {
    data: result.data?.length
      ? { count: result.data.length, findings: result.data }
      : null,
    configured: true,
    error: result.error?.message ?? null,
  };
}

export async function getCatalystResearchManagement() {
  const db: any = createAdminClient();
  const fallback = {
    summary: null as any,
    queue: [] as any[],
    failures: [] as any[],
    sources: [] as any[],
    secCoverage: null as any,
    watchlists: [] as any[],
    clusterCandidates: [] as any[],
    provider: {
      configured: false,
      status: "unconfigured",
      requestsPerSecond: catalystConfig.secRequestsPerSecond,
    },
  };
  if (!db) return { data: fallback, configured: false, error: null };
  const results = await Promise.all([
    db.from("catalyst_research_management").select("*").maybeSingle(),
    db
      .from("catalyst_research_queue")
      .select("*,tickers(symbol)")
      .order("updated_at", { ascending: false })
      .limit(100),
    db
      .from("catalyst_provider_failures")
      .select("*,tickers(symbol),event_sources(name)")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("event_source_analytics")
      .select("*")
      .order("events_ingested", { ascending: false }),
    db.from("sec_ingestion_coverage").select("*").maybeSingle(),
    db.from("watchlists").select("id,name").order("name").limit(500),
    db
      .from("event_cluster_candidates")
      .select(
        "*,tickers(symbol),event_a:ticker_events!event_cluster_candidates_event_a_id_fkey(id,event_date,headline,source_name),event_b:ticker_events!event_cluster_candidates_event_b_id_fkey(id,event_date,headline,source_name)",
      )
      .eq("status", "unresolved")
      .order("similarity", { ascending: false })
      .limit(100),
    db
      .from("catalyst_provider_runs")
      .select("status,error_type,completed_at")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const error = results.find((result) => result.error)?.error;
  const configured = validSecUserAgent(catalystConfig.secUserAgent);
  const latestRun = results[7].data;
  const status = !configured
    ? "unconfigured"
    : latestRun?.error_type === "rate_limited"
      ? "rate_limited"
      : latestRun?.status === "failed"
        ? "unavailable"
        : latestRun?.status === "completed"
          ? "healthy"
          : "degraded";
  return {
    data: {
      summary: results[0].data,
      queue: results[1].data ?? [],
      failures: results[2].data ?? [],
      sources: results[3].data ?? [],
      secCoverage: results[4].data,
      watchlists: results[5].data ?? [],
      clusterCandidates: results[6].data ?? [],
      provider: {
        configured,
        status,
        requestsPerSecond: catalystConfig.secRequestsPerSecond,
      },
    },
    configured: true,
    error: error?.message ?? null,
  };
}
