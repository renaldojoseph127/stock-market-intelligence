import{readFile}from"node:fs/promises";
import path from"node:path";
import{PGlite}from"@electric-sql/pglite";
import{describe,expect,it}from"vitest";

const migrationFiles=["202608090001_checkpoint_1_foundation.sql","202608100001_checkpoint_2_import_pipeline.sql","202608100002_checkpoint_3_historical_analytics.sql","202608100003_checkpoint_4_social_research.sql","202608100004_checkpoint_5_account_intelligence.sql","202608100005_checkpoint_6_sentiment_attention_scoring.sql","202608100006_checkpoint_7_historical_price_volume.sql","202608100007_checkpoint_8_pattern_similarity.sql","202608100008_checkpoint_9_watchlists_alerts.sql","202608100009_checkpoint_10_ai_research.sql","202608120001_checkpoint_2_async_preview_jobs.sql","202608120002_checkpoint_2_adaptive_ocr.sql","202608120003_checkpoint_2_resumable_finalization.sql","202608120004_checkpoint_2_decimal_count_recovery.sql","202608120005_checkpoint_2_batch_detail_indexes.sql","202608130001_phase_2a_ticker_enrichment.sql","202608130002_phase_2a1_on_demand_enrichment.sql"];

describe("Phase 2A enrichment migration",()=>{it("merges safely, retains provenance/conflicts, resumes, and leaves mover history unchanged",async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role;");
  for(const file of migrationFiles)await db.exec((await readFile(path.join(process.cwd(),"supabase/migrations",file),"utf8")).replace("create extension if not exists pgcrypto;",""));
  await db.exec(`
   insert into public.tickers(id,symbol,company_name)values
    ('10000000-0000-0000-0000-000000000001','SAFE','Existing Name'),
    ('10000000-0000-0000-0000-000000000002','FAIL',null);
   insert into public.source_reports(id,report_date,source_type,source_filename,import_status)values
    ('20000000-0000-0000-0000-000000000001','2026-01-05','scanz','fixture.pdf','completed');
   insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,change_percent,volume)
    select'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-01-05',1,25,1000000
    from public.market_categories where name='NASDAQ Biggest Gainers';
   select public.rebuild_ticker_statistics();`);
  const before=await db.query<any>("select count(*)::int appearances,(select count(*)::int from public.source_reports)reports,(select array_agg(id order by id)from public.tickers)ids from public.market_mover_appearances");
  const started=await db.query<any>("select public.start_ticker_enrichment_run('fixture','selected',array['10000000-0000-0000-0000-000000000001']::uuid[],array['fixture'],1,3)id"),runId=started.rows[0].id;
  const claimed=await db.query<any>("select*from public.claim_ticker_enrichment_items($1,1)",[runId]),itemId=claimed.rows[0].id;
  await db.query("select public.apply_ticker_enrichment_result($1,$2,'fixture','found',$3::jsonb,null,null,false)",[runId,itemId,JSON.stringify({company_name:"Conflicting Name",exchange:"XNAS",sector:"Biotechnology",industry:"Biotechnology",market_cap:125000000,float_shares:5000000,shares_outstanding:10000000,website:"https://example.com",security_type:"common_stock",cik:"1234",currency:"usd",confidence:.9})]);
  await db.query("select public.apply_ticker_enrichment_result($1,$2,'fixture','found',$3::jsonb,null,null,false)",[runId,itemId,JSON.stringify({company_name:null,sector:null,security_type:"common_stock"})]);
  await db.query("select public.refresh_ticker_enrichment_run($1)",[runId]);
  const ticker=await db.query<any>("select*from public.tickers where symbol='SAFE'"),conflicts=await db.query<any>("select*from public.ticker_metadata_conflicts where ticker_id='10000000-0000-0000-0000-000000000001'"),sources=await db.query<any>("select*from public.ticker_metadata_sources where ticker_id='10000000-0000-0000-0000-000000000001'"),after=await db.query<any>("select count(*)::int appearances,(select count(*)::int from public.source_reports)reports,(select array_agg(id order by id)from public.tickers)ids from public.market_mover_appearances");
  expect(ticker.rows[0]).toMatchObject({company_name:"Existing Name",exchange:"NASDAQ",sector:"Biotechnology",market_cap:"125000000",cik:"0000001234",currency:"USD",enrichment_status:"enriched"});
  expect(conflicts.rows.some(x=>x.field_name==="company_name"&&x.incoming_value==="Conflicting Name")).toBe(true);
  expect(sources.rows.some(x=>x.field_name==="market_cap"&&x.provider==="fixture")).toBe(true);
  expect(after.rows[0]).toEqual(before.rows[0]);
  expect(await db.query<any>("select count(*)::int count from public.tickers where symbol='SAFE'").then(x=>x.rows[0].count)).toBe(1);
  await expect(db.exec("update public.tickers set market_cap=-1 where symbol='SAFE'")).rejects.toThrow();
  await db.exec("update public.tickers set enrichment_status='failed' where symbol='FAIL'");
  const retry=await db.query<any>("select public.start_ticker_enrichment_run('fixture','failed',null,array['fixture'],50,3)id"),retryCount=await db.query<any>("select total_tickers from public.ticker_enrichment_runs where id=$1",[retry.rows[0].id]);
  expect(retryCount.rows[0].total_tickers).toBe(1);
  const research=await db.query<any>(`select public.execute_ticker_metadata_research('{"exchange":"NASDAQ","industry":"biotech","market_cap_max":200000000,"category_type":"biggest_gainer"}',50) result`);
  expect(research.rows[0].result.records[0]).toMatchObject({symbol:"SAFE",biggest_gainer_count:1});
  await db.query("select public.refresh_ticker_research_documents(array['10000000-0000-0000-0000-000000000001']::uuid[])");
  const catalog=await db.query<any>("select content,evidence from public.research_search_documents where domain='ticker'and record_id='10000000-0000-0000-0000-000000000001'");
  expect(catalog.rows[0].content).toContain("Biotechnology");expect(catalog.rows[0].evidence.security_type).toBe("common_stock");
 }finally{await db.close()}
},30000)});
