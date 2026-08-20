import{readFile,readdir}from"node:fs/promises";import path from"node:path";import{PGlite}from"@electric-sql/pglite";import{describe,expect,it}from"vitest";

async function database(){const db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role;");for(const file of(await readdir(path.join(process.cwd(),"supabase/migrations"))).filter(x=>x.endsWith(".sql")).sort())await db.exec((await readFile(path.join(process.cwd(),"supabase/migrations",file),"utf8")).replace("create extension if not exists pgcrypto;",""));return db}

describe("Phase 2C derived historical social intelligence",()=>{
 it("derives coverage-aware mover/catalyst sequence while preserving Scanz source rows",async()=>{const db=await database();try{
  await db.exec(`
   insert into public.tickers(id,symbol,company_name)values('10000000-0000-0000-0000-000000000001','NVDA','NVIDIA Corporation');
   insert into public.source_reports(id,report_date,source_filename,import_status)values('20000000-0000-0000-0000-000000000001','2026-08-06','scanz.pdf','completed');
   insert into public.market_mover_appearances(id,ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
   select'30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'2026-08-06',1,180,12.5,1000000,'{"immutable":true}'from public.market_categories where category_type='biggest_gainer'order by display_order limit 1;
  `);
  const before=(await db.query<any>("select row_to_json(m.*)row from public.market_mover_appearances m where id='30000000-0000-0000-0000-000000000001'")).rows[0].row;
  const source=(await db.query<any>("select id from public.social_sources where adapter_key='reddit'")).rows[0].id;
  const community=(await db.query<any>("select id from public.social_communities where source_id=$1 and slug='wallstreetbets'",[source])).rows[0].id;
  await db.query("insert into public.social_accounts(id,source_id,username)values('40000000-0000-0000-0000-000000000001',$1,'historian')",[source]);
  await db.query("insert into public.social_posts(id,source_id,account_id,community_id,external_post_id,title,body,posted_at,post_type,availability_status)values('50000000-0000-0000-0000-000000000001',$1,'40000000-0000-0000-0000-000000000001',$2,'t3_fixture','$NVDA earnings thesis','Bullish NVDA earnings and upside','2026-08-03 15:00Z','post','active')",[source,community]);
  await db.exec("insert into public.post_tickers(post_id,ticker_id,mention_text,extraction_method,confidence_score,resolver_version)values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','$NVDA','cashtag',.99,'ticker-mention-v2');insert into public.ticker_events(id,ticker_id,event_date,event_type,headline,source_url,event_status,source_name,source_type,is_primary_source)values('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-08-05 13:00Z','earnings','Public results','https://issuer.example/results','linked','Issuer IR','company_ir',true);select public.rebuild_cp6_analytics('10000000-0000-0000-0000-000000000001');");
  await db.query("insert into public.ticker_social_coverage(ticker_id,source_id,community,date_from,date_to,last_researched_at,posts_found,accounts_found,coverage_status,provider_cursor_exhausted,limitations,query_evidence)values('10000000-0000-0000-0000-000000000001',$1,'wallstreetbets','2026-07-07','2026-08-08',now(),1,1,'complete_for_provider_window',true,'[]','[]')",[source]);
  const rebuilt=(await db.query<any>("select public.rebuild_phase2c_social_derivatives(array['10000000-0000-0000-0000-000000000001']::uuid[])result")).rows[0].result;
  expect(rebuilt).toMatchObject({mover_relationships:1,catalyst_relationships:1});
  expect((await db.query<any>("select relationship_type,days_before_move::int,temporal_bucket from public.social_mover_relationships")).rows[0]).toMatchObject({relationship_type:"mentioned_before_move",days_before_move:3,temporal_bucket:"1_to_3_days_before"});
  expect((await db.query<any>("select relationship_type from public.social_catalyst_relationships")).rows[0].relationship_type).toBe("discussion_before_catalyst");
  expect((await db.query<any>("select first_known_bullish_mention from public.social_mover_context where appearance_id='30000000-0000-0000-0000-000000000001'")).rows[0].first_known_bullish_mention).toBeTruthy();
  expect((await db.query<any>("select adequately_researched_appearances,appearances_with_pre_move_social from public.social_pre_move_analytics_universe")).rows[0]).toMatchObject({adequately_researched_appearances:1,appearances_with_pre_move_social:1});
  const ai=(await db.query<any>("select public.execute_social_research_query('wallstreetbets_before_move','{\"tickers\":[\"NVDA\"]}',50)result")).rows[0].result;
  expect(ai.record_count).toBe(1);expect(ai.limitations.join(" ")).toMatch(/does not establish causation/i);
  expect((await db.query<any>("select row_to_json(m.*)row from public.market_mover_appearances m where id='30000000-0000-0000-0000-000000000001'")).rows[0].row).toEqual(before);
 }finally{await db.close()}},30_000);

 it("queues only bounded selections in a 4,247-ticker / 25,219-appearance universe",async()=>{const db=await database();try{
  await db.exec(`
   insert into public.tickers(symbol)select'T'||lpad(g::text,4,'0')from generate_series(1,4247)g;
   insert into public.source_reports(id,report_date,source_filename,import_status)values('20000000-0000-0000-0000-000000000001','2026-08-06','scale.pdf','completed');
   with ts as(select id,row_number()over(order by symbol)rn from public.tickers),cs as(select id,row_number()over(order by display_order)rn,count(*)over()n from public.market_categories),g as(select generate_series(1,25219)n)
   insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date)
   select ts.id,'20000000-0000-0000-0000-000000000001',cs.id,'2026-08-06'from g join ts on ts.rn=((g.n-1)%4247)+1 join cs on cs.rn=(((g.n-1)/4247)::int%cs.n)+1;
  `);
  const selected=(await db.query<any>("select array_agg(id)ids from(select id from public.tickers order by symbol limit 5)x")).rows[0].ids;
  const result=(await db.query<any>("select public.queue_social_research_selection('selected_tickers',$1::uuid[],null,null,100,null)result",[selected])).rows[0].result;
  expect(result.queued).toBe(5);expect((await db.query<any>("select count(*)::int count from public.social_research_queue")).rows[0].count).toBe(5);
  const source=(await db.query<any>("select id from public.social_sources where adapter_key='reddit'")).rows[0].id,statuses=["complete_for_provider_window","partial","provider_limited","rate_limited","not_available"];
  for(let i=0;i<statuses.length;i++)await db.query("insert into public.ticker_social_coverage(ticker_id,source_id,date_from,date_to,coverage_status,limitations,query_evidence)values($1,$2,'2026-07-01','2026-08-08',$3,'[]','[]')",[selected[i],source,statuses[i]]);
  await db.query("insert into public.social_posts(source_id,external_post_id,posted_at,post_type,availability_status)select $1,'scale-post-'||g,now()-(g||' minutes')::interval,'post','active'from generate_series(1,5000)g",[source]);
  await db.query("insert into public.post_tickers(post_id,ticker_id,mention_text,extraction_method,confidence_score,resolver_version)select id,$1,'$T0001','cashtag',.99,'ticker-mention-v2'from public.social_posts where external_post_id like'scale-post-%'",[selected[0]]);
  expect((await db.query<any>("select count(*)::int count from public.social_posts where external_post_id like'scale-post-%'")).rows[0].count).toBe(5000);
  expect((await db.query<any>("select count(*)::int count from public.post_tickers pt join public.social_posts p on p.id=pt.post_id where p.external_post_id like'scale-post-%'")).rows[0].count).toBe(5000);
  const timelineStarted=performance.now(),timeline=await db.query<any>("select source_domain,total_count from public.get_cross_source_timeline(array[$1]::uuid[],null,null,'raw',null,null,null,50,0)",[selected[0]]),timelineMs=performance.now()-timelineStarted;
  expect(timeline.rows).toHaveLength(50);expect(Number(timeline.rows[0].total_count)).toBeGreaterThanOrEqual(5000);expect(timelineMs).toBeLessThan(5000);
  expect((await db.query<any>("select array_agg(coverage_status order by coverage_status)statuses from public.ticker_social_coverage")).rows[0].statuses).toEqual([...statuses].sort());
  expect((await db.query<any>("select partial_or_limited_coverage from public.social_analytics_summary")).rows[0].partial_or_limited_coverage).toBe(3);
  expect((await db.query<any>("select count(*)::int count from public.tickers")).rows[0].count).toBe(4247);expect((await db.query<any>("select count(*)::int count from public.market_mover_appearances")).rows[0].count).toBe(25219);
  expect((await db.query<any>("select public.reserve_social_provider_request('reddit',2)reserved")).rows[0].reserved).toBe(true);
  await db.exec("select public.record_social_provider_request('reddit','success',true);select public.record_social_provider_request('reddit','success',false);");
  expect((await db.query<any>("select requests_reserved,requests_succeeded,cache_hits,cache_misses from public.social_provider_daily_usage where provider='reddit'")).rows[0]).toMatchObject({requests_reserved:1,requests_succeeded:1,cache_hits:1,cache_misses:1});
 }finally{await db.close()}},30_000);
});
