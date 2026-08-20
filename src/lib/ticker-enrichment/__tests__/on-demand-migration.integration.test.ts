import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrations = [
  "202608090001_checkpoint_1_foundation.sql",
  "202608100001_checkpoint_2_import_pipeline.sql",
  "202608100002_checkpoint_3_historical_analytics.sql",
  "202608100003_checkpoint_4_social_research.sql",
  "202608100004_checkpoint_5_account_intelligence.sql",
  "202608100005_checkpoint_6_sentiment_attention_scoring.sql",
  "202608100006_checkpoint_7_historical_price_volume.sql",
  "202608100007_checkpoint_8_pattern_similarity.sql",
  "202608100008_checkpoint_9_watchlists_alerts.sql",
  "202608100009_checkpoint_10_ai_research.sql",
  "202608120001_checkpoint_2_async_preview_jobs.sql",
  "202608120002_checkpoint_2_adaptive_ocr.sql",
  "202608120003_checkpoint_2_resumable_finalization.sql",
  "202608120004_checkpoint_2_decimal_count_recovery.sql",
  "202608120005_checkpoint_2_batch_detail_indexes.sql",
  "202608130001_phase_2a_ticker_enrichment.sql",
  "202608130002_phase_2a1_on_demand_enrichment.sql",
];

async function database() {
  const db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role;");
  for (const file of migrations) {
    const sql = await readFile(path.join(process.cwd(), "supabase/migrations", file), "utf8");
    await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
  }
  return db;
}

describe("Phase 2A.1 on-demand migration", () => {
  it("deduplicates queue requests, merges fields/reasons, and claims in priority order", async () => {
    const db = await database();
    try {
      await db.exec(`
        insert into public.tickers(id,symbol) values
          ('10000000-0000-0000-0000-000000000001','NVDA'),
          ('10000000-0000-0000-0000-000000000002','AAPL');
      `);
      const first = await db.query<{ id: string }>(
        "select public.queue_ticker_metadata($1,'stale_refresh',$2::jsonb,20,null) id",
        ["10000000-0000-0000-0000-000000000001", JSON.stringify(["company_name"])],
      );
      const merged = await db.query<{ id: string }>(
        "select public.queue_ticker_metadata($1,'ai_search',$2::jsonb,100,null) id",
        ["10000000-0000-0000-0000-000000000001", JSON.stringify(["sector", "market_cap"])],
      );
      await db.query(
        "select public.queue_ticker_metadata($1,'ticker_search',$2::jsonb,70,null)",
        ["10000000-0000-0000-0000-000000000002", JSON.stringify(["company_name", "exchange"])],
      );

      expect(merged.rows[0].id).toBe(first.rows[0].id);
      const queue = await db.query<any>("select * from public.ticker_metadata_queue order by priority desc");
      expect(queue.rows).toHaveLength(2);
      expect(queue.rows[0]).toMatchObject({
        ticker_id: "10000000-0000-0000-0000-000000000001",
        priority: 100,
        reason: "ai_search",
      });
      expect(queue.rows[0].reasons).toEqual(["ai_search", "stale_refresh"]);
      expect(queue.rows[0].required_fields).toEqual(["company_name", "market_cap", "sector"]);
      const claimed = await db.query<any>("select * from public.claim_ticker_metadata_queue(1,null)");
      expect(claimed.rows).toHaveLength(1);
      expect(claimed.rows[0]).toMatchObject({ ticker_id: "10000000-0000-0000-0000-000000000001", status: "processing", attempts: 1 });
    } finally {
      await db.close();
    }
  }, 30_000);

  it("tracks transparent priority signals and enforces the shared daily budget atomically", async () => {
    const db = await database();
    try {
      const tickerId = "10000000-0000-0000-0000-000000000010";
      await db.query("insert into public.tickers(id,symbol) values($1,'AMD')", [tickerId]);
      await db.query("select public.track_ticker_popularity($1,'ai_search',5)", [tickerId]);
      await db.query("select public.track_ticker_popularity($1,'ticker_page',2)", [tickerId]);
      const before = await db.query<{ priority: number }>("select public.calculate_ticker_metadata_priority($1,'stale_refresh') priority", [tickerId]);
      expect(before.rows[0].priority).toBe(22);

      const watchlist = await db.query<{ id: string }>("insert into public.watchlists(name) values('Research') returning id");
      await db.query("insert into public.watchlist_entities(watchlist_id,entity_type,ticker_id) values($1,'ticker',$2)", [watchlist.rows[0].id, tickerId]);
      await db.query("insert into public.alert_rules(name,entity_type,ticker_id,condition_type,condition_configuration) values('AMD mover','ticker',$1,'market_mover_detected','{}')", [tickerId]);
      const after = await db.query<{ priority: number }>("select public.calculate_ticker_metadata_priority($1,'stale_refresh') priority", [tickerId]);
      expect(after.rows[0].priority).toBeGreaterThanOrEqual(41);
      const active = await db.query<any>("select * from public.ticker_metadata_queue where ticker_id=$1 and status in('pending','processing','deferred')", [tickerId]);
      expect(active.rows).toHaveLength(1);
      expect(active.rows[0].reasons).toEqual(expect.arrayContaining(["watchlist", "alert"]));

      const freshTickerId = "10000000-0000-0000-0000-000000000011";
      await db.query("insert into public.tickers(id,symbol,company_name,exchange,sector,industry,enrichment_status,metadata_updated_at,next_metadata_refresh_at) values($1,'FRESH','Fresh Co','NASDAQ','Technology','Software','complete',now(),now()+interval '180 days')", [freshTickerId]);
      await db.query("insert into public.watchlist_entities(watchlist_id,entity_type,ticker_id) values($1,'ticker',$2)", [watchlist.rows[0].id, freshTickerId]);
      expect((await db.query<any>("select count(*)::int count from public.ticker_metadata_queue where ticker_id=$1", [freshTickerId])).rows[0].count).toBe(0);
      expect((await db.query<any>("select watchlist_additions from public.ticker_popularity where ticker_id=$1", [freshTickerId])).rows[0].watchlist_additions).toBe(1);

      const reserved = [];
      for (let index = 0; index < 4; index++) {
        const result = await db.query<{ allowed: boolean }>("select public.reserve_metadata_provider_call('fixture',3) allowed");
        reserved.push(result.rows[0].allowed);
      }
      expect(reserved).toEqual([true, true, true, false]);
      const usage = await db.query<any>("select * from public.metadata_provider_usage where provider='fixture' and usage_date=current_date");
      expect(usage.rows[0].calls_attempted).toBe(3);
      await db.exec("update public.metadata_provider_usage set usage_date=current_date-1 where provider='fixture'");
      expect((await db.query<{ allowed: boolean }>("select public.reserve_metadata_provider_call('fixture',3) allowed")).rows[0].allowed).toBe(true);
    } finally {
      await db.close();
    }
  }, 30_000);

  it("caches not-found results, preserves raw history, and refreshes only affected ticker documents", async () => {
    const db = await database();
    try {
      const tickerId = "10000000-0000-0000-0000-000000000020";
      await db.query("insert into public.tickers(id,symbol,company_name) values($1,'PLTR','Palantir Technologies')", [tickerId]);
      const reportId = "20000000-0000-0000-0000-000000000020";
      await db.query("insert into public.source_reports(id,report_date,source_type,source_filename,import_status) values($1,current_date,'scanz','real.pdf','completed')", [reportId]);
      await db.query("insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date,rank) select $1,$2,id,current_date,1 from public.market_categories where name='NASDAQ Most Active'", [tickerId, reportId]);
      const oldTickerId = "10000000-0000-0000-0000-000000000021";
      const oldReportId = "20000000-0000-0000-0000-000000000021";
      await db.query("insert into public.tickers(id,symbol) values($1,'OLDX')", [oldTickerId]);
      await db.query("insert into public.source_reports(id,report_date,source_type,source_filename,import_status) values($1,current_date-365,'scanz','old.pdf','completed')", [oldReportId]);
      await db.query("insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date,rank) select $1,$2,id,current_date-365,1 from public.market_categories where name='NASDAQ Most Active'", [oldTickerId, oldReportId]);
      expect((await db.query<any>("select count(*)::int count from public.ticker_metadata_queue where ticker_id=$1", [oldTickerId])).rows[0].count).toBe(0);
      const before = await db.query<any>("select count(*)::int appearances,(select count(*)::int from public.source_reports) reports,(select array_agg(id order by id) from public.tickers) ids from public.market_mover_appearances");
      const queue = await db.query<{ id: string }>("select public.queue_ticker_metadata($1,'ticker_page','[\"company_name\",\"exchange\"]',95,null) id", [tickerId]);
      await db.query("select * from public.claim_ticker_metadata_queue(1,$1)", [queue.rows[0].id]);
      await db.query("select public.apply_ticker_metadata_queue_result($1,'fixture','not_found','{}','not_found','Unsupported symbol',false,180,30,3)", [queue.rows[0].id]);
      await db.query("select public.finish_ticker_metadata_queue($1,'completed','fixture','Not found; retry cooldown applied',null)", [queue.rows[0].id]);
      const ticker = await db.query<any>("select * from public.tickers where id=$1", [tickerId]);
      expect(ticker.rows[0].last_not_found_at).toBeTruthy();
      expect(new Date(ticker.rows[0].next_retry_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
      expect(ticker.rows[0].company_name).toBe("Palantir Technologies");
      const after = await db.query<any>("select count(*)::int appearances,(select count(*)::int from public.source_reports) reports,(select array_agg(id order by id) from public.tickers) ids from public.market_mover_appearances");
      expect(after.rows[0]).toEqual(before.rows[0]);
      await db.query("select public.refresh_ticker_research_documents(array[$1]::uuid[])", [tickerId]);
      expect((await db.query<any>("select count(*)::int count from public.research_search_documents where domain='ticker' and record_id=$1", [tickerId])).rows[0].count).toBe(1);
    } finally {
      await db.close();
    }
  }, 30_000);
});
