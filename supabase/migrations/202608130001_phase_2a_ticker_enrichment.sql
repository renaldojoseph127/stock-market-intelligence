-- Phase 2A: provider-neutral company and security metadata enrichment.
-- All records introduced here are derived/reference metadata. Historical mover observations are untouched.

alter table public.tickers
 add column security_type text,
 add column primary_exchange text,
 add column cik text,
 add column isin text,
 add column cusip text,
 add column currency text,
 add column active boolean,
 add column delisted boolean,
 add column enrichment_source text,
 add column enrichment_status text not null default 'pending',
 add column enriched_at timestamptz,
 add column enrichment_error text,
 add column metadata_updated_at timestamptz,
 add constraint tickers_security_type_check check(security_type is null or security_type in('common_stock','preferred_stock','ETF','ETN','warrant','unit','ADR','closed_end_fund','other')),
 add constraint tickers_exchange_check check(exchange is null or exchange in('NASDAQ','NYSE','NYSE American','OTC','Cboe','Other')),
 add constraint tickers_primary_exchange_check check(primary_exchange is null or primary_exchange in('NASDAQ','NYSE','NYSE American','OTC','Cboe','Other')),
 add constraint tickers_cik_check check(cik is null or cik ~ '^\d{10}$'),
 add constraint tickers_isin_check check(isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
 add constraint tickers_cusip_check check(cusip is null or cusip ~ '^[A-Z0-9*@#]{9}$'),
 add constraint tickers_currency_check check(currency is null or currency ~ '^[A-Z]{3}$'),
 add constraint tickers_website_check check(website is null or website ~* '^https://[^[:space:]]+$'),
 add constraint tickers_activity_check check(not(coalesce(active,false)and coalesce(delisted,false))),
 add constraint tickers_enrichment_status_check check(enrichment_status in('pending','enriched','partial','not_found','failed','skipped'));

create index tickers_exchange_enrichment_idx on public.tickers(exchange,enrichment_status,symbol);
create index tickers_sector_idx on public.tickers(sector)where sector is not null;
create index tickers_industry_idx on public.tickers(industry)where industry is not null;
create index tickers_security_type_idx on public.tickers(security_type)where security_type is not null;
create index tickers_enrichment_status_idx on public.tickers(enrichment_status,symbol);
create index tickers_market_cap_idx on public.tickers(market_cap)where market_cap is not null;
create index tickers_country_idx on public.tickers(country)where country is not null;

create table public.ticker_enrichment_runs(
 id uuid primary key default gen_random_uuid(),provider text not null,status text not null default'pending'check(status in('pending','running','completed','partial','failed','cancelled')),
 mode text not null default'pending'check(mode in('pending','all','failed','selected')),provider_chain text[]not null default'{}',batch_size integer not null default 50 check(batch_size between 1 and 100),max_attempts integer not null default 3 check(max_attempts between 1 and 10),
 total_tickers integer not null default 0 check(total_tickers>=0),processed_tickers integer not null default 0 check(processed_tickers>=0),enriched_tickers integer not null default 0 check(enriched_tickers>=0),partial_tickers integer not null default 0 check(partial_tickers>=0),not_found_tickers integer not null default 0 check(not_found_tickers>=0),failed_tickers integer not null default 0 check(failed_tickers>=0),
 cursor_ordinal integer not null default -1,last_symbol text,started_at timestamptz not null default now(),completed_at timestamptz,error_message text,created_at timestamptz not null default now()
);
create index ticker_enrichment_runs_status_idx on public.ticker_enrichment_runs(status,created_at desc);

create table public.ticker_enrichment_run_items(
 id uuid primary key default gen_random_uuid(),enrichment_run_id uuid not null references public.ticker_enrichment_runs(id)on delete cascade,ticker_id uuid not null references public.tickers(id)on delete restrict,symbol text not null,ordinal integer not null,
 status text not null default'pending'check(status in('pending','processing','enriched','partial','not_found','failed','skipped')),attempt_count integer not null default 0 check(attempt_count>=0),provider text,error_message text,started_at timestamptz,completed_at timestamptz,updated_at timestamptz not null default now(),
 unique(enrichment_run_id,ticker_id),unique(enrichment_run_id,ordinal)
);
create index ticker_enrichment_items_claim_idx on public.ticker_enrichment_run_items(enrichment_run_id,status,ordinal);
create index ticker_enrichment_items_ticker_idx on public.ticker_enrichment_run_items(ticker_id,updated_at desc);

create table public.ticker_enrichment_errors(
 id uuid primary key default gen_random_uuid(),enrichment_run_id uuid not null references public.ticker_enrichment_runs(id)on delete cascade,ticker_id uuid references public.tickers(id)on delete set null,symbol text not null,provider text not null,error_type text not null,error_message text not null,retryable boolean not null default false,attempt_count integer not null default 1 check(attempt_count>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index ticker_enrichment_errors_run_idx on public.ticker_enrichment_errors(enrichment_run_id,created_at desc);
create index ticker_enrichment_errors_retry_idx on public.ticker_enrichment_errors(retryable,updated_at desc)where retryable;

create table public.ticker_metadata_sources(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,field_name text not null,provider text not null,source_value text,source_timestamp timestamptz,confidence numeric check(confidence is null or confidence between 0 and 1),created_at timestamptz not null default now(),
 unique(ticker_id,field_name,provider,source_value)
);
create index ticker_metadata_sources_ticker_idx on public.ticker_metadata_sources(ticker_id,field_name,created_at desc);

create table public.ticker_metadata_conflicts(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,field_name text not null,existing_value text not null,incoming_value text not null,provider text not null,source_timestamp timestamptz,status text not null default'open'check(status in('open','accepted_existing','accepted_incoming','dismissed')),reviewed_at timestamptz,review_notes text,created_at timestamptz not null default now(),
 unique(ticker_id,field_name,existing_value,incoming_value,provider)
);
create index ticker_metadata_conflicts_review_idx on public.ticker_metadata_conflicts(status,created_at desc);
create index ticker_metadata_conflicts_ticker_idx on public.ticker_metadata_conflicts(ticker_id,created_at desc);

create trigger ticker_enrichment_errors_updated before update on public.ticker_enrichment_errors for each row execute function public.set_updated_at();
create trigger ticker_enrichment_run_items_updated before update on public.ticker_enrichment_run_items for each row execute function public.set_updated_at();

create or replace function public.normalize_security_exchange(p_value text)returns text language sql immutable as $$
 select case
  when nullif(trim(p_value),'')is null then null
  when upper(trim(p_value))like'NASDAQ%'or upper(trim(p_value))in('XNAS','XNGS','XNCM','XNMS')then'NASDAQ'
  when upper(trim(p_value))in('NYSE AMERICAN','NYSE AMEX','AMEX','XASE')then'NYSE American'
  when upper(trim(p_value))in('NYSE','NEW YORK STOCK EXCHANGE','XNYS')then'NYSE'
  when upper(trim(p_value))~'^(OTC|OTCQX|OTCQB|PINK|GREY)'or upper(trim(p_value))in('OTCM','OOTC','PINX')then'OTC'
  when upper(trim(p_value))like'CBOE%'or upper(trim(p_value))in('BATS','XCBO','BZX','EDGX')then'Cboe'
  else'Other'end
$$;

create or replace function public.start_ticker_enrichment_run(p_provider text,p_mode text default'pending',p_ticker_ids uuid[]default null,p_provider_chain text[]default null,p_batch_size integer default 50,p_max_attempts integer default 3)returns uuid
language plpgsql security definer set search_path=public as $$
declare v_run_id uuid;v_mode text:=lower(coalesce(p_mode,'pending'));begin
 if nullif(trim(p_provider),'')is null then raise exception'Provider is required';end if;
 if v_mode not in('pending','all','failed','selected')then raise exception'Unsupported enrichment mode';end if;
 if v_mode='selected'and coalesce(cardinality(p_ticker_ids),0)=0 then raise exception'Selected mode requires ticker IDs';end if;
 insert into public.ticker_enrichment_runs(provider,status,mode,provider_chain,batch_size,max_attempts)values(trim(p_provider),'running',v_mode,coalesce(p_provider_chain,array[trim(p_provider)]),greatest(1,least(coalesce(p_batch_size,50),100)),greatest(1,least(coalesce(p_max_attempts,3),10)))returning id into v_run_id;
 insert into public.ticker_enrichment_run_items(enrichment_run_id,ticker_id,symbol,ordinal)
 select v_run_id,t.id,t.symbol,row_number()over(order by t.symbol,t.id)-1
 from public.tickers t where
  (v_mode='all')or(v_mode='pending'and t.enrichment_status in('pending','partial','not_found'))or(v_mode='failed'and t.enrichment_status='failed')or(v_mode='selected'and t.id=any(p_ticker_ids))
 order by t.symbol,t.id;
 update public.ticker_enrichment_runs r set total_tickers=(select count(*)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id),status=case when exists(select 1 from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id)then'running'else'completed'end,completed_at=case when exists(select 1 from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id)then null else now()end where r.id=v_run_id;
 return v_run_id;
end$$;

create or replace function public.claim_ticker_enrichment_items(p_run_id uuid,p_limit integer default 50)returns setof public.ticker_enrichment_run_items
language plpgsql security definer set search_path=public as $$
declare v_limit integer;begin
 if not exists(select 1 from public.ticker_enrichment_runs where id=p_run_id and status='running')then return;end if;
 v_limit:=greatest(1,least(coalesce(p_limit,50),(select batch_size from public.ticker_enrichment_runs where id=p_run_id),100));
 update public.ticker_enrichment_run_items i set status='pending',error_message='Recovered expired processing lease'
 where i.enrichment_run_id=p_run_id and i.status='processing'and i.updated_at<now()-interval'10 minutes';
 return query with claimed as(
  select i.id from public.ticker_enrichment_run_items i join public.ticker_enrichment_runs r on r.id=i.enrichment_run_id
  where i.enrichment_run_id=p_run_id and i.status='pending'and i.attempt_count<r.max_attempts order by i.ordinal for update of i skip locked limit v_limit
 )update public.ticker_enrichment_run_items i set status='processing',attempt_count=i.attempt_count+1,started_at=coalesce(i.started_at,now()),updated_at=now()from claimed where i.id=claimed.id returning i.*;
end$$;

create or replace function public.refresh_ticker_enrichment_run(p_run_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run public.ticker_enrichment_runs;begin
 update public.ticker_enrichment_runs r set
  processed_tickers=(select count(*)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status in('enriched','partial','not_found','failed','skipped')),
  enriched_tickers=(select count(*)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status='enriched'),
  partial_tickers=(select count(*)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status='partial'),
  not_found_tickers=(select count(*)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status='not_found'),
  failed_tickers=(select count(*)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status='failed'),
  cursor_ordinal=coalesce((select max(i.ordinal)from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status in('enriched','partial','not_found','failed','skipped')),-1),
  last_symbol=(select i.symbol from public.ticker_enrichment_run_items i where i.enrichment_run_id=r.id and i.status in('enriched','partial','not_found','failed','skipped')order by i.ordinal desc limit 1)
 where r.id=p_run_id;
 update public.ticker_enrichment_runs r set status=case when r.status='cancelled'then'cancelled'when r.processed_tickers<r.total_tickers then'running'when r.failed_tickers=r.total_tickers and r.total_tickers>0 then'failed'when r.failed_tickers+r.not_found_tickers+r.partial_tickers>0 then'partial'else'completed'end,completed_at=case when r.processed_tickers>=r.total_tickers then coalesce(r.completed_at,now())else null end where r.id=p_run_id;
 select*into v_run from public.ticker_enrichment_runs where id=p_run_id;
 if not found then raise exception'Enrichment run not found';end if;
 return to_jsonb(v_run);
end$$;

create or replace function public.record_ticker_enrichment_error(p_run_id uuid,p_item_id uuid,p_provider text,p_error_type text,p_error_message text,p_retryable boolean default false)returns uuid
language plpgsql security definer set search_path=public as $$
declare v_item public.ticker_enrichment_run_items;v_id uuid;begin
 select*into v_item from public.ticker_enrichment_run_items where id=p_item_id and enrichment_run_id=p_run_id;
 if not found then raise exception'Enrichment work item not found';end if;
 insert into public.ticker_enrichment_errors(enrichment_run_id,ticker_id,symbol,provider,error_type,error_message,retryable,attempt_count)
 values(p_run_id,v_item.ticker_id,v_item.symbol,p_provider,coalesce(nullif(trim(p_error_type),''),'provider_error'),coalesce(nullif(trim(p_error_message),''),'Provider request failed'),coalesce(p_retryable,false),greatest(v_item.attempt_count,1))returning id into v_id;
 return v_id;
end$$;

create or replace function public.apply_ticker_enrichment_result(p_run_id uuid,p_item_id uuid,p_provider text,p_status text,p_metadata jsonb default'{}',p_error_type text default null,p_error_message text default null,p_retryable boolean default false)returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_item public.ticker_enrichment_run_items;v_ticker public.tickers;v_status text:=lower(coalesce(p_status,'failed'));v_key text;v_raw text;v_value text;v_invalid text;v_field_provider text;v_any boolean:=false;v_core integer:=0;v_existing text;v_source_time timestamptz;v_confidence numeric;begin
 select*into v_item from public.ticker_enrichment_run_items where id=p_item_id and enrichment_run_id=p_run_id for update;
 if not found then raise exception'Enrichment work item not found';end if;
 select*into v_ticker from public.tickers where id=v_item.ticker_id for update;
 if v_status not in('found','partial','not_found','failed','skipped')then raise exception'Unsupported provider result status';end if;
 v_source_time:=case when coalesce(p_metadata->>'source_timestamp','')~'^\d{4}-\d{2}-\d{2}T'then(p_metadata->>'source_timestamp')::timestamptz else now()end;
 v_confidence:=case when coalesce(p_metadata->>'confidence','')~'^0(\.\d+)?$|^1(\.0+)?$'then(p_metadata->>'confidence')::numeric else null end;
 if v_status in('found','partial')then
  for v_key in select unnest(array['company_name','exchange','sector','industry','market_cap','float_shares','shares_outstanding','country','website','security_type','primary_exchange','cik','isin','cusip','currency','active','delisted'])loop
   v_raw:=p_metadata->>v_key;v_value:=nullif(trim(v_raw),'');v_invalid:=null;
   if v_key='company_name'and v_raw is not null and trim(v_raw)=''then
    insert into public.ticker_enrichment_errors(enrichment_run_id,ticker_id,symbol,provider,error_type,error_message,retryable,attempt_count)values(p_run_id,v_item.ticker_id,v_item.symbol,p_provider,'data_quality','company_name: blank_company_name',false,v_item.attempt_count);continue;
   end if;
   if v_value is null then continue;end if;
   if v_key in('exchange','primary_exchange')then v_value:=public.normalize_security_exchange(v_value);if v_value='Other'and upper(trim(v_raw))not in('OTHER','OTC OTHER')then v_invalid:='unknown_exchange';end if;end if;
   if v_key in('market_cap','float_shares','shares_outstanding')and(v_value!~'^\d+(\.\d+)?$'or v_value::numeric<0)then v_invalid:='invalid_nonnegative_number';end if;
   if v_key='website'and v_value!~*'^https://[^[:space:]]+$'then v_invalid:='malformed_url';end if;
   if v_key='company_name'and trim(v_value)=''then v_invalid:='blank_company_name';end if;
   if v_key='security_type'and v_value not in('common_stock','preferred_stock','ETF','ETN','warrant','unit','ADR','closed_end_fund','other')then v_invalid:='unknown_security_type';end if;
   if v_key='cik'then v_value:=lpad(regexp_replace(v_value,'\D','','g'),10,'0');if v_value!~'^\d{10}$'then v_invalid:='malformed_cik';end if;end if;
   if v_key='currency'then v_value:=upper(v_value);if v_value!~'^[A-Z]{3}$'then v_invalid:='malformed_currency';end if;end if;
   if v_key in('active','delisted')then v_value:=lower(v_value);if v_value not in('true','false')then v_invalid:='malformed_boolean';end if;end if;
   if v_invalid is not null then
    insert into public.ticker_enrichment_errors(enrichment_run_id,ticker_id,symbol,provider,error_type,error_message,retryable,attempt_count)values(p_run_id,v_item.ticker_id,v_item.symbol,p_provider,'data_quality',v_key||': '||v_invalid,false,v_item.attempt_count);continue;
   end if;
   v_field_provider:=coalesce(nullif(p_metadata->'field_providers'->>v_key,''),p_provider);
   insert into public.ticker_metadata_sources(ticker_id,field_name,provider,source_value,source_timestamp,confidence)values(v_item.ticker_id,v_key,v_field_provider,v_value,v_source_time,v_confidence)on conflict do nothing;
   execute format('select %I::text from public.tickers where id=$1',v_key)into v_existing using v_item.ticker_id;
   if nullif(trim(v_existing),'')is null then
    if v_key in('market_cap','float_shares','shares_outstanding')then execute format('update public.tickers set %I=$1::numeric where id=$2',v_key)using v_value,v_item.ticker_id;
    elsif v_key in('active','delisted')then execute format('update public.tickers set %I=$1::boolean where id=$2',v_key)using v_value,v_item.ticker_id;
    else execute format('update public.tickers set %I=$1 where id=$2',v_key)using v_value,v_item.ticker_id;end if;
    v_any:=true;
   elsif trim(v_existing)<>trim(v_value)then
    insert into public.ticker_metadata_conflicts(ticker_id,field_name,existing_value,incoming_value,provider,source_timestamp)values(v_item.ticker_id,v_key,v_existing,v_value,v_field_provider,v_source_time)on conflict do nothing;
   end if;
  end loop;
  select*into v_ticker from public.tickers where id=v_item.ticker_id;
  if v_ticker.float_shares is not null and v_ticker.shares_outstanding is not null and v_ticker.float_shares>v_ticker.shares_outstanding then
   insert into public.ticker_enrichment_errors(enrichment_run_id,ticker_id,symbol,provider,error_type,error_message,retryable,attempt_count)values(p_run_id,v_item.ticker_id,v_item.symbol,p_provider,'data_quality','float_shares exceeds shares_outstanding; values retained for provider-semantic review',false,v_item.attempt_count);
  end if;
  v_core:=(v_ticker.company_name is not null)::int+(v_ticker.exchange is not null)::int+(v_ticker.security_type is not null)::int;
  v_status:=case when v_core=3 then'enriched'else'partial'end;
  update public.tickers set enrichment_status=v_status,enrichment_source=p_provider,enriched_at=now(),metadata_updated_at=now(),enrichment_error=null,updated_at=now()where id=v_item.ticker_id;
 elsif v_status='not_found'then
  update public.tickers set enrichment_status=case when enrichment_status='enriched'then enrichment_status else'not_found'end,enrichment_source=coalesce(enrichment_source,p_provider),enriched_at=coalesce(enriched_at,now()),enrichment_error='No supported provider returned metadata',updated_at=now()where id=v_item.ticker_id;
 else
  if p_error_message is not null then insert into public.ticker_enrichment_errors(enrichment_run_id,ticker_id,symbol,provider,error_type,error_message,retryable,attempt_count)values(p_run_id,v_item.ticker_id,v_item.symbol,p_provider,coalesce(p_error_type,'provider_error'),p_error_message,coalesce(p_retryable,false),v_item.attempt_count);end if;
  if v_status='failed'and p_retryable and v_item.attempt_count<(select max_attempts from public.ticker_enrichment_runs where id=p_run_id)then v_status:='pending';else v_status:=case when v_status='skipped'then'skipped'else'failed'end;end if;
  update public.tickers set enrichment_status=case when enrichment_status='enriched'then enrichment_status when v_status='failed'then'failed'else enrichment_status end,enrichment_error=case when enrichment_status='enriched'then enrichment_error else p_error_message end,updated_at=now()where id=v_item.ticker_id;
 end if;
 update public.ticker_enrichment_run_items set status=v_status,provider=p_provider,error_message=p_error_message,completed_at=case when v_status='pending'then null else now()end,updated_at=now()where id=v_item.id;
 return jsonb_build_object('item_id',v_item.id,'ticker_id',v_item.ticker_id,'symbol',v_item.symbol,'status',v_status,'metadata_changed',v_any);
end$$;

create or replace function public.cancel_ticker_enrichment_run(p_run_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
begin update public.ticker_enrichment_runs set status='cancelled',completed_at=now()where id=p_run_id and status in('pending','running');update public.ticker_enrichment_run_items set status='skipped',completed_at=now()where enrichment_run_id=p_run_id and status in('pending','processing');return public.refresh_ticker_enrichment_run(p_run_id);end$$;

create or replace view public.ticker_metadata_coverage with(security_invoker=true)as
select count(*)::int total_tickers,count(*)filter(where enrichment_status='enriched')::int enriched_tickers,count(*)filter(where company_name is null)::int missing_company_name,count(*)filter(where exchange is null)::int missing_exchange,count(*)filter(where sector is null)::int missing_sector,count(*)filter(where industry is null)::int missing_industry,count(*)filter(where market_cap is null)::int missing_market_cap,count(*)filter(where float_shares is null)::int missing_float from public.tickers;

create or replace view public.ticker_metadata_conflict_review with(security_invoker=true)as
select c.*,t.symbol,t.company_name from public.ticker_metadata_conflicts c join public.tickers t on t.id=c.ticker_id;

create or replace view public.pattern_observation_metadata_detail with(security_invoker=true)as
select p.*,t.exchange,t.primary_exchange,t.sector,t.industry,t.security_type,t.country,t.market_cap,t.enrichment_status from public.pattern_observation_detail p join public.tickers t on t.id=p.ticker_id;

-- Refresh only ticker search documents after a batch; all other catalog domains remain intact.
create or replace function public.refresh_ticker_research_documents(p_ticker_ids uuid[]default null)returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;begin
 delete from public.research_search_documents d where d.domain='ticker'and(p_ticker_ids is null or d.ticker_id=any(p_ticker_ids));
 insert into public.research_search_documents(domain,record_id,title,content,route,ticker_id,account_id,observation_date,source_table,methodology_version,evidence)
 select'ticker',t.id,t.symbol,concat_ws(' ',t.company_name,t.exchange,t.primary_exchange,t.sector,t.industry,t.country,t.security_type,t.currency,t.cik),'/tickers/'||t.symbol,t.id,null,null,'tickers','ticker-enrichment-v1',jsonb_build_object('ticker_id',t.id,'symbol',t.symbol,'company_name',t.company_name,'exchange',t.exchange,'primary_exchange',t.primary_exchange,'sector',t.sector,'industry',t.industry,'country',t.country,'security_type',t.security_type,'market_cap',t.market_cap,'cik',t.cik,'enrichment_source',t.enrichment_source)
 from public.tickers t where p_ticker_ids is null or t.id=any(p_ticker_ids);
 get diagnostics rebuilt=row_count;return rebuilt;
end$$;

create or replace function public.execute_ticker_metadata_research(p_filters jsonb default'{}',p_limit integer default 50)returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));v_records jsonb;begin
 select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
  select t.id ticker_id,t.symbol,t.company_name,t.exchange,t.primary_exchange,t.sector,t.industry,t.security_type,t.country,t.market_cap,t.float_shares,t.shares_outstanding,t.cik,t.enrichment_status,coalesce(s.total_appearances,0)total_appearances,coalesce(s.biggest_gainer_count,0)biggest_gainer_count,coalesce(s.biggest_decliner_count,0)biggest_decliner_count,coalesce(s.most_active_count,0)most_active_count,s.last_appearance,
   (select count(*)from public.post_tickers pt where pt.ticker_id=t.id and((p_filters->'sources')is null or exists(select 1 from public.social_posts sp join public.social_sources ss on ss.id=sp.source_id left join public.social_communities sc on sc.id=sp.community_id cross join jsonb_array_elements_text(p_filters->'sources')src where sp.id=pt.post_id and(lower(ss.name)=lower(src.value)or(lower(src.value)='wallstreetbets'and lower(coalesce(sc.slug,sc.name))='wallstreetbets')))))social_mentions,
   'Ticker matched normalized company/security metadata filters; mover and social counts come from existing imported observations.'why,
   jsonb_build_array(jsonb_build_object('type','ticker','id',t.id,'label',t.symbol,'route','/tickers/'||t.symbol,'source_table','tickers'))citations
  from public.tickers t left join public.ticker_statistics s on s.ticker_id=t.id
  where(p_filters->>'exchange'is null or t.exchange=public.normalize_security_exchange(p_filters->>'exchange'))
   and(p_filters->>'sector'is null or lower(coalesce(t.sector,''))like'%'||lower(p_filters->>'sector')||'%')
   and(p_filters->>'industry'is null or lower(concat_ws(' ',t.industry,t.sector,t.company_name))like'%'||lower(p_filters->>'industry')||'%')
   and(p_filters->>'security_type'is null or t.security_type=p_filters->>'security_type')
   and(p_filters->>'country'is null or lower(coalesce(t.country,''))=lower(p_filters->>'country'))
   and(p_filters->>'market_cap_min'is null or t.market_cap>=(p_filters->>'market_cap_min')::numeric)
   and(p_filters->>'market_cap_max'is null or t.market_cap<(p_filters->>'market_cap_max')::numeric)
   and(p_filters->'tickers'is null or t.symbol in(select upper(value)from jsonb_array_elements_text(p_filters->'tickers')))
   and(p_filters->>'category_type'is null or case p_filters->>'category_type'when'biggest_gainer'then coalesce(s.biggest_gainer_count,0)>0 when'biggest_decliner'then coalesce(s.biggest_decliner_count,0)>0 when'most_active'then coalesce(s.most_active_count,0)>0 else false end)
   and(p_filters->'sources'is null or exists(select 1 from public.post_tickers pt join public.social_posts sp on sp.id=pt.post_id join public.social_sources ss on ss.id=sp.source_id left join public.social_communities sc on sc.id=sp.community_id cross join jsonb_array_elements_text(p_filters->'sources')src where pt.ticker_id=t.id and(lower(ss.name)=lower(src.value)or(lower(src.value)='wallstreetbets'and lower(coalesce(sc.slug,sc.name))='wallstreetbets'))))
  order by case when p_filters->>'order_by'='market_cap'then t.market_cap end desc nulls last,case when p_filters->>'order_by'='attention_score'then(select max(f.attention_score)from public.ticker_research_features f where f.ticker_id=t.id)end desc nulls last,coalesce(s.total_appearances,0)desc,t.symbol limit v_limit
 )x;
 return jsonb_build_object('intent','metadata_screen','records',v_records,'record_count',jsonb_array_length(v_records),'tables',jsonb_build_array('tickers','ticker_statistics','post_tickers','social_posts'),'methodology_versions',jsonb_build_array('ticker-enrichment-v1','Checkpoint 1 ticker statistics'),'limitations',jsonb_build_array('Results use only populated provider metadata and imported project observations.','Missing metadata remains null and can exclude a ticker from a filter.','Counts are descriptive historical observations, not predictions or recommendations.'),'executed_at',now());
end$$;

do $$declare t text;begin foreach t in array array['ticker_enrichment_runs','ticker_enrichment_run_items','ticker_enrichment_errors','ticker_metadata_sources','ticker_metadata_conflicts']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;

revoke all on function public.start_ticker_enrichment_run(text,text,uuid[],text[],integer,integer)from public,anon,authenticated;grant execute on function public.start_ticker_enrichment_run(text,text,uuid[],text[],integer,integer)to service_role;
revoke all on function public.claim_ticker_enrichment_items(uuid,integer)from public,anon,authenticated;grant execute on function public.claim_ticker_enrichment_items(uuid,integer)to service_role;
revoke all on function public.apply_ticker_enrichment_result(uuid,uuid,text,text,jsonb,text,text,boolean)from public,anon,authenticated;grant execute on function public.apply_ticker_enrichment_result(uuid,uuid,text,text,jsonb,text,text,boolean)to service_role;
revoke all on function public.record_ticker_enrichment_error(uuid,uuid,text,text,text,boolean)from public,anon,authenticated;grant execute on function public.record_ticker_enrichment_error(uuid,uuid,text,text,text,boolean)to service_role;
revoke all on function public.refresh_ticker_enrichment_run(uuid)from public,anon,authenticated;grant execute on function public.refresh_ticker_enrichment_run(uuid)to service_role;
revoke all on function public.cancel_ticker_enrichment_run(uuid)from public,anon,authenticated;grant execute on function public.cancel_ticker_enrichment_run(uuid)to service_role;
revoke all on function public.refresh_ticker_research_documents(uuid[])from public,anon,authenticated;grant execute on function public.refresh_ticker_research_documents(uuid[])to service_role;
revoke all on function public.execute_ticker_metadata_research(jsonb,integer)from public,anon,authenticated;grant execute on function public.execute_ticker_metadata_research(jsonb,integer)to service_role;

select public.refresh_ticker_research_documents(null);
