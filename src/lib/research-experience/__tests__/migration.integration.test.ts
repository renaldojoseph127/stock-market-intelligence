import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

async function database() {
  const db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role;");
  const migrations = (await readdir(path.join(process.cwd(), "supabase/migrations"))).filter((name) => name.endsWith(".sql")).sort();
  for (const migration of migrations)
    await db.exec((await readFile(path.join(process.cwd(), "supabase/migrations", migration), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  return db;
}

describe("Phase 2C.2 research-experience migration", () => {
  it("derives priority, repeat profiles, coverage backlog, and attribute-only similarity without changing RAW rows", async () => {
    const db = await database();
    try {
      await db.exec(`
        insert into public.tickers(id,symbol,company_name,exchange,enrichment_status)values
          ('10000000-0000-0000-0000-000000000001','NVDA','NVIDIA','NASDAQ','complete'),
          ('10000000-0000-0000-0000-000000000002','AAPL','Apple','NASDAQ','complete'),
          ('10000000-0000-0000-0000-000000000003','TSLA','Tesla','NYSE','partial');
        insert into public.source_reports(id,report_date,source_filename,import_status)values
          ('20000000-0000-0000-0000-000000000001','2026-08-01','one.pdf','completed'),
          ('20000000-0000-0000-0000-000000000002','2026-08-06','two.pdf','completed'),
          ('20000000-0000-0000-0000-000000000003','2026-08-08','three.pdf','completed');
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
          select'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-08-01',1,4.5,80,1000000,'{"raw":true}' from public.market_categories where name='NASDAQ Biggest Gainers';
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
          select'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',id,'2026-08-06',2,4.8,70,1500000,'{"raw":true}' from public.market_categories where name='NASDAQ Biggest Gainers';
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
          select'30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',id,'2026-08-06',3,4.2,76,1300000,'{"raw":true}' from public.market_categories where name='NASDAQ Biggest Gainers';
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
          select'30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',id,'2026-08-08',1,150,-55,100,'{"raw":true}' from public.market_categories where name='NYSE Biggest Decliners';
        insert into public.market_data_quality_findings(id,appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,status)
          select'40000000-0000-0000-0000-000000000001',id,ticker_id,report_id,category_id,'price','possible_missing_decimal','high',price::text,price,'test','v1',.9,'open' from public.market_mover_appearances where id='30000000-0000-0000-0000-000000000004';
        select public.rebuild_ticker_statistics();
      `);
      const profile = (await db.query<any>("select * from public.ticker_research_profile where symbol='NVDA'")).rows[0];
      expect(profile).toMatchObject({ total_appearances: 2, distinct_report_dates: 2, shortest_recurrence_gap: 5, longest_recurrence_gap: 5, valid_change_denominator: 2 });
      expect(Number(profile.median_absolute_change)).toBe(75);

      const priority = (await db.query<any>("select * from public.research_priority_candidates where appearance_id='30000000-0000-0000-0000-000000000001'")).rows[0];
      expect(priority.research_priority_version).toBe("historical-research-priority-v1");
      expect(priority.research_priority_reasons).toEqual(expect.arrayContaining(["Repeated mover +2", "Catalyst not researched +10", "Social coverage not researched +10"]));
      expect(Number(priority.research_priority_score)).toBeGreaterThan(50);

      const first = (await db.query<any>("select * from public.find_similar_historical_movers('30000000-0000-0000-0000-000000000001',10)")).rows;
      expect(first[0]).toMatchObject({ reference_appearance_id: "30000000-0000-0000-0000-000000000002", similarity_algorithm_version: "historical-mover-similarity-v1" });
      expect(first[0].match_reasons).toEqual(expect.arrayContaining(["Same mover category", "Same exchange", "Similar price band", "Similar volume band"]));
      const scoreBeforeOutcome = first.find((row) => row.reference_appearance_id === "30000000-0000-0000-0000-000000000003").similarity_score;
      await db.exec("insert into public.ticker_price_events(ticker_id,event_type,event_id,event_timestamp,reference_price,return_1d,return_3d,return_7d,return_30d)values('10000000-0000-0000-0000-000000000002','market_mover','30000000-0000-0000-0000-000000000003','2026-08-06',4.2,.1,.2,.3,.4)");
      const after = (await db.query<any>("select * from public.find_similar_historical_movers('30000000-0000-0000-0000-000000000001',10)")).rows;
      const outcomeMatch = after.find((row) => row.reference_appearance_id === "30000000-0000-0000-0000-000000000003");
      expect(outcomeMatch.similarity_score).toBe(scoreBeforeOutcome);
      expect(Number(outcomeMatch.return_30d)).toBe(.4);
      await expect(db.exec("update public.market_mover_appearances set change_percent=999 where id='30000000-0000-0000-0000-000000000001'")).rejects.toThrow(/immutable/i);
    } finally {
      await db.close();
    }
  }, 30_000);

  it("stores case status, questions, checklist, saved views, and metadata-only brief snapshots separately from evidence", async () => {
    const db = await database();
    try {
      await db.exec(`
        insert into public.tickers(id,symbol)values('10000000-0000-0000-0000-000000000001','NVDA');
        insert into public.source_reports(id,report_date,import_status)values('20000000-0000-0000-0000-000000000001','2026-08-06','completed');
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date)
          select'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-08-06' from public.market_categories order by display_order limit 1;
        insert into public.research_workspaces(id,name,status)values('80000000-0000-0000-0000-000000000001','NVDA case','follow_up');
        insert into public.research_questions(workspace_id,question)values('80000000-0000-0000-0000-000000000001','What public evidence occurred before the move?');
        insert into public.research_checklist_items(workspace_id,item_key,label)values('80000000-0000-0000-0000-000000000001','review_mover_data','Review mover data');
        insert into public.saved_research_views(workspace_id,name,source_page,route,filters)values('80000000-0000-0000-0000-000000000001','NASDAQ gains','research_today','/research?exchange=NASDAQ','{"exchange":"NASDAQ"}');
        insert into public.research_brief_snapshots(workspace_id,brief_type,ticker_id,appearance_id,data_mode,research_brief_version,title,provenance,coverage,generated_at)
          values('80000000-0000-0000-0000-000000000001','mover','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','raw','mover-research-brief-v1','NVDA mover brief','{"mover_ids":["30000000-0000-0000-0000-000000000001"]}','{"social":"not_researched"}',now());
      `);
      const workspace = (await db.query<any>("select * from public.workspace_activity_summary")).rows[0];
      expect(workspace).toMatchObject({ status: "follow_up", open_questions: 1, incomplete_checklist: 1, saved_view_count: 1, brief_count: 1 });
      expect((await db.query<any>("select count(*)::int count from public.market_mover_appearances")).rows[0].count).toBe(1);
      await expect(db.exec("insert into public.research_workspaces(name,status)values('bad','machine_ranked')")).rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 30_000);
});
