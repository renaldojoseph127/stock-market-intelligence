-- Checkpoint 5: descriptive promoter/account intelligence derived from normalized records.
alter table public.social_accounts add column if not exists is_promoter_candidate boolean not null default false;
alter table public.social_accounts add column if not exists promoter_status text not null default 'unreviewed';
alter table public.social_accounts add column if not exists promoter_status_reason text;
alter table public.social_accounts add column if not exists first_promoter_flagged_at timestamptz;
alter table public.social_accounts add column if not exists last_promoter_reviewed_at timestamptz;
alter table public.social_accounts add column if not exists promoter_notes text;
alter table public.social_accounts add constraint social_accounts_promoter_status_check check(promoter_status in ('unreviewed','candidate','tracked','dismissed'));
create index social_accounts_promoter_status_idx on public.social_accounts(promoter_status);
create index social_accounts_candidate_idx on public.social_accounts(is_promoter_candidate) where is_promoter_candidate;

create table public.promoter_candidate_settings(
 id boolean primary key default true check(id), minimum_total_mentions integer not null default 5 check(minimum_total_mentions>0),
 minimum_repeated_ticker_mentions integer not null default 3 check(minimum_repeated_ticker_mentions>1),
 minimum_pre_mover_observations integer not null default 2 check(minimum_pre_mover_observations>0),
 updated_at timestamptz not null default now()
);
insert into public.promoter_candidate_settings(id) values(true) on conflict(id) do nothing;

create table public.account_mover_observations(
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.social_accounts(id) on delete cascade,
 ticker_id uuid not null references public.tickers(id) on delete cascade, post_id uuid not null references public.social_posts(id) on delete cascade,
 mover_appearance_id uuid not null references public.market_mover_appearances(id) on delete cascade,
 mention_at timestamptz not null, mover_date date not null, days_before_mover numeric not null,
 mover_category_id uuid not null references public.market_categories(id) on delete restrict,
 mover_rank integer, mover_price numeric, mover_change_percent numeric, mover_volume bigint, mover_dollar_volume numeric,
 relationship_type text not null check(relationship_type in ('before_mover','mover_day','after_mover')),
 created_at timestamptz not null default now(), unique(post_id,ticker_id,mover_appearance_id)
);
create index amo_account_idx on public.account_mover_observations(account_id);
create index amo_ticker_idx on public.account_mover_observations(ticker_id);
create index amo_mover_date_idx on public.account_mover_observations(mover_date desc);
create index amo_mention_at_idx on public.account_mover_observations(mention_at desc);
create index amo_relationship_idx on public.account_mover_observations(relationship_type);
create index amo_account_ticker_idx on public.account_mover_observations(account_id,ticker_id);
create index amo_ticker_mover_date_idx on public.account_mover_observations(ticker_id,mover_date desc);

create table public.account_ticker_statistics(
 account_id uuid not null references public.social_accounts(id) on delete cascade,
 ticker_id uuid not null references public.tickers(id) on delete cascade,
 total_mentions integer not null default 0, first_mention_at timestamptz, last_mention_at timestamptz,
 unique_posts integer not null default 0, unique_posting_days integer not null default 0,
 unique_communities integer not null default 0, unique_sources integer not null default 0,
 pre_mover_mentions integer not null default 0, mover_day_mentions integer not null default 0, post_mover_mentions integer not null default 0,
 subsequent_mover_count integer not null default 0, subsequent_gainer_count integer not null default 0,
 subsequent_decliner_count integer not null default 0, subsequent_most_active_count integer not null default 0,
 earliest_days_before_mover numeric, average_days_before_mover numeric, median_days_before_mover numeric,
 latest_related_mover_date date, updated_at timestamptz not null default now(), primary key(account_id,ticker_id)
);
create index ats_ticker_idx on public.account_ticker_statistics(ticker_id);
create index ats_total_mentions_idx on public.account_ticker_statistics(total_mentions desc);
create index ats_pre_mover_idx on public.account_ticker_statistics(pre_mover_mentions desc);
create index ats_gainer_idx on public.account_ticker_statistics(subsequent_gainer_count desc);

create table public.promoter_notes(
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.social_accounts(id) on delete cascade,
 note text not null check(length(trim(note))>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index promoter_notes_account_idx on public.promoter_notes(account_id,created_at desc);
create trigger promoter_notes_updated before update on public.promoter_notes for each row execute function public.set_updated_at();

create or replace view public.account_intelligence_summary with (security_invoker=true) as
select a.id account_id,a.username,a.display_name,a.profile_url,a.followers,a.first_seen_at,a.last_seen_at,
 a.is_promoter_candidate,a.promoter_status,a.promoter_status_reason,a.first_promoter_flagged_at,a.last_promoter_reviewed_at,a.promoter_notes,
 s.id source_id,s.name platform,s.platform_type,
 count(distinct p.id)::bigint total_posts,count(distinct pt.id)::bigint total_ticker_mentions,
 min(p.posted_at) first_activity,max(p.posted_at) last_activity,
 count(distinct pt.ticker_id)::bigint unique_tickers,count(distinct p.source_id)::bigint unique_sources,
 count(distinct p.community_id) filter(where p.community_id is not null)::bigint unique_communities,
 count(distinct o.post_id) filter(where o.relationship_type='before_mover')::bigint early_mentions,
 count(distinct o.ticker_id) filter(where o.relationship_type='before_mover')::bigint unique_tickers_before_movers,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day'))::bigint subsequent_mover_appearances,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='biggest_gainer')::bigint gainer_associations,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='biggest_decliner')::bigint decliner_associations,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='most_active')::bigint most_active_associations,
 (select round(avg(x.days_before_mover),2) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=a.id and oo.relationship_type='before_mover')x) average_days_before_mover,
 (select percentile_cont(.5) within group(order by x.days_before_mover) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=a.id and oo.relationship_type='before_mover')x) median_days_before_mover,
 (select max(x.days_before_mover) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=a.id and oo.relationship_type='before_mover')x) earliest_days_before_mover,
 count(distinct ats.ticker_id) filter(where ats.total_mentions>=3)::bigint recurring_ticker_relationships,
 case when count(distinct pt.ticker_id)=0 then null else round(100.0*count(distinct o.ticker_id) filter(where o.relationship_type='before_mover')/count(distinct pt.ticker_id),2) end historical_pre_move_association_rate,
 max(greatest(coalesce(p.updated_at,p.created_at),coalesce(ats.updated_at,'epoch'::timestamptz))) analytics_updated_at
from public.social_accounts a join public.social_sources s on s.id=a.source_id
left join public.social_posts p on p.account_id=a.id left join public.post_tickers pt on pt.post_id=p.id
left join public.account_mover_observations o on o.post_id=p.id and o.ticker_id=pt.ticker_id
left join public.market_categories c on c.id=o.mover_category_id
left join public.account_ticker_statistics ats on ats.account_id=a.id
group by a.id,s.id;

create or replace view public.account_mover_observation_detail with (security_invoker=true) as
select o.*,abs(o.mover_change_percent) absolute_move_percent,a.username,a.display_name,s.name platform,t.symbol,c.name category_name,c.category_type,
 p.post_url,p.title,p.body,p.community_id,sc.name community
from public.account_mover_observations o join public.social_accounts a on a.id=o.account_id
join public.social_sources s on s.id=a.source_id join public.tickers t on t.id=o.ticker_id
join public.market_categories c on c.id=o.mover_category_id join public.social_posts p on p.id=o.post_id
left join public.social_communities sc on sc.id=p.community_id;
create or replace view public.pre_move_account_observations with (security_invoker=true) as
select * from public.account_mover_observation_detail where relationship_type='before_mover';

create or replace view public.recurring_account_ticker_relationships with (security_invoker=true) as
select ats.*,a.username,s.name platform,t.symbol from public.account_ticker_statistics ats
join public.social_accounts a on a.id=ats.account_id join public.social_sources s on s.id=a.source_id
join public.tickers t on t.id=ats.ticker_id where ats.total_mentions>=2;

create or replace function public.get_account_subsequent_movers(p_post_id uuid,p_window_days integer default 30)
returns table(post_id uuid,ticker_id uuid,mover_appearance_id uuid,mention_at timestamptz,mover_date date,days_before_mover integer,category_name text,category_type text,mover_rank integer,mover_change_percent numeric,mover_volume bigint,mover_dollar_volume numeric)
language sql stable security invoker set search_path=public as $$
 select p.id,pt.ticker_id,m.id,p.posted_at,m.report_date,m.report_date-(p.posted_at at time zone 'UTC')::date,
 c.name,c.category_type,m.rank,m.change_percent,m.volume,m.dollar_volume
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id
 join public.market_mover_appearances m on m.ticker_id=pt.ticker_id
 join public.market_categories c on c.id=m.category_id
 where p.id=p_post_id and p.posted_at is not null and m.report_date>=(p.posted_at at time zone 'UTC')::date
 and m.report_date-(p.posted_at at time zone 'UTC')::date between 0 and greatest(0,least(p_window_days,365))
 order by m.report_date,m.rank nulls last,c.name
$$;

create or replace function public.rebuild_account_intelligence() returns jsonb language plpgsql security definer set search_path=public as $$
declare observation_count bigint; relationship_count bigint; account_count bigint;
begin
 delete from public.account_mover_observations;
 -- Link a normalized post/ticker once to every category on its nearest next date.
 insert into public.account_mover_observations(account_id,ticker_id,post_id,mover_appearance_id,mention_at,mover_date,days_before_mover,mover_category_id,mover_rank,mover_price,mover_change_percent,mover_volume,mover_dollar_volume,relationship_type)
 select p.account_id,pt.ticker_id,p.id,m.id,p.posted_at,m.report_date,
   (m.report_date-(p.posted_at at time zone 'UTC')::date)::numeric,m.category_id,m.rank,m.price,m.change_percent,m.volume,m.dollar_volume,
   case when m.report_date=(p.posted_at at time zone 'UTC')::date then 'mover_day' else 'before_mover' end
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id
 join lateral(select min(x.report_date) mover_date from public.market_mover_appearances x where x.ticker_id=pt.ticker_id and x.report_date>=(p.posted_at at time zone 'UTC')::date) nearest on nearest.mover_date is not null
 join public.market_mover_appearances m on m.ticker_id=pt.ticker_id and m.report_date=nearest.mover_date
 where p.account_id is not null and p.posted_at is not null;
 -- If no same/future mover exists, preserve relationship to every category on the nearest prior date.
 insert into public.account_mover_observations(account_id,ticker_id,post_id,mover_appearance_id,mention_at,mover_date,days_before_mover,mover_category_id,mover_rank,mover_price,mover_change_percent,mover_volume,mover_dollar_volume,relationship_type)
 select p.account_id,pt.ticker_id,p.id,m.id,p.posted_at,m.report_date,
   (m.report_date-(p.posted_at at time zone 'UTC')::date)::numeric,m.category_id,m.rank,m.price,m.change_percent,m.volume,m.dollar_volume,'after_mover'
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id
 join lateral(select max(x.report_date) mover_date from public.market_mover_appearances x where x.ticker_id=pt.ticker_id and x.report_date<(p.posted_at at time zone 'UTC')::date) nearest on nearest.mover_date is not null
 join public.market_mover_appearances m on m.ticker_id=pt.ticker_id and m.report_date=nearest.mover_date
 where p.account_id is not null and p.posted_at is not null
 and not exists(select 1 from public.market_mover_appearances x where x.ticker_id=pt.ticker_id and x.report_date>=(p.posted_at at time zone 'UTC')::date);
 get diagnostics observation_count=row_count; select count(*) into observation_count from public.account_mover_observations;

 delete from public.account_ticker_statistics;
 insert into public.account_ticker_statistics(account_id,ticker_id,total_mentions,first_mention_at,last_mention_at,unique_posts,unique_posting_days,unique_communities,unique_sources,pre_mover_mentions,mover_day_mentions,post_mover_mentions,subsequent_mover_count,subsequent_gainer_count,subsequent_decliner_count,subsequent_most_active_count,earliest_days_before_mover,average_days_before_mover,median_days_before_mover,latest_related_mover_date,updated_at)
 select p.account_id,pt.ticker_id,count(distinct pt.id)::int,min(p.posted_at),max(p.posted_at),count(distinct p.id)::int,
 count(distinct (p.posted_at at time zone 'UTC')::date)::int,count(distinct p.community_id) filter(where p.community_id is not null)::int,count(distinct p.source_id)::int,
 count(distinct o.post_id) filter(where o.relationship_type='before_mover')::int,
 count(distinct o.post_id) filter(where o.relationship_type='mover_day')::int,
 count(distinct o.post_id) filter(where o.relationship_type='after_mover')::int,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day'))::int,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='biggest_gainer')::int,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='biggest_decliner')::int,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='most_active')::int,
 (select max(x.days_before_mover) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=p.account_id and oo.ticker_id=pt.ticker_id and oo.relationship_type='before_mover')x),
 (select round(avg(x.days_before_mover),2) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=p.account_id and oo.ticker_id=pt.ticker_id and oo.relationship_type='before_mover')x),
 (select percentile_cont(.5) within group(order by x.days_before_mover) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=p.account_id and oo.ticker_id=pt.ticker_id and oo.relationship_type='before_mover')x),max(o.mover_date),now()
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id
 left join public.account_mover_observations o on o.post_id=p.id and o.ticker_id=pt.ticker_id
 left join public.market_categories c on c.id=o.mover_category_id where p.account_id is not null
 group by p.account_id,pt.ticker_id;
 get diagnostics relationship_count=row_count;

 insert into public.promoter_statistics(account_id,tickers_mentioned,early_mentions,average_days_before_mover,gainer_mentions,decliner_mentions,updated_at)
 select a.id,coalesce(ats.tickers,0),coalesce(ats.early,0),obs.average_days,
 coalesce(obs.gainers,0),coalesce(obs.decliners,0),now()
 from public.social_accounts a
 left join lateral(select count(*)::int tickers,coalesce(sum(x.pre_mover_mentions),0)::int early from public.account_ticker_statistics x where x.account_id=a.id) ats on true
 left join lateral(select (select round(avg(x.days_before_mover),2) from(select distinct oo.post_id,oo.days_before_mover from public.account_mover_observations oo where oo.account_id=a.id and oo.relationship_type='before_mover')x) average_days,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='biggest_gainer')::int gainers,
 count(distinct o.mover_appearance_id) filter(where o.relationship_type in ('before_mover','mover_day') and c.category_type='biggest_decliner')::int decliners
 from public.account_mover_observations o join public.market_categories c on c.id=o.mover_category_id where o.account_id=a.id) obs on true
 on conflict(account_id) do update set tickers_mentioned=excluded.tickers_mentioned,early_mentions=excluded.early_mentions,
 average_days_before_mover=excluded.average_days_before_mover,gainer_mentions=excluded.gainer_mentions,decliner_mentions=excluded.decliner_mentions,
 bullish_mentions=0,bearish_mentions=0,average_return_after_mention=null,median_return_after_mention=null,best_subsequent_return=null,worst_subsequent_return=null,updated_at=now();
 get diagnostics account_count=row_count;

 update public.social_accounts set is_promoter_candidate=false,promoter_status='unreviewed',promoter_status_reason=null where promoter_status='candidate';
 update public.social_accounts a set is_promoter_candidate=true,promoter_status=case when a.promoter_status='unreviewed' then 'candidate' else a.promoter_status end,
 promoter_status_reason=format('At least %s ticker mentions, %s repeated mentions, or %s pre-move observations',cfg.minimum_total_mentions,cfg.minimum_repeated_ticker_mentions,cfg.minimum_pre_mover_observations),
 first_promoter_flagged_at=coalesce(a.first_promoter_flagged_at,now())
 from public.promoter_candidate_settings cfg join public.account_intelligence_summary s on true
 where cfg.id and s.account_id=a.id and a.promoter_status<>'dismissed' and
 (s.total_ticker_mentions>=cfg.minimum_total_mentions or exists(select 1 from public.account_ticker_statistics x where x.account_id=a.id and x.total_mentions>=cfg.minimum_repeated_ticker_mentions) or s.early_mentions>=cfg.minimum_pre_mover_observations);
 return jsonb_build_object('observations',observation_count,'relationships',relationship_count,'accounts',account_count,'rebuilt_at',now());
end $$;
revoke all on function public.rebuild_account_intelligence() from public,anon,authenticated;
grant execute on function public.rebuild_account_intelligence() to service_role;

create or replace function public.update_promoter_status(p_account_id uuid,p_status text,p_reason text default null,p_notes text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_status not in ('unreviewed','candidate','tracked','dismissed') then raise exception 'Invalid promoter status'; end if;
 update public.social_accounts set promoter_status=p_status,is_promoter_candidate=(p_status in ('candidate','tracked')),
 promoter_status_reason=p_reason,promoter_notes=p_notes,last_promoter_reviewed_at=now(),
 first_promoter_flagged_at=case when p_status in ('candidate','tracked') then coalesce(first_promoter_flagged_at,now()) else first_promoter_flagged_at end
 where id=p_account_id;
end $$;
revoke all on function public.update_promoter_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.update_promoter_status(uuid,text,text,text) to service_role;

do $$ declare t text; begin foreach t in array array['account_mover_observations','account_ticker_statistics','promoter_notes','promoter_candidate_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);
end loop; end $$;
