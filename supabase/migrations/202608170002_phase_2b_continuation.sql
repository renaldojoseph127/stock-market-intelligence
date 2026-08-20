-- Phase 2B continuation: operational safety, review workflows, and coverage-aware analytics.
-- All objects are derived from public evidence. Imported Scanz observations remain unchanged.

alter table public.event_source_cache rename column fetched_at to retrieved_at;
alter table public.event_source_cache alter column response_payload drop not null;
alter table public.event_source_cache drop constraint if exists event_source_cache_response_payload_check;
alter table public.event_source_cache
 add column status text not null default 'success' check(status in('success','not_found','temporary_failure','failure')),
 add column http_status integer check(http_status is null or http_status between 100 and 599),
 add column error_type text,
 add column error_message text,
 add column retryable boolean not null default false,
 add constraint event_source_cache_payload_check check(response_payload is null or jsonb_typeof(response_payload)in('object','array')),
 add constraint event_source_cache_success_payload_check check(status<>'success' or response_payload is not null);

alter table public.event_classification_evidence add column classifier_id text not null default 'sec-form-items';
create unique index event_classification_stable_uidx on public.event_classification_evidence(event_id,classifier_id,classification_version,candidate_type,coalesce(candidate_subtype,''));

create table public.cik_resolution_cache(
 id uuid primary key default gen_random_uuid(),symbol text not null,normalized_symbol text not null,cik text,company_name text,
 resolution_status text not null check(resolution_status in('resolved','not_found','ambiguous','unresolved')),
 candidate_count integer not null default 0 check(candidate_count>=0),source_url text not null check(source_url~'^https://'),
 raw_mapping jsonb not null default'{}'check(jsonb_typeof(raw_mapping)='object'),retrieved_at timestamptz not null default now(),expires_at timestamptz not null,
 last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(normalized_symbol)
);
create trigger cik_resolution_cache_updated before update on public.cik_resolution_cache for each row execute function public.set_updated_at();
create index cik_resolution_status_expiry_idx on public.cik_resolution_cache(resolution_status,expires_at);

create table public.catalyst_provider_failures(
 id uuid primary key default gen_random_uuid(),queue_id uuid references public.catalyst_research_queue(id)on delete set null,
 ticker_id uuid not null references public.tickers(id)on delete cascade,source_id uuid references public.event_sources(id)on delete set null,
 date_from date not null,date_to date not null,attempt integer not null check(attempt>0),http_status integer check(http_status is null or http_status between 100 and 599),
 error_type text not null,error_message text not null,retryable boolean not null,available_after timestamptz,created_at timestamptz not null default now()
);
create index catalyst_provider_failures_ticker_idx on public.catalyst_provider_failures(ticker_id,created_at desc);
create index catalyst_provider_failures_queue_idx on public.catalyst_provider_failures(queue_id,created_at desc);
create index catalyst_provider_failures_retry_idx on public.catalyst_provider_failures(retryable,available_after)where retryable;

create table public.catalyst_provider_runs(
 id uuid primary key default gen_random_uuid(),queue_id uuid references public.catalyst_research_queue(id)on delete set null,
 ticker_id uuid not null references public.tickers(id)on delete cascade,source_id uuid references public.event_sources(id)on delete set null,
 provider text not null,status text not null check(status in('completed','partial','deferred','failed','unconfigured')),
 requests_made integer not null default 0 check(requests_made>=0),cache_hits integer not null default 0 check(cache_hits>=0),cache_misses integer not null default 0 check(cache_misses>=0),
 rate_limited_count integer not null default 0 check(rate_limited_count>=0),events_inserted integer not null default 0 check(events_inserted>=0),
 duplicates_detected integer not null default 0 check(duplicates_detected>=0),relationships_created integer not null default 0 check(relationships_created>=0),
 duration_ms integer not null default 0 check(duration_ms>=0),error_type text,error_message text,started_at timestamptz not null,completed_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index catalyst_provider_runs_source_date_idx on public.catalyst_provider_runs(source_id,completed_at desc);
create index catalyst_provider_runs_status_date_idx on public.catalyst_provider_runs(status,completed_at desc);
create index catalyst_provider_runs_queue_idx on public.catalyst_provider_runs(queue_id);

create table public.filing_document_evidence(
 id uuid primary key default gen_random_uuid(),filing_id uuid not null references public.sec_filings(id)on delete cascade,
 document_url text not null check(document_url~'^https://'),document_section text,short_evidence text not null check(length(short_evidence)between 1 and 4000),
 retrieved_at timestamptz not null,download_bytes integer check(download_bytes is null or download_bytes between 0 and 5242880),
 extracted_text_characters integer check(extracted_text_characters is null or extracted_text_characters between 0 and 100000),
 extraction_method text not null,metadata jsonb not null default'{}'check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default now()
);
create index filing_document_evidence_filing_idx on public.filing_document_evidence(filing_id,retrieved_at desc);

create table public.event_normalization_history(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.ticker_events(id)on delete cascade,
 classifier_id text not null,classifier_version text not null,before_value jsonb not null check(jsonb_typeof(before_value)='object'),
 after_value jsonb not null check(jsonb_typeof(after_value)='object'),change_reason text not null,changed_by text not null,created_at timestamptz not null default now()
);
create index event_normalization_history_event_idx on public.event_normalization_history(event_id,created_at desc);

create table public.manual_event_audit(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.ticker_events(id)on delete cascade,
 action text not null check(action in('created','corrected','excluded','restored')),actor text not null,reason text not null,
 source_url text not null check(source_url~'^https://'),before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
create index manual_event_audit_event_idx on public.manual_event_audit(event_id,created_at desc);

alter table public.event_clusters add column review_status text not null default 'unresolved' check(review_status in('unresolved','confirmed','separated')),
 add column review_reason text;
create table public.event_cluster_candidates(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 event_a_id uuid not null references public.ticker_events(id)on delete cascade,event_b_id uuid not null references public.ticker_events(id)on delete cascade,
 similarity numeric not null check(similarity between 0 and 1),reason text not null,status text not null default'unresolved'check(status in('unresolved','confirmed','separated')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(event_a_id<>event_b_id),unique(event_a_id,event_b_id)
);
create trigger event_cluster_candidates_updated before update on public.event_cluster_candidates for each row execute function public.set_updated_at();
create index event_cluster_candidates_review_idx on public.event_cluster_candidates(status,similarity desc,created_at);
create table public.event_cluster_reviews(
 id uuid primary key default gen_random_uuid(),candidate_id uuid not null references public.event_cluster_candidates(id)on delete cascade,
 decision text not null check(decision in('confirm_same_event','separate','leave_unresolved')),actor text not null,reason text not null,
 resulting_cluster_id uuid references public.event_clusters(id)on delete set null,created_at timestamptz not null default now()
);
create index event_cluster_reviews_candidate_idx on public.event_cluster_reviews(candidate_id,created_at desc);

-- Existing workspace, search, and alert systems are extended instead of duplicated.
alter table public.research_workspace_items drop constraint if exists research_workspace_items_item_type_check;
alter table public.research_workspace_items add constraint research_workspace_items_item_type_check check(item_type in('pinned_ticker','saved_comparison','saved_prompt','saved_filter','saved_event','saved_filing','saved_catalyst_comparison','saved_timeline'));
alter table public.research_search_documents drop constraint if exists research_search_documents_domain_check;
alter table public.research_search_documents add constraint research_search_documents_domain_check check(domain in('ticker','social_post','account','community','market_mover','pattern','alert','watchlist','event','filing'));

alter table public.alert_rules drop constraint if exists alert_rules_condition_type_check;
alter table public.alert_rules add constraint alert_rules_condition_type_check check(condition_type in('unusual_attention_score_above','attention_increase_percentage','sentiment_score_above','sentiment_score_below','sentiment_change','promotion_intensity_above','hype_risk_above','pattern_detected','similarity_score_above','market_mover_detected','volume_expansion','volatility_expansion','mention_count_increase','new_account_activity','new_source_activity','new_sec_filing','new_catalyst_event'));

create or replace function public.validate_alert_rule()returns trigger language plpgsql as $$
declare needs_value boolean;begin
 if jsonb_typeof(new.condition_configuration)<>'object'then raise exception'Alert configuration must be a JSON object';end if;
 if coalesce(new.condition_configuration->>'frequency','once_per_event')not in('once_per_event','once_per_day','once_per_week')then raise exception'Invalid alert frequency';end if;
 if new.condition_configuration?'operator'and new.condition_configuration->>'operator'not in('>','>=','<','<=','=','change_by')then raise exception'Invalid alert operator';end if;
 needs_value:=new.condition_type not in('pattern_detected','market_mover_detected','new_account_activity','new_source_activity','new_sec_filing','new_catalyst_event');
 if needs_value and(not(new.condition_configuration?'value')or jsonb_typeof(new.condition_configuration->'value')not in('number','string'))then raise exception'Alert threshold value is required';end if;
 if new.condition_configuration?'value'then perform(new.condition_configuration->>'value')::numeric;end if;return new;
exception when invalid_text_representation then raise exception'Alert threshold must be numeric';end$$;

alter view public.alert_candidate_events rename to alert_candidate_events_base;
create or replace view public.catalyst_alert_candidate_events with(security_invoker=true)as
select e.ticker_id,null::uuid account_id,null::uuid pattern_id,coalesce(e.published_at,e.event_date)reference_timestamp,
 case when e.event_type='sec_filing'then'new_sec_filing'else'new_catalyst_event'end condition_type,1::numeric current_value,null::numeric previous_value,
 jsonb_build_object('condition_type',case when e.event_type='sec_filing'then'new_sec_filing'else'new_catalyst_event'end,'event_id',e.id,'event_type',e.event_type,'event_subtype',e.event_subtype,'source_url',e.source_url,'source','ticker_events')evidence,
 'event:'||e.id::text entity_key from public.ticker_events e where e.event_status not in('duplicate','excluded','failed');
create or replace view public.alert_candidate_events with(security_invoker=true)as select*from public.alert_candidate_events_base union all select*from public.catalyst_alert_candidate_events;

create or replace function public.alert_condition_met(p_condition text,p_value numeric,p_configuration jsonb)returns boolean language sql immutable as $$
 select case when p_value is null then false when p_condition in('pattern_detected','market_mover_detected','new_account_activity','new_source_activity','new_sec_filing','new_catalyst_event')then p_value>0
 when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='>'then p_value>(p_configuration->>'value')::numeric
 when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='>='then p_value>=(p_configuration->>'value')::numeric
 when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='<'then p_value<(p_configuration->>'value')::numeric
 when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='<='then p_value<=(p_configuration->>'value')::numeric
 when p_configuration->>'operator'='='then p_value=(p_configuration->>'value')::numeric when p_configuration->>'operator'='change_by'then abs(p_value)>=(p_configuration->>'value')::numeric else false end
$$;

-- Coverage-aware descriptive analytics. Relationships are many-to-many and never represent causation.
create or replace view public.catalyst_analytics_universe with(security_invoker=true)as
select count(*)::bigint total_mover_appearances,count(*)filter(where catalyst_status<>'not_researched')::bigint researched_mover_appearances,
 count(*)filter(where catalyst_status='catalyst_found')::bigint identified_catalyst_appearances,count(*)filter(where catalyst_status='no_identified_catalyst')::bigint no_identified_catalyst_appearances,
 count(*)filter(where catalyst_status='research_partial')::bigint partial_coverage_appearances,'raw'::text data_mode from public.mover_catalyst_status;

create or replace view public.catalyst_combinations with(security_invoker=true)as
with combinations as(
 select r.appearance_id,array_agg(distinct coalesce(nullif(e.event_subtype,''),e.event_type::text)order by coalesce(nullif(e.event_subtype,''),e.event_type::text))types
 from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id where r.relationship_type in('preceded_move','same_day')group by r.appearance_id
),usable as(select appearance_id,types,array_to_string(types,' + ')combination from combinations where cardinality(types)>1)
select u.combination,u.types,count(*)::bigint appearance_count,count(distinct a.ticker_id)::bigint ticker_count,
 count(*)filter(where c.category_type='biggest_gainer')::bigint gainer_count,count(*)filter(where c.category_type='biggest_decliner')::bigint decliner_count,
 count(*)filter(where c.category_type='most_active')::bigint most_active_count,round(percentile_cont(.5)within group(order by a.change_percent)::numeric,4)median_change_percent,
 round(avg(a.change_percent),4)average_change_percent,'raw'::text data_mode
from usable u join public.market_mover_appearances a on a.id=u.appearance_id join public.market_categories c on c.id=a.category_id group by u.combination,u.types;

create or replace view public.catalyst_combination_detail with(security_invoker=true)as
with combinations as(
 select r.appearance_id,array_agg(distinct coalesce(nullif(e.event_subtype,''),e.event_type::text)order by coalesce(nullif(e.event_subtype,''),e.event_type::text))types
 from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id where r.relationship_type in('preceded_move','same_day')group by r.appearance_id
)
select a.id appearance_id,a.ticker_id,t.symbol,a.report_date,c.name category_name,c.category_type,c.exchange,a.change_percent,a.volume,
 array_to_string(x.types,' + ')combination,x.types,'raw'::text data_mode
from combinations x join public.market_mover_appearances a on a.id=x.appearance_id join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id where cardinality(x.types)>1;

create or replace view public.ticker_repeat_catalyst_behavior with(security_invoker=true)as
select t.id ticker_id,t.symbol,coalesce(nullif(e.event_subtype,''),e.event_type::text)catalyst_type,count(distinct e.id)::bigint historical_event_count,
 count(distinct r.appearance_id)::bigint associated_mover_count,min(e.event_date)first_seen,max(e.event_date)last_seen,
 round(percentile_cont(.5)within group(order by r.hours_before_move)filter(where r.relationship_type='preceded_move')::numeric,2)median_hours_before_move
from public.ticker_events e join public.tickers t on t.id=e.ticker_id left join public.event_mover_relationships r on r.event_id=e.id
where e.event_status not in('duplicate','excluded','failed')group by t.id,coalesce(nullif(e.event_subtype,''),e.event_type::text);

create or replace view public.sec_form_analytics with(security_invoker=true)as
select f.form_type,count(distinct f.id)::bigint filings_observed,count(distinct r.event_id)::bigint filings_linked_to_movers,count(distinct r.appearance_id)::bigint mover_appearances,
 round(percentile_cont(.5)within group(order by r.hours_before_move)filter(where r.relationship_type='preceded_move')::numeric,2)median_hours_before_move,
 count(distinct r.appearance_id)filter(where c.category_type='biggest_gainer')::bigint gainer_associations,
 count(distinct r.appearance_id)filter(where c.category_type='biggest_decliner')::bigint decliner_associations,
 count(distinct r.appearance_id)filter(where c.category_type='most_active')::bigint most_active_associations
from public.sec_filings f left join public.event_mover_relationships r on r.event_id=f.event_id left join public.market_mover_appearances a on a.id=r.appearance_id left join public.market_categories c on c.id=a.category_id group by f.form_type;

create or replace view public.event_source_analytics with(security_invoker=true)as
select s.id source_id,s.name source,s.source_type,s.authority_level,coalesce(e.events_ingested,0)events_ingested,coalesce(e.events_linked,0)events_linked,
 coalesce(cl.duplicates_clustered,0)duplicates_clustered,coalesce(pr.failed_retrievals,0)failed_retrievals,pr.last_successful_retrieval,
 coalesce(pr.requests_made,0)requests_made,coalesce(pr.cache_hits,0)cache_hits,coalesce(pr.cache_misses,0)cache_misses,coalesce(pr.rate_limited_count,0)rate_limited_count
from public.event_sources s
left join lateral(select count(*)::bigint events_ingested,count(*)filter(where exists(select 1 from public.event_mover_relationships r where r.event_id=x.id))::bigint events_linked from public.ticker_events x where x.source_id=s.id)e on true
left join lateral(select count(*)::bigint duplicates_clustered from public.event_cluster_members m join public.ticker_events x on x.id=m.event_id where x.source_id=s.id and m.relationship_type in('same_event','syndicated'))cl on true
left join lateral(select count(*)filter(where status in('failed','deferred'))::bigint failed_retrievals,max(completed_at)filter(where status in('completed','partial'))last_successful_retrieval,sum(requests_made)::bigint requests_made,sum(cache_hits)::bigint cache_hits,sum(cache_misses)::bigint cache_misses,sum(rate_limited_count)::bigint rate_limited_count from public.catalyst_provider_runs x where x.source_id=s.id)pr on true;

create or replace view public.sec_ingestion_coverage with(security_invoker=true)as
select count(distinct t.id)filter(where coalesce(nullif(t.cik,''),nullif(c.cik,''))is not null)::bigint tickers_with_cik,
 count(distinct t.id)filter(where coalesce(nullif(t.cik,''),nullif(c.cik,''))is null)::bigint tickers_without_cik,
 count(distinct cov.ticker_id)filter(where cov.sec_checked)::bigint tickers_researched_through_sec,
 (select count(distinct ticker_id)from public.catalyst_provider_failures f join public.event_sources s on s.id=f.source_id where s.source_type='sec')::bigint sec_research_failures,
 (select count(*)from public.sec_filings)::bigint filings_stored,
 (select count(distinct event_id)from public.event_classification_evidence ce where ce.candidate_type<>'sec_filing')::bigint filings_classified,
 (select count(*)from public.sec_filings f where not exists(select 1 from public.event_classification_evidence ce where ce.event_id=f.event_id and ce.candidate_type<>'sec_filing'))::bigint filings_unresolved
from public.tickers t left join public.cik_resolution_cache c on c.normalized_symbol=upper(t.symbol)and c.resolution_status='resolved' left join public.ticker_catalyst_coverage cov on cov.ticker_id=t.id;

create or replace view public.catalyst_monthly_distribution with(security_invoker=true)as
select date_trunc('month',e.event_date)::date event_month,count(distinct e.id)::bigint events,count(distinct r.appearance_id)::bigint mover_appearances
from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id group by date_trunc('month',e.event_date);
create or replace view public.catalyst_yearly_distribution with(security_invoker=true)as
select extract(year from e.event_date)::integer event_year,count(distinct e.id)::bigint events,count(distinct r.appearance_id)::bigint mover_appearances
from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id group by extract(year from e.event_date);

create or replace view public.catalyst_before_move_detail with(security_invoker=true)as
select r.id relationship_id,r.event_id,r.appearance_id,r.ticker_id,t.symbol,t.sector,t.industry,t.security_type,e.event_date,e.published_at,e.event_type,e.event_subtype,coalesce(nullif(e.event_subtype,''),e.event_type::text)catalyst_type,e.sec_form_type,
 r.relationship_type,r.temporal_bucket,r.hours_before_move,r.days_before_move,r.catalyst_relevance,a.report_date,a.change_percent,a.volume,c.name category_name,c.category_type,c.exchange,'raw'::text data_mode
from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id join public.tickers t on t.id=r.ticker_id
join public.market_mover_appearances a on a.id=r.appearance_id join public.market_categories c on c.id=a.category_id where r.relationship_type='preceded_move';

create or replace view public.catalyst_research_management with(security_invoker=true)as
select count(*)filter(where q.status='pending')::bigint queue_depth,count(*)filter(where q.status='processing')::bigint currently_processing,
 count(*)filter(where q.status in('completed','partial')and q.completed_at::date=current_date)::bigint completed_today,
 count(*)filter(where q.status='failed'and q.completed_at::date=current_date)::bigint failed_today,count(*)filter(where q.status='deferred')::bigint deferred,
 coalesce((select sum(requests_made)from public.catalyst_provider_runs where completed_at::date=current_date),0)::bigint sec_requests_today,
 coalesce((select sum(cache_hits)from public.catalyst_provider_runs where completed_at::date=current_date),0)::bigint cache_hits_today,
 coalesce((select sum(cache_misses)from public.catalyst_provider_runs where completed_at::date=current_date),0)::bigint cache_misses_today,
 (select max(completed_at)from public.catalyst_provider_runs where status in('completed','partial'))last_sec_success
from public.catalyst_research_queue q;

create or replace function public.queue_catalyst_selection(p_selection text,p_ticker_ids uuid[]default null,p_watchlist_id uuid default null,p_date_from date default null,p_date_to date default null,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ids uuid[];ticker_id uuid;queued uuid[]:='{}';safe_limit integer:=greatest(1,least(p_limit,50));begin
 if p_selection='selected_tickers'then ids:=p_ticker_ids;
 elsif p_selection='top_frequent'then select array_agg(ticker_id)into ids from(select a.ticker_id from public.market_mover_appearances a group by a.ticker_id order by count(distinct a.report_date)desc,a.ticker_id limit least(safe_limit,25))x;
 elsif p_selection='top_gainers'then select array_agg(ticker_id)into ids from(select a.ticker_id from public.market_mover_appearances a join public.market_categories c on c.id=a.category_id where c.category_type='biggest_gainer'group by a.ticker_id order by count(*)desc,a.ticker_id limit safe_limit)x;
 elsif p_selection='watchlist'then select array_agg(distinct ticker_id)into ids from public.watchlist_entities where watchlist_id=p_watchlist_id and entity_type='ticker';
 else raise exception'Unsupported selective catalyst research scope';end if;
 if coalesce(cardinality(ids),0)=0 then return jsonb_build_object('queued',0,'queue_ids','[]'::jsonb);end if;
 foreach ticker_id in array ids[1:safe_limit]loop queued:=array_append(queued,public.queue_catalyst_research(ticker_id,null,case when p_selection='watchlist'then'watchlist'else'historical_backfill'end,p_date_from,p_date_to,'["sec"]'));end loop;
 return jsonb_build_object('queued',cardinality(queued),'queue_ids',to_jsonb(queued),'selection',p_selection);end$$;

create or replace function public.retry_failed_catalyst_research(p_limit integer default 25)returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;begin with chosen as(select id from public.catalyst_research_queue where status='failed'order by updated_at limit greatest(1,least(p_limit,50))for update skip locked)
 update public.catalyst_research_queue q set status='pending',available_after=null,completed_at=null from chosen where q.id=chosen.id;get diagnostics changed=row_count;return changed;end$$;

create or replace function public.create_manual_catalyst_event(p_ticker_id uuid,p_event_at timestamptz,p_event_type text,p_event_subtype text,p_headline text,p_source_url text,p_source_name text,p_notes text,p_actor text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare event_id uuid:=gen_random_uuid();source_id uuid;begin
 if p_source_url!~'^https://'then raise exception'Manual event source URL must use HTTPS';end if;
 if length(trim(coalesce(p_headline,'')))=0 or length(trim(coalesce(p_source_name,'')))=0 or length(trim(coalesce(p_actor,'')))=0 or length(trim(coalesce(p_reason,'')))=0 then raise exception'Headline, source name, actor, and reason are required';end if;
 if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='ticker_event_type'and e.enumlabel=p_event_type)then raise exception'Unsupported event type';end if;
 select id into source_id from public.event_sources where name='Manual Public Source';
 insert into public.ticker_events(id,ticker_id,event_date,event_type,headline,description,source_url,source_id,external_event_id,event_subtype,published_at,source_name,source_type,event_status,event_confidence,ingestion_method,raw_title,raw_summary,normalized_headline,normalized_description,is_primary_source,market_session,classification_version,metadata)
 values(event_id,p_ticker_id,p_event_at,p_event_type::public.ticker_event_type,trim(p_headline),nullif(trim(p_notes),''),p_source_url,source_id,'manual:'||event_id,p_event_subtype,p_event_at,trim(p_source_name),'manual','normalized',1,'manual',trim(p_headline),nullif(trim(p_notes),''),trim(p_headline),nullif(trim(p_notes),''),false,'unknown','manual-v1',jsonb_build_object('actor',trim(p_actor),'reason',trim(p_reason)));
 insert into public.manual_event_audit(event_id,action,actor,reason,source_url,after_value)values(event_id,'created',trim(p_actor),trim(p_reason),p_source_url,jsonb_build_object('event_type',p_event_type,'event_subtype',p_event_subtype,'headline',trim(p_headline),'notes',nullif(trim(p_notes),'')));
 return event_id;end$$;

create or replace function public.correct_catalyst_event(p_event_id uuid,p_normalized_headline text,p_normalized_description text,p_event_subtype text,p_actor text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.ticker_events;before_value jsonb;after_value jsonb;begin select*into e from public.ticker_events where id=p_event_id for update;if not found then raise exception'Event not found';end if;
 if length(trim(coalesce(p_actor,'')))=0 or length(trim(coalesce(p_reason,'')))=0 then raise exception'Actor and reason are required';end if;
 before_value:=jsonb_build_object('normalized_headline',e.normalized_headline,'normalized_description',e.normalized_description,'event_subtype',e.event_subtype,'classification_version',e.classification_version);
 after_value:=jsonb_build_object('normalized_headline',coalesce(nullif(trim(p_normalized_headline),''),e.normalized_headline),'normalized_description',coalesce(nullif(trim(p_normalized_description),''),e.normalized_description),'event_subtype',coalesce(nullif(trim(p_event_subtype),''),e.event_subtype),'classification_version','manual-correction-v1');
 update public.ticker_events set normalized_headline=after_value->>'normalized_headline',normalized_description=after_value->>'normalized_description',event_subtype=after_value->>'event_subtype',classification_version='manual-correction-v1'where id=e.id;
 insert into public.event_normalization_history(event_id,classifier_id,classifier_version,before_value,after_value,change_reason,changed_by)values(e.id,'manual-correction','manual-correction-v1',before_value,after_value,trim(p_reason),trim(p_actor));
 if e.ingestion_method='manual'then insert into public.manual_event_audit(event_id,action,actor,reason,source_url,before_value,after_value)values(e.id,'corrected',trim(p_actor),trim(p_reason),e.source_url,before_value,after_value);end if;
 return jsonb_build_object('event_id',e.id,'status','corrected');end$$;

create or replace function public.review_event_cluster_candidate(p_candidate_id uuid,p_decision text,p_actor text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$
declare candidate public.event_cluster_candidates;cluster_id uuid;new_status text;begin select*into candidate from public.event_cluster_candidates where id=p_candidate_id for update;if not found then raise exception'Cluster candidate not found';end if;
 if p_decision not in('confirm_same_event','separate','leave_unresolved')then raise exception'Unsupported cluster decision';end if;if length(trim(coalesce(p_actor,'')))=0 or length(trim(coalesce(p_reason,'')))=0 then raise exception'Actor and reason are required';end if;
 new_status:=case p_decision when'confirm_same_event'then'confirmed'when'separate'then'separated'else'unresolved'end;
 if p_decision='confirm_same_event'then insert into public.event_clusters(ticker_id,canonical_event_id,cluster_type,cluster_date,confidence,review_status,review_reason)
  select candidate.ticker_id,case when a.is_primary_source then a.id when b.is_primary_source then b.id else a.id end,'same_event',least(a.event_date,b.event_date)::date,candidate.similarity,'confirmed',trim(p_reason)from public.ticker_events a join public.ticker_events b on b.id=candidate.event_b_id where a.id=candidate.event_a_id returning id into cluster_id;
  insert into public.event_cluster_members(cluster_id,event_id,relationship_type,confidence)values(cluster_id,candidate.event_a_id,'same_event',candidate.similarity),(cluster_id,candidate.event_b_id,'same_event',candidate.similarity)on conflict do nothing;
 end if;
 update public.event_cluster_candidates set status=new_status where id=candidate.id;insert into public.event_cluster_reviews(candidate_id,decision,actor,reason,resulting_cluster_id)values(candidate.id,p_decision,trim(p_actor),trim(p_reason),cluster_id);
 return jsonb_build_object('candidate_id',candidate.id,'status',new_status,'cluster_id',cluster_id);end$$;

create or replace function public.refresh_catalyst_search_document(p_event_id uuid)returns void language plpgsql security definer set search_path=public as $$begin
 insert into public.research_search_documents(domain,record_id,title,content,route,ticker_id,observation_date,source_table,methodology_version,evidence)
 select'event',e.id,coalesce(e.normalized_headline,e.headline,e.event_type::text),left(concat_ws(' ',e.normalized_description,e.description,e.event_type,e.event_subtype,e.sec_form_type,t.symbol),4000),'/events/'||e.id,e.ticker_id,e.event_date::date,'ticker_events',e.classification_version,
 jsonb_build_object('event_id',e.id,'ticker',t.symbol,'source_name',e.source_name,'source_url',e.source_url,'accession_number',e.sec_accession_number,'published_at',e.published_at)
 from public.ticker_events e join public.tickers t on t.id=e.ticker_id where e.id=p_event_id on conflict(domain,record_id)do update set title=excluded.title,content=excluded.content,route=excluded.route,ticker_id=excluded.ticker_id,observation_date=excluded.observation_date,source_table=excluded.source_table,methodology_version=excluded.methodology_version,evidence=excluded.evidence,updated_at=now();
end$$;

-- Safe structured catalyst query planner target. It accepts only fixed intents and typed JSON filters.
create or replace function public.execute_catalyst_research_query(p_intent text,p_filters jsonb default'{}',p_limit integer default 50)returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare filters jsonb:=coalesce(p_filters,'{}');safe_limit integer:=greatest(1,least(p_limit,200));symbols text[];from_date date;to_date date;records jsonb:='[]';tables text[];methods text[]:=array['catalyst-v1','catalyst-relevance-v1'];limitations text[]:=array['Results include only configured and completed catalyst research coverage.','SEC-only research does not imply broad news or internet coverage.','Temporal association does not establish causation or predictive power.','Raw imported Scanz observations are the default market-data mode.'];begin
 if p_intent not in('catalyst_before_movers','catalyst_repeat_tickers','catalyst_no_identified','catalyst_comparison')then raise exception'Unsupported catalyst research intent';end if;
 select array_agg(upper(value))into symbols from jsonb_array_elements_text(coalesce(filters->'tickers','[]'));if coalesce(filters->>'from','')~'^\d{4}-\d{2}-\d{2}$'then from_date:=(filters->>'from')::date;end if;if coalesce(filters->>'to','')~'^\d{4}-\d{2}-\d{2}$'then to_date:=(filters->>'to')::date;end if;
 if p_intent='catalyst_no_identified'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select s.appearance_id,t.symbol,s.report_date,c.name category_name,c.category_type,c.exchange,s.last_researched_at,s.sources_checked,s.limitations,'No qualifying catalyst was found in the recorded source/window coverage; this does not mean no catalyst existed.'why,
   jsonb_build_array(jsonb_build_object('type','market_mover','id',s.appearance_id,'label',t.symbol||' · '||c.name,'route','/market-movers/'||s.appearance_id,'source_table','mover_catalyst_status','observation_date',s.report_date))citations
   from public.mover_catalyst_status s join public.tickers t on t.id=s.ticker_id join public.market_mover_appearances a on a.id=s.appearance_id join public.market_categories c on c.id=a.category_id where s.catalyst_status='no_identified_catalyst'and(symbols is null or t.symbol=any(symbols))and(from_date is null or s.report_date>=from_date)and(to_date is null or s.report_date<=to_date)order by s.report_date desc limit safe_limit)x;tables:=array['mover_catalyst_status','ticker_catalyst_coverage','market_mover_appearances'];
 elsif p_intent='catalyst_repeat_tickers'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select r.*,jsonb_build_array(jsonb_build_object('type','ticker','id',r.ticker_id,'label',r.symbol,'route','/tickers/'||r.symbol,'source_table','ticker_repeat_catalyst_behavior','observation_date',r.last_seen::date))citations,'Repeated historical event/mover associations for the same ticker and normalized catalyst type.'why from public.ticker_repeat_catalyst_behavior r where r.associated_mover_count>0 and(symbols is null or r.symbol=any(symbols))and(filters->>'catalyst_type'is null or lower(r.catalyst_type)=lower(filters->>'catalyst_type'))order by r.associated_mover_count desc,r.historical_event_count desc limit safe_limit)x;tables:=array['ticker_events','event_mover_relationships','market_mover_appearances'];
 elsif p_intent='catalyst_comparison'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select t.id ticker_id,t.symbol,e.id event_id,e.event_date,e.event_type,e.event_subtype,e.sec_form_type,e.normalized_headline,e.source_name,e.source_url,e.classification_confidence,
   (select count(*)from public.event_mover_relationships r where r.event_id=e.id)mover_associations,(select jsonb_agg(jsonb_build_object('date_from',c.date_from,'date_to',c.date_to,'sources_checked',c.sources_checked,'status',c.coverage_status,'limitations',c.limitations))from public.ticker_catalyst_coverage c where c.ticker_id=t.id)research_coverage,
   'Events are shown by requested ticker with recorded source coverage; counts are descriptive.'why,jsonb_build_array(jsonb_build_object('type','event','id',e.id,'label',coalesce(e.normalized_headline,e.headline),'route','/events/'||e.id,'source_table','ticker_events','observation_date',e.event_date::date))citations
   from public.event_intelligence e join public.tickers t on t.id=e.ticker_id where symbols is not null and t.symbol=any(symbols)and(from_date is null or e.event_date::date>=from_date)and(to_date is null or e.event_date::date<=to_date)and(filters->>'event_type'is null or e.event_type::text=filters->>'event_type')order by t.symbol,e.event_date desc limit safe_limit)x;tables:=array['event_intelligence','ticker_catalyst_coverage','event_mover_relationships'];
 else
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select d.*,e.normalized_headline headline,e.source_name,e.source_url,e.classification_confidence,e.sec_accession_number,
   cov.sources_checked,cov.coverage_status,cov.limitations,'The public event preceded the imported mover observation in the recorded temporal bucket; timing does not establish causation.'why,
   jsonb_build_array(jsonb_build_object('type','event','id',d.event_id,'label',coalesce(e.normalized_headline,e.headline),'route','/events/'||d.event_id,'source_table','ticker_events','observation_date',d.event_date::date),jsonb_build_object('type','market_mover','id',d.appearance_id,'label',d.symbol||' · '||d.category_name,'route','/market-movers/'||d.appearance_id,'source_table','market_mover_appearances','observation_date',d.report_date))citations
   from public.catalyst_before_move_detail d join public.event_intelligence e on e.id=d.event_id left join lateral(select c.sources_checked,c.coverage_status,c.limitations from public.ticker_catalyst_coverage c where c.ticker_id=d.ticker_id and d.report_date between c.date_from and c.date_to order by c.last_researched_at desc limit 1)cov on true
   where(symbols is null or d.symbol=any(symbols))and(from_date is null or d.report_date>=from_date)and(to_date is null or d.report_date<=to_date)
   and(filters->>'category_type'is null or d.category_type=filters->>'category_type')and(filters->>'event_type'is null or d.event_type::text=filters->>'event_type')and(filters->>'catalyst_type'is null or lower(d.catalyst_type)=lower(filters->>'catalyst_type')or(lower(filters->>'catalyst_type')='offering'and lower(d.catalyst_type)in('registered_offering','direct_offering','private_placement','atm_offering','shelf_registration','financing','debt_financing','equity_financing')))
   and(filters->>'sec_form'is null or upper(d.sec_form_type)=upper(filters->>'sec_form'))and(filters->>'temporal_bucket'is null or d.temporal_bucket=filters->>'temporal_bucket')
   and(filters->>'industry'is null or lower(coalesce(d.industry,''))like'%'||lower(filters->>'industry')||'%')and(filters->>'max_days_before'is null or d.days_before_move<=least(90,(filters->>'max_days_before')::numeric))
   order by d.report_date desc,d.catalyst_relevance desc limit safe_limit)x;tables:=array['catalyst_before_move_detail','event_intelligence','ticker_catalyst_coverage'];
 end if;
 return jsonb_build_object('intent',p_intent,'records',coalesce(records,'[]'),'record_count',jsonb_array_length(coalesce(records,'[]')),'tables',to_jsonb(tables),'methodology_versions',to_jsonb(methods),'limitations',to_jsonb(limitations),'executed_at',now());end$$;

do $$declare t text;begin foreach t in array array['cik_resolution_cache','filing_document_evidence','event_normalization_history','manual_event_audit','event_cluster_candidates','event_cluster_reviews']loop
 execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon,authenticated using(true)',t);end loop;end$$;
alter table public.catalyst_provider_failures enable row level security;
alter table public.catalyst_provider_runs enable row level security;

do $$declare signature text;begin foreach signature in array array[
 'queue_catalyst_selection(text,uuid[],uuid,date,date,integer)','retry_failed_catalyst_research(integer)',
 'create_manual_catalyst_event(uuid,timestamptz,text,text,text,text,text,text,text,text)',
 'correct_catalyst_event(uuid,text,text,text,text,text)','review_event_cluster_candidate(uuid,text,text,text)','refresh_catalyst_search_document(uuid)'
]loop execute format('revoke all on function public.%s from public,anon,authenticated',signature);execute format('grant execute on function public.%s to service_role',signature);end loop;end$$;
revoke all on function public.execute_catalyst_research_query(text,jsonb,integer)from public,anon,authenticated;
grant execute on function public.execute_catalyst_research_query(text,jsonb,integer)to service_role;
