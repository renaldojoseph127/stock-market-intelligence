-- Checkpoint 3 derives analytics exclusively from immutable Scanz appearances.
create table if not exists public.analytics_methodologies (
  code text primary key, version text not null, description text not null, formula jsonb not null,
  created_at timestamptz not null default now(), unique(code,version)
);
insert into public.analytics_methodologies(code,version,description,formula) values
('recurrence_score','v1','Repeat presence across report days, categories, recency, gaps, and active months.',
 '{"total_appearances":"min(18,total*2)","unique_days":"min(24,days*3)","repeat_gainers":"min(16,max(gainers-1,0)*4)","categories":"min(10,categories*2)","recent_available_days":"min(12,last7*3)","gap_bonus":"12 if avg<=5, 8 if <=10, 4 if <=30","active_months":"min(8,months)"}'),
('mover_intensity_score','v1','Magnitude, extremes, rank, volume, and dollar volume; not investment quality.',
 '{"absolute_change":"min(30,avg_abs_change*0.4)","extremes":"min(24,extreme_count*6)","top_rank":"min(16,top5_count*2)","volume":"min(15,ln(1+avg_volume)/1.5)","dollar_volume":"min(15,ln(1+avg_dollar_volume)/1.7)"}'),
('research_priority_score','v1','Internal historical research interest only; does not predict returns.',
 '{"recurrence":0.35,"intensity":0.30,"repeat_gainers":"min(15,repeats*5)","reversals":"min(10,reversals*2)","most_active_to_gainer":"min(5,count)","unique_days":"min(10,days)"}')
on conflict(code) do update set version=excluded.version,description=excluded.description,formula=excluded.formula;

create table if not exists public.analytics_settings (
  key text primary key, numeric_value numeric not null, description text not null, updated_at timestamptz not null default now()
);
insert into public.analytics_settings(key,numeric_value,description) values
('frequent_mover_unique_days',5,'Unique report days required for frequent_mover.'),
('recent_repeat_max_days',10,'Maximum calendar gap for recent_repeat.'),
('returning_mover_max_days',90,'Maximum calendar gap for returning_mover.'),
('major_move_percent',25,'Absolute percentage threshold for a major move.'),
('extreme_move_percent',50,'Absolute percentage threshold for an extreme move.')
on conflict(key) do update set numeric_value=excluded.numeric_value,description=excluded.description;

create table if not exists public.research_reason_types (
 id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,description text not null,
 display_order integer not null,created_at timestamptz not null default now()
);
insert into public.research_reason_types(code,name,description,display_order) values
('repeat_gainer','Repeat Gainer','Appeared as a Biggest Gainer more than once.',10),('repeat_decliner','Repeat Decliner','Appeared as a Biggest Decliner more than once.',20),
('frequent_mover','Frequent Mover','Appeared on at least the configured number of unique report days.',30),('returning_mover','Returning Mover','Returned after an 11–90 calendar-day gap.',40),
('extreme_gainer','Extreme Gainer','Recorded a change of at least +50%.',50),('extreme_decliner','Extreme Decliner','Recorded a change of at most -50%.',60),
('high_recurrence','High Recurrence','Recurrence score is at least 70.',70),('short_recurrence','Short Recurrence','Average appearance gap is at most 10 days.',80),
('gainer_decliner_reversal','Gainer/Decliner Reversal','Transitioned from gainer to decliner.',90),('decliner_gainer_reversal','Decliner/Gainer Reversal','Transitioned from decliner to gainer.',100),
('most_active_before_gainer','Most Active Before Gainer','Transitioned from most active to gainer.',110),('most_active_before_decliner','Most Active Before Decliner','Transitioned from most active to decliner.',120),
('multiple_categories','Multiple Categories','Appeared in multiple canonical categories.',130),('high_mover_intensity','High Mover Intensity','Mover intensity score is at least 70.',140)
on conflict(code) do update set name=excluded.name,description=excluded.description,display_order=excluded.display_order;

create table if not exists public.ticker_research_reasons (
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id) on delete cascade,
 reason_type_id uuid not null references public.research_reason_types(id) on delete cascade,score numeric not null,
 created_at timestamptz not null default now(),unique(ticker_id,reason_type_id)
);

create materialized view public.ticker_recurrence_summary as
with global_dates as (
 select max(report_date) max_date from public.market_mover_appearances
), last7 as (
 select report_date from (select distinct report_date from public.market_mover_appearances order by report_date desc limit 7) d
), base as (
 select a.*,c.category_type,c.exchange category_exchange from public.market_mover_appearances a join public.market_categories c on c.id=a.category_id
), day_rows as (
 select ticker_id,report_date,lag(report_date) over(partition by ticker_id order by report_date) prev_date
 from (select distinct ticker_id,report_date from base) d
), gaps as (
 select ticker_id,report_date,(report_date-prev_date)::int gap_days from day_rows where prev_date is not null
), gap_stats as (
 select ticker_id,avg(gap_days)::numeric average_gap,percentile_cont(.5) within group(order by gap_days)::numeric median_gap,
 min(gap_days) minimum_gap,max(gap_days) maximum_gap,(array_agg(gap_days order by report_date desc))[1] last_gap from gaps group by ticker_id
), agg as (
 select b.ticker_id,count(*)::int total_appearances,count(distinct b.report_date)::int unique_report_days,min(b.report_date) first_seen,max(b.report_date) last_seen,
 (max(b.report_date)-min(b.report_date))::int active_span_days,
 count(*) filter(where category_type='most_active')::int most_active_appearances,
 count(*) filter(where category_type='biggest_gainer')::int gainer_appearances,count(*) filter(where category_type='biggest_decliner')::int decliner_appearances,
 count(*) filter(where category_exchange='NASDAQ')::int nasdaq_appearances,count(*) filter(where category_exchange='NYSE')::int nyse_appearances,
 count(*) filter(where category_exchange='OTC')::int otc_appearances,count(*) filter(where category_exchange='PENNY')::int penny_appearances,
 count(distinct category_id)::int number_of_categories_seen,count(distinct category_exchange)::int number_of_distinct_market_groups_seen,
 array_agg(distinct category_id) category_ids,array_agg(distinct category_exchange) market_groups,
 count(*) filter(where b.report_date in(select report_date from last7))::int appearances_last_7_available_report_days,
 count(*) filter(where b.report_date>(select max_date from global_dates)-30)::int appearances_last_30_calendar_days,
 count(*) filter(where b.report_date>(select max_date from global_dates)-90)::int appearances_last_90_calendar_days,
 count(distinct date_trunc('month',b.report_date))::int active_months,
 avg(abs(b.change_percent)) filter(where b.change_percent is not null) avg_abs_change,
 count(*) filter(where abs(b.change_percent)>=50)::int extreme_move_count,count(*) filter(where b.rank<=5)::int top_rank_count,
 avg(b.volume) filter(where b.volume is not null) avg_volume,avg(b.dollar_volume) filter(where b.dollar_volume is not null) avg_dollar_volume,
 max(b.change_percent) highest_gain,min(b.change_percent) largest_decline
 from base b group by b.ticker_id
), scored as (
 select a.*,g.average_gap,g.median_gap,g.minimum_gap,g.maximum_gap,g.last_gap,
 least(100,least(18,a.total_appearances*2)+least(24,a.unique_report_days*3)+least(16,greatest(a.gainer_appearances-1,0)*4)+least(10,a.number_of_categories_seen*2)+least(12,a.appearances_last_7_available_report_days*3)+case when g.average_gap<=5 then 12 when g.average_gap<=10 then 8 when g.average_gap<=30 then 4 else 0 end+least(8,a.active_months))::numeric recurrence_score,
 least(100,least(30,coalesce(a.avg_abs_change,0)*.4)+least(24,a.extreme_move_count*6)+least(16,a.top_rank_count*2)+least(15,ln(1+coalesce(a.avg_volume,0))/1.5)+least(15,ln(1+coalesce(a.avg_dollar_volume,0))/1.7))::numeric mover_intensity_score
 from agg a left join gap_stats g using(ticker_id)
)
select s.*,t.symbol,t.exchange, 'v1'::text recurrence_score_version,'v1'::text mover_intensity_score_version,
 case when unique_report_days>=(select numeric_value from public.analytics_settings where key='frequent_mover_unique_days') then 'frequent_mover'
      when unique_report_days=1 then 'new_mover' when last_gap<=10 then 'recent_repeat' when last_gap<=90 then 'returning_mover' else 'returning_mover' end mover_classification
from scored s join public.tickers t on t.id=s.ticker_id with no data;
create unique index ticker_recurrence_summary_pk on public.ticker_recurrence_summary(ticker_id);
create index ticker_recurrence_score_idx on public.ticker_recurrence_summary(recurrence_score desc);
create index ticker_intensity_score_idx on public.ticker_recurrence_summary(mover_intensity_score desc);
create index ticker_recurrence_filters_idx on public.ticker_recurrence_summary(unique_report_days,total_appearances,last_seen);

create materialized view public.ticker_category_transitions as
with ordered as (
 select a.id,a.ticker_id,t.symbol,a.report_date,c.id category_id,c.name category_name,c.category_type,
 lag(a.report_date) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id) from_date,
 lag(c.id) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id) from_category_id,
 lag(c.name) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id) from_category,
 lag(c.category_type) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id) from_category_type
 from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id
)
select id,ticker_id,symbol,from_category_id,from_category,from_category_type,category_id to_category_id,category_name to_category,
 category_type to_category_type,from_date,report_date to_date,(report_date-from_date)::int days_between
from ordered where from_date is not null with no data;
create unique index ticker_category_transitions_pk on public.ticker_category_transitions(id);
create index ticker_transitions_ticker_gap_idx on public.ticker_category_transitions(ticker_id,days_between);
create index ticker_transitions_types_idx on public.ticker_category_transitions(from_category_type,to_category_type,days_between);

create materialized view public.ticker_transition_summary as
select ticker_id,count(*) filter(where from_category_type='most_active' and to_category_type='biggest_gainer')::int most_active_to_gainer_count,
 count(*) filter(where from_category_type='biggest_gainer' and to_category_type='most_active')::int gainer_to_most_active_count,
 count(*) filter(where from_category_type='biggest_gainer' and to_category_type='biggest_decliner')::int gainer_to_decliner_count,
 count(*) filter(where from_category_type='biggest_decliner' and to_category_type='biggest_gainer')::int decliner_to_gainer_count,
 count(*) filter(where from_category_type='most_active' and to_category_type='biggest_decliner')::int most_active_to_decliner_count,
 count(*) filter(where from_category_type='biggest_gainer' and to_category_type='biggest_gainer')::int repeat_gainer_count,
 count(*) filter(where from_category_type='biggest_decliner' and to_category_type='biggest_decliner')::int repeat_decliner_count
from public.ticker_category_transitions group by ticker_id with no data;
create unique index ticker_transition_summary_pk on public.ticker_transition_summary(ticker_id);

create materialized view public.transition_statistics as
select from_category_type,to_category_type,count(*)::bigint transition_count,
 count(*) filter(where days_between<=1)::bigint within_1_day,count(*) filter(where days_between<=3)::bigint within_3_days,
 count(*) filter(where days_between<=5)::bigint within_5_days,count(*) filter(where days_between<=10)::bigint within_10_days,
 count(*) filter(where days_between<=30)::bigint within_30_days,avg(days_between)::numeric average_days_between
from public.ticker_category_transitions group by from_category_type,to_category_type with no data;
create unique index transition_statistics_pk on public.transition_statistics(from_category_type,to_category_type);

create materialized view public.ticker_category_type_summary as
select a.ticker_id,t.symbol,c.category_type,count(*)::int total_appearances,count(distinct a.report_date)::int unique_days,
 min(a.report_date) first_date,max(a.report_date) last_date,avg(a.change_percent) average_change,
 percentile_cont(.5) within group(order by a.change_percent) median_change,max(a.change_percent) largest_gain,min(a.change_percent) largest_decline,
 avg(a.volume) average_volume,avg(a.dollar_volume) average_dollar_volume
from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id
group by a.ticker_id,t.symbol,c.category_type with no data;
create unique index ticker_category_type_summary_pk on public.ticker_category_type_summary(ticker_id,category_type);
create index ticker_category_type_rank_idx on public.ticker_category_type_summary(category_type,total_appearances desc);

create materialized view public.category_statistics as
select c.id category_id,c.name category_name,c.exchange,c.category_type,count(a.id)::int total_appearances,count(distinct a.ticker_id)::int unique_tickers,
 case when count(distinct a.ticker_id)=0 then 0 else count(a.id)::numeric/count(distinct a.ticker_id) end average_appearances_per_ticker,
 (array_agg(t.symbol order by freq.cnt desc,t.symbol) filter(where t.symbol is not null))[1] most_recurrent_ticker,
 avg(a.change_percent) average_change_percent,percentile_cont(.5) within group(order by a.change_percent) median_change_percent,
 avg(a.volume) average_volume,min(a.report_date) coverage_start,max(a.report_date) coverage_end
from public.market_categories c left join public.market_mover_appearances a on a.category_id=c.id left join public.tickers t on t.id=a.ticker_id
left join lateral(select count(*) cnt from public.market_mover_appearances x where x.category_id=c.id and x.ticker_id=a.ticker_id) freq on true
group by c.id,c.name,c.exchange,c.category_type with no data;
create unique index category_statistics_pk on public.category_statistics(category_id);

create materialized view public.extreme_move_summary as
select a.id,a.ticker_id,t.symbol,a.report_date,c.id category_id,c.name category_name,a.change_percent,a.volume,
 lag(a.report_date) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id) previous_appearance_date,
 (a.report_date-lag(a.report_date) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id))::int days_since_previous_appearance,
 lead(a.report_date) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id) next_appearance_date,
 (lead(a.report_date) over(partition by a.ticker_id order by a.report_date,c.display_order,a.id)-a.report_date)::int days_until_next_appearance,
 case when a.change_percent>=50 then 'extreme_gainer' when a.change_percent>=25 then 'major_gainer' when a.change_percent<=-50 then 'extreme_decliner' else 'major_decliner' end move_type
from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id
where abs(a.change_percent)>=25 with no data;
create unique index extreme_move_summary_pk on public.extreme_move_summary(id);
create index extreme_move_date_change_idx on public.extreme_move_summary(report_date desc,change_percent desc);

create materialized view public.ticker_mover_cycles as
with seq as (
 select ticker_id,symbol,from_date cycle_start,to_date cycle_end,from_category_type||' → '||to_category_type cycle_type,2 number_of_events,days_between duration_days
 from public.ticker_category_transitions
 union all
 select a.ticker_id,a.symbol,a.from_date,b.to_date,a.from_category_type||' → '||a.to_category_type||' → '||b.to_category_type,3,(b.to_date-a.from_date)::int
 from public.ticker_category_transitions a join public.ticker_category_transitions b on b.ticker_id=a.ticker_id and b.from_date=a.to_date and b.from_category_type=a.to_category_type and b.id<>a.id
)
select row_number() over(order by ticker_id,cycle_start,cycle_end,cycle_type)::bigint id,* from seq with no data;
create unique index ticker_mover_cycles_pk on public.ticker_mover_cycles(id);
create index ticker_mover_cycles_ticker_idx on public.ticker_mover_cycles(ticker_id,cycle_start);

create materialized view public.research_priority_summary as
select r.*,coalesce(ts.most_active_to_gainer_count,0) most_active_to_gainer_count,coalesce(ts.gainer_to_decliner_count,0) gainer_to_decliner_count,
 coalesce(ts.decliner_to_gainer_count,0) decliner_to_gainer_count,coalesce(ts.repeat_gainer_count,0) repeat_gainer_count,coalesce(ts.repeat_decliner_count,0) repeat_decliner_count,
 coalesce(ts.most_active_to_decliner_count,0) most_active_to_decliner_count,
 least(100,r.recurrence_score*.35+r.mover_intensity_score*.30+least(15,greatest(r.gainer_appearances-1,0)*5)+least(10,(coalesce(ts.gainer_to_decliner_count,0)+coalesce(ts.decliner_to_gainer_count,0))*2)+least(5,coalesce(ts.most_active_to_gainer_count,0))+least(10,r.unique_report_days))::numeric research_priority_score,
 'v1'::text research_priority_score_version
from public.ticker_recurrence_summary r left join public.ticker_transition_summary ts using(ticker_id) with no data;
create unique index research_priority_summary_pk on public.research_priority_summary(ticker_id);
create index research_priority_score_idx on public.research_priority_summary(research_priority_score desc,recurrence_score desc,total_appearances desc);

create or replace view public.research_priority_detail with (security_invoker=true) as
select p.*,coalesce(array_agg(rt.code order by rt.display_order) filter(where rt.code is not null),'{}') reason_codes,
 coalesce(array_agg(rt.name order by rt.display_order) filter(where rt.name is not null),'{}') reason_names
from public.research_priority_summary p left join public.ticker_research_reasons tr on tr.ticker_id=p.ticker_id
left join public.research_reason_types rt on rt.id=tr.reason_type_id group by p.ticker_id,p.symbol,p.exchange,p.total_appearances,p.unique_report_days,p.first_seen,p.last_seen,p.active_span_days,
p.most_active_appearances,p.gainer_appearances,p.decliner_appearances,p.nasdaq_appearances,p.nyse_appearances,p.otc_appearances,p.penny_appearances,
p.number_of_categories_seen,p.number_of_distinct_market_groups_seen,p.category_ids,p.market_groups,p.appearances_last_7_available_report_days,
p.appearances_last_30_calendar_days,p.appearances_last_90_calendar_days,p.active_months,p.avg_abs_change,p.extreme_move_count,p.top_rank_count,p.avg_volume,
p.avg_dollar_volume,p.highest_gain,p.largest_decline,p.average_gap,p.median_gap,p.minimum_gap,p.maximum_gap,p.recurrence_score,p.mover_intensity_score,
p.last_gap,
p.recurrence_score_version,p.mover_intensity_score_version,p.mover_classification,p.most_active_to_gainer_count,p.gainer_to_decliner_count,
p.decliner_to_gainer_count,p.repeat_gainer_count,p.repeat_decliner_count,p.most_active_to_decliner_count,p.research_priority_score,p.research_priority_score_version;

create or replace view public.research_queue_analytics with (security_invoker=true) as
select row_number() over(order by p.research_priority_score desc,p.recurrence_score desc,p.total_appearances desc,p.symbol)::bigint priority_rank,
 p.*,q.id queue_id,q.research_status,q.reason queue_reason,q.first_queued_at,q.started_at,q.completed_at
from public.research_priority_detail p left join public.research_queue q on q.ticker_id=p.ticker_id;

create or replace view public.historical_analytics_coverage with (security_invoker=true) as
with reports as (select count(*) filter(where import_status='completed') completed_reports,count(*) filter(where import_status='partial') partial_reports,
 count(*) filter(where import_status='failed') failed_reports,min(report_date) coverage_start_date,max(report_date) coverage_end_date,
 count(distinct report_date) available_report_days from public.source_reports), span as (
 select *,case when coverage_start_date is null then null else (coverage_end_date-coverage_start_date+1) end calendar_span_days from reports
)
select *,case when calendar_span_days>0 then round(available_report_days::numeric/calendar_span_days*100,2) else null end observed_calendar_day_percentage,
 'Observed report days divided by calendar span; this is not trading-day completeness.'::text coverage_percentage_definition from span;

create or replace function public.get_ticker_transitions(max_days integer default 30)
returns setof public.ticker_category_transitions language sql stable security invoker set search_path=public as $$
 select * from public.ticker_category_transitions where days_between between 0 and greatest(max_days,0)
$$;

create or replace function public.get_pre_move_history(extreme_appearance_id uuid,days_before integer default 30)
returns table(id uuid,ticker_id uuid,report_date date,category_name text,rank integer,price numeric,change_percent numeric,volume bigint)
language sql stable security invoker set search_path=public as $$
 with target as(select ticker_id,report_date from public.extreme_move_summary where id=extreme_appearance_id)
 select a.id,a.ticker_id,a.report_date,c.name,a.rank,a.price,a.change_percent,a.volume from public.market_mover_appearances a
 join public.market_categories c on c.id=a.category_id join target t on t.ticker_id=a.ticker_id
 where a.report_date<t.report_date and a.report_date>=t.report_date-greatest(days_before,0) order by a.report_date desc,c.display_order
$$;
create or replace function public.get_post_move_history(extreme_appearance_id uuid,days_after integer default 30)
returns table(id uuid,ticker_id uuid,report_date date,category_name text,category_type text,rank integer,price numeric,change_percent numeric,volume bigint)
language sql stable security invoker set search_path=public as $$
 with target as(select ticker_id,report_date from public.extreme_move_summary where id=extreme_appearance_id)
 select a.id,a.ticker_id,a.report_date,c.name,c.category_type,a.rank,a.price,a.change_percent,a.volume from public.market_mover_appearances a
 join public.market_categories c on c.id=a.category_id join target t on t.ticker_id=a.ticker_id
 where a.report_date>t.report_date and a.report_date<=t.report_date+greatest(days_after,0) order by a.report_date,c.display_order
$$;

create or replace function public.refresh_historical_analytics() returns jsonb language plpgsql security definer set search_path=public as $$
declare reason_count int;
begin
 refresh materialized view public.ticker_recurrence_summary;
 refresh materialized view public.ticker_category_transitions;
 refresh materialized view public.ticker_transition_summary;
 refresh materialized view public.transition_statistics;
 refresh materialized view public.ticker_category_type_summary;
 refresh materialized view public.category_statistics;
 refresh materialized view public.extreme_move_summary;
 refresh materialized view public.ticker_mover_cycles;
 refresh materialized view public.research_priority_summary;
 truncate public.ticker_research_reasons;
 insert into public.ticker_research_reasons(ticker_id,reason_type_id,score)
 select p.ticker_id,rt.id,case rt.code when 'high_recurrence' then p.recurrence_score when 'high_mover_intensity' then p.mover_intensity_score else p.research_priority_score end
 from public.research_priority_summary p cross join public.research_reason_types rt where
 (rt.code='repeat_gainer' and p.gainer_appearances>1) or (rt.code='repeat_decliner' and p.decliner_appearances>1) or
 (rt.code='frequent_mover' and p.unique_report_days>=5) or (rt.code='returning_mover' and p.maximum_gap between 11 and 90) or
 (rt.code='extreme_gainer' and p.highest_gain>=50) or (rt.code='extreme_decliner' and p.largest_decline<=-50) or
 (rt.code='high_recurrence' and p.recurrence_score>=70) or (rt.code='short_recurrence' and p.average_gap<=10) or
 (rt.code='gainer_decliner_reversal' and p.gainer_to_decliner_count>0) or (rt.code='decliner_gainer_reversal' and p.decliner_to_gainer_count>0) or
 (rt.code='most_active_before_gainer' and p.most_active_to_gainer_count>0) or
 (rt.code='most_active_before_decliner' and exists(select 1 from public.ticker_transition_summary x where x.ticker_id=p.ticker_id and x.most_active_to_decliner_count>0)) or
 (rt.code='multiple_categories' and p.number_of_categories_seen>1) or (rt.code='high_mover_intensity' and p.mover_intensity_score>=70);
 get diagnostics reason_count=row_count;
 return jsonb_build_object('tickers',(select count(*) from public.ticker_recurrence_summary),'reasons',reason_count,'refreshed_at',now());
end $$;
revoke all on function public.refresh_historical_analytics() from public,anon,authenticated;
grant execute on function public.refresh_historical_analytics() to service_role;

create or replace function public.prevent_raw_appearance_mutation() returns trigger language plpgsql as $$
begin raise exception 'Raw market-mover appearances are immutable; rebuild derived analytics instead.'; end $$;
drop trigger if exists market_mover_appearances_immutable on public.market_mover_appearances;
create trigger market_mover_appearances_immutable before update or delete on public.market_mover_appearances for each row execute function public.prevent_raw_appearance_mutation();

alter table public.analytics_methodologies enable row level security;alter table public.analytics_settings enable row level security;
alter table public.research_reason_types enable row level security;alter table public.ticker_research_reasons enable row level security;
create policy "Public read analytics methodologies" on public.analytics_methodologies for select to anon,authenticated using(true);
create policy "Public read analytics settings" on public.analytics_settings for select to anon,authenticated using(true);
create policy "Public read research reason types" on public.research_reason_types for select to anon,authenticated using(true);
create policy "Public read ticker research reasons" on public.ticker_research_reasons for select to anon,authenticated using(true);
