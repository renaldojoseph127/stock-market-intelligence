import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

async function database() {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role;",
  );
  for (const file of (
    await readdir(path.join(process.cwd(), "supabase/migrations"))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(
      (
        await readFile(
          path.join(process.cwd(), "supabase/migrations", file),
          "utf8",
        )
      ).replace("create extension if not exists pgcrypto;", ""),
    );
  }
  return db;
}

describe("Phase 2B continuation migration", () => {
  it("derives coverage-aware analytics, audits reviews, plans catalyst research, and preserves raw observations", async () => {
    const db = await database();
    try {
      await db.exec(`
        insert into public.tickers(id,symbol,cik,security_type,industry)values
          ('10000000-0000-0000-0000-000000000001','NVDA','0001045810','common_stock','Semiconductors'),
          ('10000000-0000-0000-0000-000000000002','MISSING',null,'ETF',null);
        insert into public.source_reports(id,report_date,source_filename,import_status)values
          ('20000000-0000-0000-0000-000000000001','2026-06-15','scanz.pdf','completed');
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
        select '30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-06-15',1,212.1,24.5,1000000,'{"source":"immutable"}'
        from public.market_categories where category_type='biggest_gainer' order by display_order limit 1;
      `);
      const rawBefore = (
        await db.query<any>(
          "select row_to_json(a.*)row from public.market_mover_appearances a where id='30000000-0000-0000-0000-000000000001'",
        )
      ).rows[0].row;
      const source = (
        await db.query<any>(
          "select id from public.event_sources where name='SEC EDGAR'",
        )
      ).rows[0].id;
      const filing = (
        await db.query<any>(
          `insert into public.ticker_events(ticker_id,event_date,event_type,headline,source_url,source_id,external_event_id,event_subtype,published_at,source_name,source_type,sec_accession_number,sec_form_type,sec_cik,event_status,is_primary_source,classification_version,metadata)
        values('10000000-0000-0000-0000-000000000001','2026-06-14 13:00Z','sec_filing','Original 8-K fact','https://www.sec.gov/fixture',$1,'0001045810-26-000111','financial_results','2026-06-14 13:00Z','SEC EDGAR','sec','0001045810-26-000111','8-K','0001045810','linked',true,'catalyst-v1','{}')returning id`,
          [source],
        )
      ).rows[0];
      await db.query(
        "insert into public.sec_filings(event_id,ticker_id,cik,accession_number,form_type,filing_date,accepted_at,filing_url,is_amendment)values($1,'10000000-0000-0000-0000-000000000001','0001045810','0001045810-26-000111','8-K','2026-06-14','2026-06-14 13:00Z','https://www.sec.gov/fixture',false)",
        [filing.id],
      );
      const manual = (
        await db.query<any>(
          "select public.create_manual_catalyst_event('10000000-0000-0000-0000-000000000001','2026-06-13 14:00Z','offering',null,'Public offering announcement','https://issuer.example/release','Issuer IR','Short evidence','admin@example.com','Primary source found during review')id",
        )
      ).rows[0];
      for (const event of [filing.id, manual.id])
        await db.query(
          `insert into public.event_mover_relationships(event_id,appearance_id,ticker_id,relationship_type,event_at,mover_date,hours_before_move,days_before_move,temporal_bucket,confidence,catalyst_relevance,reason,score_evidence)
           values($1,'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','preceded_move','2026-06-14 13:00Z','2026-06-15',20,.83,'within_24h_before',.95,90,'Temporal association only','{"formulaVersion":"catalyst-relevance-v1"}')`,
          [event],
        );
      await db.exec(
        "insert into public.ticker_catalyst_coverage(ticker_id,date_from,date_to,source_scope_key,sources_checked,last_researched_at,sec_checked,events_found,coverage_status,limitations)values('10000000-0000-0000-0000-000000000001','2026-06-08','2026-06-17','sec','[{\"source\":\"sec\"}]',now(),true,2,'complete_for_configured_sources','[\"SEC only\"]')",
      );

      expect(
        (
          await db.query<any>(
            "select combination,appearance_count,ticker_count from public.catalyst_combinations",
          )
        ).rows[0],
      ).toMatchObject({
        combination: "financial_results + offering",
        appearance_count: 1,
        ticker_count: 1,
      });
      expect(
        (
          await db.query<any>(
            "select filings_observed,filings_linked_to_movers from public.sec_form_analytics where form_type='8-K'",
          )
        ).rows[0],
      ).toMatchObject({ filings_observed: 1, filings_linked_to_movers: 1 });
      expect(
        (
          await db.query<any>(
            "select total_mover_appearances,researched_mover_appearances,identified_catalyst_appearances,data_mode from public.catalyst_analytics_universe",
          )
        ).rows[0],
      ).toMatchObject({
        total_mover_appearances: 1,
        researched_mover_appearances: 1,
        identified_catalyst_appearances: 1,
        data_mode: "raw",
      });
      const ai = (
        await db.query<any>(
          'select public.execute_catalyst_research_query(\'catalyst_before_movers\',\'{"tickers":["NVDA"],"temporal_bucket":"within_24h_before"}\',50)result',
        )
      ).rows[0].result;
      expect(ai.record_count).toBe(2);
      expect(ai.limitations.join(" ")).toMatch(/does not establish causation/i);

      const corrected = (
        await db.query<any>(
          "select public.correct_catalyst_event($1,'Normalized 8-K headline','Normalized interpretation','financial_results','reviewer@example.com','Clarified normalized display')result",
          [filing.id],
        )
      ).rows[0].result;
      expect(corrected.status).toBe("corrected");
      expect(
        (
          await db.query<any>(
            "select headline,normalized_headline from public.ticker_events where id=$1",
            [filing.id],
          )
        ).rows[0],
      ).toMatchObject({
        headline: "Original 8-K fact",
        normalized_headline: "Normalized 8-K headline",
      });
      expect(
        (
          await db.query<any>(
            "select count(*)::int count from public.event_normalization_history where event_id=$1",
            [filing.id],
          )
        ).rows[0].count,
      ).toBe(1);

      const candidate = (
        await db.query<any>(
          "insert into public.event_cluster_candidates(ticker_id,event_a_id,event_b_id,similarity,reason)values('10000000-0000-0000-0000-000000000001',$1,$2,.7,'Headline/date similarity requires review')returning id",
          [filing.id, manual.id],
        )
      ).rows[0];
      const reviewed = (
        await db.query<any>(
          "select public.review_event_cluster_candidate($1,'confirm_same_event','reviewer@example.com','Primary and issuer evidence describe the same announcement')result",
          [candidate.id],
        )
      ).rows[0].result;
      expect(reviewed.status).toBe("confirmed");
      expect(
        (
          await db.query<any>(
            "select count(*)::int count from public.event_cluster_members where cluster_id=$1",
            [reviewed.cluster_id],
          )
        ).rows[0].count,
      ).toBe(2);

      const workspace = (
        await db.query<any>(
          "insert into public.research_workspaces(name)values('Catalyst review')returning id",
        )
      ).rows[0];
      await db.query(
        "insert into public.research_workspace_items(workspace_id,item_type,name,content)values($1,'saved_event','8-K evidence',$2)",
        [workspace.id, JSON.stringify({ eventId: filing.id })],
      );
      expect(
        (
          await db.query<any>(
            "select count(*)::int count from public.catalyst_alert_candidate_events",
          )
        ).rows[0].count,
      ).toBe(2);
      expect(
        (
          await db.query<any>(
            "select row_to_json(a.*)row from public.market_mover_appearances a where id='30000000-0000-0000-0000-000000000001'",
          )
        ).rows[0].row,
      ).toEqual(rawBefore);
    } finally {
      await db.close();
    }
  }, 30_000);

  it("selectively queues work, caches unresolved CIK state, and persists operational failures without universe backfill", async () => {
    const db = await database();
    try {
      await db.exec(`insert into public.tickers(id,symbol)values('10000000-0000-0000-0000-000000000001','ONE'),('10000000-0000-0000-0000-000000000002','TWO');
        insert into public.cik_resolution_cache(symbol,normalized_symbol,resolution_status,candidate_count,source_url,raw_mapping,expires_at)values('TWO','TWO','ambiguous',2,'https://www.sec.gov/files/company_tickers.json','{}',now()+interval'7 days');`);
      const selected = (
        await db.query<any>(
          "select public.queue_catalyst_selection('selected_tickers',array['10000000-0000-0000-0000-000000000001']::uuid[],null,'2026-01-01','2026-01-31',25)result",
        )
      ).rows[0].result;
      expect(selected.queued).toBe(1);
      expect(
        (
          await db.query<any>(
            "select count(*)::int count from public.catalyst_research_queue",
          )
        ).rows[0].count,
      ).toBe(1);
      const queue = (
        await db.query<any>(
          "select*from public.claim_catalyst_research_queue(1,null)",
        )
      ).rows[0];
      const source = (
        await db.query<any>(
          "select id from public.event_sources where name='SEC EDGAR'",
        )
      ).rows[0];
      await db.query(
        "insert into public.catalyst_provider_failures(queue_id,ticker_id,source_id,date_from,date_to,attempt,http_status,error_type,error_message,retryable,available_after)values($1,$2,$3,'2026-01-01','2026-01-31',1,429,'rate_limited','HTTP 429',true,now()+interval'15 minutes')",
        [queue.id, queue.ticker_id, source.id],
      );
      await db.query(
        "insert into public.catalyst_provider_runs(queue_id,ticker_id,source_id,provider,status,requests_made,cache_hits,cache_misses,rate_limited_count,duration_ms,started_at,completed_at)values($1,$2,$3,'sec_edgar','deferred',3,1,2,1,500,now(),now())",
        [queue.id, queue.ticker_id, source.id],
      );
      await db.query(
        "select public.finish_catalyst_research_queue($1,'deferred','HTTP 429',now()+interval'15 minutes')",
        [queue.id],
      );
      expect(
        (
          await db.query<any>(
            "select failed_retrievals,rate_limited_count from public.event_source_analytics where source='SEC EDGAR'",
          )
        ).rows[0],
      ).toMatchObject({ failed_retrievals: 1, rate_limited_count: 1 });
      const coverage = (
        await db.query<any>("select*from public.sec_ingestion_coverage")
      ).rows[0];
      expect(coverage).toMatchObject({
        tickers_with_cik: 0,
        tickers_without_cik: 2,
        sec_research_failures: 1,
      });
      expect(
        (
          await db.query<any>(
            "select count(*)::int count from public.catalyst_research_queue where reason='historical_backfill'",
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await db.close();
    }
  }, 30_000);
});
