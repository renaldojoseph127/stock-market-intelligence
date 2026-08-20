import { createClient } from "@/lib/supabase/server";
import { groupCrossSourceBreakdownRows } from "./breakdowns";
import type { ResearchDataMode } from "./types";

type Envelope<T> = { data: T; configured: boolean; error: string | null };

async function safe<T>(
  fallback: T,
  run: (db: any) => Promise<{ data: T | null; error: any; count?: number | null }>,
): Promise<Envelope<T> & { count?: number }> {
  const db = await createClient();
  if (!db) return { data: fallback, configured: false, error: null };
  try {
    const result = await run(db);
    return {
      data: result.data ?? fallback,
      configured: true,
      error: result.error?.message ?? null,
      count: result.count ?? undefined,
    };
  } catch (error) {
    return {
      data: fallback,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const boundedPage = (value?: string | number) => Math.max(1, Number(value) || 1);
const boundedSize = (value?: string | number, fallback = 50) =>
  Math.max(1, Math.min(Number(value) || fallback, 100));

export async function getResearchCandidates(
  params: Record<string, string | undefined> = {},
  options: { defaultSize?: number } = {},
) {
  const page = boundedPage(params.page);
  const pageSize = boundedSize(params.pageSize, options.defaultSize ?? 50);
  const result = await safe<any[]>([], async (db) => {
    let query: any = db.from("research_priority_candidates").select("*", { count: "exact" });
    if (params.exchange) query = query.eq("exchange", params.exchange);
    if (params.category) query = query.eq("category_id", params.category);
    if (params.from) query = query.gte("report_date", params.from);
    if (params.to) query = query.lte("report_date", params.to);
    if (params.ticker) query = query.ilike("symbol", `%${params.ticker}%`);
    if (params.magnitude) query = query.gte("absolute_change_percent", Number(params.magnitude));
    if (params.catalyst) query = query.eq("catalyst_status", params.catalyst);
    if (params.quality) query = query.eq("quality_status", params.quality);
    if (params.social) query = query.eq("social_coverage_status", params.social);
    if (params.repeat === "yes") query = query.gt("repeat_count", 1);
    if (params.repeat === "no") query = query.eq("repeat_count", 1);
    if (params.saved === "yes") query = query.eq("saved_research", true);
    if (params.saved === "no") query = query.eq("saved_research", false);
    return query
      .order("research_priority_score", { ascending: false })
      .order("report_date", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
  });
  return { ...result, page, pageSize, total: result.count ?? 0 };
}

export const getCoverageBacklog = (limit = 20, backlogType?: string) =>
  safe<any[]>([], (db) =>
    db.rpc("get_research_coverage_backlog", {
      p_backlog_type: backlogType || null,
      p_limit: Math.max(1, Math.min(Number(limit) || 20, 100)),
    }),
  );

export const getTickerResearchProfile = (tickerId: string) =>
  safe<any>(null, (db) =>
    db.from("ticker_research_profile").select("*").eq("ticker_id", tickerId).maybeSingle(),
  );

export async function getTickerHighlights(tickerId: string) {
  return safe<any>(
    { positive: [], negative: [], volume: [], active: [], recent: [] },
    async (db) => {
      const base = () =>
        db
          .from("market_mover_intelligence")
          .select("id,report_id,report_date,category_name,category_type,raw_rank,raw_price,raw_change_percent,raw_volume,quality_status,open_finding_count,repaired_field_count,catalyst_status")
          .eq("ticker_id", tickerId);
      const [positive, negative, volume, active, recent] = await Promise.all([
        base().not("raw_change_percent", "is", null).order("raw_change_percent", { ascending: false }).limit(10),
        base().not("raw_change_percent", "is", null).order("raw_change_percent", { ascending: true }).limit(10),
        base().not("raw_volume", "is", null).order("raw_volume", { ascending: false }).limit(10),
        base().eq("category_type", "most_active").order("report_date", { ascending: false }).limit(10),
        base().order("report_date", { ascending: false }).limit(50),
      ]);
      return {
        data: {
          positive: positive.data ?? [],
          negative: negative.data ?? [],
          volume: volume.data ?? [],
          active: active.data ?? [],
          recent: recent.data ?? [],
        },
        error: positive.error ?? negative.error ?? volume.error ?? active.error ?? recent.error,
      };
    },
  );
}

export const getMoverResearchContext = (appearanceId: string) =>
  safe<any>({ priority: null, outcome: null, similarities: [] }, async (db) => {
    const [priority, outcome, similarities] = await Promise.all([
      db.from("research_priority_candidates").select("*").eq("appearance_id", appearanceId).maybeSingle(),
      db.from("market_mover_price_outcomes").select("*").eq("appearance_id", appearanceId).maybeSingle(),
      db.rpc("find_similar_historical_movers", { p_appearance_id: appearanceId, p_limit: 10 }),
    ]);
    return {
      data: {
        priority: priority.data,
        outcome: outcome.data,
        similarities: similarities.data ?? [],
      },
      error: priority.error ?? outcome.error ?? similarities.error,
    };
  });

export async function getComparison(input: { tickerSymbols?: string[]; moverIds?: string[] }) {
  const tickerSymbols = [...new Set(input.tickerSymbols ?? [])].slice(0, 5);
  const moverIds = [...new Set(input.moverIds ?? [])].slice(0, 5);
  return safe<any>({ tickers: [], movers: [], similarities: [] }, async (db) => {
    const [tickers, movers] = await Promise.all([
      tickerSymbols.length
        ? db.from("ticker_research_profile").select("*").in("symbol", tickerSymbols).order("symbol")
        : Promise.resolve({ data: [], error: null }),
      moverIds.length
        ? db.from("research_priority_candidates").select("*").in("appearance_id", moverIds).order("report_date")
        : Promise.resolve({ data: [], error: null }),
    ]);
    let outcomes: any = { data: [], error: null };
    if (moverIds.length)
      outcomes = await db.from("market_mover_price_outcomes").select("*").in("appearance_id", moverIds);
    const similarities = moverIds.length > 1
      ? await Promise.all(moverIds.map((id) => db.rpc("find_similar_historical_movers", { p_appearance_id: id, p_limit: 50 })))
      : [];
    const byOutcome = new Map((outcomes.data ?? []).map((row: any) => [row.appearance_id, row]));
    return {
      data: {
        tickers: tickers.data ?? [],
        movers: (movers.data ?? []).map((row: any) => ({ ...row, outcome: byOutcome.get(row.appearance_id) ?? null })),
        similarities: similarities.flatMap((result: any, index) =>
          (result.data ?? [])
            .filter((row: any) => moverIds.includes(row.reference_appearance_id))
            .map((row: any) => ({ source_appearance_id: moverIds[index], ...row })),
        ),
      },
      error: tickers.error ?? movers.error ?? outcomes.error ?? similarities.find((result: any) => result.error)?.error,
    };
  });
}

export const getSavedResearchViews = () =>
  safe<any[]>([], (db) =>
    db.from("saved_research_views").select("*,research_workspaces(name)").order("updated_at", { ascending: false }).limit(100),
  );

export const getCrossSourceResearchBreakdowns = () =>
  safe<any>(
    {
      exchange: [],
      category: [],
      month: [],
      quality: [],
      repeat_status: [],
      social_coverage: [],
      catalystTypes: [],
      catalystTiming: [],
      qualityFields: [],
      repairMethods: [],
    },
    async (db) => {
      const [breakdowns, catalystTypes, catalystTiming, qualityFields, repairMethods] = await Promise.all([
        db.rpc("get_research_experience_breakdowns", { p_limit: 24 }),
        db.from("catalyst_type_performance").select("*").order("associated_appearances", { ascending: false }).limit(50),
        db.from("catalyst_timing_distribution").select("*").order("mover_appearances", { ascending: false }).limit(50),
        db.from("research_quality_field_counts").select("*").order("finding_count", { ascending: false }).limit(100),
        db.from("research_repair_method_counts").select("*").order("proposal_count", { ascending: false }).limit(100),
      ]);
      const grouped = groupCrossSourceBreakdownRows(breakdowns.data);
      return {
        data: {
          exchange: grouped.exchange,
          category: grouped.category,
          month: grouped.month,
          quality: grouped.quality,
          repeat_status: grouped.repeat_status,
          social_coverage: grouped.social_coverage,
          catalystTypes: catalystTypes.data ?? [],
          catalystTiming: catalystTiming.data ?? [],
          qualityFields: qualityFields.data ?? [],
          repairMethods: repairMethods.data ?? [],
        },
        error: breakdowns.error ?? catalystTypes.error ?? catalystTiming.error ?? qualityFields.error ?? repairMethods.error ?? null,
      };
    },
  );

export async function getSystemStatus() {
  return safe<any>(
    { counts: {}, queues: {}, latestRuns: {}, migrations: { expectedLatest: "202608200002", applied: null } },
    async (db) => {
      const countTables = [
        "source_reports",
        "market_mover_appearances",
        "ticker_metadata_sources",
        "ticker_events",
        "social_posts",
        "research_workspaces",
      ];
      const queueTables = ["ticker_metadata_queue", "catalyst_research_queue", "social_research_queue"];
      const counts = await Promise.all(countTables.map((table) => db.from(table).select("*", { count: "exact", head: true })));
      const queues = await Promise.all(queueTables.map((table) => db.from(table).select("status").limit(1000)));
      const latest = await Promise.all([
        db.from("import_batches").select("status,completed_at,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("ticker_enrichment_runs").select("status,completed_at,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("catalyst_provider_runs").select("status,completed_at,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("social_provider_runs").select("status,completed_at,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        data: {
          counts: Object.fromEntries(countTables.map((table, index) => [table, counts[index].count ?? 0])),
          queues: Object.fromEntries(queueTables.map((table, index) => [table, queues[index].data ?? []])),
          latestRuns: { imports: latest[0].data, metadata: latest[1].data, catalysts: latest[2].data, social: latest[3].data },
          migrations: { expectedLatest: "202608200002", applied: null },
        },
        error: counts.find((result) => result.error)?.error ?? queues.find((result) => result.error)?.error ?? latest.find((result) => result.error)?.error ?? null,
      };
    },
  );
}

export const dataMode = (value?: string): ResearchDataMode =>
  value === "effective" ? "effective" : "raw";
