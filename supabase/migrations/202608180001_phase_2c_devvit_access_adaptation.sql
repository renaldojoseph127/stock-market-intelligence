-- Phase 2C production-access adaptation: preserve analytics while representing
-- the newly available, non-exhaustive Devvit search transport honestly.

alter table public.social_research_queue drop constraint if exists social_research_queue_coverage_status_check;
alter table public.social_research_queue add constraint social_research_queue_coverage_status_check
 check(coverage_status is null or coverage_status in('complete_for_provider_window','partial','provider_limited','rate_limited','not_available','not_researched','failed'));

alter table public.ticker_social_coverage drop constraint if exists ticker_social_coverage_coverage_status_check;
alter table public.ticker_social_coverage add constraint ticker_social_coverage_coverage_status_check
 check(coverage_status in('complete_for_provider_window','partial','provider_limited','rate_limited','not_available','not_researched','failed'));

update public.social_sources
set provider_status='unconfigured',
    provider_status_reason='Read-only Devvit bridge deployment, limited-access approval, managed token, and data-handling approval are required before collection.',
    last_error=null,
    updated_at=now()
where adapter_key='reddit' and provider_status='unconfigured';

create or replace view public.social_analytics_summary with(security_invoker=true)as
select count(distinct c.ticker_id)filter(where c.coverage_status<>'not_researched')::bigint researched_tickers,
 (select count(*)from public.social_posts where post_type not in('comment','reply'))::bigint posts_ingested,(select count(*)from public.social_posts where post_type in('comment','reply'))::bigint comments_ingested,
 (select count(*)from public.social_accounts)::bigint accounts_observed,(select count(*)from public.post_tickers)::bigint ticker_mentions,
 (select count(*)from public.social_mover_relationships where relationship_type='mentioned_before_move')::bigint pre_move_mentions,
 (select count(*)from public.social_mover_relationships where relationship_type='mentioned_after_move')::bigint post_move_mentions,
 count(distinct lower(c.community))filter(where c.community is not null)::bigint communities_researched,
 count(*)filter(where c.coverage_status='complete_for_provider_window')::bigint complete_coverage,
 count(*)filter(where c.coverage_status in('partial','provider_limited','rate_limited'))::bigint partial_or_limited_coverage,
 count(*)filter(where c.coverage_status='not_researched')::bigint not_researched_coverage
from public.ticker_social_coverage c;

create or replace view public.social_pre_move_analytics_universe with(security_invoker=true)as
select count(distinct m.id)::bigint total_mover_appearances,
 count(distinct m.id)filter(where cov.coverage_status='complete_for_provider_window')::bigint adequately_researched_appearances,
 count(distinct m.id)filter(where cov.coverage_status='complete_for_provider_window'and exists(select 1 from public.social_mover_relationships r where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move'))::bigint appearances_with_pre_move_social,
 count(distinct m.id)filter(where cov.coverage_status='complete_for_provider_window'and not exists(select 1 from public.social_mover_relationships r where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move'))::bigint adequately_researched_without_identified_social,
 percentile_cont(.5)within group(order by first_social.days_before_move)filter(where cov.coverage_status='complete_for_provider_window')median_days_from_earliest_known_mention,
 count(distinct m.id)filter(where cov.coverage_status in('partial','provider_limited','rate_limited','not_available','failed'))::bigint limited_coverage_appearances
from public.market_mover_appearances m
left join lateral(select c.coverage_status from public.ticker_social_coverage c where c.ticker_id=m.ticker_id and m.report_date::timestamptz between c.date_from and c.date_to order by c.last_researched_at desc nulls last limit 1)cov on true
left join lateral(select max(r.days_before_move)days_before_move from public.social_mover_relationships r where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move')first_social on true;
