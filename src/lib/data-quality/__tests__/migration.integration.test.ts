import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Phase 2A.2 data-quality migration", () => {
  it("batches, resumes, deduplicates, approves effective values, logs, and reverts without touching raw", async () => {
    const db = new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;");
      const files = (await readdir(path.join(process.cwd(), "supabase/migrations"))).filter(file => file.endsWith(".sql")).sort();
      for (const file of files) await db.exec((await readFile(path.join(process.cwd(), "supabase/migrations", file), "utf8")).replace("create extension if not exists pgcrypto;", ""));
      await db.exec(`
        insert into public.tickers(id,symbol)values('10000000-0000-0000-0000-000000000001','TEST');
        insert into public.source_reports(id,report_date,source_filename,import_status,extraction_method)values
          ('20000000-0000-0000-0000-000000000001','2026-01-01','one.pdf','completed','ocr'),
          ('20000000-0000-0000-0000-000000000002','2026-01-02','two.pdf','completed','ocr');
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,price,change_percent,volume,dollar_volume,raw_values)
          select'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-01-01',2121,3.37,100000000,21210000000,'{"line":"TEST 2121 +3.37% 1,000 100,000,000 $21,210,000,000","price":"2121"}'::jsonb from public.market_categories where name='NASDAQ Most Active';
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,price,change_percent,volume,dollar_volume,raw_values)
          select'30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',id,'2026-01-02',210,1,1000000,210000000,'{"line":"TEST 210.00 +1.00% 1,000 1,000,000 $210,000,000","price":"210.00"}'::jsonb from public.market_categories where name='NASDAQ Most Active';
      `);
      const run = await db.query<{ id: string }>("select public.start_market_data_quality_audit('2a2-v1',null)id"), runId = run.rows[0].id;
      const first = await db.query<any>("select*from public.claim_market_data_quality_audit_items($1,1)", [runId]);
      expect(first.rows).toHaveLength(1);
      await db.exec(`update public.market_data_quality_audit_items set claimed_at=now()-interval'11 minutes'where id='${first.rows[0].id}'`);
      const resumed = await db.query<any>("select*from public.claim_market_data_quality_audit_items($1,1)", [runId]);
      expect(resumed.rows[0].appearance_id).toBe(first.rows[0].appearance_id);
      const finding = [{ appearanceId: "30000000-0000-0000-0000-000000000001", findings: [{ fieldName: "price", findingType: "possible_missing_decimal", severity: "high", originalValue: "2121", numericOriginalValue: 2121, ruleId: "price_missing_decimal_v1", ruleVersion: "2a2-v1", confidenceScore: .97, evidence: { localMedian: 210 }, proposal: { proposedValue: "212.1", proposedNumericValue: 212.1, proposalMethod: "decimal_restoration", confidenceScore: .97, reason: "fixture", evidence: { scale: 10 } } }] }];
      await db.query("select public.record_market_data_quality_batch($1,$2::jsonb)", [runId, JSON.stringify(finding)]);
      const second = await db.query<any>("select*from public.claim_market_data_quality_audit_items($1,1)", [runId]);
      await db.query("select public.record_market_data_quality_batch($1,$2::jsonb)", [runId, JSON.stringify([{ appearanceId: second.rows[0].appearance_id, findings: [] }])]);
      const completed = await db.query<any>("select*from public.market_data_quality_audit_runs where id=$1", [runId]);
      expect(completed.rows[0]).toMatchObject({ status: "completed", total_rows: 2, processed_rows: 2, findings_created: 1, proposals_created: 1 });

      const rerun = await db.query<{ id: string }>("select public.start_market_data_quality_audit('2a2-v1',array['30000000-0000-0000-0000-000000000001']::uuid[])id");
      await db.query("select*from public.claim_market_data_quality_audit_items($1,1)", [rerun.rows[0].id]);
      await db.query("select public.record_market_data_quality_batch($1,$2::jsonb)", [rerun.rows[0].id, JSON.stringify(finding)]);
      expect((await db.query<any>("select count(*)::int count from public.market_data_quality_findings")).rows[0].count).toBe(1);
      expect((await db.query<any>("select count(*)::int count from public.market_data_correction_proposals")).rows[0].count).toBe(1);

      const proposal = (await db.query<any>("select id from public.market_data_correction_proposals")).rows[0].id;
      await db.query("select public.approve_market_data_proposal($1,'reviewer','Verified against source')", [proposal]);
      const values = await db.query<any>("select raw_price,price,quality_status from public.market_mover_appearances_effective where id='30000000-0000-0000-0000-000000000001'");
      expect(values.rows[0]).toMatchObject({ raw_price: "2121", price: "212.1", quality_status: "repaired" });
      expect((await db.query<any>("select count(*)::int count from public.market_data_repair_log where repair_action='approve'")).rows[0].count).toBe(1);
      await expect(db.query("select public.approve_market_data_proposal($1,'other','duplicate')", [proposal])).rejects.toThrow(/not pending/);
      await expect(db.exec("update public.market_mover_appearances set price=212.1 where id='30000000-0000-0000-0000-000000000001'")).rejects.toThrow(/immutable/);
      await db.query("select public.revert_market_data_repair('30000000-0000-0000-0000-000000000001','price','reviewer','Recheck requested')");
      const reverted = await db.query<any>("select raw_price,price from public.market_mover_appearances_effective where id='30000000-0000-0000-0000-000000000001'");
      expect(reverted.rows[0]).toMatchObject({ raw_price: "2121", price: "2121" });
      expect((await db.query<any>("select count(*)::int count from public.market_data_repair_log where repair_action='revert'")).rows[0].count).toBe(1);

      const reviewRun = await db.query<{ id: string }>("select public.start_market_data_quality_audit('2a2-v1',array['30000000-0000-0000-0000-000000000001']::uuid[])id");
      await db.query("select*from public.claim_market_data_quality_audit_items($1,1)", [reviewRun.rows[0].id]);
      await db.query("select public.record_market_data_quality_batch($1,$2::jsonb)", [reviewRun.rows[0].id, JSON.stringify(finding)]);
      const pending = (await db.query<any>("select id from public.market_data_correction_proposals where finding_id=(select id from public.market_data_quality_findings where appearance_id='30000000-0000-0000-0000-000000000001')and status='pending'and is_current")).rows[0].id;
      const edited = await db.query<{ edit_market_data_proposal: string }>("select public.edit_market_data_proposal($1,'211.9',211.9,'reviewer','Manual source reinspection')", [pending]);
      const editedId = edited.rows[0].edit_market_data_proposal;
      expect((await db.query<any>("select status,is_current,proposal_method from public.market_data_correction_proposals where id=$1", [pending])).rows[0]).toMatchObject({ status: "superseded", is_current: false });
      expect((await db.query<any>("select status,is_current,proposal_method from public.market_data_correction_proposals where id=$1", [editedId])).rows[0]).toMatchObject({ status: "pending", is_current: true, proposal_method: "manual_review" });
      await db.query("select public.reject_market_data_proposal($1,'reviewer','Source did not prove the correction')", [editedId]);
      expect((await db.query<any>("select status,rejected_by from public.market_data_correction_proposals where id=$1", [editedId])).rows[0]).toMatchObject({ status: "rejected", rejected_by: "reviewer" });

      const ignoreFinding = (await db.query<any>(`insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence)
        select a.id,a.ticker_id,a.report_id,a.category_id,'row','other','low','fixture',null,'manual_fixture_v1','2a2-v1',.5,'{}'::jsonb from public.market_mover_appearances a where a.id='30000000-0000-0000-0000-000000000002' returning id`)).rows[0].id;
      await db.query("select public.ignore_market_data_finding($1,'reviewer','Known clean control')", [ignoreFinding]);
      expect((await db.query<any>("select status,reviewed_by from public.market_data_quality_findings where id=$1", [ignoreFinding])).rows[0]).toMatchObject({ status: "ignored", reviewed_by: "reviewer" });

      const dashboard = (await db.query<any>("select*from public.market_data_quality_dashboard")).rows[0];
      expect(dashboard).toMatchObject({ total_appearances: 2, flagged: 0, clean: 2, rejected_proposals: 1, reverted_repairs: 1 });
    } finally { await db.close(); }
  }, 30000);
});
