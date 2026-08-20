import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMetadataRequest } from "@/lib/ticker-enrichment/on-demand";

export type QueryResult<T> = {
  data: T;
  configured: boolean;
  error: string | null;
};
async function clientResult<T>(
  fallback: T,
  run: (
    db: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<QueryResult<T>> {
  const db = await createClient();
  if (!db) return { data: fallback, configured: false, error: null };
  const { data, error } = await run(db);
  return {
    data: (data as T) ?? fallback,
    configured: true,
    error: error?.message ?? null,
  };
}
export async function getCounts() {
  const db = await createClient();
  const zero = {
    tickers: 0,
    appearances: 0,
    reports: 0,
    posts: 0,
    promoters: 0,
    promotions: 0,
    sentiment: 0,
    socialTickers: 0,
  };
  if (!db) return { data: zero, configured: false, error: null };
  const tables = [
    "tickers",
    "market_mover_appearances",
    "source_reports",
    "social_posts",
    "social_accounts",
    "promotion_events",
    "sentiment_observations",
  ] as const;
  const rs = await Promise.all(
    tables.map((t) => db.from(t).select("*", { count: "exact", head: true })),
  );
  const social = await db.from("post_tickers").select("ticker_id");
  const error =
    rs.find((r) => r.error)?.error?.message ?? social.error?.message ?? null;
  return {
    data: {
      tickers: rs[0].count ?? 0,
      appearances: rs[1].count ?? 0,
      reports: rs[2].count ?? 0,
      posts: rs[3].count ?? 0,
      promoters: rs[4].count ?? 0,
      promotions: rs[5].count ?? 0,
      sentiment: rs[6].count ?? 0,
      socialTickers: new Set((social.data ?? []).map((x: any) => x.ticker_id))
        .size,
    },
    configured: true,
    error,
  };
}
export const getFrequentMovers = () =>
  clientResult<any[]>([], (db) =>
    db
      .from("ticker_statistics")
      .select("*,tickers(symbol)")
      .order("total_appearances", { ascending: false })
      .limit(10),
  );
export const getRecentReports = () =>
  clientResult<any[]>([], (db) =>
    db
      .from("recent_reports_with_counts")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(10),
  );
export async function getMovers(p: Record<string, string | undefined>) {
  const page = Math.max(1, Number(p.page) || 1),
    size = 50,
    mode = p.dataMode === "effective" ? "effective" : "raw";
  const result = await clientResult<any[]>([], async (db) => {
    let q: any = db
      .from("research_priority_candidates")
      .select("*", { count: "exact" });
    if (p.from) q = q.gte("report_date", p.from);
    if (p.to) q = q.lte("report_date", p.to);
    if (p.ticker) q = q.ilike("symbol", `%${p.ticker}%`);
    if (p.exchange) q = q.eq("exchange", p.exchange);
    if (p.sector) q = q.ilike("ticker_sector", `%${p.sector}%`);
    if (p.industry) q = q.ilike("ticker_industry", `%${p.industry}%`);
    if (p.securityType) q = q.eq("ticker_security_type", p.securityType);
    if (p.country) q = q.ilike("ticker_country", p.country);
    if (p.marketCapMin) q = q.gte("ticker_market_cap", Number(p.marketCapMin));
    if (p.marketCapMax) q = q.lt("ticker_market_cap", Number(p.marketCapMax));
    if (p.category) q = q.eq("category_id", p.category);
    if (p.type) q = q.eq("category_type", p.type);
    if (p.quality) q = q.eq("quality_status", p.quality);
    const catalyst = {
      found: "catalyst_found",
      not_researched: "not_researched",
      no_identified: "no_identified_catalyst",
      partial: "research_partial",
    }[p.catalyst ?? ""];
    if (catalyst) q = q.eq("catalyst_status", catalyst);
    if (p.social) q = q.eq("social_coverage_status", p.social);
    if (p.repeat === "yes") q = q.gt("repeat_count", 1);
    if (p.repeat === "no") q = q.eq("repeat_count", 1);
    if (p.saved === "yes") q = q.eq("saved_research", true);
    if (p.saved === "no") q = q.eq("saved_research", false);
    const allowed = new Set([
        "report_date",
        "change_percent",
        "volume",
        "dollar_volume",
      ]),
      sort = allowed.has(p.sort ?? "") ? p.sort! : "report_date",
      order = mode === "effective" && sort !== "report_date" ? `effective_${sort}` : sort;
    return q
      .order(order, { ascending: false })
      .range((page - 1) * size, page * size - 1);
  });
  return {
    ...result,
    data: result.data.map((x: any) => ({
      ...x,
      rank: mode === "raw" ? x.rank : x.effective_rank,
      price: mode === "raw" ? x.price : x.effective_price,
      change_amount: mode === "raw" ? x.change_amount : x.effective_change_amount,
      change_percent: mode === "raw" ? x.change_percent : x.effective_change_percent,
      trades: mode === "raw" ? x.trades : x.effective_trades,
      volume: mode === "raw" ? x.volume : x.effective_volume,
      dollar_volume: mode === "raw" ? x.dollar_volume : x.effective_dollar_volume,
      data_mode: mode,
      tickers: {
        symbol: x.symbol,
        exchange: x.ticker_exchange,
        sector: x.ticker_sector,
        industry: x.ticker_industry,
        security_type: x.ticker_security_type,
        country: x.ticker_country,
        market_cap: x.ticker_market_cap,
      },
      market_categories: {
        name: x.category_name,
        category_type: x.category_type,
      },
    })),
    page,
    pageSize: size,
    dataMode: mode,
  };
}
export const getCategories = () =>
  clientResult<any[]>([], (db) =>
    db.from("market_categories").select("*").order("display_order"),
  );
export async function getTickers(p: Record<string, string | undefined> = {}) {
  const page = Math.max(1, Number(p.page) || 1),
    pageSize = 50,
    db = await createClient();
  if (!db)
    return {
      data: [] as any[],
      configured: false,
      error: null,
      page,
      pageSize,
      total: 0,
    };
  let q: any = db
    .from("tickers")
    .select(
      "id,symbol,company_name,exchange,security_type,sector,industry,market_cap,enrichment_status,ticker_statistics(total_appearances,last_appearance)",
      { count: "exact" },
    );
  if (p.q) q = q.or(`symbol.ilike.%${p.q}%,company_name.ilike.%${p.q}%`);
  if (p.exchange) q = q.eq("exchange", p.exchange);
  if (p.sector) q = q.ilike("sector", `%${p.sector}%`);
  if (p.industry) q = q.ilike("industry", `%${p.industry}%`);
  if (p.securityType) q = q.eq("security_type", p.securityType);
  if (p.enrichmentStatus) q = q.eq("enrichment_status", p.enrichmentStatus);
  if (p.country) q = q.ilike("country", p.country);
  if (p.marketCapMin) q = q.gte("market_cap", Number(p.marketCapMin));
  if (p.marketCapMax) q = q.lt("market_cap", Number(p.marketCapMax));
  const result = await q
    .order("symbol")
    .range((page - 1) * pageSize, page * pageSize - 1);
  let data: any[] = result.data ?? [];
  const exact = String(p.q ?? "")
    .trim()
    .toUpperCase();
  if (/^[A-Z0-9.-]{1,15}$/.test(exact)) {
    const match = data.find((x) => x.symbol === exact),
      admin = match ? createAdminClient() : null;
    if (match && admin)
      try {
        const resolution = await resolveMetadataRequest(admin, {
          tickerId: match.id,
          reason: "ticker_search",
          sync: true,
        });
        data = data.map((x) =>
          x.id === match.id
            ? {
                ...x,
                ...resolution.ticker,
                ticker_statistics: x.ticker_statistics,
              }
            : x,
        );
      } catch {}
  }
  return {
    data,
    configured: true,
    error: result.error?.message ?? null,
    page,
    pageSize,
    total: result.count ?? 0,
  };
}
export async function getTicker(symbol: string) {
  const db = await createClient();
  if (!db) return { data: null as any, configured: false, error: null };
  const result = await db
    .from("tickers")
    .select("*,ticker_statistics(*)")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  let data: any = result.data;
  if (data) {
    const admin = createAdminClient();
    if (admin)
      try {
        const resolution = await resolveMetadataRequest(admin, {
          tickerId: data.id,
          reason: "ticker_page",
          sync: true,
        });
        data = {
          ...data,
          ...resolution.ticker,
          ticker_statistics: data.ticker_statistics,
        };
      } catch {}
  }
  return { data, configured: true, error: result.error?.message ?? null };
}
export async function getTickerHistory(id: string, dataMode = "raw") {
  const mode = dataMode === "effective" ? "effective" : "raw",
    result = await clientResult<any[]>([], (db) =>
      db
        .from("market_mover_appearances_effective")
        .select("*")
        .eq("ticker_id", id)
        .order("report_date", { ascending: false })
        .limit(50),
    );
  return {
    ...result,
    data: result.data.map((x: any) => ({
      ...x,
      price: mode === "raw" ? x.raw_price : x.price,
      change_amount: mode === "raw" ? x.raw_change_amount : x.change_amount,
      change_percent: mode === "raw" ? x.raw_change_percent : x.change_percent,
      trades: mode === "raw" ? x.raw_trades : x.trades,
      volume: mode === "raw" ? x.raw_volume : x.volume,
      dollar_volume: mode === "raw" ? x.raw_dollar_volume : x.dollar_volume,
      data_mode: mode,
      market_categories: { name: x.category_name },
    })),
    dataMode: mode,
  };
}
export const getTickerFrequency = (id: string) =>
  clientResult<any[]>([], (db) =>
    db
      .from("ticker_category_frequency")
      .select("*")
      .eq("ticker_id", id)
      .order("appearance_count", { ascending: false }),
  );
export const getPromoters = () =>
  clientResult<any[]>([], (db) =>
    db
      .from("social_accounts")
      .select("*,social_sources(name),promoter_statistics(*)")
      .order("last_seen_at", { ascending: false })
      .limit(500),
  );
export const getResearch = () =>
  clientResult<any[]>([], (db) =>
    db
      .from("research_queue")
      .select(
        "*,tickers(symbol,ticker_statistics(total_appearances,last_appearance))",
      )
      .order("priority", { ascending: false })
      .limit(500),
  );
export const getImports = () =>
  clientResult<any[]>([], (db) =>
    db
      .from("import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
  );
export const getImportQuality = () =>
  clientResult<any | null>(null, (db) =>
    db.from("import_data_quality").select("*").single(),
  );
export const getBatch = (id: string) =>
  clientResult<any | null>(null, (db) =>
    db
      .from("import_batches")
      .select(
        "id,name,source_type,total_files,processed_files,successful_files,partial_files,failed_files,total_records,status,started_at,completed_at,created_at",
      )
      .eq("id", id)
      .maybeSingle(),
  );
export const getReport = (id: string) =>
  clientResult<any | null>(null, (db) =>
    db
      .from("source_reports")
      .select(
        "id,import_batch_id,source_filename,report_date,import_status,page_count,extraction_method,extraction_confidence,record_count,warning_count,error_message",
      )
      .eq("id", id)
      .maybeSingle(),
  );
