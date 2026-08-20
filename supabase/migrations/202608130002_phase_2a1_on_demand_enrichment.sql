-- Phase 2A.1: cache-first, selective, on-demand metadata enrichment.
-- This migration adds only derived/reference scheduling data. Raw Scanz observations remain unchanged.

alter table public.tickers drop constraint tickers_enrichment_status_check;
alter table public.tickers
 add constraint tickers_enrichment_status_check check(enrichment_status in('pending','queued','enriching','enriched','complete','partial','failed','stale','not_found','skipped')),
 add column metadata_version text,
 add column next_metadata_refresh_at timestamptz,
 add column metadata_refresh_attempts integer not null default 0 check(metadata_refresh_attempts>=0),
 add column metadata_priority integer not null default 0 check(metadata_priority>=0),
 add column metadata_last_requested_at timestamptz,
 add column last_not_found_at timestamptz,
 add column next_retry_at timestamptz,
 add column failure_reason text;
create index tickers_metadata_refresh_idx on public.tickers(enrichment_status,next_metadata_refresh_at)where enrichment_status in('complete','partial','stale','failed','not_found');
create index tickers_metadata_priority_idx on public.tickers(metadata_priority desc,metadata_last_requested_at desc nulls last);
create index tickers_metadata_retry_idx on public.tickers(next_retry_at)where next_retry_at is not null;

create table public.ticker_popularity(
 ticker_id uuid primary key references public.tickers(id)on delete cascade,
 search_count integer not null default 0 check(search_count>=0),ticker_page_views integer not null default 0 check(ticker_page_views>=0),ai_search_count integer not null default 0 check(ai_search_count>=0),watchlist_additions integer not null default 0 check(watchlist_additions>=0),alert_count integer not null default 0 check(alert_count>=0),pattern_match_count integer not null default 0 check(pattern_match_count>=0),
 last_requested_at timestamptz,popularity_score numeric not null default 0 check(popularity_score>=0),updated_at timestamptz not null default now()
);
create index ticker_popularity_score_idx on public.ticker_popularity(popularity_score desc,last_requested_at desc nulls last);

create table public.ticker_metadata_queue(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,
 priority integer not null check(priority>=0),reason text not null check(reason in('ticker_search','ticker_page','ai_search','watchlist','alert','pattern_match','dashboard','recent_market_mover','popular_ticker','manual','stale_refresh','retry')),
 reasons jsonb not null default'[]'check(jsonb_typeof(reasons)='array'),required_fields jsonb not null default'[]'check(jsonb_typeof(required_fields)='array'),
 status text not null default'pending'check(status in('pending','processing','completed','deferred','failed','cancelled')),provider text,attempts integer not null default 0 check(attempts>=0),
 queued_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,available_after timestamptz,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index ticker_metadata_queue_one_active_uidx on public.ticker_metadata_queue(ticker_id)where status in('pending','processing','deferred');
create index ticker_metadata_queue_claim_idx on public.ticker_metadata_queue(status,available_after,priority desc,queued_at)where status in('pending','deferred');
create index ticker_metadata_queue_today_idx on public.ticker_metadata_queue(completed_at desc,status);
create trigger ticker_metadata_queue_updated before update on public.ticker_metadata_queue for each row execute function public.set_updated_at();

create table public.metadata_provider_usage(
 id uuid primary key default gen_random_uuid(),provider text not null,usage_date date not null default current_date,
 calls_attempted integer not null default 0 check(calls_attempted>=0),calls_succeeded integer not null default 0 check(calls_succeeded>=0),calls_failed integer not null default 0 check(calls_failed>=0),calls_rate_limited integer not null default 0 check(calls_rate_limited>=0),cache_hits integer not null default 0 check(cache_hits>=0),cache_misses integer not null default 0 check(cache_misses>=0),provider_calls_avoided integer not null default 0 check(provider_calls_avoided>=0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(provider,usage_date)
);
create index metadata_provider_usage_date_idx on public.metadata_provider_usage(usage_date desc,provider);
create trigger metadata_provider_usage_updated before update on public.metadata_provider_usage for each row execute function public.set_updated_at();

create table public.metadata_provider_health(
 provider text primary key,status text not null default'unconfigured'check(status in('healthy','degraded','rate_limited','unavailable','unconfigured')),
 consecutive_failures integer not null default 0 check(consecutive_failures>=0),rate_limited_until timestamptz,last_successful_call timestamptz,last_error text,last_error_at timestamptz,updated_at timestamptz not null default now()
);
create index metadata_provider_health_status_idx on public.metadata_provider_health(status,rate_limited_until);
create trigger metadata_provider_health_updated before update on public.metadata_provider_health for each row execute function public.set_updated_at();

create or replace function public.metadata_priority_base(p_reason text)returns integer language sql immutable as $$
 select case p_reason when'ai_search'then 100 when'ticker_page'then 95 when'watchlist'then 90 when'alert'then 90 when'pattern_match'then 85 when'manual'then 80 when'dashboard'then 75 when'recent_market_mover'then 70 when'ticker_search'then 70 when'popular_ticker'then 60 when'retry'then 50 when'stale_refresh'then 20 else 20 end
$$;

create or replace function public.calculate_ticker_metadata_priority(p_ticker_id uuid,p_reason text)returns integer language sql stable security definer set search_path=public as $$
 select least(150,public.metadata_priority_base(p_reason)
  +case when exists(select 1 from public.watchlist_entities w where w.ticker_id=p_ticker_id)then 10 else 0 end
  +case when exists(select 1 from public.market_mover_appearances m where m.ticker_id=p_ticker_id and m.report_date>=current_date-30)then 8 else 0 end
  +case when exists(select 1 from public.alert_rules a where a.ticker_id=p_ticker_id and a.enabled)then 8 else 0 end
  +case when exists(select 1 from public.pattern_observations o where o.ticker_id=p_ticker_id and o.observation_date>=current_date-90)then 5 else 0 end
  +least(15,coalesce((select floor(p.popularity_score/10)::int from public.ticker_popularity p where p.ticker_id=p_ticker_id),0))
  +least(10,coalesce((select floor(p.ai_search_count/5)::int from public.ticker_popularity p where p.ticker_id=p_ticker_id),0)))
$$;

create or replace function public.track_ticker_popularity(p_ticker_id uuid,p_event text,p_increment integer default 1)returns numeric
language plpgsql security definer set search_path=public as $$
declare v_increment integer:=greatest(1,least(coalesce(p_increment,1),100));v_score numeric;begin
 if p_event not in('ticker_search','ticker_page','ai_search','watchlist','alert','pattern_match')then raise exception'Unsupported popularity event';end if;
 insert into public.ticker_popularity(ticker_id)values(p_ticker_id)on conflict do nothing;
 update public.ticker_popularity set
  search_count=search_count+case when p_event='ticker_search'then v_increment else 0 end,
  ticker_page_views=ticker_page_views+case when p_event='ticker_page'then v_increment else 0 end,
  ai_search_count=ai_search_count+case when p_event='ai_search'then v_increment else 0 end,
  watchlist_additions=watchlist_additions+case when p_event='watchlist'then v_increment else 0 end,
  alert_count=alert_count+case when p_event='alert'then v_increment else 0 end,
  pattern_match_count=pattern_match_count+case when p_event='pattern_match'then v_increment else 0 end,
  last_requested_at=now(),
  popularity_score=(search_count+case when p_event='ticker_search'then v_increment else 0 end)
   +(ticker_page_views+case when p_event='ticker_page'then v_increment else 0 end)*2
   +(ai_search_count+case when p_event='ai_search'then v_increment else 0 end)*3
   +(watchlist_additions+case when p_event='watchlist'then v_increment else 0 end)*5
   +(alert_count+case when p_event='alert'then v_increment else 0 end)*5
   +(pattern_match_count+case when p_event='pattern_match'then v_increment else 0 end)*2,
  updated_at=now()where ticker_id=p_ticker_id returning popularity_score into v_score;
 return v_score;
end$$;

create or replace function public.queue_ticker_metadata(p_ticker_id uuid,p_reason text,p_required_fields jsonb default'[]',p_priority integer default null,p_available_after timestamptz default null)returns uuid
language plpgsql security definer set search_path=public as $$
declare v_existing public.ticker_metadata_queue;v_id uuid;v_priority integer;v_fields jsonb;v_reasons jsonb;begin
 if not exists(select 1 from public.tickers where id=p_ticker_id)then raise exception'Ticker not found';end if;
 if p_reason not in('ticker_search','ticker_page','ai_search','watchlist','alert','pattern_match','dashboard','recent_market_mover','popular_ticker','manual','stale_refresh','retry')then raise exception'Unsupported queue reason';end if;
 if jsonb_typeof(coalesce(p_required_fields,'[]'))<>'array'then raise exception'Required fields must be an array';end if;
 v_priority:=coalesce(p_priority,public.calculate_ticker_metadata_priority(p_ticker_id,p_reason));
 select*into v_existing from public.ticker_metadata_queue where ticker_id=p_ticker_id and status in('pending','processing','deferred')for update;
 if found then
  select coalesce(jsonb_agg(value order by value),'[]')into v_fields from(select distinct value from jsonb_array_elements_text(v_existing.required_fields||coalesce(p_required_fields,'[]')))x;
  select coalesce(jsonb_agg(value order by value),'[]')into v_reasons from(select distinct value from jsonb_array_elements_text(v_existing.reasons||jsonb_build_array(p_reason)))x;
  update public.ticker_metadata_queue set priority=greatest(priority,v_priority),reason=case when public.metadata_priority_base(p_reason)>public.metadata_priority_base(reason)then p_reason else reason end,reasons=v_reasons,required_fields=v_fields,status=case when status='deferred'and(p_available_after is null or p_available_after<=now())then'pending'else status end,available_after=case when status='deferred'then least(available_after,p_available_after)else coalesce(available_after,p_available_after)end,last_error=null where id=v_existing.id returning id into v_id;
 else
  select coalesce(jsonb_agg(value order by value),'[]')into v_fields from(select distinct value from jsonb_array_elements_text(coalesce(p_required_fields,'[]')))x;
  insert into public.ticker_metadata_queue(ticker_id,priority,reason,reasons,required_fields,available_after)values(p_ticker_id,v_priority,p_reason,jsonb_build_array(p_reason),v_fields,p_available_after)returning id into v_id;
 end if;
 update public.tickers set enrichment_status=case when enrichment_status in('complete','enriched')then enrichment_status else'queued'end,metadata_priority=greatest(metadata_priority,v_priority),metadata_last_requested_at=now()where id=p_ticker_id;
 return v_id;
end$$;

create or replace function public.claim_ticker_metadata_queue(p_limit integer default 5,p_queue_id uuid default null)returns setof public.ticker_metadata_queue
language plpgsql security definer set search_path=public as $$
begin
 update public.ticker_metadata_queue set status='pending',last_error='Recovered expired processing lease'where status='processing'and updated_at<now()-interval'10 minutes';
 return query with claimed as(
  select q.id from public.ticker_metadata_queue q where q.status in('pending','deferred')and(q.available_after is null or q.available_after<=now())and(p_queue_id is null or q.id=p_queue_id)
  order by q.priority desc,q.queued_at for update skip locked limit greatest(1,least(coalesce(p_limit,5),10))
 )update public.ticker_metadata_queue q set status='processing',attempts=q.attempts+1,started_at=coalesce(q.started_at,now()),updated_at=now()from claimed where q.id=claimed.id returning q.*;
end$$;

create or replace function public.reserve_metadata_provider_call(p_provider text,p_daily_budget integer default 20)returns boolean
language plpgsql security definer set search_path=public as $$
declare v_used integer;begin
 perform pg_advisory_xact_lock(hashtext('metadata-provider-budget-'||current_date::text));
 select coalesce(sum(calls_attempted),0)into v_used from public.metadata_provider_usage where usage_date=current_date;
 if v_used>=greatest(0,p_daily_budget)then return false;end if;
 insert into public.metadata_provider_usage(provider,usage_date,calls_attempted)values(p_provider,current_date,1)on conflict(provider,usage_date)do update set calls_attempted=metadata_provider_usage.calls_attempted+1,updated_at=now();
 return true;
end$$;

create or replace function public.record_metadata_cache_event(p_provider text,p_hit boolean,p_avoided boolean default false)returns void
language sql security definer set search_path=public as $$
 insert into public.metadata_provider_usage(provider,usage_date,cache_hits,cache_misses,provider_calls_avoided)values(coalesce(nullif(trim(p_provider),''),'cache'),current_date,case when p_hit then 1 else 0 end,case when p_hit then 0 else 1 end,case when p_avoided then 1 else 0 end)
 on conflict(provider,usage_date)do update set cache_hits=metadata_provider_usage.cache_hits+case when p_hit then 1 else 0 end,cache_misses=metadata_provider_usage.cache_misses+case when p_hit then 0 else 1 end,provider_calls_avoided=metadata_provider_usage.provider_calls_avoided+case when p_avoided then 1 else 0 end,updated_at=now()
$$;

create or replace function public.finish_metadata_provider_call(p_provider text,p_outcome text,p_error text default null,p_cooldown_seconds integer default null)returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_outcome not in('succeeded','failed','rate_limited')then raise exception'Unsupported provider outcome';end if;
 insert into public.metadata_provider_usage(provider,usage_date,calls_succeeded,calls_failed,calls_rate_limited)values(p_provider,current_date,(p_outcome='succeeded')::int,(p_outcome='failed')::int,(p_outcome='rate_limited')::int)
 on conflict(provider,usage_date)do update set calls_succeeded=metadata_provider_usage.calls_succeeded+(p_outcome='succeeded')::int,calls_failed=metadata_provider_usage.calls_failed+(p_outcome='failed')::int,calls_rate_limited=metadata_provider_usage.calls_rate_limited+(p_outcome='rate_limited')::int,updated_at=now();
 insert into public.metadata_provider_health(provider,status,consecutive_failures,rate_limited_until,last_successful_call,last_error,last_error_at)
 values(p_provider,case when p_outcome='succeeded'then'healthy'when p_outcome='rate_limited'then'rate_limited'else'degraded'end,case when p_outcome='succeeded'then 0 else 1 end,case when p_outcome='rate_limited'then now()+make_interval(secs=>coalesce(p_cooldown_seconds,3600))end,case when p_outcome='succeeded'then now()end,p_error,case when p_outcome<>'succeeded'then now()end)
 on conflict(provider)do update set status=excluded.status,consecutive_failures=case when p_outcome='succeeded'then 0 else metadata_provider_health.consecutive_failures+1 end,rate_limited_until=excluded.rate_limited_until,last_successful_call=coalesce(excluded.last_successful_call,metadata_provider_health.last_successful_call),last_error=excluded.last_error,last_error_at=excluded.last_error_at,updated_at=now();
end$$;

create or replace function public.apply_ticker_metadata_queue_result(p_queue_id uuid,p_provider text,p_status text,p_metadata jsonb default'{}',p_error_type text default null,p_error_message text default null,p_retryable boolean default false,p_stale_days integer default 180,p_not_found_days integer default 30,p_max_retries integer default 3)returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_queue public.ticker_metadata_queue;v_run_id uuid;v_item_id uuid;v_result jsonb;v_complete boolean;begin
 select*into v_queue from public.ticker_metadata_queue where id=p_queue_id for update;if not found then raise exception'Queue item not found';end if;
 v_run_id:=public.start_ticker_enrichment_run(p_provider,'selected',array[v_queue.ticker_id],array[p_provider],1,greatest(1,p_max_retries));
 select id into v_item_id from public.claim_ticker_enrichment_items(v_run_id,1)limit 1;
 v_result:=public.apply_ticker_enrichment_result(v_run_id,v_item_id,p_provider,p_status,p_metadata,p_error_type,p_error_message,p_retryable);
 perform public.refresh_ticker_enrichment_run(v_run_id);
 select company_name is not null and exchange is not null and sector is not null and industry is not null into v_complete from public.tickers where id=v_queue.ticker_id;
 if p_status in('found','partial')then
  update public.tickers set enrichment_status=case when v_complete then'complete'else'partial'end,metadata_version='metadata-v1',metadata_updated_at=now(),next_metadata_refresh_at=now()+make_interval(days=>greatest(1,p_stale_days)),metadata_refresh_attempts=metadata_refresh_attempts+1,enrichment_error=null,next_retry_at=null,failure_reason=null where id=v_queue.ticker_id;
 elsif p_status='not_found'then
  update public.tickers set enrichment_status=case when metadata_updated_at is not null then'partial'else'not_found'end,last_not_found_at=now(),next_retry_at=now()+make_interval(days=>greatest(1,p_not_found_days)),failure_reason=coalesce(p_error_message,'Provider did not return a supported security'),enrichment_error=coalesce(p_error_message,'Not found'),metadata_refresh_attempts=metadata_refresh_attempts+1 where id=v_queue.ticker_id;
 else
  update public.tickers set enrichment_status=case when metadata_updated_at is not null then enrichment_status else'failed'end,next_retry_at=case when p_retryable then now()+make_interval(mins=>least(1440,power(2,greatest(v_queue.attempts,1))::int*5))else now()+make_interval(days=>greatest(1,p_not_found_days))end,failure_reason=p_error_message,enrichment_error=p_error_message,metadata_refresh_attempts=metadata_refresh_attempts+1 where id=v_queue.ticker_id;
 end if;
 return v_result;
end$$;

create or replace function public.finish_ticker_metadata_queue(p_queue_id uuid,p_status text,p_provider text default null,p_error text default null,p_available_after timestamptz default null)returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_queue public.ticker_metadata_queue;begin
 if p_status not in('completed','deferred','failed','cancelled')then raise exception'Unsupported queue completion status';end if;
 update public.ticker_metadata_queue set status=p_status,provider=coalesce(p_provider,provider),last_error=p_error,available_after=p_available_after,completed_at=case when p_status in('completed','failed','cancelled')then now()else null end where id=p_queue_id returning*into v_queue;
 if not found then raise exception'Queue item not found';end if;
 if p_status='deferred'then update public.tickers set enrichment_status=case when metadata_updated_at is not null then enrichment_status else'queued'end,enrichment_error=p_error where id=v_queue.ticker_id;end if;
 return to_jsonb(v_queue);
end$$;

create or replace function public.queue_selective_ticker_metadata(p_selector text,p_limit integer default 25,p_required_fields jsonb default'["company_name","exchange","sector","industry"]')returns integer
language plpgsql security definer set search_path=public as $$
declare v_ticker uuid;v_count integer:=0;v_limit integer:=greatest(1,least(coalesce(p_limit,25),100));begin
 for v_ticker in
  select t.id from public.tickers t left join public.ticker_popularity p on p.ticker_id=t.id left join public.ticker_statistics s on s.ticker_id=t.id
  where case p_selector when'top_popular'then true when'watchlist'then exists(select 1 from public.watchlist_entities w where w.ticker_id=t.id)when'recent_movers'then s.last_appearance>=current_date-30 when'missing_company_name'then t.company_name is null when'missing_exchange'then t.exchange is null when'retry_failed'then t.enrichment_status='failed'or exists(select 1 from public.ticker_metadata_queue q where q.ticker_id=t.id and q.status='failed')else false end
  order by case when p_selector='top_popular'then coalesce(p.popularity_score,0)end desc,case when p_selector='recent_movers'then s.last_appearance end desc nulls last,coalesce(s.total_appearances,0)desc,t.symbol limit v_limit
 loop perform public.queue_ticker_metadata(v_ticker,case p_selector when'watchlist'then'watchlist'when'recent_movers'then'recent_market_mover'when'top_popular'then'popular_ticker'when'retry_failed'then'retry'else'manual'end,p_required_fields);v_count:=v_count+1;end loop;
 return v_count;
end$$;

create or replace function public.metadata_priority_trigger()returns trigger language plpgsql security definer set search_path=public as $$
declare v_reason text;v_ticker uuid;begin
 if tg_table_name='watchlist_entities'then v_ticker:=new.ticker_id;v_reason:='watchlist';
 elsif tg_table_name='alert_rules'then v_ticker:=new.ticker_id;v_reason:='alert';
 elsif tg_table_name='alert_events'then v_ticker:=new.ticker_id;v_reason:='alert';
 elsif tg_table_name='pattern_observations'then v_ticker:=new.ticker_id;v_reason:='pattern_match';
 else
  if new.report_date<current_date-30 then return new;end if;
  v_ticker:=new.ticker_id;v_reason:='recent_market_mover';
 end if;
 if v_ticker is not null then
  if v_reason in('watchlist','alert','pattern_match')then perform public.track_ticker_popularity(v_ticker,v_reason,1);end if;
  if exists(select 1 from public.tickers t where t.id=v_ticker and(
   t.company_name is null or t.exchange is null
   or(v_reason not in('watchlist','alert')and(t.sector is null or t.industry is null))
   or(t.next_metadata_refresh_at is not null and t.next_metadata_refresh_at<=now())
  ))then
   perform public.queue_ticker_metadata(v_ticker,v_reason,case when v_reason in('watchlist','alert')then'["company_name","exchange"]'::jsonb else'["company_name","exchange","sector","industry"]'::jsonb end);
  end if;
 end if;return new;
end$$;
create trigger metadata_watchlist_priority after insert on public.watchlist_entities for each row when(new.ticker_id is not null)execute function public.metadata_priority_trigger();
create trigger metadata_alert_rule_priority after insert on public.alert_rules for each row when(new.ticker_id is not null and new.enabled)execute function public.metadata_priority_trigger();
create trigger metadata_alert_event_priority after insert on public.alert_events for each row when(new.ticker_id is not null)execute function public.metadata_priority_trigger();
create trigger metadata_pattern_priority after insert on public.pattern_observations for each row execute function public.metadata_priority_trigger();
create trigger metadata_recent_mover_priority after insert on public.market_mover_appearances for each row execute function public.metadata_priority_trigger();

create or replace view public.metadata_intelligence_dashboard with(security_invoker=true)as
select
 (select count(*)::int from public.tickers where metadata_updated_at is not null)cached_tickers,
 (select count(*)::int from public.tickers where enrichment_status in('complete','enriched'))complete_metadata,
 (select count(*)::int from public.tickers where enrichment_status='partial')partial_metadata,
 (select count(*)::int from public.ticker_metadata_queue where status in('pending','processing','deferred'))pending_queue,
 (select count(*)::int from public.tickers where metadata_updated_at is not null and next_metadata_refresh_at<=now())stale_tickers,
 (select coalesce(sum(calls_attempted),0)::int from public.metadata_provider_usage where usage_date=current_date)api_calls_today,
 (select coalesce(sum(cache_hits),0)::int from public.metadata_provider_usage where usage_date=current_date)cache_hits_today,
 (select coalesce(sum(cache_misses),0)::int from public.metadata_provider_usage where usage_date=current_date)cache_misses_today,
 (select coalesce(sum(provider_calls_avoided),0)::int from public.metadata_provider_usage where usage_date=current_date)provider_calls_avoided_today,
 (select coalesce(sum(calls_failed),0)::int from public.metadata_provider_usage where usage_date=current_date)provider_failures_today,
 (select coalesce(sum(calls_rate_limited),0)::int from public.metadata_provider_usage where usage_date=current_date)rate_limits_today;

do $$declare t text;begin foreach t in array array['ticker_popularity','ticker_metadata_queue','metadata_provider_usage','metadata_provider_health']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;

do $$declare f text;begin foreach f in array array[
 'calculate_ticker_metadata_priority(uuid,text)','track_ticker_popularity(uuid,text,integer)','queue_ticker_metadata(uuid,text,jsonb,integer,timestamptz)','claim_ticker_metadata_queue(integer,uuid)','reserve_metadata_provider_call(text,integer)','record_metadata_cache_event(text,boolean,boolean)','finish_metadata_provider_call(text,text,text,integer)','apply_ticker_metadata_queue_result(uuid,text,text,jsonb,text,text,boolean,integer,integer,integer)','finish_ticker_metadata_queue(uuid,text,text,text,timestamptz)','queue_selective_ticker_metadata(text,integer,jsonb)'
 ]loop execute'revoke all on function public.'||f||' from public,anon,authenticated';execute'grant execute on function public.'||f||' to service_role';end loop;end$$;
