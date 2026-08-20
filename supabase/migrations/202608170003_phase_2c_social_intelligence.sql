-- Phase 2C: Historical Social Intelligence, official Reddit research, and coverage-aware pre-move analysis.
-- Existing normalized social, sentiment, attention, account, catalyst, and mover records remain authoritative.

alter table public.social_sources add column if not exists provider_status text not null default 'unconfigured';
alter table public.social_sources add column if not exists provider_status_reason text;
alter table public.social_sources add column if not exists last_rate_limit_used numeric;
alter table public.social_sources add column if not exists last_rate_limit_remaining numeric;
alter table public.social_sources add column if not exists last_rate_limit_reset_seconds integer;
alter table public.social_sources add column if not exists last_rate_limit_observed_at timestamptz;
alter table public.social_sources add column if not exists last_error text;
alter table public.social_sources drop constraint if exists social_sources_provider_status_check;
alter table public.social_sources add constraint social_sources_provider_status_check check(provider_status in('healthy','degraded','rate_limited','unavailable','unconfigured','authorization_required'));
update public.social_sources set ingestion_enabled=true,provider_status='unconfigured',provider_status_reason='Official OAuth and explicit Reddit Data API authorization are required before collection.' where adapter_key='reddit';

alter table public.social_accounts add column if not exists account_status text not null default 'unknown';
alter table public.social_accounts add column if not exists account_created_at timestamptz;
alter table public.social_accounts add column if not exists last_verified_at timestamptz;
alter table public.social_accounts add column if not exists provider_metadata jsonb not null default '{}';
alter table public.social_accounts drop constraint if exists social_accounts_account_status_check;
alter table public.social_accounts add constraint social_accounts_account_status_check check(account_status in('active','deleted','suspended','unavailable','unknown'));

alter table public.social_posts add column if not exists submission_external_id text;
alter table public.social_posts add column if not exists permalink text;
alter table public.social_posts add column if not exists upvote_ratio numeric;
alter table public.social_posts add column if not exists is_self_post boolean;
alter table public.social_posts add column if not exists retrieved_at timestamptz;
alter table public.social_posts add column if not exists source_created_at timestamptz;
alter table public.social_posts add column if not exists provider_metadata jsonb not null default '{}';
alter table public.social_posts add column if not exists compliance_checked_at timestamptz;
alter table public.social_posts drop constraint if exists social_posts_availability_check;
alter table public.social_posts add constraint social_posts_availability_check check(availability_status in('active','available','deleted','removed','unavailable','unknown'));
alter table public.social_posts drop constraint if exists social_posts_upvote_ratio_check;
alter table public.social_posts add constraint social_posts_upvote_ratio_check check(upvote_ratio is null or upvote_ratio between 0 and 1);
create index if not exists social_posts_submission_idx on public.social_posts(source_id,submission_external_id);
create index if not exists social_posts_availability_retrieved_idx on public.social_posts(availability_status,retrieved_at);

alter table public.post_tickers add column if not exists context_excerpt text;
alter table public.post_tickers add column if not exists resolver_version text;
create index if not exists post_tickers_ticker_created_idx on public.post_tickers(ticker_id,created_at desc);

create table public.social_research_settings(
 id boolean primary key default true check(id),early_min_days integer not null default 1 check(early_min_days between 1 and 30),
 early_max_days integer not null default 30 check(early_max_days between 1 and 90),resolver_version text not null default 'ticker-mention-v2',
 attention_version text not null default 'social-attention-v2',retention_hours integer not null default 48 check(retention_hours between 1 and 720),
 max_query_pages integer not null default 3 check(max_query_pages between 1 and 10),updated_at timestamptz not null default now(),
 check(early_max_days>=early_min_days)
);
insert into public.social_research_settings(id)values(true)on conflict(id)do nothing;

create table public.social_research_queue(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 appearance_id uuid references public.market_mover_appearances(id)on delete cascade,source_id uuid not null references public.social_sources(id)on delete restrict,
 community text,date_from timestamptz not null,date_to timestamptz not null,priority integer not null default 0,
 reason text not null check(reason in('ticker_page','market_mover','ai_search','watchlist','manual','historical_backfill','catalyst_comparison','pattern_match','research_workspace','retry')),
 status text not null default'pending'check(status in('pending','processing','completed','partial','rate_limited','not_available','deferred','failed','cancelled')),
 cursor_state jsonb,attempts integer not null default 0 check(attempts>=0),available_after timestamptz,
 posts_found integer not null default 0 check(posts_found>=0),comments_found integer not null default 0 check(comments_found>=0),accounts_found integer not null default 0 check(accounts_found>=0),
 coverage_status text check(coverage_status is null or coverage_status in('complete_for_provider_window','partial','rate_limited','not_available','not_researched','failed')),
 last_error text,started_at timestamptz,updated_at timestamptz not null default now(),completed_at timestamptz,created_at timestamptz not null default now(),
 check(date_to>=date_from),check(date_to-date_from<=interval'93 days')
);
create unique index social_research_queue_active_uidx on public.social_research_queue(ticker_id,coalesce(appearance_id,'00000000-0000-0000-0000-000000000000'::uuid),source_id,coalesce(lower(community),''),date_from,date_to)where status in('pending','processing','deferred','rate_limited');
create index social_research_queue_claim_idx on public.social_research_queue(status,available_after,priority desc,created_at);
create index social_research_queue_ticker_idx on public.social_research_queue(ticker_id,created_at desc);

create table public.ticker_social_coverage(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 source_id uuid not null references public.social_sources(id)on delete restrict,community text,date_from timestamptz not null,date_to timestamptz not null,
 last_researched_at timestamptz,posts_found integer not null default 0,comments_found integer not null default 0,accounts_found integer not null default 0,
 coverage_status text not null default'not_researched'check(coverage_status in('complete_for_provider_window','partial','rate_limited','not_available','not_researched','failed')),
 provider_cursor_exhausted boolean,limitations jsonb not null default'[]',query_evidence jsonb not null default'[]',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(ticker_id,source_id,community,date_from,date_to),check(date_to>=date_from)
);
create unique index ticker_social_coverage_scope_uidx on public.ticker_social_coverage(ticker_id,source_id,coalesce(lower(community),''),date_from,date_to);
create index ticker_social_coverage_ticker_window_idx on public.ticker_social_coverage(ticker_id,date_from,date_to,coverage_status);

create table public.social_provider_cache(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.social_sources(id)on delete cascade,
 cache_key text not null,request_url text not null,response_payload jsonb,status text not null default'success'check(status in('success','empty','not_found','temporary_failure','failure','deleted')),
 cursor text,retrieved_at timestamptz not null default now(),expires_at timestamptz not null,
 etag text,last_modified text,http_status integer,error_type text,error_message text,retryable boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(source_id,cache_key)
);
create index social_provider_cache_expiry_idx on public.social_provider_cache(source_id,expires_at);

create table public.social_provider_daily_usage(
 provider text not null,usage_date date not null default current_date,requests_reserved integer not null default 0,
 requests_succeeded integer not null default 0,requests_failed integer not null default 0,requests_rate_limited integer not null default 0,
 cache_hits integer not null default 0,cache_misses integer not null default 0,updated_at timestamptz not null default now(),primary key(provider,usage_date)
);
create table public.social_provider_runs(
 id uuid primary key default gen_random_uuid(),queue_id uuid references public.social_research_queue(id)on delete set null,
 ticker_id uuid references public.tickers(id)on delete set null,source_id uuid references public.social_sources(id)on delete set null,
 provider text not null,status text not null,requests_made integer not null default 0,cache_hits integer not null default 0,cache_misses integer not null default 0,
 rate_limited_count integer not null default 0,posts_inserted integer not null default 0,posts_updated integer not null default 0,comments_inserted integer not null default 0,
 accounts_observed integer not null default 0,mentions_created integer not null default 0,mover_relationships_created integer not null default 0,catalyst_relationships_created integer not null default 0,
 duration_ms integer not null default 0,error_type text,error_message text,rate_limit_used numeric,rate_limit_remaining numeric,rate_limit_reset_seconds integer,
 started_at timestamptz not null,completed_at timestamptz not null,created_at timestamptz not null default now()
);
create index social_provider_runs_source_completed_idx on public.social_provider_runs(source_id,completed_at desc);
create table public.social_provider_failures(
 id uuid primary key default gen_random_uuid(),queue_id uuid references public.social_research_queue(id)on delete set null,
 ticker_id uuid references public.tickers(id)on delete set null,source_id uuid references public.social_sources(id)on delete set null,community text,
 date_from timestamptz,date_to timestamptz,attempt integer not null,http_status integer,error_type text not null,error_message text not null,
 retryable boolean not null,available_after timestamptz,cursor_state jsonb,created_at timestamptz not null default now()
);
create index social_provider_failures_retry_idx on public.social_provider_failures(retryable,available_after,created_at);

create table public.social_post_research_tags(
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.social_posts(id)on delete cascade,
 tag text not null check(tag in('bull_case','bear_case','valuation','catalyst_expectation','earnings','fda','contract','short_squeeze','short_interest','technical','options','momentum','offering','dilution','merger','partnership','product','sector_theme','macro','rumor','other')),
 confidence numeric not null check(confidence between 0 and 1),reason text not null,method_version text not null,created_at timestamptz not null default now(),unique(post_id,tag,method_version)
);
create index social_post_tags_tag_idx on public.social_post_research_tags(tag,confidence desc);

create table public.social_mover_relationships(
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.social_posts(id)on delete cascade,
 account_id uuid references public.social_accounts(id)on delete set null,ticker_id uuid not null references public.tickers(id)on delete cascade,
 mover_appearance_id uuid not null references public.market_mover_appearances(id)on delete cascade,mention_at timestamptz not null,mover_date date not null,
 minutes_before_move numeric,hours_before_move numeric,days_before_move numeric,
 temporal_bucket text not null check(temporal_bucket in('same_session','pre_market_same_day','after_hours_previous_day','within_24h_before','1_to_3_days_before','4_to_7_days_before','8_to_14_days_before','15_to_30_days_before','31_to_90_days_before','after_move','unknown')),
 relationship_type text not null check(relationship_type in('mentioned_before_move','mentioned_same_day','mentioned_after_move','near_move','historical_context')),
 confidence numeric not null check(confidence between 0 and 1),method_version text not null default'social-temporal-v1',created_at timestamptz not null default now(),
 unique(post_id,ticker_id,mover_appearance_id)
);
create index social_mover_appearance_idx on public.social_mover_relationships(mover_appearance_id,relationship_type,days_before_move);
create index social_mover_ticker_idx on public.social_mover_relationships(ticker_id,mover_date desc);
create index social_mover_account_idx on public.social_mover_relationships(account_id,mover_date desc);

create table public.social_catalyst_relationships(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 post_id uuid not null references public.social_posts(id)on delete cascade,event_id uuid not null references public.ticker_events(id)on delete cascade,
 post_at timestamptz not null,event_at timestamptz not null,time_difference_minutes numeric,time_difference_hours numeric,time_difference_days numeric,
 relationship_type text not null check(relationship_type in('discussion_before_catalyst','discussion_after_catalyst','discussion_same_day','discussion_near_catalyst')),
 confidence numeric not null check(confidence between 0 and 1),method_version text not null default'social-catalyst-temporal-v1',created_at timestamptz not null default now(),unique(post_id,event_id)
);
create index social_catalyst_event_idx on public.social_catalyst_relationships(event_id,relationship_type);
create index social_catalyst_ticker_idx on public.social_catalyst_relationships(ticker_id,event_at desc);

create table public.social_attention_windows(
 ticker_id uuid not null references public.tickers(id)on delete cascade,observation_at date not null,window_days integer not null check(window_days in(1,3,7,14,30)),
 mention_count integer not null,comment_count integer not null,unique_accounts integer not null,unique_communities integer not null,engagement_total numeric,
 baseline_median numeric,attention_ratio numeric,robust_z_score numeric,baseline_status text not null check(baseline_status in('available','insufficient_history')),
 unusual_attention_score numeric check(unusual_attention_score is null or unusual_attention_score between 0 and 100),scoring_version text not null default'social-attention-v2',
 calculated_at timestamptz not null default now(),primary key(ticker_id,observation_at,window_days,scoring_version)
);
create index social_attention_windows_date_idx on public.social_attention_windows(observation_at desc,window_days);

create table public.social_content_compliance_log(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.social_sources(id)on delete restrict,
 post_id uuid references public.social_posts(id)on delete set null,account_id uuid references public.social_accounts(id)on delete set null,
 action text not null check(action in('content_tombstoned','author_identity_removed','provider_revoked','retention_reviewed')),
 reason text not null,evidence jsonb not null default'{}',performed_at timestamptz not null default now()
);

create or replace function public.social_research_priority(p_reason text)returns integer language sql immutable as $$select case p_reason when'ai_search'then 100 when'manual'then 95 when'market_mover'then 90 when'catalyst_comparison'then 90 when'ticker_page'then 85 when'watchlist'then 80 when'pattern_match'then 75 when'research_workspace'then 70 when'retry'then 60 else 20 end$$;

create or replace function public.queue_social_research(p_ticker_id uuid,p_appearance_id uuid default null,p_reason text default'ticker_page',p_community text default null,p_date_from timestamptz default null,p_date_to timestamptz default null)returns uuid
language plpgsql security definer set search_path=public as $$declare qid uuid;sid uuid;ref_date date;dfrom timestamptz;dto timestamptz;begin
 if p_reason not in('ticker_page','market_mover','ai_search','watchlist','manual','historical_backfill','catalyst_comparison','pattern_match','research_workspace','retry')then raise exception'Unsupported social research reason';end if;
 select id into sid from public.social_sources where adapter_key='reddit';if sid is null then raise exception'Reddit source registry is unavailable';end if;
 if p_appearance_id is not null then select report_date into ref_date from public.market_mover_appearances where id=p_appearance_id and ticker_id=p_ticker_id;end if;
 if ref_date is null then select max(report_date)into ref_date from public.market_mover_appearances where ticker_id=p_ticker_id;end if;ref_date:=coalesce(ref_date,current_date);
 dfrom:=coalesce(p_date_from,ref_date::timestamptz-interval'30 days');dto:=coalesce(p_date_to,(ref_date+2)::timestamptz);
 if dto<dfrom or dto-dfrom>interval'93 days'then raise exception'Social research window must be 0-93 days';end if;
 select id into qid from public.social_research_queue where ticker_id=p_ticker_id and appearance_id is not distinct from p_appearance_id and source_id=sid and lower(coalesce(community,''))=lower(coalesce(p_community,''))and date_from=dfrom and date_to=dto and status in('pending','processing','deferred','rate_limited')limit 1;
 if qid is null then insert into public.social_research_queue(ticker_id,appearance_id,source_id,community,date_from,date_to,priority,reason)values(p_ticker_id,p_appearance_id,sid,nullif(lower(trim(p_community)),''),dfrom,dto,public.social_research_priority(p_reason),p_reason)returning id into qid;end if;return qid;end$$;

create or replace function public.claim_social_research_queue(p_limit integer default 1,p_queue_id uuid default null)returns setof public.social_research_queue language plpgsql security definer set search_path=public as $$begin
 update public.social_research_queue set status='pending',started_at=null where status='processing'and updated_at<now()-interval'15 minutes';
 return query with chosen as(select id from public.social_research_queue where(p_queue_id is null or id=p_queue_id)and status in('pending','deferred','rate_limited')and coalesce(available_after,'-infinity')<=now()order by priority desc,created_at limit greatest(1,least(p_limit,5))for update skip locked)
 update public.social_research_queue q set status='processing',attempts=q.attempts+1,started_at=coalesce(q.started_at,now()),updated_at=now()from chosen where q.id=chosen.id returning q.*;end$$;

create or replace function public.finish_social_research_queue(p_queue_id uuid,p_status text,p_coverage_status text,p_posts integer,p_comments integer,p_accounts integer,p_cursor_state jsonb default null,p_error text default null,p_available_after timestamptz default null)returns jsonb language plpgsql security definer set search_path=public as $$begin
 if p_status not in('completed','partial','rate_limited','not_available','deferred','failed','cancelled')then raise exception'Unsupported queue completion status';end if;
 update public.social_research_queue set status=p_status,coverage_status=p_coverage_status,posts_found=greatest(0,coalesce(p_posts,0)),comments_found=greatest(0,coalesce(p_comments,0)),accounts_found=greatest(0,coalesce(p_accounts,0)),cursor_state=p_cursor_state,last_error=p_error,available_after=p_available_after,completed_at=case when p_status in('completed','partial','not_available','failed','cancelled')then now()else null end,updated_at=now()where id=p_queue_id;
 return jsonb_build_object('id',p_queue_id,'status',p_status,'coverage_status',p_coverage_status);end$$;

create or replace function public.reserve_social_provider_request(p_provider text,p_daily_budget integer default 100)returns boolean language plpgsql security definer set search_path=public as $$declare used integer;begin
 insert into public.social_provider_daily_usage(provider,usage_date)values(p_provider,current_date)on conflict do nothing;
 select requests_reserved into used from public.social_provider_daily_usage where provider=p_provider and usage_date=current_date for update;
 if used>=greatest(1,least(p_daily_budget,10000))then return false;end if;
 update public.social_provider_daily_usage set requests_reserved=requests_reserved+1,updated_at=now()where provider=p_provider and usage_date=current_date;return true;end$$;

create or replace function public.record_social_provider_request(p_provider text,p_outcome text,p_cache_hit boolean default false)returns void language plpgsql security definer set search_path=public as $$begin
 insert into public.social_provider_daily_usage(provider,usage_date)values(p_provider,current_date)on conflict do nothing;
 update public.social_provider_daily_usage set requests_succeeded=requests_succeeded+case when not p_cache_hit and p_outcome='success'then 1 else 0 end,requests_failed=requests_failed+case when not p_cache_hit and p_outcome='failed'then 1 else 0 end,requests_rate_limited=requests_rate_limited+case when not p_cache_hit and p_outcome='rate_limited'then 1 else 0 end,cache_hits=cache_hits+case when p_cache_hit then 1 else 0 end,cache_misses=cache_misses+case when not p_cache_hit then 1 else 0 end,updated_at=now()where provider=p_provider and usage_date=current_date;end$$;

create or replace function public.retry_failed_social_research(p_limit integer default 25)returns integer language plpgsql security definer set search_path=public as $$declare changed integer;begin
 with chosen as(select id from public.social_research_queue where status='failed'order by updated_at limit greatest(1,least(p_limit,50))for update skip locked)update public.social_research_queue q set status='pending',available_after=null,completed_at=null,updated_at=now()from chosen where q.id=chosen.id;get diagnostics changed=row_count;return changed;end$$;

create or replace function public.queue_social_research_selection(p_selection text,p_ticker_ids uuid[]default null,p_appearance_id uuid default null,p_watchlist_id uuid default null,p_limit integer default 25,p_community text default null)returns jsonb language plpgsql security definer set search_path=public as $$declare ids uuid[];tid uuid;queued uuid[]:='{}';safe_limit integer:=greatest(1,least(p_limit,50));begin
 if p_selection in('selected_tickers','ticker_ids')then ids:=p_ticker_ids;
 elsif p_selection='selected_mover'then select array_agg(ticker_id)into ids from public.market_mover_appearances where id=p_appearance_id;
 elsif p_selection='watchlist'then select array_agg(distinct ticker_id)into ids from public.watchlist_entities where watchlist_id=p_watchlist_id and entity_type='ticker';
 elsif p_selection='recent_movers'then select array_agg(ticker_id)into ids from(select ticker_id from public.market_mover_appearances group by ticker_id order by max(report_date)desc limit safe_limit)x;
 elsif p_selection='top_frequent'then select array_agg(ticker_id)into ids from(select ticker_id from public.market_mover_appearances group by ticker_id order by count(*)desc limit safe_limit)x;
 else raise exception'Unsupported selective social research scope';end if;
 if coalesce(cardinality(ids),0)=0 then return jsonb_build_object('queued',0,'queue_ids','[]'::jsonb);end if;
 foreach tid in array ids[1:safe_limit]loop queued:=array_append(queued,public.queue_social_research(tid,case when p_selection='selected_mover'then p_appearance_id else null end,case when p_selection='watchlist'then'watchlist'when p_selection='selected_mover'then'market_mover'else'historical_backfill'end,p_community));end loop;
 return jsonb_build_object('queued',cardinality(queued),'queue_ids',to_jsonb(queued),'selection',p_selection);end$$;

create or replace function public.rebuild_phase2c_social_derivatives(p_ticker_ids uuid[]default null)returns jsonb language plpgsql security definer set search_path=public as $$declare movers integer;catrels integer;attention integer;begin
 delete from public.social_mover_relationships where p_ticker_ids is null or ticker_id=any(p_ticker_ids);
 insert into public.social_mover_relationships(post_id,account_id,ticker_id,mover_appearance_id,mention_at,mover_date,minutes_before_move,hours_before_move,days_before_move,temporal_bucket,relationship_type,confidence)
 select p.id,p.account_id,pt.ticker_id,m.id,p.posted_at,m.report_date,
  case when p.posted_at::date=m.report_date then null else extract(epoch from(m.report_date::timestamptz-p.posted_at))/60 end,
  case when p.posted_at::date=m.report_date then null else extract(epoch from(m.report_date::timestamptz-p.posted_at))/3600 end,
  (m.report_date-p.posted_at::date)::numeric,
  case when p.posted_at::date=m.report_date then'unknown'when p.posted_at<m.report_date::timestamptz and m.report_date::timestamptz-p.posted_at<=interval'24 hours'then'within_24h_before'when m.report_date-p.posted_at::date between 1 and 3 then'1_to_3_days_before'when m.report_date-p.posted_at::date between 4 and 7 then'4_to_7_days_before'when m.report_date-p.posted_at::date between 8 and 14 then'8_to_14_days_before'when m.report_date-p.posted_at::date between 15 and 30 then'15_to_30_days_before'when m.report_date-p.posted_at::date between 31 and 90 then'31_to_90_days_before'when p.posted_at::date>m.report_date then'after_move'else'unknown'end,
  case when p.posted_at::date<m.report_date then'mentioned_before_move'when p.posted_at::date=m.report_date then'mentioned_same_day'else'mentioned_after_move'end,
  case when p.posted_at::date=m.report_date then.75 else.95 end
 from public.post_tickers pt join public.social_posts p on p.id=pt.post_id join public.market_mover_appearances m on m.ticker_id=pt.ticker_id
 where p.posted_at is not null and p.availability_status in('active','available')and(p_ticker_ids is null or pt.ticker_id=any(p_ticker_ids))and p.posted_at::date between m.report_date-90 and m.report_date+2;
 get diagnostics movers=row_count;
 delete from public.social_catalyst_relationships where p_ticker_ids is null or ticker_id=any(p_ticker_ids);
 insert into public.social_catalyst_relationships(ticker_id,post_id,event_id,post_at,event_at,time_difference_minutes,time_difference_hours,time_difference_days,relationship_type,confidence)
 select pt.ticker_id,p.id,e.id,p.posted_at,coalesce(e.published_at,e.event_date),extract(epoch from(coalesce(e.published_at,e.event_date)-p.posted_at))/60,extract(epoch from(coalesce(e.published_at,e.event_date)-p.posted_at))/3600,extract(epoch from(coalesce(e.published_at,e.event_date)-p.posted_at))/86400,
 case when p.posted_at::date=coalesce(e.published_at,e.event_date)::date then'discussion_same_day'when p.posted_at<coalesce(e.published_at,e.event_date)then'discussion_before_catalyst'else'discussion_after_catalyst'end,
 case when e.published_at is null then.8 else.95 end
 from public.post_tickers pt join public.social_posts p on p.id=pt.post_id join public.ticker_events e on e.ticker_id=pt.ticker_id
 where p.posted_at is not null and p.availability_status in('active','available')and e.event_status not in('duplicate','excluded','failed')and(p_ticker_ids is null or pt.ticker_id=any(p_ticker_ids))and abs(extract(epoch from(coalesce(e.published_at,e.event_date)-p.posted_at))/86400)<=90;
 get diagnostics catrels=row_count;
 delete from public.social_attention_windows where p_ticker_ids is null or ticker_id=any(p_ticker_ids);
 insert into public.social_attention_windows(ticker_id,observation_at,window_days,mention_count,comment_count,unique_accounts,unique_communities,engagement_total,baseline_median,attention_ratio,robust_z_score,baseline_status,unusual_attention_score)
 select m.ticker_id,m.report_date,w.days,count(distinct p.id)::integer,count(distinct p.id)filter(where p.post_type in('comment','reply'))::integer,count(distinct p.account_id)::integer,count(distinct p.community_id)::integer,
  case when count(p.id)filter(where p.score is not null or p.comments is not null or p.upvotes is not null)>0 then sum(coalesce(p.score,p.upvotes,0)+coalesce(p.comments,0))end,
  b.baseline_median,case when b.baseline_median>0 then round((count(distinct p.id)/b.baseline_median)::numeric,4)end,case when b.baseline_mad>0 then round(((count(distinct p.id)-b.baseline_median)/(1.4826*b.baseline_mad))::numeric,4)end,
  case when b.baseline_days>=3 then'available'else'insufficient_history'end,
  case when b.baseline_days<3 then null when b.baseline_median=0 then case when count(distinct p.id)>0 then 100 else 0 end else least(100,greatest(0,round(((count(distinct p.id)/b.baseline_median)-1)*25,2)))end
 from(select distinct ticker_id,report_date from public.market_mover_appearances where p_ticker_ids is null or ticker_id=any(p_ticker_ids))m cross join(values(1),(3),(7),(14),(30))w(days)
 left join public.post_tickers pt on pt.ticker_id=m.ticker_id left join public.social_posts p on p.id=pt.post_id and p.posted_at>=m.report_date::timestamptz-(w.days||' days')::interval and p.posted_at<m.report_date::timestamptz and p.availability_status in('active','available')
 left join lateral(with x as(select d::date,count(distinct p2.id)::numeric n from generate_series(m.report_date-w.days*4,m.report_date-w.days-1,interval'1 day')d left join public.post_tickers pt2 on pt2.ticker_id=m.ticker_id left join public.social_posts p2 on p2.id=pt2.post_id and p2.posted_at::date=d::date and p2.availability_status in('active','available')where exists(select 1 from public.ticker_social_coverage cov where cov.ticker_id=m.ticker_id and cov.coverage_status='complete_for_provider_window'and d::timestamptz between cov.date_from and cov.date_to)group by d),med as(select percentile_cont(.5)within group(order by n)::numeric baseline_median from x)select med.baseline_median,count(*)::integer baseline_days,percentile_cont(.5)within group(order by abs(x.n-med.baseline_median))::numeric baseline_mad from x cross join med group by med.baseline_median)b on true
 group by m.ticker_id,m.report_date,w.days,b.baseline_median,b.baseline_days,b.baseline_mad;
 get diagnostics attention=row_count;return jsonb_build_object('mover_relationships',movers,'catalyst_relationships',catrels,'attention_windows',attention,'methodology_versions',jsonb_build_array('social-temporal-v1','social-catalyst-temporal-v1','social-attention-v2'));end$$;

create or replace function public.tombstone_reddit_content(p_post_id uuid,p_state text,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$declare sid uuid;rid uuid;begin
 if p_state not in('deleted','removed','unavailable')then raise exception'Unsupported tombstone state';end if;select source_id,raw_record_id into sid,rid from public.social_posts where id=p_post_id for update;if sid is null then raise exception'Post not found';end if;
 update public.social_posts set title=null,body=null,post_url=null,permalink=null,raw_payload=null,provider_metadata='{}',availability_status=p_state,compliance_checked_at=now(),updated_at=now()where id=p_post_id;
 if rid is not null then update public.social_raw_records set raw_text=null,raw_payload=null,source_url=null where id=rid;end if;
 insert into public.social_content_compliance_log(source_id,post_id,action,reason,evidence)values(sid,p_post_id,'content_tombstoned',p_reason,jsonb_build_object('state',p_state));return jsonb_build_object('post_id',p_post_id,'state',p_state);end$$;

create or replace function public.tombstone_reddit_account(p_account_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$declare sid uuid;begin
 select source_id into sid from public.social_accounts where id=p_account_id for update;if sid is null then raise exception'Account not found';end if;
 update public.social_posts set account_id=null where account_id=p_account_id;
 update public.social_accounts set username='[deleted]-'||id,display_name=null,profile_url=null,external_account_id=null,account_metadata=null,provider_metadata='{}',followers=null,is_deleted=true,account_status='deleted',last_verified_at=now()where id=p_account_id;
 insert into public.social_content_compliance_log(source_id,account_id,action,reason)values(sid,p_account_id,'author_identity_removed',p_reason);return jsonb_build_object('account_id',p_account_id,'status','deleted');end$$;

create or replace function public.revoke_social_provider(p_source_id uuid,p_reason text,p_remove_content boolean default false)returns jsonb language plpgsql security definer set search_path=public as $$declare posts_changed integer:=0;accounts_changed integer:=0;begin
 if trim(coalesce(p_reason,''))=''then raise exception'Provider revocation reason is required';end if;
 update public.social_sources set ingestion_enabled=false,provider_status='unavailable',provider_status_reason=p_reason,last_error=p_reason,updated_at=now()where id=p_source_id;
 update public.social_research_queue set status='cancelled',last_error='Provider revoked: '||p_reason,completed_at=now(),updated_at=now()where source_id=p_source_id and status in('pending','processing','deferred','rate_limited');
 if p_remove_content then
  update public.social_raw_records set raw_text=null,raw_payload=null,source_url=null where source_id=p_source_id;get diagnostics posts_changed=row_count;
  update public.social_posts set title=null,body=null,post_url=null,permalink=null,raw_payload=null,provider_metadata='{}',availability_status='unavailable',compliance_checked_at=now(),updated_at=now()where source_id=p_source_id;get diagnostics posts_changed=row_count;
  update public.social_accounts set username='unavailable-'||id::text,display_name=null,profile_url=null,account_metadata=null,provider_metadata='{}',account_status='unavailable',is_deleted=true,updated_at=now()where source_id=p_source_id;get diagnostics accounts_changed=row_count;
 end if;
 insert into public.social_content_compliance_log(source_id,action,reason,evidence)values(p_source_id,'provider_revoked',p_reason,jsonb_build_object('content_removed',p_remove_content,'posts_changed',posts_changed,'accounts_changed',accounts_changed));
 return jsonb_build_object('source_id',p_source_id,'status','unavailable','content_removed',p_remove_content,'posts_changed',posts_changed,'accounts_changed',accounts_changed);end$$;

create or replace view public.social_mover_relationship_detail with(security_invoker=true)as
select r.*,t.symbol,c.name category_name,c.category_type,c.exchange,m.rank,m.change_percent,m.volume,p.title,p.body,p.post_url,p.post_type,p.availability_status,p.score,p.comments,
 a.username,s.name source,sc.name community,so.sentiment,so.sentiment_score,so.confidence_score sentiment_confidence,so.model_version sentiment_version
from public.social_mover_relationships r join public.tickers t on t.id=r.ticker_id join public.market_mover_appearances m on m.id=r.mover_appearance_id join public.market_categories c on c.id=m.category_id
join public.social_posts p on p.id=r.post_id left join public.social_accounts a on a.id=r.account_id join public.social_sources s on s.id=p.source_id left join public.social_communities sc on sc.id=p.community_id
left join lateral(select x.sentiment,x.sentiment_score,x.confidence_score,x.model_version from public.sentiment_observations x where x.post_id=p.id and x.ticker_id=r.ticker_id order by x.created_at desc limit 1)so on true;

create or replace view public.social_catalyst_relationship_detail with(security_invoker=true)as
select r.*,t.symbol,p.title,p.body,p.post_url,p.availability_status,p.post_type,p.score,p.comments,a.username,s.name source,sc.name community,
 e.event_type,e.event_subtype,e.normalized_headline catalyst_headline,e.source_url catalyst_source_url,e.sec_form_type
from public.social_catalyst_relationships r join public.tickers t on t.id=r.ticker_id join public.social_posts p on p.id=r.post_id left join public.social_accounts a on a.id=p.account_id
join public.social_sources s on s.id=p.source_id left join public.social_communities sc on sc.id=p.community_id join public.ticker_events e on e.id=r.event_id;

create or replace view public.social_analytics_summary with(security_invoker=true)as
select count(distinct c.ticker_id)filter(where c.coverage_status<>'not_researched')::bigint researched_tickers,
 (select count(*)from public.social_posts where post_type not in('comment','reply'))::bigint posts_ingested,(select count(*)from public.social_posts where post_type in('comment','reply'))::bigint comments_ingested,
 (select count(*)from public.social_accounts)::bigint accounts_observed,(select count(*)from public.post_tickers)::bigint ticker_mentions,
 (select count(*)from public.social_mover_relationships where relationship_type='mentioned_before_move')::bigint pre_move_mentions,
 (select count(*)from public.social_mover_relationships where relationship_type='mentioned_after_move')::bigint post_move_mentions,
 count(distinct lower(c.community))filter(where c.community is not null)::bigint communities_researched,
 count(*)filter(where c.coverage_status='complete_for_provider_window')::bigint complete_coverage,count(*)filter(where c.coverage_status in('partial','rate_limited'))::bigint partial_or_limited_coverage,
 count(*)filter(where c.coverage_status='not_researched')::bigint not_researched_coverage from public.ticker_social_coverage c;

create or replace view public.social_pre_move_analytics_universe with(security_invoker=true)as
select count(distinct m.id)::bigint total_mover_appearances,
 count(distinct m.id)filter(where cov.coverage_status='complete_for_provider_window')::bigint adequately_researched_appearances,
 count(distinct m.id)filter(where cov.coverage_status='complete_for_provider_window'and exists(select 1 from public.social_mover_relationships r where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move'))::bigint appearances_with_pre_move_social,
 count(distinct m.id)filter(where cov.coverage_status='complete_for_provider_window'and not exists(select 1 from public.social_mover_relationships r where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move'))::bigint adequately_researched_without_identified_social,
 percentile_cont(.5)within group(order by first_social.days_before_move)filter(where cov.coverage_status='complete_for_provider_window')median_days_from_earliest_known_mention,
 count(distinct m.id)filter(where cov.coverage_status in('partial','rate_limited','not_available','failed'))::bigint limited_coverage_appearances
from public.market_mover_appearances m left join lateral(select c.coverage_status from public.ticker_social_coverage c where c.ticker_id=m.ticker_id and m.report_date::timestamptz between c.date_from and c.date_to order by c.last_researched_at desc nulls last limit 1)cov on true
left join lateral(select max(r.days_before_move)days_before_move from public.social_mover_relationships r where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move')first_social on true;

create or replace view public.social_pre_move_sentiment_distribution with(security_invoker=true)as
select d.sentiment,count(*)::bigint mentions,count(distinct d.mover_appearance_id)::bigint mover_appearances from public.social_mover_relationship_detail d
where d.relationship_type='mentioned_before_move'and exists(select 1 from public.ticker_social_coverage c where c.ticker_id=d.ticker_id and d.mover_date::timestamptz between c.date_from and c.date_to and c.coverage_status='complete_for_provider_window')group by d.sentiment;
create or replace view public.social_pre_move_community_distribution with(security_invoker=true)as
select coalesce(d.community,'Unknown')community,count(*)::bigint mentions,count(distinct d.mover_appearance_id)::bigint mover_appearances from public.social_mover_relationship_detail d
where d.relationship_type='mentioned_before_move'and exists(select 1 from public.ticker_social_coverage c where c.ticker_id=d.ticker_id and d.mover_date::timestamptz between c.date_from and c.date_to and c.coverage_status='complete_for_provider_window')group by d.community;
create or replace view public.social_pre_move_attention_distribution with(security_invoker=true)as
select case when a.baseline_status='insufficient_history'then'insufficient_baseline'when a.unusual_attention_score>=70 then'high'when a.unusual_attention_score>=40 then'elevated'when a.unusual_attention_score is null then'unavailable'else'normal'end attention_band,count(*)::bigint observations,count(distinct a.ticker_id)::bigint tickers
from public.social_attention_windows a where exists(select 1 from public.ticker_social_coverage c where c.ticker_id=a.ticker_id and a.observation_at::timestamptz between c.date_from and c.date_to and c.coverage_status='complete_for_provider_window')group by 1;

create or replace view public.social_catalyst_analytics with(security_invoker=true)as
select count(*)filter(where relationship_type='discussion_before_catalyst')::bigint social_before_catalyst,count(*)filter(where relationship_type='discussion_after_catalyst')::bigint catalyst_before_social,
 count(*)filter(where relationship_type='discussion_same_day')::bigint same_day,count(distinct ticker_id)::bigint tickers,count(distinct post_id)::bigint posts,count(distinct event_id)::bigint catalysts from public.social_catalyst_relationships;

create or replace view public.social_mover_context with(security_invoker=true)as
select m.id appearance_id,m.ticker_id,t.symbol,m.report_date,c.name category_name,c.category_type,
 cov.coverage_status,cov.limitations,cov.last_researched_at,
 coalesce(s.pre_move_mentions,0)::bigint pre_move_mentions,coalesce(s.unique_accounts,0)::bigint unique_accounts,coalesce(s.communities,0)::bigint communities,s.earliest_known_mention,s.first_known_bullish_mention,s.first_known_bearish_mention,s.first_known_high_attention_mention,s.earliest_days_before_move,
 case when cov.coverage_status is null or cov.coverage_status='not_researched'then'not_researched'when cov.coverage_status<>'complete_for_provider_window'then'coverage_incomplete'
 when coalesce(s.pre_move_mentions,0)>0 and exists(select 1 from public.event_mover_relationships e where e.appearance_id=m.id)then'social_and_catalyst_before_mover'
 when coalesce(s.pre_move_mentions,0)>0 then'social_attention_present_no_identified_catalyst'
 when exists(select 1 from public.event_mover_relationships e where e.appearance_id=m.id)then'catalyst_identified_little_or_no_researched_social'
 else'no_identified_social_or_catalyst_in_researched_sources'end context_state
from public.market_mover_appearances m join public.tickers t on t.id=m.ticker_id join public.market_categories c on c.id=m.category_id
left join lateral(select x.coverage_status,x.limitations,x.last_researched_at from public.ticker_social_coverage x where x.ticker_id=m.ticker_id and m.report_date::timestamptz between x.date_from and x.date_to order by x.last_researched_at desc nulls last limit 1)cov on true
left join lateral(select count(*)pre_move_mentions,count(distinct r.account_id)unique_accounts,count(distinct p.community_id)communities,min(r.mention_at)earliest_known_mention,
 min(r.mention_at)filter(where exists(select 1 from public.sentiment_observations so where so.post_id=r.post_id and so.ticker_id=r.ticker_id and so.sentiment in('bullish','very_bullish')))first_known_bullish_mention,
 min(r.mention_at)filter(where exists(select 1 from public.sentiment_observations so where so.post_id=r.post_id and so.ticker_id=r.ticker_id and so.sentiment in('bearish','very_bearish')))first_known_bearish_mention,
 min(r.mention_at)filter(where exists(select 1 from public.ticker_attention_observations a where a.ticker_id=r.ticker_id and a.period_type='daily'and a.period_start::date=r.mention_at::date and a.unusual_attention_score>=70))first_known_high_attention_mention,
 max(r.days_before_move)earliest_days_before_move from public.social_mover_relationships r join public.social_posts p on p.id=r.post_id where r.mover_appearance_id=m.id and r.relationship_type='mentioned_before_move')s on true;

create or replace view public.social_catalyst_analytics with(security_invoker=true)as
select count(*)filter(where relationship_type='discussion_before_catalyst')::bigint social_before_catalyst,count(*)filter(where relationship_type='discussion_after_catalyst')::bigint catalyst_before_social,
 count(*)filter(where relationship_type='discussion_same_day')::bigint same_day,count(distinct ticker_id)::bigint tickers,count(distinct post_id)::bigint posts,count(distinct event_id)::bigint catalysts,
 (select count(*)from public.social_mover_context where context_state='social_and_catalyst_before_mover')::bigint social_and_catalyst_before_mover,
 (select count(*)from public.social_mover_context where context_state='social_attention_present_no_identified_catalyst')::bigint social_before_mover_without_identified_catalyst,
 (select count(*)from public.social_mover_context where context_state='catalyst_identified_little_or_no_researched_social')::bigint catalyst_before_mover_without_researched_social,
 (select count(*)from public.social_mover_context where context_state='coverage_incomplete')::bigint coverage_incomplete
from public.social_catalyst_relationships;

create or replace view public.repeat_account_ticker_relationships with(security_invoker=true)as
select ats.*,a.username,s.name platform,t.symbol,count(distinct r.mover_appearance_id)::bigint associated_movers,min(r.mention_at)first_early_mention,max(r.mention_at)last_early_mention
from public.account_ticker_statistics ats join public.social_accounts a on a.id=ats.account_id join public.social_sources s on s.id=a.source_id join public.tickers t on t.id=ats.ticker_id
left join public.social_mover_relationships r on r.account_id=ats.account_id and r.ticker_id=ats.ticker_id and r.relationship_type='mentioned_before_move'
group by ats.account_id,ats.ticker_id,a.username,s.name,t.symbol;

create or replace view public.social_provider_analytics with(security_invoker=true)as
select s.id source_id,s.name,s.provider_status,s.provider_status_reason,s.last_successful_sync_at,s.last_attempted_sync_at,s.last_error,
 s.last_rate_limit_used,s.last_rate_limit_remaining,s.last_rate_limit_reset_seconds,s.last_rate_limit_observed_at,
 coalesce((select sum(requests_reserved)from public.social_provider_daily_usage u where u.provider=coalesce(s.adapter_key,s.name)and u.usage_date=current_date),0)::bigint requests_today,
 coalesce((select sum(cache_hits)from public.social_provider_daily_usage u where u.provider=coalesce(s.adapter_key,s.name)and u.usage_date=current_date),0)::bigint cache_hits_today,
 coalesce((select sum(cache_misses)from public.social_provider_daily_usage u where u.provider=coalesce(s.adapter_key,s.name)and u.usage_date=current_date),0)::bigint cache_misses_today,
 (select count(*)from public.social_posts p where p.source_id=s.id)::bigint records_stored from public.social_sources s;

create or replace view public.social_research_management with(security_invoker=true)as
select count(*)filter(where status='pending')::bigint pending,count(*)filter(where status='processing')::bigint processing,
 count(*)filter(where status in('completed','partial')and completed_at::date=current_date)::bigint completed_today,
 count(*)filter(where status='failed'and completed_at::date=current_date)::bigint failed_today,count(*)filter(where status in('rate_limited','deferred'))::bigint deferred_or_limited,
 coalesce((select sum(posts_inserted+posts_updated+comments_inserted)from public.social_provider_runs where completed_at::date=current_date),0)::bigint records_ingested_today from public.social_research_queue;
create or replace view public.social_compliance_due with(security_invoker=true)as
select p.id post_id,p.source_id,p.external_post_id,p.post_type,p.retrieved_at,p.compliance_checked_at,s.retention_hours,
 coalesce(p.compliance_checked_at,p.retrieved_at,p.created_at)+make_interval(hours=>s.retention_hours)review_due_at
from public.social_posts p cross join public.social_research_settings s where p.availability_status in('active','available')and coalesce(p.compliance_checked_at,p.retrieved_at,p.created_at)+make_interval(hours=>s.retention_hours)<=now();

create or replace view public.social_combined_timeline with(security_invoker=true)as
select p.ticker_id,p.occurred_at,p.entry_type,p.record_id,p.title,p.route,p.source,p.temporal_precision,p.evidence from(
 select pt.ticker_id,sp.posted_at occurred_at,'social_post'::text entry_type,sp.id record_id,coalesce(sp.title,left(sp.body,160),'Unavailable social content')title,'/social/posts/'||sp.id route,ss.name source,'timestamp'::text temporal_precision,jsonb_build_object('community',sc.name,'availability',sp.availability_status,'post_type',sp.post_type)evidence from public.post_tickers pt join public.social_posts sp on sp.id=pt.post_id join public.social_sources ss on ss.id=sp.source_id left join public.social_communities sc on sc.id=sp.community_id where sp.posted_at is not null
 union all select e.ticker_id,coalesce(e.published_at,e.event_date),'public_catalyst',e.id,coalesce(e.normalized_headline,e.headline,e.event_type::text),'/events/'||e.id,coalesce(e.source_name,'Public event'),case when e.published_at is null then'date_or_source_precision'else'timestamp'end,jsonb_build_object('event_type',e.event_type,'event_subtype',e.event_subtype,'sec_form',e.sec_form_type)from public.ticker_events e where e.event_status not in('duplicate','excluded','failed')
 union all select m.ticker_id,m.report_date::timestamptz,'market_mover',m.id,t.symbol||' · '||c.name,'/market-movers/'||m.id,'Scanz','date',jsonb_build_object('category',c.name,'change_percent',m.change_percent,'data_mode','raw')from public.market_mover_appearances m join public.tickers t on t.id=m.ticker_id join public.market_categories c on c.id=m.category_id)p;

create or replace function public.refresh_social_search_documents(p_ticker_ids uuid[]default null)returns integer language plpgsql security definer set search_path=public as $$declare changed integer;begin
 delete from public.research_search_documents d where d.domain='social_post'and(p_ticker_ids is null or d.ticker_id=any(p_ticker_ids));
 insert into public.research_search_documents(domain,record_id,title,content,route,ticker_id,account_id,observation_date,source_table,methodology_version,evidence,updated_at)
 select'social_post',p.id,coalesce(p.title,'Social post'),left(concat_ws(' ',p.title,p.body,t.symbol,sc.name),4000),'/social/posts/'||p.id,pt.ticker_id,p.account_id,p.posted_at::date,'social_posts','ticker-mention-v2',jsonb_build_object('source',s.name,'community',sc.name,'availability',p.availability_status),now()
 from public.social_posts p join public.post_tickers pt on pt.post_id=p.id join public.tickers t on t.id=pt.ticker_id join public.social_sources s on s.id=p.source_id left join public.social_communities sc on sc.id=p.community_id
 where p.availability_status in('active','available')and(p_ticker_ids is null or pt.ticker_id=any(p_ticker_ids))on conflict(domain,record_id)do update set title=excluded.title,content=excluded.content,route=excluded.route,ticker_id=excluded.ticker_id,account_id=excluded.account_id,observation_date=excluded.observation_date,methodology_version=excluded.methodology_version,evidence=excluded.evidence,updated_at=now();get diagnostics changed=row_count;return changed;end$$;

create or replace function public.execute_social_research_query(p_intent text,p_filters jsonb default'{}',p_limit integer default 50)returns jsonb language plpgsql stable security definer set search_path=public as $$declare f jsonb:=coalesce(p_filters,'{}');lim integer:=greatest(1,least(p_limit,200));symbols text[];records jsonb:='[]';tables text[];begin
 if p_intent not in('reddit_before_move','wallstreetbets_before_move','social_before_catalyst','social_after_catalyst','accounts_before_move','sentiment_before_move','attention_before_move','community_comparison','repeat_account_ticker','social_without_identified_catalyst')then raise exception'Unsupported social research intent';end if;
 select array_agg(upper(value))into symbols from jsonb_array_elements_text(coalesce(f->'tickers','[]'));
 if p_intent in('social_before_catalyst','social_after_catalyst')then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select d.*,'Reddit discussion is social evidence; the linked catalyst is separate primary/public-event evidence. Timing does not establish prediction or causation.'why,jsonb_build_array(jsonb_build_object('type','social_post','id',d.post_id,'route','/social/posts/'||d.post_id,'source_table','social_posts'),jsonb_build_object('type','event','id',d.event_id,'route','/events/'||d.event_id,'source_table','ticker_events'))citations from public.social_catalyst_relationship_detail d where d.relationship_type=case when p_intent='social_before_catalyst'then'discussion_before_catalyst'else'discussion_after_catalyst'end and(symbols is null or d.symbol=any(symbols))order by d.event_at desc limit lim)x;tables:=array['social_catalyst_relationships','social_posts','ticker_events','ticker_social_coverage'];
 elsif p_intent='repeat_account_ticker'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select r.*,'Repeated observed account/ticker history; this does not label the account as a promoter or establish predictive ability.'why,jsonb_build_array(jsonb_build_object('type','account','id',r.account_id,'route','/promoters/'||r.account_id,'source_table','social_accounts'))citations from public.repeat_account_ticker_relationships r where(symbols is null or r.symbol=any(symbols))and r.total_mentions>1 order by r.pre_mover_mentions desc,r.total_mentions desc limit lim)x;tables:=array['account_ticker_statistics','social_mover_relationships','social_accounts'];
 elsif p_intent='social_without_identified_catalyst'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select c.*,'Social attention was observed in qualifying researched coverage; no public catalyst was identified in the separately recorded catalyst coverage.'why,jsonb_build_array(jsonb_build_object('type','market_mover','id',c.appearance_id,'route','/market-movers/'||c.appearance_id,'source_table','market_mover_appearances'))citations from public.social_mover_context c where c.context_state='social_attention_present_no_identified_catalyst'and(symbols is null or c.symbol=any(symbols))order by c.report_date desc limit lim)x;tables:=array['social_mover_context','ticker_social_coverage','ticker_catalyst_coverage'];
 elsif p_intent='attention_before_move'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select a.*,t.symbol,'Attention is calculated only from observations available before the mover date; insufficient baselines remain unavailable.'why,jsonb_build_array(jsonb_build_object('type','ticker','id',a.ticker_id,'route','/tickers/'||t.symbol,'source_table','social_attention_windows'))citations from public.social_attention_windows a join public.tickers t on t.id=a.ticker_id where(symbols is null or t.symbol=any(symbols))order by a.observation_at desc,a.window_days limit lim)x;tables:=array['social_attention_windows','ticker_social_coverage'];
 elsif p_intent='community_comparison'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select d.community,count(*)::bigint mentions,count(distinct d.post_id)::bigint posts,count(distinct d.ticker_id)::bigint tickers,'Counts are limited to ingested records and recorded provider coverage.'why,'[]'::jsonb citations from public.social_mover_relationship_detail d where(symbols is null or d.symbol=any(symbols))group by d.community order by mentions desc limit lim)x;tables:=array['social_mover_relationships','social_communities','ticker_social_coverage'];
 else
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select d.*,'First/early means first known within recorded provider coverage. Temporal order does not establish causation or predictive power.'why,jsonb_build_array(jsonb_build_object('type','social_post','id',d.post_id,'route','/social/posts/'||d.post_id,'source_table','social_posts'),jsonb_build_object('type','market_mover','id',d.mover_appearance_id,'route','/market-movers/'||d.mover_appearance_id,'source_table','market_mover_appearances'))citations from public.social_mover_relationship_detail d where d.relationship_type='mentioned_before_move'and(symbols is null or d.symbol=any(symbols))and(p_intent<>'wallstreetbets_before_move'or lower(d.community)='wallstreetbets')and(p_intent<>'sentiment_before_move'or d.sentiment is not null)order by d.mover_date desc,d.days_before_move desc limit lim)x;tables:=array['social_mover_relationships','social_posts','sentiment_observations','ticker_social_coverage'];
 end if;
 return jsonb_build_object('intent',p_intent,'records',records,'record_count',jsonb_array_length(records),'tables',to_jsonb(tables),'methodology_versions',jsonb_build_array('ticker-mention-v2','rules-v1','social-temporal-v1','social-attention-v2'),'limitations',jsonb_build_array('Results include only explicitly researched Reddit provider windows and stored records.','Reddit API search is not represented as exhaustive historical coverage unless the recorded provider status supports that claim.','Social discussion is user-generated evidence and is distinct from verified public-catalyst evidence.','Temporal association does not establish causation, prediction, or investment merit.'),'executed_at',now());end$$;

do $$declare t text;begin foreach t in array array['social_research_settings','ticker_social_coverage','social_post_research_tags','social_mover_relationships','social_catalyst_relationships','social_attention_windows','social_content_compliance_log']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon,authenticated using(true)',t);end loop;end$$;
do $$declare t text;begin foreach t in array array['social_research_queue','social_provider_cache','social_provider_daily_usage','social_provider_runs','social_provider_failures']loop execute format('alter table public.%I enable row level security',t);end loop;end$$;

do $$declare signature text;begin foreach signature in array array[
 'queue_social_research(uuid,uuid,text,text,timestamptz,timestamptz)','claim_social_research_queue(integer,uuid)',
 'finish_social_research_queue(uuid,text,text,integer,integer,integer,jsonb,text,timestamptz)','reserve_social_provider_request(text,integer)',
 'record_social_provider_request(text,text,boolean)','retry_failed_social_research(integer)','queue_social_research_selection(text,uuid[],uuid,uuid,integer,text)',
 'rebuild_phase2c_social_derivatives(uuid[])','tombstone_reddit_content(uuid,text,text)','tombstone_reddit_account(uuid,text)',
 'revoke_social_provider(uuid,text,boolean)',
 'refresh_social_search_documents(uuid[])'
 ]loop execute format('revoke all on function public.%s from public,anon,authenticated',signature);execute format('grant execute on function public.%s to service_role',signature);end loop;end$$;
revoke all on function public.execute_social_research_query(text,jsonb,integer)from public,anon,authenticated;
grant execute on function public.execute_social_research_query(text,jsonb,integer)to service_role;

create trigger social_research_settings_updated before update on public.social_research_settings for each row execute function public.set_updated_at();
create trigger social_research_queue_updated before update on public.social_research_queue for each row execute function public.set_updated_at();
create trigger ticker_social_coverage_updated before update on public.ticker_social_coverage for each row execute function public.set_updated_at();
create trigger social_provider_cache_updated before update on public.social_provider_cache for each row execute function public.set_updated_at();
