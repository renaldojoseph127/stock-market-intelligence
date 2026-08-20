import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

async function database() {
  const db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role;");
  for (const file of (await readdir(path.join(process.cwd(), "supabase/migrations"))).filter((name) => name.endsWith(".sql")).sort())
    await db.exec((await readFile(path.join(process.cwd(), "supabase/migrations", file), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  return db;
}

describe("Phase 2C.1 derived cross-source migration", () => {
  it("combines market, catalyst, and future social fixtures with explicit modes, quality, ordering, and pagination", async () => {
    const db = await database();
    try {
      await db.exec(`
        insert into public.tickers(id,symbol,company_name,enrichment_status,enrichment_source)values('10000000-0000-0000-0000-000000000001','NVDA','NVIDIA Corporation','complete','alpha_vantage');
        insert into public.source_reports(id,report_date,source_filename,import_status)values('20000000-0000-0000-0000-000000000001','2026-08-06','scanz.pdf','completed');
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
        select'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-08-06',1,22935,12.5,1000000,'{"immutable":true}'from public.market_categories where category_type='biggest_gainer'order by display_order limit 1;
        insert into public.market_data_quality_findings(id,appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
        select'40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',category_id,'price','possible_missing_decimal','high','22935',22935,'decimal','v1',.95,'{}','proposed'from public.market_mover_appearances where id='30000000-0000-0000-0000-000000000001';
        insert into public.market_data_correction_proposals(id,finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
        values('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','price','22935','229.35',229.35,'decimal_restoration',.95,'Fixture approved overlay','{}');
        select public.approve_market_data_proposal('41000000-0000-0000-0000-000000000001','test','Fixture approval');
        insert into public.market_data_quality_findings(id,appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
        select'42000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',category_id,'volume','historical_outlier','medium','1000000',1000000,'volume-outlier','v1',.8,'{}','open'from public.market_mover_appearances where id='30000000-0000-0000-0000-000000000001';
        insert into public.ticker_events(id,ticker_id,event_date,event_type,headline,normalized_headline,source_url,event_status,source_name,source_type,is_primary_source)
        values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-08-05 13:00Z','sec_filing','8-K results','8-K results','https://www.sec.gov/fixture','linked','SEC EDGAR','sec',true);
        insert into public.ticker_events(id,ticker_id,event_date,event_type,headline,normalized_headline,source_url,event_status,source_name,source_type,is_primary_source)
        values('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2026-08-06 00:00Z','news','Same timestamp evidence','Same timestamp evidence','https://issuer.example/fixture','observed','Issuer IR','company_ir',true);
        insert into public.event_mover_relationships(event_id,appearance_id,ticker_id,relationship_type,event_at,mover_date,hours_before_move,days_before_move,temporal_bucket,confidence,catalyst_relevance,reason)
        values('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','preceded_move','2026-08-05 13:00Z','2026-08-06',11,.45,'within_24h_before',.9,90,'Temporal fixture');
        insert into public.ticker_catalyst_coverage(ticker_id,date_from,date_to,source_scope_key,sources_checked,last_researched_at,sec_checked,events_found,coverage_status,limitations)
        values('10000000-0000-0000-0000-000000000001','2026-08-01','2026-08-08','sec','["sec"]',now(),true,1,'complete_for_configured_sources','[]');
      `);
      const source = (await db.query<any>("select id from public.social_sources where adapter_key='reddit'")).rows[0].id;
      await db.query("insert into public.social_accounts(id,source_id,username)values('60000000-0000-0000-0000-000000000001',$1,'fixture_user')", [source]);
      await db.query("insert into public.social_posts(id,source_id,account_id,external_post_id,title,body,posted_at,post_type,availability_status)values('70000000-0000-0000-0000-000000000001',$1,'60000000-0000-0000-0000-000000000001','fixture','$NVDA discussion','Fixture-only social evidence','2026-08-03 15:00Z','post','active')", [source]);
      await db.exec("insert into public.post_tickers(post_id,ticker_id,mention_text,extraction_method,confidence_score,resolver_version)values('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','$NVDA','cashtag',.99,'ticker-mention-v2')");
      await db.query("insert into public.ticker_social_coverage(ticker_id,source_id,date_from,date_to,coverage_status,limitations,query_evidence)values('10000000-0000-0000-0000-000000000001',$1,'2026-07-07','2026-08-08','provider_limited','[]','[]')", [source]);
      await db.exec("insert into public.research_workspaces(id,name)values('80000000-0000-0000-0000-000000000001','Cross-source case');insert into public.research_workspace_items(workspace_id,item_type,name,ticker_id)values('80000000-0000-0000-0000-000000000001','ticker','NVDA','10000000-0000-0000-0000-000000000001');insert into public.research_workspace_items(workspace_id,item_type,name,ticker_id,appearance_id)values('80000000-0000-0000-0000-000000000001','mover','NVDA mover','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');insert into public.research_workspace_items(workspace_id,item_type,name,event_id)values('80000000-0000-0000-0000-000000000001','catalyst','8-K results','50000000-0000-0000-0000-000000000001');insert into public.research_workspace_items(workspace_id,item_type,name,social_post_id)values('80000000-0000-0000-0000-000000000001','social_post','Fixture post','70000000-0000-0000-0000-000000000001');insert into public.research_workspace_items(workspace_id,item_type,name,account_id)values('80000000-0000-0000-0000-000000000001','account','Fixture account','60000000-0000-0000-0000-000000000001')");
      const raw = await db.query<any>("select * from public.get_cross_source_timeline(array['10000000-0000-0000-0000-000000000001']::uuid[],null,null,'raw',null,null,null,50,0)");
      expect(raw.rows.map((row) => row.source_domain)).toEqual(["market", "catalyst", "catalyst", "account", "social"]);
      const rawAgain = await db.query<any>("select * from public.get_cross_source_timeline(array['10000000-0000-0000-0000-000000000001']::uuid[],null,null,'raw',null,null,null,50,0)");
      expect(rawAgain.rows.map((row) => row.id)).toEqual(raw.rows.map((row) => row.id));
      const rawMarket = raw.rows.find((row) => row.source_domain === "market");
      expect(rawMarket.metadata).toMatchObject({ data_mode: "raw", price: 22935, repaired_field_count: 1 });
      expect(rawMarket.quality_status).toBe("flagged");
      const effective = await db.query<any>("select metadata from public.get_cross_source_timeline(array['10000000-0000-0000-0000-000000000001']::uuid[],null,null,'effective',array['market'],null,null,1,0)");
      expect(effective.rows[0].metadata).toMatchObject({ data_mode: "effective", price: 229.35 });
      const secondPage = await db.query<any>("select source_domain,total_count from public.get_cross_source_timeline(array['10000000-0000-0000-0000-000000000001']::uuid[],null,null,'raw',null,null,null,1,1)");
      expect(secondPage.rows[0]).toMatchObject({ source_domain: "catalyst", total_count: 5 });
      const summary = (await db.query<any>("select * from public.cross_source_analytics_summary")).rows[0];
      expect(summary).toMatchObject({ total_mover_appearances: 1, catalyst_researched_appearances: 1, identified_catalyst_appearances: 1, social_limited_appearances: 1, social_complete_appearances: 0, complete_social_without_identified_evidence: 0 });
      expect((await db.query<any>("select count(*)::int count from public.research_workspace_items where workspace_id='80000000-0000-0000-0000-000000000001'")).rows[0].count).toBe(5);
      const ai = (await db.query<any>("select public.execute_cross_source_research_query('quality_flagged_movers','{\"tickers\":[\"NVDA\"]}',50)result")).rows[0].result;
      expect(ai.records[0]).toMatchObject({ symbol: "NVDA", qualityFindingCount: 1, hasEffectiveRepair: true, dataMode: "raw" });
      expect(ai.records[0].citations[0].route).toContain("/market-movers/");
    } finally {
      await db.close();
    }
  }, 30_000);

  it("stores case-file items, notes, and tags separately and prevents duplicate evidence pins", async () => {
    const db = await database();
    try {
      await db.exec("insert into public.tickers(id,symbol)values('10000000-0000-0000-0000-000000000001','NVDA');insert into public.research_workspaces(id,name)values('80000000-0000-0000-0000-000000000001','NVDA case');insert into public.research_workspace_items(workspace_id,item_type,name,ticker_id)values('80000000-0000-0000-0000-000000000001','ticker','NVDA','10000000-0000-0000-0000-000000000001');insert into public.research_notes(workspace_id,subject_type,note)values('80000000-0000-0000-0000-000000000001','research_workspace','Review catalyst sequence');insert into public.research_tags(workspace_id,subject_type,tag)values('80000000-0000-0000-0000-000000000001','research_workspace','follow_up')");
      await expect(db.exec("insert into public.research_workspace_items(workspace_id,item_type,name,ticker_id)values('80000000-0000-0000-0000-000000000001','ticker','Duplicate','10000000-0000-0000-0000-000000000001')")).rejects.toThrow();
      expect((await db.query<any>("select count(*)::int count from public.research_notes")).rows[0].count).toBe(1);
      expect((await db.query<any>("select tag from public.research_tags")).rows[0].tag).toBe("follow_up");
    } finally {
      await db.close();
    }
  }, 30_000);
});
