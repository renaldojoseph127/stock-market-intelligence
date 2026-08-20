-- Phase 2C.2 production repair: provide a bounded backlog path without
-- expanding research_priority_candidates and repeating interest EXISTS checks
-- for every mover appearance. RAW Scanz observations remain read-only inputs.

create index if not exists research_workspace_items_ticker_interest_idx
  on public.research_workspace_items(ticker_id)
  where ticker_id is not null;

create or replace function public.get_research_coverage_backlog(
  p_backlog_type text default null,
  p_limit integer default 50
) returns table(
  appearance_id uuid,
  ticker_id uuid,
  symbol text,
  report_date date,
  category_name text,
  catalyst_status text,
  social_coverage_status text,
  quality_status text,
  research_priority_score numeric,
  backlog_type text
) language sql
stable
security invoker
set search_path = public
as $function$
with ticker_interest as materialized (
  select interested.ticker_id
  from (
    select item.ticker_id
    from public.research_workspace_items item
    where item.ticker_id is not null
    union all
    select note.ticker_id
    from public.research_notes note
    where note.ticker_id is not null
    union all
    select tag.ticker_id
    from public.research_tags tag
    where tag.ticker_id is not null
  ) interested
  group by interested.ticker_id
), appearance_interest as materialized (
  select interested.appearance_id
  from (
    select note.appearance_id
    from public.research_notes note
    where note.appearance_id is not null
    union all
    select tag.appearance_id
    from public.research_tags tag
    where tag.appearance_id is not null
  ) interested
  group by interested.appearance_id
), quality as materialized (
  select
    finding.appearance_id,
    count(*)::integer as open_finding_count,
    bool_or(finding.severity in ('high', 'critical')) as has_high_severity
  from public.market_data_quality_findings finding
  where finding.status in ('open', 'proposed')
  group by finding.appearance_id
), repaired as materialized (
  select effective.appearance_id
  from public.market_data_effective_values effective
  group by effective.appearance_id
), catalyst_links as materialized (
  select relationship.appearance_id
  from public.event_mover_relationships relationship
  group by relationship.appearance_id
), base as materialized (
  select
    appearance.id as appearance_id,
    appearance.ticker_id,
    ticker.symbol,
    appearance.report_date,
    category.name as category_name,
    coalesce(statistics.total_appearances, 0)::bigint as repeat_count,
    case
      when catalyst_links.appearance_id is not null then 'catalyst_found'
      when catalyst_coverage.has_complete then 'no_identified_catalyst'
      when catalyst_coverage.has_researched then 'research_partial'
      else 'not_researched'
    end as catalyst_status,
    coalesce(social.coverage_status, 'not_researched') as social_coverage_status,
    case
      when coalesce(quality.open_finding_count, 0) > 0 and quality.has_high_severity then 'unresolved'
      when coalesce(quality.open_finding_count, 0) > 0 then 'flagged'
      when repaired.appearance_id is not null then 'repaired'
      else 'clean'
    end as quality_status,
    least(25, round(coalesce(abs(appearance.change_percent), 0) / 4, 2))::numeric as magnitude_points,
    least(
      20,
      greatest(coalesce(statistics.total_appearances, 0) - 1, 0) * 2
    )::numeric as repeat_points,
    case
      when catalyst_links.appearance_id is not null then 0
      when catalyst_coverage.has_complete then 15
      when catalyst_coverage.has_researched then 5
      else 10
    end::numeric as catalyst_points,
    case
      when social.coverage_status is null or social.coverage_status = 'not_researched' then 10
      else 0
    end::numeric as social_points,
    case when coalesce(quality.open_finding_count, 0) = 0 then 10 else 0 end::numeric as quality_points,
    case
      when ticker_interest.ticker_id is not null or appearance_interest.appearance_id is not null then 10
      else 0
    end::numeric as interest_points,
    case when report.created_at >= now() - interval '30 days' then 10 else 0 end::numeric as import_recency_points
  from public.market_mover_appearances appearance
  join public.tickers ticker on ticker.id = appearance.ticker_id
  join public.market_categories category on category.id = appearance.category_id
  join public.source_reports report on report.id = appearance.report_id
  left join public.ticker_statistics statistics on statistics.ticker_id = appearance.ticker_id
  left join quality on quality.appearance_id = appearance.id
  left join repaired on repaired.appearance_id = appearance.id
  left join catalyst_links on catalyst_links.appearance_id = appearance.id
  left join ticker_interest on ticker_interest.ticker_id = appearance.ticker_id
  left join appearance_interest on appearance_interest.appearance_id = appearance.id
  left join lateral (
    select
      coalesce(bool_or(coverage.coverage_status = 'complete_for_configured_sources'), false) as has_complete,
      coalesce(bool_or(coverage.coverage_status <> 'not_researched'), false) as has_researched
    from public.ticker_catalyst_coverage coverage
    where coverage.ticker_id = appearance.ticker_id
      and appearance.report_date between coverage.date_from and coverage.date_to
  ) catalyst_coverage on true
  left join lateral (
    select coverage.coverage_status
    from public.ticker_social_coverage coverage
    where coverage.ticker_id = appearance.ticker_id
      and appearance.report_date::timestamptz between coverage.date_from and coverage.date_to
    order by coverage.last_researched_at desc nulls last
    limit 1
  ) social on true
), scored as materialized (
  select
    base.*,
    least(
      100,
      base.magnitude_points + base.repeat_points + base.catalyst_points +
      base.social_points + base.quality_points + base.interest_points + base.import_recency_points
    )::numeric as research_priority_score
  from base
), eligible as materialized (
  select
    scored.appearance_id,
    scored.ticker_id,
    scored.symbol,
    scored.report_date,
    scored.category_name,
    scored.catalyst_status,
    scored.social_coverage_status,
    scored.quality_status,
    scored.research_priority_score,
    case
      when scored.catalyst_status <> 'not_researched'
        and scored.social_coverage_status = 'not_researched'
        then 'catalyst_researched_no_social'
      when scored.catalyst_status = 'not_researched'
        and scored.research_priority_score >= 60
        then 'high_priority_no_catalyst'
      when scored.repeat_count > 1
        and scored.social_coverage_status = 'not_researched'
        then 'repeat_mover_no_social'
      else 'quality_clean_ready'
    end as backlog_type
  from scored
  where
    (scored.catalyst_status <> 'not_researched' and scored.social_coverage_status = 'not_researched')
    or (scored.catalyst_status = 'not_researched' and scored.research_priority_score >= 60)
    or (scored.repeat_count > 1 and scored.social_coverage_status = 'not_researched')
    or (scored.quality_status in ('clean', 'repaired') and scored.research_priority_score >= 50)
)
select
  eligible.appearance_id,
  eligible.ticker_id,
  eligible.symbol,
  eligible.report_date,
  eligible.category_name,
  eligible.catalyst_status,
  eligible.social_coverage_status,
  eligible.quality_status,
  eligible.research_priority_score,
  eligible.backlog_type
from eligible
where p_backlog_type is null or eligible.backlog_type = p_backlog_type
order by eligible.research_priority_score desc, eligible.report_date desc, eligible.appearance_id
limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

comment on function public.get_research_coverage_backlog(text, integer) is
  'Returns a bounded historical-research-priority-v1 coverage backlog from one RAW mover base and pre-aggregated research interest.';

grant execute on function public.get_research_coverage_backlog(text, integer)
  to anon, authenticated, service_role;
