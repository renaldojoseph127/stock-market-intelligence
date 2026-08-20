-- Checkpoint 4: normalized, provenance-preserving social research.
alter table public.social_sources add column if not exists ingestion_enabled boolean not null default false;
alter table public.social_sources add column if not exists adapter_key text;
alter table public.social_sources add column if not exists historical_backfill_supported boolean not null default false;
alter table public.social_sources add column if not exists last_successful_sync_at timestamptz;
alter table public.social_sources add column if not exists last_attempted_sync_at timestamptz;
alter table public.social_sources add column if not exists updated_at timestamptz not null default now();
create unique index if not exists social_sources_adapter_key_uidx on public.social_sources(adapter_key) where adapter_key is not null;

insert into public.social_sources(name,platform_type,base_url,adapter_key,historical_backfill_supported) values
 ('Reddit','reddit','https://www.reddit.com','reddit',true),
 ('Stocktwits','stocktwits','https://stocktwits.com','stocktwits',false),
 ('Yahoo Finance Community','forum','https://finance.yahoo.com','yahoo_finance_community',false),
 ('InvestorsHub','forum','https://investorshub.advfn.com','investorshub',false),
 ('Seeking Alpha Community','forum','https://seekingalpha.com','seeking_alpha_community',false),
 ('Motley Fool Community','forum','https://community.fool.com','motley_fool_community',false),
 ('Other Forum','forum',null,'other_forum',false)
on conflict(name) do update set platform_type=excluded.platform_type,base_url=excluded.base_url,
 adapter_key=excluded.adapter_key,historical_backfill_supported=excluded.historical_backfill_supported;
-- WSB is a Reddit community, not a duplicate provider. Retain the CP1 row but disable ingestion.
update public.social_sources set ingestion_enabled=false,adapter_key=null,historical_backfill_supported=false
 where name='WallStreetBets';

create table public.social_communities (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.social_sources(id) on delete restrict,
 external_community_id text, name text not null, slug text, community_type text, url text, description text,
 last_successful_sync_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source_id,name)
);
insert into public.social_communities(source_id,name,slug,community_type,url)
select s.id,v.name,v.slug,'subreddit','https://www.reddit.com/r/'||v.slug
from public.social_sources s cross join (values
 ('wallstreetbets','wallstreetbets'),('stocks','stocks'),('investing','investing'),
 ('personalfinance','personalfinance'),('CryptoCurrency','CryptoCurrency')) v(name,slug)
where s.adapter_key='reddit' on conflict(source_id,name) do nothing;

alter table public.social_accounts add column if not exists external_account_id text;
alter table public.social_accounts add column if not exists account_metadata jsonb;
alter table public.social_accounts add column if not exists is_deleted boolean not null default false;
alter table public.social_accounts add column if not exists is_suspended boolean not null default false;
create index if not exists social_accounts_source_username_idx on public.social_accounts(source_id,username);

alter table public.social_posts add column if not exists community_id uuid references public.social_communities(id) on delete set null;
alter table public.social_posts add column if not exists parent_post_id uuid references public.social_posts(id) on delete set null;
alter table public.social_posts add column if not exists root_post_id uuid references public.social_posts(id) on delete set null;
alter table public.social_posts add column if not exists external_parent_id text;
alter table public.social_posts add column if not exists post_type text not null default 'post';
alter table public.social_posts add column if not exists edited_at timestamptz;
alter table public.social_posts add column if not exists downvotes integer;
alter table public.social_posts add column if not exists score integer;
alter table public.social_posts add column if not exists raw_payload jsonb;
alter table public.social_posts add column if not exists content_hash text;
alter table public.social_posts add column if not exists import_run_id uuid;
alter table public.social_posts add column if not exists availability_status text not null default 'available';
alter table public.social_posts add column if not exists updated_at timestamptz not null default now();
alter table public.social_posts add constraint social_posts_post_type_check check(post_type in ('post','thread','topic','message','comment','reply'));
alter table public.social_posts add constraint social_posts_availability_check check(availability_status in ('available','deleted','unavailable','unknown'));
create index if not exists social_posts_source_idx on public.social_posts(source_id);
create index if not exists social_posts_community_idx on public.social_posts(community_id);
create index if not exists social_posts_parent_idx on public.social_posts(parent_post_id);
create index if not exists social_posts_external_idx on public.social_posts(external_post_id);
create index if not exists social_posts_content_hash_idx on public.social_posts(content_hash);
create unique index if not exists social_posts_source_hash_uidx on public.social_posts(source_id,content_hash) where external_post_id is null and content_hash is not null;
create index if not exists social_posts_source_date_idx on public.social_posts(source_id,posted_at desc);
create index if not exists social_posts_community_date_idx on public.social_posts(community_id,posted_at desc);

create table public.social_import_runs (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.social_sources(id) on delete restrict,
 community_id uuid references public.social_communities(id) on delete set null,
 import_type text not null check(import_type in ('historical_backfill','incremental','retry','manual')),
 status text not null default 'pending' check(status in ('pending','running','completed','partial','failed','cancelled')),
 requested_start_at timestamptz, requested_end_at timestamptz, cursor_start text, cursor_end text,
 records_discovered bigint not null default 0, records_inserted bigint not null default 0,
 records_updated bigint not null default 0, records_skipped bigint not null default 0, records_failed bigint not null default 0,
 started_at timestamptz not null default now(), completed_at timestamptz, error_message text, metadata jsonb,
 created_at timestamptz not null default now()
);
alter table public.social_posts add constraint social_posts_import_run_fk foreign key(import_run_id) references public.social_import_runs(id) on delete set null;
create index social_import_runs_source_status_idx on public.social_import_runs(source_id,status);
create index social_import_runs_started_idx on public.social_import_runs(started_at desc);

create table public.social_raw_records (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.social_sources(id) on delete restrict,
 import_run_id uuid not null references public.social_import_runs(id) on delete restrict, external_id text,
 record_type text not null, source_url text, captured_at timestamptz not null default now(), posted_at timestamptz,
 raw_text text, raw_payload jsonb, content_hash text not null,
 parse_status text not null default 'pending' check(parse_status in ('pending','parsed','partial','ignored','failed')),
 parse_error text, created_at timestamptz not null default now(), unique(source_id,content_hash)
);
create index social_raw_source_idx on public.social_raw_records(source_id);
create index social_raw_run_idx on public.social_raw_records(import_run_id);
create index social_raw_external_idx on public.social_raw_records(external_id);
create index social_raw_hash_idx on public.social_raw_records(content_hash);
create index social_raw_posted_idx on public.social_raw_records(posted_at desc);
alter table public.social_posts add column if not exists raw_record_id uuid references public.social_raw_records(id) on delete set null;
create index if not exists social_posts_raw_record_idx on public.social_posts(raw_record_id);

create table public.social_import_errors (
 id uuid primary key default gen_random_uuid(), import_run_id uuid not null references public.social_import_runs(id) on delete cascade,
 source_id uuid not null references public.social_sources(id) on delete restrict, external_id text, error_type text not null,
 error_message text not null, retryable boolean not null default false, attempt_count integer not null default 1 check(attempt_count>0),
 last_attempt_at timestamptz not null default now(), raw_context jsonb, created_at timestamptz not null default now()
);
create index social_import_errors_run_idx on public.social_import_errors(import_run_id);

alter table public.post_tickers add column if not exists mention_text text;
alter table public.post_tickers add column if not exists extraction_method text;
alter table public.post_tickers add column if not exists confidence_score numeric;
alter table public.post_tickers add column if not exists created_at timestamptz not null default now();
alter table public.post_tickers add constraint post_tickers_confidence_check check(confidence_score is null or confidence_score between 0 and 1);
create index if not exists post_tickers_post_idx on public.post_tickers(post_id);

create table public.unresolved_ticker_mentions (
 id uuid primary key default gen_random_uuid(), post_id uuid references public.social_posts(id) on delete cascade,
 raw_record_id uuid references public.social_raw_records(id) on delete set null, symbol_candidate text not null,
 mention_text text, context_excerpt text, source_id uuid not null references public.social_sources(id) on delete restrict,
 resolution_status text not null default 'pending' check(resolution_status in ('pending','confirmed','rejected','ignored')),
 resolved_ticker_id uuid references public.tickers(id) on delete set null, resolution_reason text,
 created_at timestamptz not null default now(), resolved_at timestamptz,
 unique(post_id,symbol_candidate)
);
create index unresolved_symbol_idx on public.unresolved_ticker_mentions(symbol_candidate);
create index unresolved_status_idx on public.unresolved_ticker_mentions(resolution_status);

create or replace view public.social_ticker_statistics with (security_invoker=true) as
select t.id ticker_id,t.symbol,count(pt.id)::bigint total_mentions,count(distinct p.account_id)::bigint unique_accounts,
 count(distinct p.source_id)::bigint unique_sources,min(p.posted_at) first_mention,max(p.posted_at) last_mention,
 count(*) filter(where exists(select 1 from public.market_mover_appearances m where m.ticker_id=t.id and m.report_date>=(p.posted_at at time zone 'UTC')::date))::bigint mentions_before_movers,
 count(*) filter(where exists(select 1 from public.market_mover_appearances m where m.ticker_id=t.id and m.report_date=(p.posted_at at time zone 'UTC')::date))::bigint mentions_on_mover_dates
from public.tickers t join public.post_tickers pt on pt.ticker_id=t.id join public.social_posts p on p.id=pt.post_id group by t.id,t.symbol;

create or replace view public.social_account_statistics with (security_invoker=true) as
select a.id account_id,count(distinct p.id)::bigint total_posts,count(pt.id)::bigint total_ticker_mentions,
 count(distinct pt.ticker_id)::bigint unique_tickers,min(p.posted_at) first_activity,max(p.posted_at) last_activity
from public.social_accounts a left join public.social_posts p on p.account_id=a.id left join public.post_tickers pt on pt.post_id=p.id group by a.id;

create or replace view public.social_mention_mover_proximity with (security_invoker=true) as
select p.id post_id,p.posted_at,t.id ticker_id,t.symbol,
 nxt.report_date next_mover_date,(nxt.report_date-(p.posted_at at time zone 'UTC')::date) days_before_next_mover,
 nxt.category_name next_mover_category,nxt.change_percent next_mover_change_percent,nxt.volume next_mover_volume,
 prv.report_date prior_mover_date,((p.posted_at at time zone 'UTC')::date-prv.report_date) days_after_prior_mover,
 prv.category_name prior_mover_category,prv.change_percent prior_mover_change_percent
from public.social_posts p join public.post_tickers pt on pt.post_id=p.id join public.tickers t on t.id=pt.ticker_id
left join lateral (select m.report_date,c.name category_name,m.change_percent,m.volume from public.market_mover_appearances m join public.market_categories c on c.id=m.category_id where m.ticker_id=t.id and m.report_date>=(p.posted_at at time zone 'UTC')::date order by m.report_date,m.rank nulls last limit 1) nxt on true
left join lateral (select m.report_date,c.name category_name,m.change_percent from public.market_mover_appearances m join public.market_categories c on c.id=m.category_id where m.ticker_id=t.id and m.report_date<=(p.posted_at at time zone 'UTC')::date order by m.report_date desc,m.rank nulls last limit 1) prv on true;

create or replace view public.social_source_coverage with (security_invoker=true) as
select s.id,s.name,s.platform_type,s.adapter_key,s.ingestion_enabled,s.historical_backfill_supported,
 case when not s.ingestion_enabled then 'unavailable' when s.last_successful_sync_at is not null then 'available' else 'unconfigured' end ingestion_status,
 count(distinct p.id)::bigint records,s.last_attempted_sync_at,s.last_successful_sync_at
from public.social_sources s left join public.social_posts p on p.source_id=s.id group by s.id;

create trigger social_sources_updated before update on public.social_sources for each row execute function public.set_updated_at();
create trigger social_communities_updated before update on public.social_communities for each row execute function public.set_updated_at();
create trigger social_posts_updated before update on public.social_posts for each row execute function public.set_updated_at();

do $$ declare t text; begin foreach t in array array['social_communities','social_import_runs','social_raw_records','social_import_errors','unresolved_ticker_mentions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);
end loop; end $$;
