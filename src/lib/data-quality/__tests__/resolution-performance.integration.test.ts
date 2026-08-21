import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Phase 2D production-shaped resolution performance", () => {
  it("bounds queue, summary, and breakdown queries over 4,247 tickers and 25,219 appearances", async () => {
    const db = new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;");
      for (const file of (await readdir(path.join(process.cwd(),"supabase/migrations"))).filter(value => value.endsWith(".sql")).sort())
        await db.exec((await readFile(path.join(process.cwd(),"supabase/migrations",file),"utf8")).replace("create extension if not exists pgcrypto;",""));
      await db.exec(`
        insert into public.tickers(id,symbol)
          select('b1000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'Q'||lpad(g::text,5,'0')from generate_series(1,4247)g;
        insert into public.source_reports(id,report_date,source_filename,import_status,extraction_method,extraction_confidence)
          select('b2000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,date'2025-01-01'+(g-1),g||'-scale.pdf','completed','ocr',.94 from generate_series(1,224)g;
        insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,price,change_percent,trades,volume,dollar_volume,raw_values)
          select('b3000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
            ('b1000000-0000-0000-0000-'||lpad((((g-1)%4247)+1)::text,12,'0'))::uuid,
            ('b2000000-0000-0000-0000-'||lpad((((g-1)%224)+1)::text,12,'0'))::uuid,c.id,date'2025-01-01'+((g-1)%224),
            case when g between 3151 and 3581 then 2121 else 10+(g%100)::numeric/100 end,
            case when g between 2530 and 3150 then 621 else((g%40)-20)::numeric/10 end,100+(g%1000),1000+(g%100000),10000+(g%1000000),
            jsonb_build_object('line','Q'||lpad((((g-1)%4247)+1)::text,5,'0')||' raw source','price',case when g between 3151 and 3581 then'2121'else'10.00'end,'changePercent',case when g between 2530 and 3150 then'621%'else'1.0%'end,'sourcePageNumber',1)
          from generate_series(1,25219)g cross join lateral(select id from public.market_categories order by display_order limit 1)c;
        with numbered as(select a.*,row_number()over(order by id)rn from public.market_mover_appearances a)
        insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select id,ticker_id,report_id,category_id,
            case when rn<=2529 then'dollar_volume'when rn<=3150 then'change_percent'else'price'end,
            case when rn<=2529 then'cross_field_inconsistency'when rn<=3150 then'possible_missing_decimal'when rn<=3581 then'possible_missing_decimal'else'ticker_sequence_outlier'end,
            case when rn<=2529 then'medium'else'high'end,
            case when rn<=2529 then dollar_volume::text when rn<=3150 then change_percent::text else price::text end,
            case when rn<=2529 then dollar_volume when rn<=3150 then change_percent else price end,
            'phase2d_primary_'||rn,'2a2-v1',case when rn<=2529 then.82 else.95 end,
            case when rn<=2529 then jsonb_build_object('priceTimesVolume',price*volume)when rn<=3150 then jsonb_build_object('rawPercentToken','621%','candidateDividedBy100',6.21)else jsonb_build_object('rawPriceToken',price::text)end,'proposed'
          from numbered where rn<=3906;
        with numbered as(select a.*,row_number()over(order by id)rn from public.market_mover_appearances a)
        insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select id,ticker_id,report_id,category_id,'price','ticker_sequence_outlier','high',price::text,price,'phase2d_sequence_'||rn,'2a2-v1',.88,jsonb_build_object('lookAheadPolicy','prior_observations_only'),'open'from numbered where rn<=1098;
        with numbered as(select a.*,row_number()over(order by id)rn from public.market_mover_appearances a)
        insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
          select id,ticker_id,report_id,category_id,'volume','ocr_alignment_error','high',volume::text,volume,'phase2d_alignment_'||rn,'2a2-v1',.99,jsonb_build_object('rawLine',raw_values->>'line'),'proposed'from numbered where rn<=176;
        insert into public.market_data_correction_proposals(finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
          select f.id,f.appearance_id,f.field_name,f.original_value,
            case when f.field_name='change_percent'then(f.numeric_original_value/100)::text when f.field_name='price'then(f.numeric_original_value/100)::text else f.original_value end,
            case when f.field_name='change_percent'then f.numeric_original_value/100 when f.field_name='price'then f.numeric_original_value/100 else f.numeric_original_value end,
            case when f.field_name in('price','change_percent')then'decimal_restoration'else'column_realignment'end,
            f.confidence_score,'production-shaped deterministic fixture',
            case when f.field_name='change_percent'then'{"rawPercentToken":"621%","lookAheadPolicy":"same_day_source_only","resolutionEngineVersion":"data-quality-resolution-v1","resolutionWarnings":[]}'::jsonb
                 when f.field_name='price'then'{"rawPriceToken":"2121","lookAheadPolicy":"prior_observations_only","resolutionEngineVersion":"data-quality-resolution-v1","resolutionWarnings":[]}'::jsonb
                 else jsonb_build_object('rawLine',f.evidence->>'rawLine','lookAheadPolicy','same_day_source_only','resolutionEngineVersion','data-quality-resolution-v1','resolutionWarnings',jsonb_build_array('Coordinated row approval required.'))end
          from public.market_data_quality_findings f where f.rule_id like'phase2d_primary_%'and f.field_name in('change_percent','price')
          union all
          select f.id,f.appearance_id,f.field_name,f.original_value,f.original_value,f.numeric_original_value,'column_realignment',f.confidence_score,'alignment fixture',
            jsonb_build_object('rawLine',f.evidence->>'rawLine','lookAheadPolicy','same_day_source_only','resolutionEngineVersion','data-quality-resolution-v1','resolutionWarnings',jsonb_build_array('Coordinated row approval required.'))
          from public.market_data_quality_findings f where f.rule_id like'phase2d_alignment_%';
        select public.rebuild_ticker_statistics();
      `);
      expect((await db.query<any>("select count(*)::int count from public.tickers where symbol like'Q%'")).rows[0].count).toBe(4247);
      expect((await db.query<any>("select count(*)::int count from public.market_mover_appearances")).rows[0].count).toBe(25219);
      expect((await db.query<any>("select count(distinct appearance_id)::int count from public.market_data_quality_findings where status in('open','proposed')")).rows[0].count).toBe(3906);
      const queueStart = performance.now(), queue = await db.query<any>("select*from public.get_market_data_resolution_queue(p_limit=>100)"), queueMs = performance.now()-queueStart;
      const summaryStart = performance.now(), summary = (await db.query<any>("select*from public.get_market_data_resolution_summary()")).rows[0], summaryMs = performance.now()-summaryStart;
      const breakdownStart = performance.now(), breakdowns = await db.query<any>("select*from public.get_market_data_resolution_breakdowns(24)"), breakdownMs = performance.now()-breakdownStart;
      console.info(`[phase2d-performance] queue=${queueMs.toFixed(1)}ms summary=${summaryMs.toFixed(1)}ms breakdowns=${breakdownMs.toFixed(1)}ms`);
      expect(queue.rows).toHaveLength(100);expect(summary).toMatchObject({ total_appearances:25219,affected_appearances:3906 });
      expect(new Set(breakdowns.rows.map(row => row.dimension))).toEqual(new Set(["field","finding_type","method","confidence","status"]));
      expect(queueMs).toBeLessThan(10_000);expect(summaryMs).toBeLessThan(10_000);expect(breakdownMs).toBeLessThan(10_000);
    } finally { await db.close(); }
  },60_000);
});
