-- Checkpoint 6: deterministic, explainable sentiment, attention and promotion-activity analytics.
alter table public.sentiment_observations add column if not exists account_id uuid references public.social_accounts(id) on delete set null;
alter table public.sentiment_observations add column if not exists source_id uuid references public.social_sources(id) on delete set null;
alter table public.sentiment_observations add column if not exists community_id uuid references public.social_communities(id) on delete set null;
alter table public.sentiment_observations add column if not exists observed_at timestamptz;
alter table public.sentiment_observations add column if not exists model_name text;
alter table public.sentiment_observations add column if not exists model_version text;
alter table public.sentiment_observations add column if not exists analysis_method text not null default 'rules';
alter table public.sentiment_observations add column if not exists updated_at timestamptz not null default now();
alter table public.sentiment_observations add constraint sentiment_score_bounds check(sentiment_score is null or sentiment_score between -1 and 1);
alter table public.sentiment_observations add constraint sentiment_method_check check(analysis_method in ('rules','ai','source_metadata','manual'));
create unique index sentiment_post_ticker_method_uidx on public.sentiment_observations(post_id,ticker_id,analysis_method,model_version) where post_id is not null;
create index sentiment_post_idx on public.sentiment_observations(post_id);
create index sentiment_account_idx on public.sentiment_observations(account_id);
create index sentiment_date_idx on public.sentiment_observations(observation_date desc);
create index sentiment_kind_idx on public.sentiment_observations(sentiment);
create index sentiment_ticker_observed_idx on public.sentiment_observations(ticker_id,observed_at desc);
create trigger sentiment_observations_updated before update on public.sentiment_observations for each row execute function public.set_updated_at();

create table public.scoring_methodologies(
 version text primary key, is_current boolean not null default false, sentiment_method text not null,
 baseline_days integer not null check(baseline_days>0), methodology jsonb not null,
 created_at timestamptz not null default now()
);
insert into public.scoring_methodologies(version,is_current,sentiment_method,baseline_days,methodology) values('rules-v1',true,'rules',7,
 '{"sentiment":{"range":[-1,1],"thresholds":{"very_bearish":-0.6,"bearish":-0.2,"neutral_max":0.19,"bullish":0.2,"very_bullish":0.6}},"attention":{"velocity":0.35,"account_growth":0.25,"source_spread":0.20,"community_spread":0.15,"engagement":0.05},"promotion":{"repeat_density":0.30,"posting_frequency":0.25,"community_spread":0.20,"source_spread":0.15,"engagement":0.10},"hype":{"unusual_attention":0.35,"promotion_intensity":0.30,"sentiment_directionality":0.20,"account_concentration":0.15},"normalization":"capped ratios and logarithmic engagement","missing_data":"renormalize across available component weights"}'::jsonb)
on conflict(version) do update set is_current=true,methodology=excluded.methodology;

create table public.ticker_sentiment_statistics(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id) on delete cascade,
 period_type text not null check(period_type in ('daily','weekly','monthly')),period_start timestamptz not null,period_end timestamptz not null,
 mention_count integer not null default 0,sentiment_count integer not null default 0,very_bullish_count integer not null default 0,
 bullish_count integer not null default 0,neutral_count integer not null default 0,bearish_count integer not null default 0,very_bearish_count integer not null default 0,
 average_sentiment_score numeric,median_sentiment_score numeric,weighted_sentiment_score numeric,average_confidence numeric,
 unique_accounts integer not null default 0,unique_sources integer not null default 0,unique_communities integer not null default 0,
 scoring_version text not null references public.scoring_methodologies(version),updated_at timestamptz not null default now(),unique(ticker_id,period_type,period_start)
);
create index ticker_sentiment_period_idx on public.ticker_sentiment_statistics(ticker_id,period_start desc,period_type);

create table public.ticker_attention_observations(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id) on delete cascade,
 period_start timestamptz not null,period_end timestamptz not null,period_type text not null check(period_type in ('daily','weekly','monthly')),
 mention_count integer not null default 0,unique_accounts integer not null default 0,unique_sources integer not null default 0,unique_communities integer not null default 0,
 engagement_total numeric,posting_rate numeric,baseline_mentions numeric,baseline_unique_accounts numeric,mention_velocity numeric,account_growth_rate numeric,
 source_spread numeric,community_spread numeric,unusual_attention_score numeric check(unusual_attention_score between 0 and 100),
 scoring_version text not null references public.scoring_methodologies(version),calculated_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(ticker_id,period_type,period_start)
);
create index attention_ticker_period_idx on public.ticker_attention_observations(ticker_id,period_start desc,period_type);
create index attention_score_idx on public.ticker_attention_observations(unusual_attention_score desc);

create table public.attention_score_components(
 id uuid primary key default gen_random_uuid(),attention_observation_id uuid not null references public.ticker_attention_observations(id) on delete cascade,
 component_name text not null,raw_value numeric,normalized_value numeric check(normalized_value is null or normalized_value between 0 and 100),weight numeric not null check(weight between 0 and 1),contribution numeric,
 explanation text,created_at timestamptz not null default now(),unique(attention_observation_id,component_name)
);

alter table public.promotion_events add column if not exists community_id uuid references public.social_communities(id) on delete set null;
alter table public.promotion_events add column if not exists event_start_at timestamptz;
alter table public.promotion_events add column if not exists event_end_at timestamptz;
alter table public.promotion_events add column if not exists mention_count integer;
alter table public.promotion_events add column if not exists unique_accounts integer;
alter table public.promotion_events add column if not exists unique_sources integer;
alter table public.promotion_events add column if not exists scoring_version text references public.scoring_methodologies(version);
alter table public.promotion_events add column if not exists calculated_at timestamptz;
alter table public.promotion_events add constraint promotion_intensity_bounds check(promotion_intensity is null or promotion_intensity between 0 and 100);
alter table public.promotion_events add constraint promotion_attention_bounds check(unusual_attention_score is null or unusual_attention_score between 0 and 100);
alter table public.promotion_events add constraint promotion_hype_bounds check(hype_risk_score is null or hype_risk_score between 0 and 100);
create unique index promotion_derived_event_uidx on public.promotion_events(ticker_id,event_start_at,scoring_version) where scoring_version is not null;
create index promotion_event_start_idx on public.promotion_events(ticker_id,event_start_at desc);
create index promotion_intensity_idx on public.promotion_events(promotion_intensity desc);
create index promotion_attention_idx on public.promotion_events(unusual_attention_score desc);
create index promotion_hype_idx on public.promotion_events(hype_risk_score desc);

create table public.promotion_score_components(
 id uuid primary key default gen_random_uuid(),promotion_event_id uuid not null references public.promotion_events(id) on delete cascade,
 component_name text not null,raw_value numeric,normalized_value numeric check(normalized_value is null or normalized_value between 0 and 100),weight numeric not null check(weight between 0 and 1),contribution numeric,explanation text,created_at timestamptz not null default now(),unique(promotion_event_id,component_name)
);
create table public.hype_risk_components(
 id uuid primary key default gen_random_uuid(),promotion_event_id uuid not null references public.promotion_events(id) on delete cascade,
 component_name text not null,raw_value numeric,normalized_value numeric check(normalized_value is null or normalized_value between 0 and 100),weight numeric not null check(weight between 0 and 1),contribution numeric,explanation text,created_at timestamptz not null default now(),unique(promotion_event_id,component_name)
);

create table public.analytics_runs(
 id uuid primary key default gen_random_uuid(),analytics_type text not null check(analytics_type in ('sentiment','attention','promotion','full_rebuild')),
 status text not null check(status in ('pending','running','completed','partial','failed','cancelled')),start_at timestamptz,end_at timestamptz,
 ticker_id uuid references public.tickers(id) on delete set null,source_id uuid references public.social_sources(id) on delete set null,
 records_processed bigint not null default 0,records_created bigint not null default 0,records_updated bigint not null default 0,records_failed bigint not null default 0,
 scoring_version text not null,started_at timestamptz not null default now(),completed_at timestamptz,error_message text,created_at timestamptz not null default now()
);
create index analytics_runs_type_started_idx on public.analytics_runs(analytics_type,started_at desc);

create or replace function public.cp6_sentiment_score(p_text text,p_symbol text) returns numeric language plpgsql immutable as $$
declare source text:=lower(coalesce(p_text,''));part text;target text:='';bull integer:=0;bear integer:=0;score numeric;
begin
 foreach part in array regexp_split_to_array(source,'\s+(?:but|however|while|whereas)\s+|[;]') loop
  if part ~ ('(^|[^a-z0-9])\$?'||lower(p_symbol)||'([^a-z0-9]|$)') then target:=part;exit;end if;
 end loop;
 if target='' then target:=source;end if;
 if target ~ '\m(long|bullish|buying|buy|calls|upside|breakout|undervalued|moon|rally)\M' then bull:=bull+1;end if;
 if target ~ '\m(strongly bullish|very bullish|huge upside|extremely undervalued)\M' then bull:=bull+1;end if;
 if target ~ '\m(short|bearish|selling|sell|puts|downside|overvalued|drop|crash|avoid)\M' then bear:=bear+1;end if;
 if target ~ '\m(strongly bearish|very bearish|huge downside|extremely overvalued)\M' then bear:=bear+1;end if;
 if target ~ '\mnot (bullish|buying|buy|long)\M' then bear:=bear+1;bull:=greatest(0,bull-1);end if;
 if target ~ '\mnot (bearish|selling|sell|short)\M' then bull:=bull+1;bear:=greatest(0,bear-1);end if;
 if bull=0 and bear=0 then return 0;end if;score:=(bull-bear)::numeric/greatest(1,bull+bear);return round(greatest(-1,least(1,score)),2);
end $$;
create or replace function public.cp6_sentiment_label(p_score numeric) returns public.sentiment_kind language sql immutable as $$select case when p_score<=-.60 then 'very_bearish'::public.sentiment_kind when p_score<=-.20 then 'bearish'::public.sentiment_kind when p_score<.20 then 'neutral'::public.sentiment_kind when p_score<.60 then 'bullish'::public.sentiment_kind else 'very_bullish'::public.sentiment_kind end$$;
create or replace function public.cp6_sentiment_confidence(p_text text,p_symbol text,p_score numeric) returns numeric language sql immutable as $$select case when trim(coalesce(p_text,''))='' then .10 when p_score=0 then .40 when abs(p_score)=1 then .80 else .65 end$$;
create or replace function public.cp6_sentiment_reason(p_score numeric) returns text language sql immutable as $$select case when p_score>=.6 then 'Strong explicit bullish directional language near the ticker mention.' when p_score>=.2 then 'Explicit bullish directional language near the ticker mention.' when p_score<=-.6 then 'Strong explicit bearish or valuation-concern language near the ticker mention.' when p_score<=-.2 then 'Explicit bearish or valuation-concern language near the ticker mention.' else 'Neutral, ambiguous, mixed, or factual discussion without a clear directional rule match.' end$$;

create or replace view public.sentiment_observation_detail with(security_invoker=true) as
select so.*,t.symbol,a.username,s.name source_name,c.name community_name,p.title,p.body,p.post_url
from public.sentiment_observations so join public.tickers t on t.id=so.ticker_id left join public.social_accounts a on a.id=so.account_id
left join public.social_sources s on s.id=so.source_id left join public.social_communities c on c.id=so.community_id left join public.social_posts p on p.id=so.post_id;
create or replace view public.source_sentiment_statistics with(security_invoker=true) as
select so.ticker_id,t.symbol,so.source_id,s.name source_name,date_trunc('day',so.observed_at) period_start,count(*)::bigint observations,avg(so.sentiment_score) average_sentiment,avg(so.confidence_score) average_confidence,count(distinct so.account_id)::bigint unique_accounts
from public.sentiment_observations so join public.tickers t on t.id=so.ticker_id left join public.social_sources s on s.id=so.source_id group by so.ticker_id,t.symbol,so.source_id,s.name,date_trunc('day',so.observed_at);
create or replace view public.community_sentiment_statistics with(security_invoker=true) as
select so.ticker_id,t.symbol,so.community_id,c.name community_name,date_trunc('day',so.observed_at) period_start,count(*)::bigint observations,avg(so.sentiment_score) average_sentiment,avg(so.confidence_score) average_confidence,count(distinct so.account_id)::bigint unique_accounts
from public.sentiment_observations so join public.tickers t on t.id=so.ticker_id left join public.social_communities c on c.id=so.community_id group by so.ticker_id,t.symbol,so.community_id,c.name,date_trunc('day',so.observed_at);
create or replace view public.account_sentiment_statistics with(security_invoker=true) as
select account_id,count(*)::bigint sentiment_observations,count(*) filter(where sentiment in ('bullish','very_bullish'))::bigint bullish_observations,count(*) filter(where sentiment in ('bearish','very_bearish'))::bigint bearish_observations,count(*) filter(where sentiment='neutral')::bigint neutral_observations,avg(sentiment_score) average_sentiment,avg(confidence_score) average_confidence from public.sentiment_observations where account_id is not null group by account_id;
create or replace view public.account_ticker_sentiment_statistics with(security_invoker=true) as
select account_id,ticker_id,count(*)::bigint observations,count(*) filter(where sentiment in ('bullish','very_bullish'))::bigint bullish_count,count(*) filter(where sentiment in ('bearish','very_bearish'))::bigint bearish_count,avg(sentiment_score) average_sentiment,min(observed_at) first_observed_at,max(observed_at) last_observed_at from public.sentiment_observations where account_id is not null group by account_id,ticker_id;
create or replace view public.ticker_sentiment_period_comparison with(security_invoker=true) as
select x.*,x.average_sentiment_score-lag(x.average_sentiment_score) over(partition by x.ticker_id,x.period_type order by x.period_start) change_vs_prior,t.symbol
from public.ticker_sentiment_statistics x join public.tickers t on t.id=x.ticker_id;
create or replace view public.attention_observation_detail with(security_invoker=true) as
select a.*,t.symbol from public.ticker_attention_observations a join public.tickers t on t.id=a.ticker_id;
create or replace view public.promotion_event_detail with(security_invoker=true) as
select p.*,t.symbol from public.promotion_events p join public.tickers t on t.id=p.ticker_id where p.scoring_version is not null;

create or replace function public.rebuild_cp6_analytics(p_ticker_id uuid default null,p_source_id uuid default null,p_start_at timestamptz default null,p_end_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare run_id uuid;processed bigint:=0;sentiments bigint:=0;attention bigint:=0;events bigint:=0;
begin
 insert into public.analytics_runs(analytics_type,status,start_at,end_at,ticker_id,source_id,scoring_version) values('full_rebuild','running',p_start_at,p_end_at,p_ticker_id,p_source_id,'rules-v1') returning id into run_id;
 -- Scope deletes only rules-v1 derived records. Full rebuild is deterministic; optional filters support bounded backfills.
 delete from public.sentiment_observations so where so.analysis_method='rules' and so.model_version='rules-v1' and (p_ticker_id is null or so.ticker_id=p_ticker_id) and (p_source_id is null or so.source_id=p_source_id) and (p_start_at is null or so.observed_at>=p_start_at) and (p_end_at is null or so.observed_at<p_end_at);
 insert into public.sentiment_observations(ticker_id,post_id,account_id,source_id,community_id,observation_date,observed_at,sentiment,sentiment_score,confidence_score,reason,model_name,model_version,analysis_method,created_at,updated_at)
 select pt.ticker_id,p.id,p.account_id,p.source_id,p.community_id,(p.posted_at at time zone 'UTC')::date,p.posted_at,
 public.cp6_sentiment_label(x.score),x.score,public.cp6_sentiment_confidence(coalesce(p.title,'')||' '||coalesce(p.body,''),t.symbol,x.score),public.cp6_sentiment_reason(x.score),'Deterministic ticker-context rules','rules-v1','rules',now(),now()
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id join public.tickers t on t.id=pt.ticker_id
 cross join lateral(select public.cp6_sentiment_score(coalesce(p.title,'')||' '||coalesce(p.body,''),t.symbol) score)x
 where p.posted_at is not null and (p_ticker_id is null or pt.ticker_id=p_ticker_id) and (p_source_id is null or p.source_id=p_source_id) and (p_start_at is null or p.posted_at>=p_start_at) and (p_end_at is null or p.posted_at<p_end_at);
 get diagnostics sentiments=row_count;processed:=sentiments;

 -- Aggregates are rebuilt for affected tickers to avoid partial-period corruption.
 delete from public.ticker_sentiment_statistics ts where p_ticker_id is null or ts.ticker_id=p_ticker_id;
 insert into public.ticker_sentiment_statistics(ticker_id,period_type,period_start,period_end,mention_count,sentiment_count,very_bullish_count,bullish_count,neutral_count,bearish_count,very_bearish_count,average_sentiment_score,median_sentiment_score,weighted_sentiment_score,average_confidence,unique_accounts,unique_sources,unique_communities,scoring_version,updated_at)
 select ticker_id,period_type,period_start,period_start+period_interval,count(*)::int,count(*)::int,count(*) filter(where sentiment='very_bullish')::int,count(*) filter(where sentiment='bullish')::int,count(*) filter(where sentiment='neutral')::int,count(*) filter(where sentiment='bearish')::int,count(*) filter(where sentiment='very_bearish')::int,round(avg(sentiment_score),4),percentile_cont(.5) within group(order by sentiment_score),round(sum(sentiment_score*confidence_score)/nullif(sum(confidence_score),0),4),round(avg(confidence_score),4),count(distinct account_id)::int,count(distinct source_id)::int,count(distinct community_id) filter(where community_id is not null)::int,'rules-v1',now()
 from(select so.*,v.period_type,date_trunc(v.trunc_unit,so.observed_at) period_start,v.period_interval from public.sentiment_observations so cross join(values('daily','day',interval '1 day'),('weekly','week',interval '1 week'),('monthly','month',interval '1 month'))v(period_type,trunc_unit,period_interval) where so.model_version='rules-v1' and (p_ticker_id is null or so.ticker_id=p_ticker_id))q group by ticker_id,period_type,period_start,period_interval;

 delete from public.ticker_attention_observations ao where p_ticker_id is null or ao.ticker_id=p_ticker_id;
 insert into public.ticker_attention_observations(ticker_id,period_start,period_end,period_type,mention_count,unique_accounts,unique_sources,unique_communities,engagement_total,posting_rate,baseline_mentions,baseline_unique_accounts,mention_velocity,account_growth_rate,source_spread,community_spread,unusual_attention_score,scoring_version,calculated_at,created_at,updated_at)
 select d.day_ticker_id,d.day_start,d.day_start+interval '1 day','daily',d.mentions,d.accounts,d.sources,d.communities,d.engagement,d.mentions,
 b.baseline_mentions,b.baseline_accounts,
 case when b.baseline_mentions=0 then null else round(100*(d.mentions-b.baseline_mentions)/b.baseline_mentions,2) end,
 case when b.baseline_accounts=0 then null else round(100*(d.accounts-b.baseline_accounts)/b.baseline_accounts,2) end,
 d.sources,d.communities,
 round(((v.velocity_n*.35+v.accounts_n*.25+v.sources_n*.20+v.communities_n*.15+coalesce(v.engagement_n,0)*.05)/(.95+case when v.engagement_n is null then 0 else .05 end))::numeric,2),'rules-v1',now(),now(),now()
 from(select pt.ticker_id day_ticker_id,date_trunc('day',p.posted_at) day_start,count(*)::numeric mentions,count(distinct p.account_id)::numeric accounts,count(distinct p.source_id)::numeric sources,count(distinct p.community_id) filter(where p.community_id is not null)::numeric communities,
 case when count(*) filter(where p.upvotes is not null or p.score is not null or p.comments is not null or p.views is not null)>0 then sum(coalesce(p.upvotes,0)+coalesce(p.score,0)+coalesce(p.comments,0)+coalesce(p.views,0))::numeric end engagement
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id where p.posted_at is not null and (p_ticker_id is null or pt.ticker_id=p_ticker_id) group by pt.ticker_id,date_trunc('day',p.posted_at))d
 cross join lateral(select coalesce((select count(*)::numeric/7 from public.social_posts p2 join public.post_tickers pt2 on pt2.post_id=p2.id where pt2.ticker_id=d.day_ticker_id and p2.posted_at>=d.day_start-interval '7 days' and p2.posted_at<d.day_start),0) baseline_mentions,
 coalesce((select sum(x.n)::numeric/7 from(select date_trunc('day',p3.posted_at),count(distinct p3.account_id)n from public.social_posts p3 join public.post_tickers pt3 on pt3.post_id=p3.id where pt3.ticker_id=d.day_ticker_id and p3.posted_at>=d.day_start-interval '7 days' and p3.posted_at<d.day_start group by 1)x),0) baseline_accounts)b
 cross join lateral(select case when b.baseline_mentions=0 then case when d.mentions>0 then 100 else 0 end else least(100,greatest(0,(d.mentions/b.baseline_mentions-1)*25)) end velocity_n,
 case when b.baseline_accounts=0 then case when d.accounts>0 then 100 else 0 end else least(100,greatest(0,(d.accounts/b.baseline_accounts-1)*25)) end accounts_n,
 least(100,d.sources/3*100) sources_n,least(100,d.communities/5*100) communities_n,
 case when d.engagement is null then null else least(100,ln(1+d.engagement)/ln(1001)*100) end engagement_n)v;
 get diagnostics attention=row_count;

 insert into public.attention_score_components(attention_observation_id,component_name,raw_value,normalized_value,weight,contribution,explanation)
 select a.id,x.name,x.raw,x.normalized,x.weight,case when x.normalized is null then null else round((x.normalized*x.weight)::numeric,4) end,x.explanation from public.ticker_attention_observations a
 cross join lateral(values('mention_velocity',a.mention_velocity,case when a.baseline_mentions=0 then 100 else least(100,greatest(0,(a.mention_count/nullif(a.baseline_mentions,0)-1)*25)) end,.35,'Change from the ticker own prior seven-day daily mention baseline.'),('account_growth',a.account_growth_rate,case when a.baseline_unique_accounts=0 then 100 else least(100,greatest(0,(a.unique_accounts/nullif(a.baseline_unique_accounts,0)-1)*25)) end,.25,'Change in distinct accounts versus the prior seven-day daily baseline.'),('source_spread',a.source_spread,least(100,a.source_spread/3*100),.20,'Distinct sources, capped at three.'),('community_spread',a.community_spread,least(100,a.community_spread/5*100),.15,'Distinct communities, capped at five.'),('engagement',a.engagement_total,case when a.engagement_total is null then null else least(100,ln(1+a.engagement_total)/ln(1001)*100) end,.05,'Log-normalized available engagement; unavailable fields are excluded.'))x(name,raw,normalized,weight,explanation)
 where a.scoring_version='rules-v1' and (p_ticker_id is null or a.ticker_id=p_ticker_id);

 delete from public.promotion_events pe where pe.scoring_version='rules-v1' and (p_ticker_id is null or pe.ticker_id=p_ticker_id);
 insert into public.promotion_events(ticker_id,platform,first_seen_at,last_seen_at,event_start_at,event_end_at,mention_count,unique_accounts,unique_sources,promotion_intensity,unusual_attention_score,hype_risk_score,evidence_summary,scoring_version,calculated_at,created_at,updated_at)
 select a.ticker_id,'Multiple / normalized sources',a.period_start,a.period_end,a.period_start,a.period_end,a.mention_count,a.unique_accounts,a.unique_sources,
 round(((v.repeat_n*.30+v.frequency_n*.25+v.community_n*.20+v.source_n*.15+coalesce(v.engagement_n,0)*.10)/(.90+case when v.engagement_n is null then 0 else .10 end))::numeric,2),a.unusual_attention_score,
 round((a.unusual_attention_score*.35+((v.repeat_n*.30+v.frequency_n*.25+v.community_n*.20+v.source_n*.15+coalesce(v.engagement_n,0)*.10)/(.90+case when v.engagement_n is null then 0 else .10 end))*.30+coalesce(s.directionality,0)*.20+v.concentration_n*.15)::numeric,2),
 'Deterministic daily discussion-burst heuristic from normalized social activity.','rules-v1',now(),now(),now()
 from public.ticker_attention_observations a left join lateral(select abs(average_sentiment_score)*100 directionality from public.ticker_sentiment_statistics ts where ts.ticker_id=a.ticker_id and ts.period_type='daily' and ts.period_start=a.period_start)s on true
 cross join lateral(select least(100,greatest(0,(a.mention_count-a.unique_accounts)/greatest(a.mention_count,1)*100)) repeat_n,least(100,a.mention_count/5.0*100) frequency_n,least(100,a.unique_communities/3.0*100) community_n,least(100,a.unique_sources/3.0*100) source_n,case when a.engagement_total is null then null else least(100,ln(1+a.engagement_total)/ln(1001)*100) end engagement_n,least(100,greatest(0,(a.mention_count-a.unique_accounts)/greatest(a.mention_count,1)*100)) concentration_n)v
 where a.scoring_version='rules-v1' and a.period_type='daily' and a.mention_count>=2 and (a.unusual_attention_score>=40 or a.mention_count>=3);
 get diagnostics events=row_count;

 insert into public.promotion_score_components(promotion_event_id,component_name,raw_value,normalized_value,weight,contribution,explanation)
 select pe.id,x.name,x.raw,x.normalized,x.weight,case when x.normalized is null then null else round((x.normalized*x.weight)::numeric,4) end,x.explanation from public.promotion_events pe
 cross join lateral(values('repeat_density',pe.mention_count-pe.unique_accounts,least(100,greatest(0,(pe.mention_count-pe.unique_accounts)::numeric/greatest(pe.mention_count,1)*100)),.30,'Share of mentions beyond one per distinct account.'),('posting_frequency',pe.mention_count,least(100,pe.mention_count/5.0*100),.25,'Daily mention count capped at five.'),('community_spread',(select unique_communities from public.ticker_attention_observations a where a.ticker_id=pe.ticker_id and a.period_start=pe.event_start_at and a.period_type='daily'),least(100,coalesce((select unique_communities from public.ticker_attention_observations a where a.ticker_id=pe.ticker_id and a.period_start=pe.event_start_at and a.period_type='daily'),0)/3.0*100),.20,'Distinct communities capped at three.'),('source_spread',pe.unique_sources,least(100,pe.unique_sources/3.0*100),.15,'Distinct normalized sources capped at three.'),('engagement',(select engagement_total from public.ticker_attention_observations a where a.ticker_id=pe.ticker_id and a.period_start=pe.event_start_at and a.period_type='daily'),case when (select engagement_total from public.ticker_attention_observations a where a.ticker_id=pe.ticker_id and a.period_start=pe.event_start_at and a.period_type='daily') is null then null else least(100,ln(1+(select engagement_total from public.ticker_attention_observations a where a.ticker_id=pe.ticker_id and a.period_start=pe.event_start_at and a.period_type='daily'))/ln(1001)*100) end,.10,'Log-normalized engagement when available.'))x(name,raw,normalized,weight,explanation) where pe.scoring_version='rules-v1';
 insert into public.hype_risk_components(promotion_event_id,component_name,raw_value,normalized_value,weight,contribution,explanation)
 select pe.id,x.name,x.raw,x.normalized,x.weight,round((x.normalized*x.weight)::numeric,4),x.explanation from public.promotion_events pe
 cross join lateral(values('unusual_attention',pe.unusual_attention_score,pe.unusual_attention_score,.35,'Attention relative to the ticker own baseline.'),('promotion_intensity',pe.promotion_intensity,pe.promotion_intensity,.30,'Observable discussion frequency, repetition and spread.'),('sentiment_directionality',coalesce((select abs(average_sentiment_score)*100 from public.ticker_sentiment_statistics ts where ts.ticker_id=pe.ticker_id and ts.period_type='daily' and ts.period_start=pe.event_start_at),0),coalesce((select abs(average_sentiment_score)*100 from public.ticker_sentiment_statistics ts where ts.ticker_id=pe.ticker_id and ts.period_type='daily' and ts.period_start=pe.event_start_at),0),.20,'Absolute directionality; bullish and bearish are treated symmetrically.'),('account_concentration',least(100,greatest(0,(pe.mention_count-pe.unique_accounts)::numeric/greatest(pe.mention_count,1)*100)),least(100,greatest(0,(pe.mention_count-pe.unique_accounts)::numeric/greatest(pe.mention_count,1)*100)),.15,'Share of mentions concentrated beyond one per account.'))x(name,raw,normalized,weight,explanation) where pe.scoring_version='rules-v1';

 update public.analytics_runs set status='completed',records_processed=processed,records_created=sentiments+attention+events,completed_at=now() where id=run_id;
 return jsonb_build_object('run_id',run_id,'sentiment_observations',sentiments,'attention_observations',attention,'promotion_events',events,'scoring_version','rules-v1');
exception when others then update public.analytics_runs set status='failed',error_message=sqlerrm,completed_at=now() where id=run_id;raise;end $$;
revoke all on function public.rebuild_cp6_analytics(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.rebuild_cp6_analytics(uuid,uuid,timestamptz,timestamptz) to service_role;

do $$declare t text;begin foreach t in array array['scoring_methodologies','ticker_sentiment_statistics','ticker_attention_observations','attention_score_components','promotion_score_components','hype_risk_components','analytics_runs'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;
