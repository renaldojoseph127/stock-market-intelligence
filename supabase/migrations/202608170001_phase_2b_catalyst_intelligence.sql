-- Phase 2B: historical public-event and catalyst intelligence.
-- Imported Scanz observations remain immutable; every relationship below is derived evidence.

create table public.event_sources(
 id uuid primary key default gen_random_uuid(),name text not null unique,source_type text not null check(source_type in('sec','company_ir','government','news_api','rss','manual','other')),
 base_url text,authority_level text not null check(authority_level in('primary','secondary','aggregator')),enabled boolean not null default true,
 priority integer not null default 0,requires_api_key boolean not null default false,configuration jsonb not null default'{}'check(jsonb_typeof(configuration)='object'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create trigger event_sources_updated before update on public.event_sources for each row execute function public.set_updated_at();

create table public.catalyst_definitions(
 id uuid primary key default gen_random_uuid(),event_type text not null,event_subtype text,display_name text not null,description text not null,
 classification_version text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(event_type,event_subtype,classification_version)
);
create trigger catalyst_definitions_updated before update on public.catalyst_definitions for each row execute function public.set_updated_at();

alter table public.ticker_events
 add column source_id uuid references public.event_sources(id)on delete set null,
 add column external_event_id text,
 add column event_subtype text,
 add column published_at timestamptz,
 add column effective_at timestamptz,
 add column source_name text,
 add column source_type text,
 add column source_document_url text,
 add column source_document_type text,
 add column sec_accession_number text,
 add column sec_form_type text,
 add column sec_cik text,
 add column event_status text not null default'observed'check(event_status in('observed','normalized','linked','unresolved','duplicate','excluded','failed')),
 add column event_confidence numeric check(event_confidence is null or event_confidence between 0 and 1),
 add column ingestion_method text,
 add column raw_title text,
 add column raw_summary text,
 add column normalized_headline text,
 add column normalized_description text,
 add column is_primary_source boolean not null default false,
 add column market_session text check(market_session is null or market_session in('pre_market','regular_session','after_hours','unknown')),
 add column classification_version text,
 add column first_seen_at timestamptz not null default now(),
 add column last_seen_at timestamptz not null default now(),
 add column metadata jsonb not null default'{}'check(jsonb_typeof(metadata)='object'),
 add column updated_at timestamptz not null default now();
create trigger ticker_events_updated before update on public.ticker_events for each row execute function public.set_updated_at();
-- Non-partial unique indexes allow PostgREST ON CONFLICT upserts; PostgreSQL still permits multiple NULL identities.
create unique index ticker_events_source_external_uidx on public.ticker_events(source_id,external_event_id);
create unique index ticker_events_sec_accession_uidx on public.ticker_events(sec_accession_number);
create index ticker_events_status_date_idx on public.ticker_events(event_status,event_date desc);
create index ticker_events_type_subtype_idx on public.ticker_events(event_type,event_subtype,event_date desc);
create index ticker_events_source_idx on public.ticker_events(source_id,event_date desc);
create index ticker_events_published_idx on public.ticker_events(published_at desc)where published_at is not null;

create table public.sec_filings(
 id uuid primary key default gen_random_uuid(),event_id uuid unique references public.ticker_events(id)on delete cascade,ticker_id uuid references public.tickers(id)on delete set null,
 cik text not null,accession_number text not null unique,form_type text not null,filing_date date not null,report_date date,accepted_at timestamptz,
 primary_document text,filing_url text not null,primary_document_url text,items text[],description text,is_amendment boolean not null default false,
 raw_metadata jsonb not null default'{}'check(jsonb_typeof(raw_metadata)='object'),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create trigger sec_filings_updated before update on public.sec_filings for each row execute function public.set_updated_at();
create index sec_filings_ticker_date_idx on public.sec_filings(ticker_id,filing_date desc);
create index sec_filings_cik_date_idx on public.sec_filings(cik,filing_date desc);
create index sec_filings_form_date_idx on public.sec_filings(form_type,filing_date desc);

create table public.event_classification_evidence(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.ticker_events(id)on delete cascade,classification_version text not null,
 candidate_type text not null,candidate_subtype text,confidence numeric not null check(confidence between 0 and 1),reason text not null,
 evidence jsonb not null default'{}'check(jsonb_typeof(evidence)='object'),created_at timestamptz not null default now(),
 unique(event_id,classification_version,candidate_type,candidate_subtype)
);
create index event_classification_event_idx on public.event_classification_evidence(event_id,confidence desc);

create table public.event_clusters(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 canonical_event_id uuid references public.ticker_events(id)on delete set null,cluster_type text not null,cluster_date date not null,
 confidence numeric check(confidence is null or confidence between 0 and 1),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create trigger event_clusters_updated before update on public.event_clusters for each row execute function public.set_updated_at();
create index event_clusters_ticker_date_idx on public.event_clusters(ticker_id,cluster_date desc);
create table public.event_cluster_members(
 cluster_id uuid not null references public.event_clusters(id)on delete cascade,event_id uuid not null references public.ticker_events(id)on delete cascade,
 relationship_type text not null check(relationship_type in('same_event','follow_up','amendment','syndicated','related')),
 confidence numeric check(confidence is null or confidence between 0 and 1),created_at timestamptz not null default now(),primary key(cluster_id,event_id)
);
create index event_cluster_members_event_idx on public.event_cluster_members(event_id);

create table public.catalyst_research_queue(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 appearance_id uuid references public.market_mover_appearances(id)on delete cascade,priority integer not null default 0,
 reason text not null check(reason in('ticker_page','market_mover','ai_search','watchlist','manual','historical_backfill','research_workspace','pattern_match','retry')),
 status text not null default'pending'check(status in('pending','processing','completed','partial','deferred','failed','cancelled')),
 date_from date not null,date_to date not null,required_sources jsonb not null default'["sec"]'check(jsonb_typeof(required_sources)='array'),source_scope_key text not null default'sec',
 attempts integer not null default 0 check(attempts>=0),available_after timestamptz,last_error text,started_at timestamptz,completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(date_to>=date_from),check(date_to-date_from<=366)
);
create trigger catalyst_research_queue_updated before update on public.catalyst_research_queue for each row execute function public.set_updated_at();
create index catalyst_queue_claim_idx on public.catalyst_research_queue(status,available_after,priority desc,created_at);
create index catalyst_queue_ticker_window_idx on public.catalyst_research_queue(ticker_id,date_from,date_to,created_at desc);
create index catalyst_queue_appearance_idx on public.catalyst_research_queue(appearance_id,created_at desc)where appearance_id is not null;

create table public.event_source_cache(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.event_sources(id)on delete cascade,cache_key text not null,
 request_url text not null,response_payload jsonb not null check(jsonb_typeof(response_payload)in('object','array')),etag text,last_modified text,
 fetched_at timestamptz not null default now(),expires_at timestamptz not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(source_id,cache_key)
);
create trigger event_source_cache_updated before update on public.event_source_cache for each row execute function public.set_updated_at();
create index event_source_cache_expiry_idx on public.event_source_cache(source_id,expires_at);

create table public.ticker_catalyst_coverage(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,date_from date not null,date_to date not null,
 source_scope_key text not null,sources_checked jsonb not null default'[]'check(jsonb_typeof(sources_checked)='array'),last_researched_at timestamptz,
 sec_checked boolean not null default false,news_checked boolean not null default false,company_ir_checked boolean not null default false,
 events_found integer not null default 0 check(events_found>=0),coverage_status text not null check(coverage_status in('complete_for_configured_sources','partial','not_researched','failed')),
 limitations jsonb not null default'[]'check(jsonb_typeof(limitations)='array'),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(ticker_id,date_from,date_to,source_scope_key),check(date_to>=date_from)
);
create trigger ticker_catalyst_coverage_updated before update on public.ticker_catalyst_coverage for each row execute function public.set_updated_at();
create index ticker_catalyst_coverage_window_idx on public.ticker_catalyst_coverage(ticker_id,date_from,date_to,coverage_status);

create table public.event_mover_relationships(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.ticker_events(id)on delete cascade,
 appearance_id uuid not null references public.market_mover_appearances(id)on delete cascade,ticker_id uuid not null references public.tickers(id)on delete cascade,
 relationship_type text not null check(relationship_type in('preceded_move','same_day','followed_move','near_move','historical_context')),
 event_at timestamptz,mover_date date not null,minutes_before_move bigint,hours_before_move numeric,days_before_move numeric,
 temporal_bucket text not null check(temporal_bucket in('same_session','pre_market_same_day','after_hours_previous_day','within_24h_before','1_to_3_days_before','4_to_7_days_before','8_to_30_days_before','after_move','unknown')),
 confidence numeric not null check(confidence between 0 and 1),catalyst_relevance smallint not null check(catalyst_relevance between 0 and 100),
 reason text not null,score_evidence jsonb not null default'{}'check(jsonb_typeof(score_evidence)='object'),created_at timestamptz not null default now(),unique(event_id,appearance_id)
);
create index event_mover_appearance_idx on public.event_mover_relationships(appearance_id,catalyst_relevance desc);
create index event_mover_event_idx on public.event_mover_relationships(event_id);
create index event_mover_ticker_date_idx on public.event_mover_relationships(ticker_id,mover_date desc,temporal_bucket);

create or replace function public.catalyst_priority_base(p_reason text)returns integer language sql immutable as $$
 select case p_reason when'ai_search'then 100 when'manual'then 95 when'market_mover'then 90 when'ticker_page'then 85 when'watchlist'then 80 when'pattern_match'then 75 when'research_workspace'then 70 when'retry'then 60 when'historical_backfill'then 20 else 0 end
$$;

create or replace function public.queue_catalyst_research(p_ticker_id uuid,p_appearance_id uuid default null,p_reason text default'ticker_page',p_date_from date default null,p_date_to date default null,p_required_sources jsonb default'["sec"]')returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_mover date;v_from date;v_to date;v_scope text;begin
 if p_reason not in('ticker_page','market_mover','ai_search','watchlist','manual','historical_backfill','research_workspace','pattern_match','retry')then raise exception'Unsupported catalyst queue reason';end if;
 if not exists(select 1 from public.tickers where id=p_ticker_id)then raise exception'Ticker does not exist';end if;
 if jsonb_typeof(coalesce(p_required_sources,'null'))<>'array'or jsonb_array_length(p_required_sources)=0 then raise exception'At least one required source is required';end if;
 if p_appearance_id is not null then select report_date into v_mover from public.market_mover_appearances where id=p_appearance_id and ticker_id=p_ticker_id;if not found then raise exception'Appearance does not belong to ticker';end if;end if;
 if v_mover is null then select max(report_date)into v_mover from public.market_mover_appearances where ticker_id=p_ticker_id;end if;
 v_from:=coalesce(p_date_from,v_mover-7,current_date-7);v_to:=coalesce(p_date_to,v_mover+2,current_date+2);
 if v_to<v_from or v_to-v_from>366 then raise exception'Catalyst window must contain 1 to 367 calendar days';end if;
 select string_agg(value,','order by value)into v_scope from(select distinct lower(trim(value))value from jsonb_array_elements_text(p_required_sources)where trim(value)<>'')s;
 if v_scope is null then raise exception'Required sources cannot be blank';end if;
 perform pg_advisory_xact_lock(hashtext(p_ticker_id::text||':'||coalesce(p_appearance_id::text,'')||':'||v_from||':'||v_to||':'||v_scope));
 select id into v_id from public.catalyst_research_queue where ticker_id=p_ticker_id and appearance_id is not distinct from p_appearance_id and date_from=v_from and date_to=v_to and source_scope_key=v_scope and status in('pending','processing','deferred')order by created_at desc limit 1 for update;
 if v_id is not null then update public.catalyst_research_queue set priority=greatest(priority,public.catalyst_priority_base(p_reason)),reason=case when public.catalyst_priority_base(p_reason)>priority then p_reason else reason end,available_after=null where id=v_id;return v_id;end if;
 insert into public.catalyst_research_queue(ticker_id,appearance_id,priority,reason,date_from,date_to,required_sources,source_scope_key)
 values(p_ticker_id,p_appearance_id,public.catalyst_priority_base(p_reason),p_reason,v_from,v_to,p_required_sources,v_scope)returning id into v_id;return v_id;
end$$;

create or replace function public.claim_catalyst_research_queue(p_limit integer default 1,p_queue_id uuid default null)returns setof public.catalyst_research_queue
language plpgsql security definer set search_path=public as $$begin
 update public.catalyst_research_queue set status='deferred',available_after=now(),last_error=coalesce(last_error,'Recovered expired 10-minute processing lease')where status='processing'and updated_at<now()-interval'10 minutes';
 return query with claimed as(select q.id from public.catalyst_research_queue q where q.status in('pending','deferred')and(q.available_after is null or q.available_after<=now())and(p_queue_id is null or q.id=p_queue_id)order by q.priority desc,q.created_at limit greatest(1,least(p_limit,5))for update skip locked)
 update public.catalyst_research_queue q set status='processing',attempts=q.attempts+1,started_at=coalesce(q.started_at,now()),last_error=null from claimed where q.id=claimed.id returning q.*;
end$$;

create or replace function public.finish_catalyst_research_queue(p_queue_id uuid,p_status text,p_error text default null,p_available_after timestamptz default null)returns jsonb
language plpgsql security definer set search_path=public as $$declare q public.catalyst_research_queue;begin
 if p_status not in('completed','partial','deferred','failed','cancelled')then raise exception'Unsupported catalyst queue completion status';end if;
 update public.catalyst_research_queue set status=p_status,last_error=p_error,available_after=p_available_after,completed_at=case when p_status in('completed','partial','failed','cancelled')then now()else null end where id=p_queue_id returning*into q;
 if not found then raise exception'Catalyst queue item not found';end if;return to_jsonb(q);end$$;

create or replace view public.event_intelligence with(security_invoker=true)as
select e.*,t.symbol ticker_symbol,t.company_name,s.name registry_source_name,s.authority_level,
 ce.candidate_type classified_type,ce.candidate_subtype classified_subtype,ce.confidence classification_confidence,ce.reason classification_reason,
 coalesce(cm.cluster_count,0)cluster_count,coalesce(rm.mover_count,0)mover_relationship_count
from public.ticker_events e join public.tickers t on t.id=e.ticker_id left join public.event_sources s on s.id=e.source_id
left join lateral(select c.candidate_type,c.candidate_subtype,c.confidence,c.reason from public.event_classification_evidence c where c.event_id=e.id order by c.confidence desc,c.created_at limit 1)ce on true
left join lateral(select count(*)::int cluster_count from public.event_cluster_members m where m.event_id=e.id)cm on true
left join lateral(select count(*)::int mover_count from public.event_mover_relationships r where r.event_id=e.id)rm on true;

create or replace view public.mover_catalyst_status with(security_invoker=true)as
select a.id appearance_id,a.ticker_id,a.report_date,coalesce(rel.event_count,0)event_count,coalesce(rel.max_relevance,0)max_relevance,
 case when coalesce(rel.event_count,0)>0 then'catalyst_found'
  when cov.complete_count>0 then'no_identified_catalyst'
  when cov.coverage_count>0 then'research_partial'else'not_researched'end catalyst_status,
 coalesce(cov.coverage_count,0)coverage_records,cov.last_researched_at,cov.sources_checked,cov.limitations
from public.market_mover_appearances a
left join lateral(select count(*)::int event_count,max(r.catalyst_relevance)::int max_relevance from public.event_mover_relationships r where r.appearance_id=a.id)rel on true
left join lateral(select count(*)::int coverage_count,count(*)filter(where c.coverage_status='complete_for_configured_sources')::int complete_count,max(c.last_researched_at)last_researched_at,
 coalesce(jsonb_agg(distinct c.sources_checked)filter(where c.id is not null),'[]')sources_checked,coalesce(jsonb_agg(distinct c.limitations)filter(where c.id is not null),'[]')limitations
 from public.ticker_catalyst_coverage c where c.ticker_id=a.ticker_id and a.report_date between c.date_from and c.date_to and c.coverage_status<>'not_researched')cov on true;

create or replace view public.market_mover_intelligence with(security_invoker=true)as
select m.*,s.catalyst_status,s.event_count catalyst_event_count,s.max_relevance catalyst_max_relevance,s.last_researched_at catalyst_last_researched_at
from public.market_mover_appearances_effective m join public.mover_catalyst_status s on s.appearance_id=m.id;

create or replace view public.catalyst_analytics_summary with(security_invoker=true)as
select count(*)filter(where catalyst_status<>'not_researched')::bigint researched_appearances,
 count(*)filter(where catalyst_status='catalyst_found')::bigint appearances_with_catalyst,
 count(*)filter(where catalyst_status='no_identified_catalyst')::bigint no_identified_catalyst,
 count(*)filter(where catalyst_status='research_partial')::bigint partial_coverage,
 round(100*count(*)filter(where catalyst_status='catalyst_found')/nullif(count(*)filter(where catalyst_status<>'not_researched'),0)::numeric,2)identified_percent_of_researched
from public.mover_catalyst_status;

create or replace view public.catalyst_type_performance with(security_invoker=true)as
select coalesce(nullif(e.event_subtype,''),e.event_type::text)catalyst_type,count(distinct r.appearance_id)::bigint associated_appearances,
 round(avg(a.change_percent),4)average_change_percent,round(percentile_cont(.5)within group(order by a.change_percent)::numeric,4)median_change_percent,
 round(percentile_cont(.5)within group(order by a.volume)::numeric,2)median_volume,
 count(distinct r.appearance_id)filter(where c.category_type='biggest_gainer')::bigint gainer_count,
 count(distinct r.appearance_id)filter(where c.category_type='biggest_decliner')::bigint decliner_count,
 count(distinct r.appearance_id)filter(where c.category_type='most_active')::bigint most_active_count
from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id join public.market_mover_appearances a on a.id=r.appearance_id join public.market_categories c on c.id=a.category_id
group by coalesce(nullif(e.event_subtype,''),e.event_type::text);

create or replace view public.catalyst_timing_distribution with(security_invoker=true)as
select temporal_bucket,count(distinct appearance_id)::bigint mover_appearances,count(*)::bigint relationships from public.event_mover_relationships group by temporal_bucket;

create or replace view public.catalyst_exchange_distribution with(security_invoker=true)as
select c.exchange,count(distinct r.appearance_id)::bigint mover_appearances,count(*)::bigint relationships
from public.event_mover_relationships r join public.market_mover_appearances a on a.id=r.appearance_id join public.market_categories c on c.id=a.category_id group by c.exchange;

create or replace view public.catalyst_mover_category_distribution with(security_invoker=true)as
select c.id category_id,c.name category_name,c.category_type,count(distinct r.appearance_id)::bigint mover_appearances,count(*)::bigint relationships
from public.event_mover_relationships r join public.market_mover_appearances a on a.id=r.appearance_id join public.market_categories c on c.id=a.category_id group by c.id;

create or replace view public.catalyst_before_move_analysis with(security_invoker=true)as
select coalesce(nullif(e.event_subtype,''),e.event_type::text)catalyst_type,r.temporal_bucket,count(distinct r.appearance_id)::bigint mover_appearances,
 round(avg(a.change_percent),4)average_change_percent
from public.event_mover_relationships r join public.ticker_events e on e.id=r.event_id join public.market_mover_appearances a on a.id=r.appearance_id
where r.relationship_type='preceded_move'group by coalesce(nullif(e.event_subtype,''),e.event_type::text),r.temporal_bucket;

insert into public.event_sources(name,source_type,base_url,authority_level,enabled,priority,requires_api_key)values
 ('SEC EDGAR','sec','https://data.sec.gov','primary',true,100,false),
 ('Configured Company IR','company_ir',null,'primary',false,80,false),
 ('Manual Public Source','manual',null,'secondary',true,50,false)
on conflict(name)do nothing;

insert into public.catalyst_definitions(event_type,event_subtype,display_name,description,classification_version)values
 ('earnings',null,'Earnings','Earnings-related public event.','catalyst-v1'),('earnings','earnings_guidance','Earnings guidance','Company guidance associated with earnings or outlook.','catalyst-v1'),
 ('earnings','revenue_update','Revenue update','Public revenue update.','catalyst-v1'),('earnings','financial_results','Financial results','Reported operating or financial results.','catalyst-v1'),
 ('sec_filing',null,'SEC filing','Observed SEC EDGAR filing; form type alone does not establish a market catalyst.','catalyst-v1'),
 ('offering',null,'Offering','Public evidence concerning a securities offering.','catalyst-v1'),('offering','registered_offering','Registered offering','Registered securities offering evidence.','catalyst-v1'),('offering','direct_offering','Direct offering','Direct offering evidence.','catalyst-v1'),('offering','private_placement','Private placement','Private placement evidence.','catalyst-v1'),('offering','atm_offering','ATM offering','At-the-market offering evidence.','catalyst-v1'),('offering','shelf_registration','Shelf registration','Shelf-registration filing; not by itself proof of issuance or dilution.','catalyst-v1'),
 ('offering','financing','Financing','Financing-related public evidence.','catalyst-v1'),('offering','debt_financing','Debt financing','Debt-financing evidence.','catalyst-v1'),('offering','equity_financing','Equity financing','Equity-financing evidence.','catalyst-v1'),
 ('reverse_split',null,'Reverse split','Reverse stock split evidence.','catalyst-v1'),('stock_split',null,'Stock split','Forward stock split evidence.','catalyst-v1'),
 ('merger',null,'Merger','Merger-related evidence.','catalyst-v1'),('acquisition',null,'Acquisition','Acquisition-related evidence.','catalyst-v1'),('merger','strategic_transaction','Strategic transaction','Strategic-transaction evidence.','catalyst-v1'),
 ('fda',null,'FDA','FDA-related public evidence.','catalyst-v1'),('fda','clinical_trial','Clinical trial','Clinical-trial evidence.','catalyst-v1'),('fda','regulatory','Regulatory','Regulatory-event evidence.','catalyst-v1'),
 ('contract',null,'Contract','Contract-related evidence.','catalyst-v1'),('contract','government_contract','Government contract','Government-contract evidence.','catalyst-v1'),('contract','partnership','Partnership','Partnership evidence.','catalyst-v1'),('contract','customer_win','Customer win','Customer-win evidence.','catalyst-v1'),
 ('other','patent','Patent','Patent-related evidence.','catalyst-v1'),('other','licensing','Licensing','Licensing evidence.','catalyst-v1'),('other','management_change','Management change','Management or board change evidence.','catalyst-v1'),
 ('analyst','analyst_rating','Analyst rating','Analyst rating evidence.','catalyst-v1'),('analyst','analyst_target','Analyst target','Analyst price-target evidence.','catalyst-v1'),('other','shareholder_update','Shareholder update','Shareholder communication.','catalyst-v1'),
 ('other','bankruptcy','Bankruptcy','Bankruptcy-related evidence.','catalyst-v1'),('other','restructuring','Restructuring','Restructuring evidence.','catalyst-v1'),('other','delisting','Delisting','Delisting-related evidence.','catalyst-v1'),('other','listing_compliance','Listing compliance','Exchange listing-compliance evidence.','catalyst-v1'),
 ('other','investigation','Investigation','Investigation-related public evidence.','catalyst-v1'),('other','litigation','Litigation','Litigation-related public evidence.','catalyst-v1'),('other','dividend','Dividend','Dividend evidence.','catalyst-v1'),('other','buyback','Buyback','Share-repurchase evidence.','catalyst-v1'),
 ('other','crypto_related','Crypto related','Crypto-related public evidence.','catalyst-v1'),('other','industry_event','Industry event','Broader industry event.','catalyst-v1'),('other',null,'Other / unresolved','Evidence does not support a more specific classification.','catalyst-v1')
on conflict(event_type,event_subtype,classification_version)do nothing;

do $$declare t text;begin foreach t in array array['event_sources','catalyst_definitions','sec_filings','event_classification_evidence','event_clusters','event_cluster_members','ticker_catalyst_coverage','event_mover_relationships']loop
 execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon,authenticated using(true)',t);end loop;end$$;
alter table public.catalyst_research_queue enable row level security;
alter table public.event_source_cache enable row level security;

do $$declare signature text;begin foreach signature in array array[
 'queue_catalyst_research(uuid,uuid,text,date,date,jsonb)','claim_catalyst_research_queue(integer,uuid)','finish_catalyst_research_queue(uuid,text,text,timestamptz)'
]loop execute format('revoke all on function public.%s from public,anon,authenticated',signature);execute format('grant execute on function public.%s to service_role',signature);end loop;end$$;
grant execute on function public.catalyst_priority_base(text)to anon,authenticated,service_role;
