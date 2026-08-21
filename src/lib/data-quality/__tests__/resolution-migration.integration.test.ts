import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Phase 2D data-quality resolution migration", () => {
  it("prioritizes, exposes impact, bulk-approves only safe overlays, audits, and reverses without changing RAW", async () => {
    const db = new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;");
      for (const file of (await readdir(path.join(process.cwd(),"supabase/migrations"))).filter(value => value.endsWith(".sql")).sort())
        await db.exec((await readFile(path.join(process.cwd(),"supabase/migrations",file),"utf8")).replace("create extension if not exists pgcrypto;",""));
      await db.exec(`
        insert into public.tickers(id,symbol)values('a1000000-0000-0000-0000-000000000001','SAFE'),('a1000000-0000-0000-0000-000000000002','LEGACY');
        insert into public.source_reports(id,report_date,source_filename,import_status,extraction_method,extraction_confidence)
          values('a2000000-0000-0000-0000-000000000001','2026-01-10','safe.pdf','completed','ocr',.97);
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,price,change_percent,trades,volume,dollar_volume,raw_values)
          select'a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',c.id,'2026-01-10',2121,1,100,1000,212100,
            '{"line":"SAFE 2121 +1% 100 1,000 $212,100","price":"2121","sourcePageNumber":1}'::jsonb from public.market_categories c order by c.display_order limit 1;
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,price,change_percent,trades,volume,dollar_volume,raw_values)
          select'a3000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001',c.id,'2026-01-10',21947,1,100,1000,219470,
            '{"line":"LEGACY 21947 +1% 100 1,000 $219,470","price":"21947","sourcePageNumber":1}'::jsonb from public.market_categories c order by c.display_order limit 1;
        insert into public.market_data_quality_findings(id,appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select'a4000000-0000-0000-0000-000000000001',a.id,a.ticker_id,a.report_id,a.category_id,'price','possible_missing_decimal','high','2121',2121,'phase2d_safe','2a2-v1',.95,'{"rawPriceToken":"2121"}'::jsonb,'proposed'from public.market_mover_appearances a where a.id='a3000000-0000-0000-0000-000000000001';
        insert into public.market_data_quality_findings(id,appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select'a4000000-0000-0000-0000-000000000002',a.id,a.ticker_id,a.report_id,a.category_id,'price','possible_missing_decimal','high','21947',21947,'phase2d_legacy','2a2-v1',.96,'{"rawPriceToken":"21947"}'::jsonb,'proposed'from public.market_mover_appearances a where a.id='a3000000-0000-0000-0000-000000000002';
        insert into public.market_data_correction_proposals(id,finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
          values('a5000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','price','2121','212.1',212.1,'decimal_restoration',.95,'prior-only fixture','{"rawPriceToken":"2121","lookAheadPolicy":"prior_observations_only","resolutionEngineVersion":"data-quality-resolution-v1","resolutionWarnings":[]}'::jsonb),
                ('a5000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000002','price','21947','219.47',219.47,'decimal_restoration',.96,'legacy fixture','{"rawPriceToken":"21947"}'::jsonb);
      `);
      const queue = await db.query<any>("select*from public.get_market_data_resolution_queue(p_limit=>50)");
      const safe = queue.rows.find(row => row.ticker_symbol === "SAFE"), legacy = queue.rows.find(row => row.ticker_symbol === "LEGACY");
      expect(safe).toMatchObject({ confidence_band:"HIGH",look_ahead_safe:true,resolution_bulk_eligible:true,source_filename:"safe.pdf" });
      expect(safe.source_provenance).toMatchObject({ sourceFilename:"safe.pdf",sourcePageNumber:"1" });
      expect(safe.impact_analysis).toMatchObject({ dataMode:{ default:"raw",approvalEffect:"effective_overlay_only",rawValueUnchanged:true },historicalResearchPriority:{ version:"historical-research-priority-v1",rawScoreUnchanged:true },historicalMoverSimilarity:{ version:"historical-mover-similarity-v1",rawSimilarityUnchanged:true },lookAheadSafety:{ laterPricesUsed:false } });
      expect(legacy).toMatchObject({ confidence_band:"HIGH",look_ahead_safe:false,resolution_bulk_eligible:false });
      expect(legacy.warnings[0]).toMatch(/not certified as prior-only/);

      const rawBefore = (await db.query<any>("select row_to_json(a.*)raw from public.market_mover_appearances a where id='a3000000-0000-0000-0000-000000000001'")).rows[0].raw;
      const item = [{ proposalId:"a5000000-0000-0000-0000-000000000001",updatedAt:new Date(safe.proposal_updated_at).toISOString() }];
      const approved = (await db.query<any>("select public.review_market_data_resolution_batch($1::jsonb,'phase2d-reviewer','Prior-only source and impact reviewed')result",[JSON.stringify(item)])).rows[0].result;
      expect(approved).toMatchObject({ requested:1,approved:1,failed:0 });
      expect((await db.query<any>("select price,raw_price,data_mode,repaired_field_count from public.market_mover_appearances_effective where id='a3000000-0000-0000-0000-000000000001'")).rows[0]).toMatchObject({ price:"212.1",raw_price:"2121",data_mode:"effective",repaired_field_count:1 });
      expect((await db.query<any>("select row_to_json(a.*)raw from public.market_mover_appearances a where id='a3000000-0000-0000-0000-000000000001'")).rows[0].raw).toEqual(rawBefore);
      const unsafeItems = [{ proposalId:"a5000000-0000-0000-0000-000000000002",updatedAt:new Date(legacy.proposal_updated_at).toISOString() }];
      await expect(db.query("select public.review_market_data_resolution_batch($1::jsonb,'phase2d-reviewer','unsafe')",[JSON.stringify(unsafeItems)])).rejects.toThrow(/not a safely qualified/);
      await expect(db.exec("update public.market_mover_appearances set price=1 where id='a3000000-0000-0000-0000-000000000001'")).rejects.toThrow(/immutable/);

      const summary = (await db.query<any>("select*from public.get_market_data_resolution_summary()")).rows[0];
      expect(summary).toMatchObject({ total_appearances:2,unresolved_findings:1,approved_overlays:1,affected_appearances:1,effective_overlay_appearances:1 });
      const dimensions = await db.query<any>("select distinct dimension from public.get_market_data_resolution_breakdowns(24) order by dimension");
      expect(dimensions.rows.map(row => row.dimension)).toEqual(["confidence","field","finding_type","method","status"]);

      const rejected = (await db.query<any>("select public.review_market_data_proposal_batch('reject',$1::jsonb,'phase2d-reviewer','Legacy evidence is insufficient','insufficient_evidence')result",[JSON.stringify(unsafeItems)])).rows[0].result;
      expect(rejected).toMatchObject({ requested:1,rejected:1,failed:0 });
      expect((await db.query<any>("select count(*)::int count from public.market_data_effective_values where appearance_id='a3000000-0000-0000-0000-000000000002'")).rows[0].count).toBe(0);

      await db.query("select public.revert_market_data_repair('a3000000-0000-0000-0000-000000000001','price','phase2d-reviewer','Acceptance reversal')");
      expect((await db.query<any>("select count(*)::int count from public.market_data_effective_values")).rows[0].count).toBe(0);
      expect((await db.query<any>("select count(*)::int count from public.market_data_repair_log where appearance_id='a3000000-0000-0000-0000-000000000001'")).rows[0].count).toBe(2);
    } finally { await db.close(); }
  },30_000);
});
