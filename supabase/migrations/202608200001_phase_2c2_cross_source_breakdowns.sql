-- Phase 2C.2 production repair: build the mover analytics base once and
-- aggregate all supported Cross-Source dimensions in a single bounded call.
create or replace function public.get_research_experience_breakdowns(
  p_limit integer default 24
) returns table(
  dimension text,
  group_key text,
  total_appearances bigint,
  catalyst_researched bigint,
  identified_catalyst bigint,
  no_identified_catalyst bigint,
  quality_flagged bigint,
  social_researched bigint,
  social_complete bigint
) language sql
stable
security invoker
set search_path = public
as $function$
with base as materialized (
  select
    a.ticker_id,
    a.report_date,
    c.exchange,
    c.name as category_name,
    count(*) over (partition by a.ticker_id) as ticker_appearance_count,
    case
      when exists (
        select 1
        from public.event_mover_relationships rel
        where rel.appearance_id = a.id
      ) then 'catalyst_found'
      when exists (
        select 1
        from public.ticker_catalyst_coverage cov
        where cov.ticker_id = a.ticker_id
          and a.report_date between cov.date_from and cov.date_to
          and cov.coverage_status = 'complete_for_configured_sources'
      ) then 'no_identified_catalyst'
      when exists (
        select 1
        from public.ticker_catalyst_coverage cov
        where cov.ticker_id = a.ticker_id
          and a.report_date between cov.date_from and cov.date_to
          and cov.coverage_status <> 'not_researched'
      ) then 'research_partial'
      else 'not_researched'
    end as catalyst_status,
    case
      when exists (
        select 1
        from public.market_data_quality_findings finding
        where finding.appearance_id = a.id
          and finding.status in ('open', 'proposed')
      ) then 'flagged'
      when exists (
        select 1
        from public.market_data_effective_values effective
        where effective.appearance_id = a.id
      ) then 'repaired'
      else 'clean'
    end as quality_state,
    coalesce(social.coverage_status, 'not_researched') as social_status
  from public.market_mover_appearances a
  join public.market_categories c on c.id = a.category_id
  left join lateral (
    select coverage.coverage_status
    from public.ticker_social_coverage coverage
    where coverage.ticker_id = a.ticker_id
      and a.report_date::timestamptz between coverage.date_from and coverage.date_to
    order by coverage.last_researched_at desc nulls last
    limit 1
  ) social on true
), expanded as (
  select
    keys.dimension,
    keys.group_key,
    base.catalyst_status,
    base.quality_state,
    base.social_status
  from base
  cross join lateral (
    values
      ('exchange'::text, base.exchange::text),
      ('category'::text, base.category_name::text),
      ('month'::text, to_char(base.report_date, 'YYYY-MM')),
      ('quality'::text, base.quality_state),
      (
        'repeat_status'::text,
        case when base.ticker_appearance_count > 1 then 'repeat_mover' else 'single_appearance' end
      ),
      ('social_coverage'::text, base.social_status)
  ) keys(dimension, group_key)
  where keys.group_key is not null
), aggregated as (
  select
    expanded.dimension,
    expanded.group_key,
    count(*)::bigint as total_appearances,
    count(*) filter (where expanded.catalyst_status <> 'not_researched')::bigint as catalyst_researched,
    count(*) filter (where expanded.catalyst_status = 'catalyst_found')::bigint as identified_catalyst,
    count(*) filter (where expanded.catalyst_status = 'no_identified_catalyst')::bigint as no_identified_catalyst,
    count(*) filter (where expanded.quality_state = 'flagged')::bigint as quality_flagged,
    count(*) filter (where expanded.social_status <> 'not_researched')::bigint as social_researched,
    count(*) filter (where expanded.social_status = 'complete_for_provider_window')::bigint as social_complete
  from expanded
  group by expanded.dimension, expanded.group_key
), ranked as (
  select
    aggregated.*,
    row_number() over (
      partition by aggregated.dimension
      order by aggregated.total_appearances desc, aggregated.group_key
    ) as group_rank
  from aggregated
)
select
  ranked.dimension,
  ranked.group_key,
  ranked.total_appearances,
  ranked.catalyst_researched,
  ranked.identified_catalyst,
  ranked.no_identified_catalyst,
  ranked.quality_flagged,
  ranked.social_researched,
  ranked.social_complete
from ranked
where ranked.group_rank <= greatest(1, least(coalesce(p_limit, 24), 100))
order by
  case ranked.dimension
    when 'exchange' then 1
    when 'category' then 2
    when 'month' then 3
    when 'quality' then 4
    when 'repeat_status' then 5
    when 'social_coverage' then 6
    else 7
  end,
  ranked.group_rank;
$function$;

comment on function public.get_research_experience_breakdowns(integer) is
  'Returns six bounded, coverage-aware Cross-Source breakdowns from one materialized RAW mover base.';

grant execute on function public.get_research_experience_breakdowns(integer)
  to anon, authenticated, service_role;
