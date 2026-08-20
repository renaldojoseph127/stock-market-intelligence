create extension if not exists pgcrypto;

create type public.import_status as enum ('pending','processing','completed','partial','failed');
create type public.sentiment_kind as enum ('very_bullish','bullish','neutral','bearish','very_bearish');
create type public.research_status as enum ('pending','researching','completed','failed');
create type public.ticker_event_type as enum ('news','earnings','sec_filing','offering','reverse_split','stock_split','fda','contract','merger','acquisition','social_spike','short_squeeze','analyst','other');

create table public.tickers (
  id uuid primary key default gen_random_uuid(), symbol text not null unique,
  company_name text, exchange text, sector text, industry text,
  market_cap numeric check (market_cap >= 0), float_shares numeric check (float_shares >= 0),
  shares_outstanding numeric check (shares_outstanding >= 0), country text, website text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint tickers_symbol_format check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.\-]{1,15}$')
);
create table public.source_reports (
  id uuid primary key default gen_random_uuid(), report_date date not null, source_type text,
  source_filename text, original_path text, import_status public.import_status not null default 'pending',
  page_count integer check (page_count is null or page_count >= 0), extracted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.market_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique, exchange text,
  category_type text not null check (category_type in ('most_active','biggest_gainer','biggest_decliner')),
  display_order integer not null default 0, created_at timestamptz not null default now()
);
create table public.market_mover_appearances (
  id uuid primary key default gen_random_uuid(), ticker_id uuid not null references public.tickers(id) on delete restrict,
  report_id uuid not null references public.source_reports(id) on delete cascade,
  category_id uuid not null references public.market_categories(id) on delete restrict,
  report_date date not null, rank integer check (rank is null or rank > 0), price numeric check (price is null or price >= 0),
  change_amount numeric, change_percent numeric, trades bigint check (trades is null or trades >= 0),
  volume bigint check (volume is null or volume >= 0), dollar_volume numeric check (dollar_volume is null or dollar_volume >= 0),
  created_at timestamptz not null default now(), unique(ticker_id, report_id, category_id)
);
create index mma_ticker_idx on public.market_mover_appearances(ticker_id);
create index mma_report_date_idx on public.market_mover_appearances(report_date desc);
create index mma_category_idx on public.market_mover_appearances(category_id);
create index mma_change_percent_idx on public.market_mover_appearances(change_percent desc);
create index mma_volume_idx on public.market_mover_appearances(volume desc);
create index mma_date_category_idx on public.market_mover_appearances(report_date desc, category_id);

create table public.ticker_statistics (
  ticker_id uuid primary key references public.tickers(id) on delete cascade,
  total_appearances integer not null default 0, most_active_count integer not null default 0,
  biggest_gainer_count integer not null default 0, biggest_decliner_count integer not null default 0,
  first_appearance date, last_appearance date, highest_recorded_gain numeric, largest_recorded_decline numeric,
  average_change_percent numeric, average_volume numeric, updated_at timestamptz not null default now()
);

create table public.social_sources (
 id uuid primary key default gen_random_uuid(), name text not null unique, platform_type text not null, base_url text, created_at timestamptz not null default now()
);
create table public.social_accounts (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.social_sources(id) on delete restrict,
 username text not null, display_name text, profile_url text, followers integer check (followers is null or followers >= 0),
 first_seen_at timestamptz, last_seen_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(source_id, username)
);
create table public.social_posts (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.social_sources(id) on delete restrict,
 account_id uuid references public.social_accounts(id) on delete set null, ticker_id uuid references public.tickers(id) on delete set null,
 external_post_id text, post_url text, title text, body text, posted_at timestamptz,
 upvotes integer, comments integer, views integer, created_at timestamptz not null default now(), unique(source_id, external_post_id)
);
create index social_posts_ticker_idx on public.social_posts(ticker_id);
create index social_posts_account_idx on public.social_posts(account_id);
create index social_posts_posted_at_idx on public.social_posts(posted_at desc);
create table public.post_tickers (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.social_posts(id) on delete cascade,
 ticker_id uuid not null references public.tickers(id) on delete cascade, mention_order integer check (mention_order is null or mention_order > 0), unique(post_id,ticker_id)
);
create index post_tickers_ticker_idx on public.post_tickers(ticker_id);
create table public.sentiment_observations (
 id uuid primary key default gen_random_uuid(), ticker_id uuid not null references public.tickers(id) on delete cascade,
 post_id uuid references public.social_posts(id) on delete set null, observation_date date not null,
 sentiment public.sentiment_kind not null, sentiment_score numeric, confidence_score numeric check (confidence_score is null or confidence_score between 0 and 1),
 reason text, created_at timestamptz not null default now()
);
create index sentiment_ticker_date_idx on public.sentiment_observations(ticker_id, observation_date desc);
create table public.promotion_events (
 id uuid primary key default gen_random_uuid(), ticker_id uuid not null references public.tickers(id) on delete cascade,
 account_id uuid references public.social_accounts(id) on delete set null, platform text,
 first_seen_at timestamptz, last_seen_at timestamptz, promotion_intensity numeric,
 unusual_attention_score numeric, hype_risk_score numeric, evidence_summary text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index promotion_events_ticker_idx on public.promotion_events(ticker_id);
create index promotion_events_account_idx on public.promotion_events(account_id);
create table public.promoter_statistics (
 account_id uuid primary key references public.social_accounts(id) on delete cascade,
 tickers_mentioned integer not null default 0, bullish_mentions integer not null default 0, bearish_mentions integer not null default 0,
 early_mentions integer not null default 0, average_days_before_mover numeric, gainer_mentions integer not null default 0,
 decliner_mentions integer not null default 0, average_return_after_mention numeric, median_return_after_mention numeric,
 best_subsequent_return numeric, worst_subsequent_return numeric, updated_at timestamptz not null default now()
);

create table public.ticker_events (
 id uuid primary key default gen_random_uuid(), ticker_id uuid not null references public.tickers(id) on delete cascade,
 event_date timestamptz not null, event_type public.ticker_event_type not null, headline text, description text, source_url text, created_at timestamptz not null default now()
);
create index ticker_events_ticker_date_idx on public.ticker_events(ticker_id,event_date desc);
create table public.watchlists (
 id uuid primary key default gen_random_uuid(), name text not null, description text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.watchlist_tickers (
 id uuid primary key default gen_random_uuid(), watchlist_id uuid not null references public.watchlists(id) on delete cascade,
 ticker_id uuid not null references public.tickers(id) on delete cascade, notes text, added_at timestamptz not null default now(), unique(watchlist_id,ticker_id)
);
create table public.research_queue (
 id uuid primary key default gen_random_uuid(), ticker_id uuid not null references public.tickers(id) on delete cascade,
 priority integer not null default 0, research_status public.research_status not null default 'pending', reason text,
 first_queued_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, unique(ticker_id)
);
create index research_queue_status_priority_idx on public.research_queue(research_status,priority desc);

insert into public.market_categories(name,exchange,category_type,display_order) values
 ('NASDAQ Most Active','NASDAQ','most_active',10),('NASDAQ Biggest Gainers','NASDAQ','biggest_gainer',20),('NASDAQ Biggest Decliners','NASDAQ','biggest_decliner',30),
 ('NYSE Most Active','NYSE','most_active',40),('NYSE Biggest Gainers','NYSE','biggest_gainer',50),('NYSE Biggest Decliners','NYSE','biggest_decliner',60),
 ('OTC Most Active','OTC','most_active',70),('OTC Biggest Gainers','OTC','biggest_gainer',80),('OTC Biggest Decliners','OTC','biggest_decliner',90),
 ('Most Active Penny Stocks','PENNY','most_active',100),('Biggest Penny Stock Gainers','PENNY','biggest_gainer',110),('Biggest Penny Stock Decliners','PENNY','biggest_decliner',120);
insert into public.social_sources(name,platform_type,base_url) values
 ('Reddit','reddit','https://www.reddit.com'),('WallStreetBets','reddit','https://www.reddit.com/r/wallstreetbets'),('Stocktwits','stocktwits','https://stocktwits.com'),('Other Forum','forum',null);

create or replace function public.rebuild_ticker_statistics() returns integer language plpgsql security definer set search_path = public as $$
declare rebuilt integer;
begin
  truncate table public.ticker_statistics;
  insert into public.ticker_statistics(ticker_id,total_appearances,most_active_count,biggest_gainer_count,biggest_decliner_count,first_appearance,last_appearance,highest_recorded_gain,largest_recorded_decline,average_change_percent,average_volume,updated_at)
  select a.ticker_id, count(*)::int,
    count(*) filter(where c.category_type='most_active')::int,
    count(*) filter(where c.category_type='biggest_gainer')::int,
    count(*) filter(where c.category_type='biggest_decliner')::int,
    min(a.report_date),max(a.report_date),max(a.change_percent),min(a.change_percent),avg(a.change_percent),avg(a.volume),now()
  from public.market_mover_appearances a join public.market_categories c on c.id=a.category_id group by a.ticker_id;
  get diagnostics rebuilt = row_count;
  return rebuilt;
end $$;
revoke all on function public.rebuild_ticker_statistics() from public, anon, authenticated;
grant execute on function public.rebuild_ticker_statistics() to service_role;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger tickers_updated before update on public.tickers for each row execute function public.set_updated_at();
create trigger accounts_updated before update on public.social_accounts for each row execute function public.set_updated_at();
create trigger promotions_updated before update on public.promotion_events for each row execute function public.set_updated_at();
create trigger watchlists_updated before update on public.watchlists for each row execute function public.set_updated_at();

do $$ declare t text; begin foreach t in array array['tickers','source_reports','market_categories','market_mover_appearances','ticker_statistics','social_sources','social_accounts','social_posts','post_tickers','sentiment_observations','promotion_events','promoter_statistics','ticker_events','watchlists','watchlist_tickers','research_queue'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t); end loop; end $$;

create or replace view public.recent_reports_with_counts with (security_invoker=true) as
 select r.*,count(a.id)::bigint as ticker_records from public.source_reports r left join public.market_mover_appearances a on a.report_id=r.id group by r.id;
