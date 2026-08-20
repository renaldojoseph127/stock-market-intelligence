create table public.price_history(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id) on delete cascade,date date not null,
 open_price numeric,high_price numeric,low_price numeric,close_price numeric not null,adjusted_close numeric,volume bigint not null,trades bigint,vwap numeric,source text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(ticker_id,date,source),
 constraint price_history_prices_positive check(close_price>0 and (open_price is null or open_price>0) and (high_price is null or high_price>0) and (low_price is null or low_price>0) and (adjusted_close is null or adjusted_close>0) and (vwap is null or vwap>0)),
 constraint price_history_high_low check(high_price is null or low_price is null or high_price>=low_price),
 constraint price_history_ohlc_range check((high_price is null or open_price is null or high_price>=open_price) and (high_price is null or close_price is null or high_price>=close_price) and (low_price is null or open_price is null or low_price<=open_price) and (low_price is null or close_price is null or low_price<=close_price)),
 constraint price_history_counts_nonnegative check(volume>=0 and (trades is null or trades>=0))
);
create index price_history_ticker_idx on public.price_history(ticker_id);
create index price_history_date_idx on public.price_history(date desc);
create index price_history_ticker_date_idx on public.price_history(ticker_id,date desc);

create table public.price_import_runs(
 id uuid primary key default gen_random_uuid(),source text not null,ticker_id uuid references public.tickers(id) on delete set null,start_date date,end_date date,
 status text not null default 'pending' check(status in('pending','running','completed','partial','failed')),records_discovered integer not null default 0 check(records_discovered>=0),
 records_inserted integer not null default 0 check(records_inserted>=0),records_updated integer not null default 0 check(records_updated>=0),records_failed integer not null default 0 check(records_failed>=0),
 error_message text,started_at timestamptz not null default now(),completed_at timestamptz,created_at timestamptz not null default now(),constraint price_import_dates check(start_date is null or end_date is null or start_date<=end_date)
);
create index price_import_runs_started_idx on public.price_import_runs(started_at desc);
create index price_import_runs_ticker_idx on public.price_import_runs(ticker_id,started_at desc);

create table public.price_import_errors(
 id uuid primary key default gen_random_uuid(),import_run_id uuid not null references public.price_import_runs(id) on delete cascade,ticker_id uuid references public.tickers(id) on delete set null,
 date date,error_type text not null,error_message text not null,raw_record jsonb,created_at timestamptz not null default now()
);
create index price_import_errors_run_idx on public.price_import_errors(import_run_id);
create index price_import_errors_ticker_idx on public.price_import_errors(ticker_id,date desc);

create table public.price_daily_metrics(
 price_history_id uuid primary key references public.price_history(id) on delete cascade,ticker_id uuid not null references public.tickers(id) on delete cascade,date date not null,
 daily_return numeric,return_3d numeric,return_5d numeric,return_7d numeric,return_14d numeric,return_30d numeric,
 average_volume_5d numeric,average_volume_20d numeric,average_volume_60d numeric,relative_volume_5d numeric,relative_volume_20d numeric,relative_volume_60d numeric,
 volume_change_percent numeric,volume_acceleration numeric,volatility_5d numeric,volatility_20d numeric,volatility_60d numeric,volatility_expansion numeric,calculated_at timestamptz not null default now(),unique(ticker_id,date)
);
create index price_daily_metrics_ticker_date_idx on public.price_daily_metrics(ticker_id,date desc);
create index price_daily_metrics_relative_volume_idx on public.price_daily_metrics(relative_volume_20d desc);

create table public.ticker_price_events(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id) on delete cascade,event_type text not null,event_id uuid,event_timestamp timestamptz not null,
 reference_price numeric,return_1d numeric,return_3d numeric,return_5d numeric,return_7d numeric,return_14d numeric,return_30d numeric,
 maximum_return numeric,maximum_return_date date,minimum_return numeric,minimum_return_date date,created_at timestamptz not null default now(),
 unique(ticker_id,event_type,event_id)
);
create index ticker_price_events_ticker_time_idx on public.ticker_price_events(ticker_id,event_timestamp desc);
create index ticker_price_events_type_idx on public.ticker_price_events(event_type,event_timestamp desc);

create table public.social_market_outcomes(
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.social_posts(id) on delete cascade,ticker_id uuid not null references public.tickers(id) on delete cascade,
 account_id uuid references public.social_accounts(id) on delete set null,mention_timestamp timestamptz not null,reference_date date,price_at_mention numeric,
 return_1d numeric,return_3d numeric,return_7d numeric,return_14d numeric,return_30d numeric,max_return_after_mention numeric,max_return_date date,min_return_after_mention numeric,min_return_date date,
 volume_change_1d numeric,volume_change_7d numeric,created_at timestamptz not null default now(),unique(post_id,ticker_id)
);
create index social_market_outcomes_ticker_idx on public.social_market_outcomes(ticker_id,mention_timestamp desc);
create index social_market_outcomes_post_idx on public.social_market_outcomes(post_id);
create index social_market_outcomes_account_idx on public.social_market_outcomes(account_id,mention_timestamp desc);

create table public.account_market_statistics(
 account_id uuid primary key references public.social_accounts(id) on delete cascade,mentions_analyzed integer not null default 0,average_return_after_mentions numeric,median_return_after_mentions numeric,
 best_return_after_mentions numeric,worst_return_after_mentions numeric,positive_outcome_count integer not null default 0,negative_outcome_count integer not null default 0,average_volume_change numeric,updated_at timestamptz not null default now()
);

create table public.ticker_social_outcomes(
 ticker_id uuid not null references public.tickers(id) on delete cascade,period_start date not null,period_end date not null,mentions integer not null default 0,
 average_return_after_mentions numeric,median_return_after_mentions numeric,average_volume_change numeric,average_attention_score numeric,average_sentiment_score numeric,created_at timestamptz not null default now(),
 primary key(ticker_id,period_start,period_end)
);
create index ticker_social_outcomes_period_idx on public.ticker_social_outcomes(period_start desc,ticker_id);

create trigger price_history_updated before update on public.price_history for each row execute function public.set_updated_at();
create or replace view public.price_history_canonical with(security_invoker=true)as select distinct on(ticker_id,date)*from public.price_history order by ticker_id,date,source,id;

create or replace function public.rebuild_price_daily_metrics(p_ticker_id uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;
begin
 delete from public.price_daily_metrics where p_ticker_id is null or ticker_id=p_ticker_id;
 with ordered as(
  select p.*,lag(close_price,1)over w c1,lag(close_price,3)over w c3,lag(close_price,5)over w c5,lag(close_price,7)over w c7,lag(close_price,14)over w c14,lag(close_price,30)over w c30,
   lag(volume,1)over w v1,lag(volume,2)over w v2,
   avg(volume)over(partition by ticker_id order by date rows between 5 preceding and 1 preceding) av5,
   avg(volume)over(partition by ticker_id order by date rows between 20 preceding and 1 preceding) av20,
   avg(volume)over(partition by ticker_id order by date rows between 60 preceding and 1 preceding) av60
  from public.price_history_canonical p where p_ticker_id is null or ticker_id=p_ticker_id window w as(partition by ticker_id order by date)
 ),returns as(
  select *,case when c1>0 then(close_price-c1)/c1 end dr,case when c3>0 then(close_price-c3)/c3 end r3,case when c5>0 then(close_price-c5)/c5 end r5,
   case when c7>0 then(close_price-c7)/c7 end r7,case when c14>0 then(close_price-c14)/c14 end r14,case when c30>0 then(close_price-c30)/c30 end r30,
   case when v1>0 then(volume-v1)::numeric/v1 end vchange,case when v1>0 and v2>0 then((volume-v1)::numeric/v1)-((v1-v2)::numeric/v2) end vaccel
  from ordered
 ),vol as(
  select *,stddev_samp(dr)over(partition by ticker_id order by date rows between 4 preceding and current row) vol5,
   stddev_samp(dr)over(partition by ticker_id order by date rows between 19 preceding and current row) vol20,
   stddev_samp(dr)over(partition by ticker_id order by date rows between 59 preceding and current row) vol60 from returns
 )
 insert into public.price_daily_metrics(price_history_id,ticker_id,date,daily_return,return_3d,return_5d,return_7d,return_14d,return_30d,average_volume_5d,average_volume_20d,average_volume_60d,relative_volume_5d,relative_volume_20d,relative_volume_60d,volume_change_percent,volume_acceleration,volatility_5d,volatility_20d,volatility_60d,volatility_expansion)
 select id,ticker_id,date,dr,r3,r5,r7,r14,r30,av5,av20,av60,case when av5>0 then volume/av5 end,case when av20>0 then volume/av20 end,case when av60>0 then volume/av60 end,vchange,vaccel,vol5,vol20,vol60,case when vol20>0 then vol5/vol20 end from vol;
 get diagnostics rebuilt=row_count;return rebuilt;
end$$;

create or replace function public.rebuild_market_outcomes(p_ticker_id uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare event_count integer;social_count integer;account_count integer;ticker_count integer;
begin
 delete from public.ticker_price_events where p_ticker_id is null or ticker_id=p_ticker_id;
 with events as(
  select pt.ticker_id,'social_mention'::text event_type,pt.post_id event_id,coalesce(sp.posted_at,sp.created_at) event_timestamp from public.post_tickers pt join public.social_posts sp on sp.id=pt.post_id
  union all select ticker_id,'attention',id,period_start from public.ticker_attention_observations
  union all select ticker_id,'promotion',id,coalesce(event_start_at,first_seen_at,created_at) from public.promotion_events
  union all select ticker_id,'market_mover',id,report_date::timestamptz from public.market_mover_appearances
 ),base as(
  select e.*,r.date reference_date,r.close_price reference_price from events e left join lateral(select p.date,p.close_price from public.price_history_canonical p where p.ticker_id=e.ticker_id and p.date>=e.event_timestamp::date order by p.date limit 1)r on true where p_ticker_id is null or e.ticker_id=p_ticker_id
 ),calc as(
  select b.*,
   (select(ph.close_price-b.reference_price)/nullif(b.reference_price,0) from public.price_history_canonical ph where ph.ticker_id=b.ticker_id and ph.date>b.reference_date order by ph.date offset 0 limit 1)r1,
   (select(ph.close_price-b.reference_price)/nullif(b.reference_price,0) from public.price_history_canonical ph where ph.ticker_id=b.ticker_id and ph.date>b.reference_date order by ph.date offset 2 limit 1)r3,
   (select(ph.close_price-b.reference_price)/nullif(b.reference_price,0) from public.price_history_canonical ph where ph.ticker_id=b.ticker_id and ph.date>b.reference_date order by ph.date offset 4 limit 1)r5,
   (select(ph.close_price-b.reference_price)/nullif(b.reference_price,0) from public.price_history_canonical ph where ph.ticker_id=b.ticker_id and ph.date>b.reference_date order by ph.date offset 6 limit 1)r7,
   (select(ph.close_price-b.reference_price)/nullif(b.reference_price,0) from public.price_history_canonical ph where ph.ticker_id=b.ticker_id and ph.date>b.reference_date order by ph.date offset 13 limit 1)r14,
   (select(ph.close_price-b.reference_price)/nullif(b.reference_price,0) from public.price_history_canonical ph where ph.ticker_id=b.ticker_id and ph.date>b.reference_date order by ph.date offset 29 limit 1)r30
  from base b
 ),extremes as(
  select c.*,mx.ret maxret,mx.date maxdate,mn.ret minret,mn.date mindate from calc c
  left join lateral(select y.ret,y.date from(select (p.close_price-c.reference_price)/nullif(c.reference_price,0)ret,p.date from public.price_history_canonical p where p.ticker_id=c.ticker_id and p.date>c.reference_date order by p.date limit 30)y order by y.ret desc,y.date limit 1)mx on true
  left join lateral(select y.ret,y.date from(select (p.close_price-c.reference_price)/nullif(c.reference_price,0)ret,p.date from public.price_history_canonical p where p.ticker_id=c.ticker_id and p.date>c.reference_date order by p.date limit 30)y order by y.ret,y.date limit 1)mn on true
 )
 insert into public.ticker_price_events(ticker_id,event_type,event_id,event_timestamp,reference_price,return_1d,return_3d,return_5d,return_7d,return_14d,return_30d,maximum_return,maximum_return_date,minimum_return,minimum_return_date)
 select ticker_id,event_type,event_id,event_timestamp,reference_price,r1,r3,r5,r7,r14,r30,maxret,maxdate,minret,mindate from extremes;
 get diagnostics event_count=row_count;

 delete from public.social_market_outcomes where p_ticker_id is null or ticker_id=p_ticker_id;
 insert into public.social_market_outcomes(post_id,ticker_id,account_id,mention_timestamp,reference_date,price_at_mention,return_1d,return_3d,return_7d,return_14d,return_30d,max_return_after_mention,max_return_date,min_return_after_mention,min_return_date,volume_change_1d,volume_change_7d)
 select pt.post_id,pt.ticker_id,sp.account_id,coalesce(sp.posted_at,sp.created_at),ph.date,e.reference_price,e.return_1d,e.return_3d,e.return_7d,e.return_14d,e.return_30d,e.maximum_return,e.maximum_return_date,e.minimum_return,e.minimum_return_date,
  case when ph.volume>0 and p1.volume is not null then(p1.volume-ph.volume)::numeric/ph.volume end,case when ph.volume>0 and p7.volume is not null then(p7.volume-ph.volume)::numeric/ph.volume end
 from public.post_tickers pt join public.social_posts sp on sp.id=pt.post_id join public.ticker_price_events e on e.event_type='social_mention' and e.event_id=pt.post_id and e.ticker_id=pt.ticker_id
 left join public.price_history_canonical ph on ph.ticker_id=pt.ticker_id and ph.date=(select min(x.date)from public.price_history_canonical x where x.ticker_id=pt.ticker_id and x.date>=coalesce(sp.posted_at,sp.created_at)::date)
 left join lateral(select volume from public.price_history_canonical x where x.ticker_id=pt.ticker_id and x.date>ph.date order by x.date offset 0 limit 1)p1 on true
 left join lateral(select volume from public.price_history_canonical x where x.ticker_id=pt.ticker_id and x.date>ph.date order by x.date offset 6 limit 1)p7 on true
 where p_ticker_id is null or pt.ticker_id=p_ticker_id;
 get diagnostics social_count=row_count;

 delete from public.account_market_statistics;
 insert into public.account_market_statistics(account_id,mentions_analyzed,average_return_after_mentions,median_return_after_mentions,best_return_after_mentions,worst_return_after_mentions,positive_outcome_count,negative_outcome_count,average_volume_change)
 select account_id,count(return_7d)::int,avg(return_7d),percentile_cont(.5)within group(order by return_7d),max(max_return_after_mention),min(min_return_after_mention),count(*)filter(where return_7d>0)::int,count(*)filter(where return_7d<0)::int,avg(volume_change_7d)
 from public.social_market_outcomes where account_id is not null group by account_id;
 get diagnostics account_count=row_count;
 update public.promoter_statistics set average_return_after_mention=null,median_return_after_mention=null,best_subsequent_return=null,worst_subsequent_return=null,updated_at=now();
 update public.promoter_statistics ps set average_return_after_mention=a.average_return_after_mentions,median_return_after_mention=a.median_return_after_mentions,best_subsequent_return=a.best_return_after_mentions,worst_subsequent_return=a.worst_return_after_mentions,updated_at=now() from public.account_market_statistics a where a.account_id=ps.account_id;

 delete from public.ticker_social_outcomes where p_ticker_id is null or ticker_id=p_ticker_id;
 with monthly as(select o.ticker_id,date_trunc('month',o.reference_date)::date period_start,count(*)::int mentions,avg(o.return_7d)avg_return,percentile_cont(.5)within group(order by o.return_7d)median_return,avg(o.volume_change_7d)avg_volume from public.social_market_outcomes o where o.reference_date is not null and(p_ticker_id is null or o.ticker_id=p_ticker_id)group by o.ticker_id,date_trunc('month',o.reference_date))
 insert into public.ticker_social_outcomes(ticker_id,period_start,period_end,mentions,average_return_after_mentions,median_return_after_mentions,average_volume_change,average_attention_score,average_sentiment_score)
 select m.ticker_id,m.period_start,(m.period_start+interval'1 month - 1 day')::date,m.mentions,m.avg_return,m.median_return,m.avg_volume,
  (select avg(a.unusual_attention_score)from public.ticker_attention_observations a where a.ticker_id=m.ticker_id and a.period_start::date between m.period_start and(m.period_start+interval'1 month - 1 day')::date),
  (select avg(s.sentiment_score)from public.sentiment_observations s where s.ticker_id=m.ticker_id and s.observation_date between m.period_start and(m.period_start+interval'1 month - 1 day')::date)from monthly m;
 get diagnostics ticker_count=row_count;
 return jsonb_build_object('price_events',event_count,'social_outcomes',social_count,'account_statistics',account_count,'ticker_outcomes',ticker_count);
end$$;

create or replace function public.rebuild_cp7_analytics(p_ticker_id uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare metrics integer;outcomes jsonb;
begin metrics:=public.rebuild_price_daily_metrics(p_ticker_id);outcomes:=public.rebuild_market_outcomes(p_ticker_id);return jsonb_build_object('price_daily_metrics',metrics,'outcomes',outcomes);end$$;

create or replace view public.price_history_detail with(security_invoker=true)as select p.*,t.symbol,m.daily_return,m.return_3d,m.return_5d,m.return_7d,m.return_14d,m.return_30d,m.relative_volume_5d,m.relative_volume_20d,m.relative_volume_60d,m.volume_change_percent,m.volume_acceleration,m.volatility_5d,m.volatility_20d,m.volatility_60d,m.volatility_expansion from public.price_history p join public.tickers t on t.id=p.ticker_id left join public.price_daily_metrics m on m.price_history_id=p.id;
create or replace view public.social_market_outcome_detail with(security_invoker=true)as select o.*,t.symbol,a.username,s.name platform,so.sentiment,so.sentiment_score,ta.unusual_attention_score from public.social_market_outcomes o join public.tickers t on t.id=o.ticker_id left join public.social_accounts a on a.id=o.account_id left join public.social_sources s on s.id=a.source_id left join lateral(select sentiment,sentiment_score from public.sentiment_observations x where x.post_id=o.post_id and x.ticker_id=o.ticker_id order by x.created_at desc limit 1)so on true left join lateral(select unusual_attention_score from public.ticker_attention_observations x where x.ticker_id=o.ticker_id and x.period_type='daily'and x.period_start::date=o.mention_timestamp::date order by x.period_start limit 1)ta on true;
create or replace view public.market_mover_price_outcomes with(security_invoker=true)as select a.id appearance_id,a.ticker_id,a.report_date,e.reference_price,e.return_1d,e.return_3d,e.return_7d,e.return_30d,e.maximum_return,e.minimum_return,prev.volume previous_volume,pm.daily_return previous_return,pm.volatility_20d previous_volatility from public.market_mover_appearances a left join public.ticker_price_events e on e.event_type='market_mover'and e.event_id=a.id left join lateral(select*from public.price_history_canonical p where p.ticker_id=a.ticker_id and p.date<a.report_date order by p.date desc limit 1)prev on true left join public.price_daily_metrics pm on pm.price_history_id=prev.id;

do $$declare t text;begin foreach t in array array['price_history','price_import_runs','price_import_errors','price_daily_metrics','ticker_price_events','social_market_outcomes','account_market_statistics','ticker_social_outcomes']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;
revoke all on function public.rebuild_price_daily_metrics(uuid)from public,anon,authenticated;grant execute on function public.rebuild_price_daily_metrics(uuid)to service_role;
revoke all on function public.rebuild_market_outcomes(uuid)from public,anon,authenticated;grant execute on function public.rebuild_market_outcomes(uuid)to service_role;
revoke all on function public.rebuild_cp7_analytics(uuid)from public,anon,authenticated;grant execute on function public.rebuild_cp7_analytics(uuid)to service_role;
