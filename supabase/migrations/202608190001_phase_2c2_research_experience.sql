-- Phase 2C.2: research experience and commercial-readiness foundations.
-- All market, catalyst, price, and social source observations remain authoritative
-- and unchanged. New analytics are derived; new rows below are user-authored case data.

alter table public.research_workspaces
  add column if not exists status text not null default 'active';
alter table public.research_workspaces
  drop constraint if exists research_workspaces_status_check;
alter table public.research_workspaces
  add constraint research_workspaces_status_check
  check (status in ('active','follow_up','complete','archived'));
create index if not exists research_workspaces_status_updated_idx
  on public.research_workspaces(status,updated_at desc);

create table public.saved_research_views(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.research_workspaces(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  description text,
  source_page text not null check(source_page in(
    'market_movers','cross_source_analytics','ai_search','research_today','ticker_history'
  )),
  route text not null check(route like '/%'),
  filters jsonb not null default '{}'::jsonb check(jsonb_typeof(filters)='object'),
  data_mode text not null default 'raw' check(data_mode in('raw','effective')),
  created_by text not null default 'researcher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_research_views_workspace_idx
  on public.saved_research_views(workspace_id,updated_at desc);
create index saved_research_views_source_idx
  on public.saved_research_views(source_page,updated_at desc);
create trigger saved_research_views_updated before update on public.saved_research_views
  for each row execute function public.set_updated_at();

create table public.research_questions(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  question text not null check(length(trim(question)) between 1 and 1000),
  status text not null default 'open' check(status in('open','answered','deferred')),
  created_by text not null default 'researcher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_questions_workspace_idx
  on public.research_questions(workspace_id,status,updated_at desc);
create trigger research_questions_updated before update on public.research_questions
  for each row execute function public.set_updated_at();

create table public.research_checklist_items(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  item_key text not null check(item_key in(
    'review_mover_data','review_catalyst_evidence','review_quality_flags',
    'review_social_coverage','compare_historical_setups','add_notes','export_brief'
  )),
  label text not null check(length(trim(label)) between 1 and 120),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,item_key),
  check((completed and completed_at is not null)or(not completed and completed_at is null))
);
create index research_checklist_workspace_idx
  on public.research_checklist_items(workspace_id,completed,updated_at desc);
create trigger research_checklist_updated before update on public.research_checklist_items
  for each row execute function public.set_updated_at();

create table public.research_brief_snapshots(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  brief_type text not null check(brief_type in('ticker','mover')),
  ticker_id uuid references public.tickers(id) on delete restrict,
  appearance_id uuid references public.market_mover_appearances(id) on delete restrict,
  data_mode text not null default 'raw' check(data_mode in('raw','effective')),
  research_brief_version text not null,
  title text not null check(length(trim(title)) between 1 and 200),
  provenance jsonb not null check(jsonb_typeof(provenance)='object'),
  coverage jsonb not null default '{}'::jsonb check(jsonb_typeof(coverage)='object'),
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  check(
    (brief_type='ticker'and ticker_id is not null and appearance_id is null)or
    (brief_type='mover'and ticker_id is not null and appearance_id is not null)
  )
);
create index research_brief_snapshots_workspace_idx
  on public.research_brief_snapshots(workspace_id,created_at desc);
create index research_brief_snapshots_ticker_idx
  on public.research_brief_snapshots(ticker_id,created_at desc);
create index research_brief_snapshots_appearance_idx
  on public.research_brief_snapshots(appearance_id,created_at desc)
  where appearance_id is not null;

-- User-authored case-management data is readable through the existing application.
-- Writes continue to use server-only service credentials.
alter table public.saved_research_views enable row level security;
alter table public.research_questions enable row level security;
alter table public.research_checklist_items enable row level security;
alter table public.research_brief_snapshots enable row level security;
create policy "Public read saved_research_views" on public.saved_research_views
  for select to anon,authenticated using(true);
create policy "Public read research_questions" on public.research_questions
  for select to anon,authenticated using(true);
create policy "Public read research_checklist_items" on public.research_checklist_items
  for select to anon,authenticated using(true);
create policy "Public read research_brief_snapshots" on public.research_brief_snapshots
  for select to anon,authenticated using(true);

-- One row per ticker. Numeric aggregates exclude fields with unresolved findings.
create or replace view public.ticker_research_profile with(security_invoker=true)as
with valid as(
  select a.*,c.category_type,c.name category_name,
    not exists(select 1 from public.market_data_quality_findings f
      where f.appearance_id=a.id and f.field_name='change_percent'
        and f.status in('open','proposed')) valid_change,
    not exists(select 1 from public.market_data_quality_findings f
      where f.appearance_id=a.id and f.field_name='volume'
        and f.status in('open','proposed')) valid_volume
  from public.market_mover_appearances a
  join public.market_categories c on c.id=a.category_id
), days as(
  select ticker_id,report_date,
    report_date-lag(report_date)over(partition by ticker_id order by report_date) gap_days
  from(select distinct ticker_id,report_date from valid)d
), gaps as(
  select ticker_id,min(gap_days)::int shortest_recurrence_gap,
    max(gap_days)::int longest_recurrence_gap
  from days where gap_days is not null group by ticker_id
), modes as(
  select distinct on(ticker_id) ticker_id,category_name most_common_category
  from(select ticker_id,category_name,count(*) category_count from valid
    group by ticker_id,category_name)x
  order by ticker_id,category_count desc,category_name
), agg as(
  select ticker_id,count(*)::bigint total_appearances,
    count(distinct report_date)::bigint distinct_report_dates,
    count(distinct category_id)::bigint distinct_categories,
    min(report_date)first_seen,max(report_date)last_seen,
    count(*)filter(where category_type='biggest_gainer')::bigint gainer_appearances,
    count(*)filter(where category_type='biggest_decliner')::bigint decliner_appearances,
    count(*)filter(where category_type='most_active')::bigint most_active_appearances,
    avg(abs(change_percent))filter(where valid_change and change_percent is not null)average_absolute_change,
    percentile_cont(.5)within group(order by abs(change_percent))
      filter(where valid_change and change_percent is not null)::numeric median_absolute_change,
    max(change_percent)filter(where valid_change)largest_positive_move,
    min(change_percent)filter(where valid_change)largest_negative_move,
    count(*)filter(where valid_change and change_percent is not null)::bigint valid_change_denominator,
    count(*)filter(where valid_volume and volume is not null)::bigint valid_volume_denominator
  from valid group by ticker_id
), catalyst as(
  select ticker_id,count(*)filter(where catalyst_status<>'not_researched')::bigint catalyst_researched_count,
    count(*)filter(where catalyst_status='catalyst_found')::bigint identified_catalyst_count,
    count(*)filter(where catalyst_status='no_identified_catalyst')::bigint no_identified_catalyst_count
  from public.mover_catalyst_status group by ticker_id
), quality as(
  select ticker_id,sum(open_finding_count)::bigint unresolved_quality_findings,
    count(*)filter(where open_finding_count>0)::bigint quality_flagged_appearances,
    count(*)filter(where repaired_field_count>0)::bigint repaired_appearances
  from public.market_data_appearance_quality group by ticker_id
), social as(
  select ticker_id,count(*)filter(where coverage_status<>'not_researched')::bigint social_researched_count,
    count(*)filter(where coverage_status='complete_for_provider_window')::bigint social_complete_count
  from public.ticker_social_coverage group by ticker_id
)
select t.id ticker_id,t.symbol,t.company_name,coalesce(t.primary_exchange,t.exchange)exchange,
  t.sector,t.industry,t.market_cap,t.security_type,t.enrichment_source metadata_provider,
  t.enrichment_status metadata_status,t.metadata_updated_at,
  coalesce(a.total_appearances,0)::bigint total_appearances,
  coalesce(a.distinct_report_dates,0)::bigint distinct_report_dates,
  coalesce(a.distinct_categories,0)::bigint distinct_categories,a.first_seen,a.last_seen,
  coalesce(a.gainer_appearances,0)::bigint gainer_appearances,
  coalesce(a.decliner_appearances,0)::bigint decliner_appearances,
  coalesce(a.most_active_appearances,0)::bigint most_active_appearances,
  a.average_absolute_change,a.median_absolute_change,a.largest_positive_move,a.largest_negative_move,
  coalesce(a.valid_change_denominator,0)::bigint valid_change_denominator,
  coalesce(a.valid_volume_denominator,0)::bigint valid_volume_denominator,
  m.most_common_category,g.shortest_recurrence_gap,g.longest_recurrence_gap,
  coalesce(c.catalyst_researched_count,0)::bigint catalyst_researched_count,
  coalesce(c.identified_catalyst_count,0)::bigint identified_catalyst_count,
  coalesce(c.no_identified_catalyst_count,0)::bigint no_identified_catalyst_count,
  coalesce(q.unresolved_quality_findings,0)::bigint unresolved_quality_findings,
  coalesce(q.quality_flagged_appearances,0)::bigint quality_flagged_appearances,
  coalesce(q.repaired_appearances,0)::bigint repaired_appearances,
  coalesce(s.social_researched_count,0)::bigint social_researched_count,
  coalesce(s.social_complete_count,0)::bigint social_complete_count
from public.tickers t left join agg a on a.ticker_id=t.id
left join modes m on m.ticker_id=t.id left join gaps g on g.ticker_id=t.id
left join catalyst c on c.ticker_id=t.id left join quality q on q.ticker_id=t.id
left join social s on s.ticker_id=t.id;

-- Historical investigation priority. This uses observation/context available in
-- the database and never incorporates later returns or later discussion.
create or replace view public.research_priority_candidates with(security_invoker=true)as
select x.*,
  least(100,x.magnitude_points+x.repeat_points+x.catalyst_points+x.social_points+
    x.quality_points+x.interest_points+x.import_recency_points)::numeric research_priority_score,
  'historical-research-priority-v1'::text research_priority_version,
  array_remove(array[
    case when x.magnitude_points>=10 then'Large historical move +'||x.magnitude_points::text end,
    case when x.repeat_points>0 then'Repeated mover +'||x.repeat_points::text end,
    case when x.catalyst_status='no_identified_catalyst'then'No identified catalyst +15'
      when x.catalyst_status='not_researched'then'Catalyst not researched +10'
      when x.catalyst_status='research_partial'then'Catalyst research partial +5'end,
    case when x.social_coverage_status='not_researched'then'Social coverage not researched +10'end,
    case when x.quality_status='clean'then'Clean observation +10'
      when x.quality_status='repaired'then'Approved repair overlay available +10'
      when x.quality_status in('flagged','unresolved')then'Data-quality review recommended +0'end,
    case when x.interest_points>0 then'Saved research interest +10'end,
    case when x.import_recency_points>0 then'Recently imported source +10'end
  ],null)::text[] research_priority_reasons
from(
  select m.id appearance_id,m.ticker_id,m.ticker_symbol symbol,m.report_id,m.report_date,
    m.category_id,m.category_name,m.category_type,m.category_exchange exchange,
    m.ticker_exchange,m.ticker_sector,m.ticker_industry,m.ticker_security_type,m.ticker_country,m.ticker_market_cap,
    m.raw_price price,m.raw_change_amount change_amount,m.raw_change_percent change_percent,abs(m.raw_change_percent)absolute_change_percent,m.raw_volume volume,m.raw_trades trades,
    m.raw_dollar_volume dollar_volume,m.raw_rank rank,m.price effective_price,m.change_amount effective_change_amount,
    m.change_percent effective_change_percent,m.volume effective_volume,m.trades effective_trades,
    m.dollar_volume effective_dollar_volume,m.rank effective_rank,
    case when m.open_finding_count>0 and m.quality_status='review_recommended'then'unresolved'
      when m.open_finding_count>0 then'flagged'when m.repaired_field_count>0 then'repaired'else'clean'end quality_status,
    m.finding_count,m.open_finding_count,m.repaired_field_count,
    m.catalyst_status,m.catalyst_event_count,
    coalesce(sc.coverage_status,'not_researched')social_coverage_status,
    coalesce(p.total_appearances,0)::bigint repeat_count,
    least(25,round(coalesce(abs(m.raw_change_percent),0)/4,2))::numeric magnitude_points,
    least(20,greatest(coalesce(p.total_appearances,0)-1,0)*2)::numeric repeat_points,
    case m.catalyst_status when'no_identified_catalyst'then 15 when'not_researched'then 10
      when'research_partial'then 5 else 0 end::numeric catalyst_points,
    case when sc.coverage_status is null or sc.coverage_status='not_researched'then 10 else 0 end::numeric social_points,
    case when m.open_finding_count=0 then 10 else 0 end::numeric quality_points,
    case when exists(select 1 from public.research_workspace_items wi where wi.ticker_id=m.ticker_id)
      or exists(select 1 from public.research_notes n where n.ticker_id=m.ticker_id or n.appearance_id=m.id)
      or exists(select 1 from public.research_tags g where g.ticker_id=m.ticker_id or g.appearance_id=m.id)
      then 10 else 0 end::numeric interest_points,
    case when r.created_at>=now()-interval'30 days'then 10 else 0 end::numeric import_recency_points,
    exists(select 1 from public.research_workspace_items wi
      where wi.ticker_id=m.ticker_id or wi.appearance_id=m.id)saved_research
  from public.market_mover_intelligence m
  join public.source_reports r on r.id=m.report_id
  left join public.ticker_statistics p on p.ticker_id=m.ticker_id
  left join lateral(
    select c.coverage_status from public.ticker_social_coverage c
    where c.ticker_id=m.ticker_id and m.report_date::timestamptz between c.date_from and c.date_to
    order by c.last_researched_at desc nulls last limit 1
  )sc on true
)x;

create index if not exists mma_category_date_change_idx
  on public.market_mover_appearances(category_id,report_date desc,change_percent desc);
create index if not exists mma_ticker_date_volume_idx
  on public.market_mover_appearances(ticker_id,report_date desc,volume desc);
create index if not exists mover_catalyst_status_filter_idx
  on public.catalyst_research_queue(status,appearance_id,created_at desc);

-- Attribute-only matching. Historical outcome columns are joined only after the
-- similarity rank has been calculated and therefore cannot affect the match.
create or replace function public.find_similar_historical_movers(
  p_appearance_id uuid,p_limit integer default 10
)returns table(
  reference_appearance_id uuid,reference_ticker_id uuid,reference_symbol text,
  reference_date date,reference_category text,reference_exchange text,
  reference_price numeric,reference_change_percent numeric,reference_volume bigint,
  similarity_score numeric,match_reasons text[],similarity_algorithm_version text,
  return_1d numeric,return_3d numeric,return_7d numeric,return_30d numeric
)language sql stable security invoker set search_path=public as $$
with target as(
  select m.*,
    coalesce(ts.total_appearances,0)>1 repeat_mover,
    not exists(select 1 from public.market_data_quality_findings f where f.appearance_id=m.id
      and f.field_name='change_percent'and f.status in('open','proposed'))valid_change,
    not exists(select 1 from public.market_data_quality_findings f where f.appearance_id=m.id
      and f.field_name='price'and f.status in('open','proposed'))valid_price,
    not exists(select 1 from public.market_data_quality_findings f where f.appearance_id=m.id
      and f.field_name='volume'and f.status in('open','proposed'))valid_volume
  from public.market_mover_intelligence m left join public.ticker_statistics ts on ts.ticker_id=m.ticker_id
  where m.id=p_appearance_id
), candidates as(
  select m.*,t.repeat_mover target_repeat,t.valid_change target_valid_change,
    t.valid_price target_valid_price,t.valid_volume target_valid_volume,
    t.category_id target_category_id,t.category_exchange target_exchange,
    t.raw_change_percent target_change,t.raw_price target_price,t.raw_volume target_volume,
    t.catalyst_status target_catalyst,t.quality_status target_quality,
    coalesce(ts.total_appearances,0)>1 repeat_mover,
    not exists(select 1 from public.market_data_quality_findings f where f.appearance_id=m.id
      and f.field_name='change_percent'and f.status in('open','proposed'))valid_change,
    not exists(select 1 from public.market_data_quality_findings f where f.appearance_id=m.id
      and f.field_name='price'and f.status in('open','proposed'))valid_price,
    not exists(select 1 from public.market_data_quality_findings f where f.appearance_id=m.id
      and f.field_name='volume'and f.status in('open','proposed'))valid_volume
  from target t join public.market_mover_intelligence m on m.id<>t.id
  left join public.ticker_statistics ts on ts.ticker_id=m.ticker_id
), weighted as(
  select c.*,
    (case when c.category_id=c.target_category_id then 25 else 0 end+
     case when c.category_exchange=c.target_exchange then 15 else 0 end+
     case when c.valid_change and c.target_valid_change and c.raw_change_percent is not null and c.target_change is not null
       then greatest(0,1-abs(abs(c.raw_change_percent)-abs(c.target_change))/greatest(abs(c.target_change),10))*20 else 0 end+
     case when c.valid_price and c.target_valid_price and c.raw_price>0 and c.target_price>0
       then case when width_bucket(c.raw_price,array[1,5,20,100]::numeric[])=width_bucket(c.target_price,array[1,5,20,100]::numeric[])then 15 else 0 end else 0 end+
     case when c.valid_volume and c.target_valid_volume and c.raw_volume>0 and c.target_volume>0
       then greatest(0,1-abs(ln(c.raw_volume::numeric/c.target_volume::numeric))/ln(10))*15 else 0 end+
     case when c.repeat_mover=c.target_repeat then 5 else 0 end+
     case when c.catalyst_status=c.target_catalyst then 3 else 0 end+
     case when c.quality_status=c.target_quality then 2 else 0 end)::numeric numerator,
    (25+case when c.category_exchange is not null and c.target_exchange is not null then 15 else 0 end+
     case when c.valid_change and c.target_valid_change and c.raw_change_percent is not null and c.target_change is not null then 20 else 0 end+
     case when c.valid_price and c.target_valid_price and c.raw_price>0 and c.target_price>0 then 15 else 0 end+
     case when c.valid_volume and c.target_valid_volume and c.raw_volume>0 and c.target_volume>0 then 15 else 0 end+5+3+2)::numeric denominator,
    array_remove(array[
      case when c.category_id=c.target_category_id then'Same mover category'end,
      case when c.category_exchange=c.target_exchange then'Same exchange'end,
      case when c.valid_change and c.target_valid_change and c.raw_change_percent is not null and c.target_change is not null
        and abs(abs(c.raw_change_percent)-abs(c.target_change))<=greatest(abs(c.target_change)*.1,5)then'Change magnitude within 10% band'end,
      case when c.valid_price and c.target_valid_price and c.raw_price>0 and c.target_price>0
        and width_bucket(c.raw_price,array[1,5,20,100]::numeric[])=width_bucket(c.target_price,array[1,5,20,100]::numeric[])then'Similar price band'end,
      case when c.valid_volume and c.target_valid_volume and c.raw_volume>0 and c.target_volume>0
        and abs(ln(c.raw_volume::numeric/c.target_volume::numeric))<=ln(3)then'Similar volume band'end,
      case when c.repeat_mover=c.target_repeat then'Matching repeat-mover status'end,
      case when c.catalyst_status=c.target_catalyst then'Matching catalyst coverage state'end,
      case when c.quality_status=c.target_quality then'Matching quality state'end
    ],null)::text[] reasons
  from candidates c
), ranked as(
  select w.*,round(100*w.numerator/nullif(w.denominator,0),2) score
  from weighted w order by score desc,w.report_date desc,w.id limit greatest(1,least(p_limit,50))
)
select r.id,r.ticker_id,r.ticker_symbol,r.report_date,r.category_name,r.category_exchange,
  r.raw_price,r.raw_change_percent,r.raw_volume,r.score,r.reasons,
  'historical-mover-similarity-v1'::text,
  o.return_1d,o.return_3d,o.return_7d,o.return_30d
from ranked r left join public.market_mover_price_outcomes o on o.appearance_id=r.id
order by r.score desc,r.report_date desc,r.id;
$$;

create or replace view public.research_coverage_backlog with(security_invoker=true)as
select c.appearance_id,c.ticker_id,c.symbol,c.report_date,c.category_name,c.exchange,
  c.change_percent,c.repeat_count,c.catalyst_status,c.social_coverage_status,c.quality_status,
  c.research_priority_score,c.research_priority_reasons,
  case
    when c.catalyst_status<>'not_researched'and c.social_coverage_status='not_researched'
      then'catalyst_researched_no_social'
    when c.catalyst_status='not_researched'and c.research_priority_score>=60
      then'high_priority_no_catalyst'
    when c.repeat_count>1 and c.social_coverage_status='not_researched'
      then'repeat_mover_no_social'
    else'quality_clean_ready'
  end backlog_type
from public.research_priority_candidates c
where(c.catalyst_status<>'not_researched'and c.social_coverage_status='not_researched')
  or(c.catalyst_status='not_researched'and c.research_priority_score>=60)
  or(c.repeat_count>1 and c.social_coverage_status='not_researched')
  or(c.quality_status in('clean','repaired')and c.research_priority_score>=50);

create or replace view public.workspace_activity_summary with(security_invoker=true)as
select w.id,w.name,w.description,w.status,w.created_at,w.updated_at,
  coalesce(i.item_count,0)::bigint item_count,coalesce(n.note_count,0)::bigint note_count,
  coalesce(q.open_questions,0)::bigint open_questions,coalesce(c.incomplete_checklist,0)::bigint incomplete_checklist,
  coalesce(v.saved_view_count,0)::bigint saved_view_count,coalesce(b.brief_count,0)::bigint brief_count,
  greatest(w.updated_at,i.last_at,n.last_at,q.last_at,c.last_at,v.last_at,b.last_at)last_activity_at
from public.research_workspaces w
left join lateral(select count(*)item_count,max(updated_at)last_at from public.research_workspace_items where workspace_id=w.id)i on true
left join lateral(select count(*)note_count,max(updated_at)last_at from public.research_notes where workspace_id=w.id)n on true
left join lateral(select count(*)filter(where status='open')open_questions,max(updated_at)last_at from public.research_questions where workspace_id=w.id)q on true
left join lateral(select count(*)filter(where not completed)incomplete_checklist,max(updated_at)last_at from public.research_checklist_items where workspace_id=w.id)c on true
left join lateral(select count(*)saved_view_count,max(updated_at)last_at from public.saved_research_views where workspace_id=w.id)v on true
left join lateral(select count(*)brief_count,max(created_at)last_at from public.research_brief_snapshots where workspace_id=w.id)b on true;

create or replace view public.research_quality_field_counts with(security_invoker=true)as
select field_name,finding_type,status,count(*)::bigint finding_count
from public.market_data_quality_findings
group by field_name,finding_type,status;

create or replace view public.research_repair_method_counts with(security_invoker=true)as
select proposal_method,status,
  case when confidence_score>=.9 then'high_0.90_to_1.00'
    when confidence_score>=.7 then'medium_0.70_to_0.89'else'low_below_0.70'end confidence_band,
  count(*)::bigint proposal_count
from public.market_data_correction_proposals
group by proposal_method,status,case when confidence_score>=.9 then'high_0.90_to_1.00'
  when confidence_score>=.7 then'medium_0.70_to_0.89'else'low_below_0.70'end;

-- Bounded breakdown function used by Cross-Source Analytics. Every row exposes
-- its own catalyst and social researched denominators.
create or replace function public.get_research_experience_breakdown(
  p_dimension text,p_limit integer default 24
)returns table(
  dimension text,group_key text,total_appearances bigint,catalyst_researched bigint,
  identified_catalyst bigint,no_identified_catalyst bigint,quality_flagged bigint,
  social_researched bigint,social_complete bigint
)language sql stable security invoker set search_path=public as $$
with base as(
  select a.id,a.ticker_id,a.report_date,c.exchange,c.name category_name,
    to_char(a.report_date,'YYYY-MM')month_key,
    case when p.total_appearances>1 then'repeat_mover'else'single_appearance'end repeat_status,
    s.catalyst_status,
    case when q.open_finding_count>0 then'flagged'when q.repaired_field_count>0 then'repaired'else'clean'end quality_state,
    coalesce(sc.coverage_status,'not_researched')social_status
  from public.market_mover_appearances a join public.market_categories c on c.id=a.category_id
  join public.mover_catalyst_status s on s.appearance_id=a.id
  join public.market_data_appearance_quality q on q.appearance_id=a.id
  join public.ticker_research_profile p on p.ticker_id=a.ticker_id
  left join lateral(select x.coverage_status from public.ticker_social_coverage x
    where x.ticker_id=a.ticker_id and a.report_date::timestamptz between x.date_from and x.date_to
    order by x.last_researched_at desc nulls last limit 1)sc on true
), grouped as(
  select case p_dimension when'exchange'then exchange when'category'then category_name
      when'month'then month_key when'quality'then quality_state
      when'repeat_status'then repeat_status when'social_coverage'then social_status end group_key,
    count(*)::bigint total_appearances,
    count(*)filter(where catalyst_status<>'not_researched')::bigint catalyst_researched,
    count(*)filter(where catalyst_status='catalyst_found')::bigint identified_catalyst,
    count(*)filter(where catalyst_status='no_identified_catalyst')::bigint no_identified_catalyst,
    count(*)filter(where quality_state='flagged')::bigint quality_flagged,
    count(*)filter(where social_status<>'not_researched')::bigint social_researched,
    count(*)filter(where social_status='complete_for_provider_window')::bigint social_complete
  from base where p_dimension in('exchange','category','month','quality','repeat_status','social_coverage')
  group by 1
)
select p_dimension,g.group_key,g.total_appearances,g.catalyst_researched,
  g.identified_catalyst,g.no_identified_catalyst,g.quality_flagged,
  g.social_researched,g.social_complete
from grouped g where g.group_key is not null
order by g.total_appearances desc,g.group_key limit greatest(1,least(p_limit,100));
$$;

grant select on public.saved_research_views,public.research_questions,
  public.research_checklist_items,public.research_brief_snapshots to anon,authenticated,service_role;
grant execute on function public.find_similar_historical_movers(uuid,integer)
  to anon,authenticated,service_role;
grant execute on function public.get_research_experience_breakdown(text,integer)
  to anon,authenticated,service_role;
