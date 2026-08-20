create type public.import_batch_status as enum ('pending','processing','completed','completed_with_errors','failed');
create type public.extraction_method as enum ('pdf_text','ocr','hybrid','manual','unknown');
create type public.issue_severity as enum ('warning','error');

create table public.import_batches (
  id uuid primary key default gen_random_uuid(), name text not null, source_type text not null default 'scanz',
  total_files integer not null default 0 check(total_files>=0), processed_files integer not null default 0 check(processed_files>=0),
  successful_files integer not null default 0 check(successful_files>=0), partial_files integer not null default 0 check(partial_files>=0),
  failed_files integer not null default 0 check(failed_files>=0), total_records integer not null default 0 check(total_records>=0),
  status public.import_batch_status not null default 'pending', started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.source_reports
  alter column report_date drop not null,
  add column import_batch_id uuid references public.import_batches(id) on delete set null,
  add column processing_started_at timestamptz,
  add column processing_completed_at timestamptz,
  add column error_message text,
  add column warning_count integer not null default 0 check(warning_count>=0),
  add column record_count integer not null default 0 check(record_count>=0),
  add column extraction_method public.extraction_method not null default 'unknown',
  add column extraction_confidence numeric check(extraction_confidence is null or extraction_confidence between 0 and 1),
  add column extracted_rows jsonb not null default '[]'::jsonb,
  add column file_hash text;
create unique index source_reports_file_hash_unique on public.source_reports(file_hash) where file_hash is not null;
create index source_reports_report_date_idx on public.source_reports(report_date desc);
create index source_reports_batch_idx on public.source_reports(import_batch_id);

alter table public.market_mover_appearances add column raw_values jsonb;
create index mma_ticker_date_idx on public.market_mover_appearances(ticker_id,report_date desc);
create index mma_category_date_idx on public.market_mover_appearances(category_id,report_date desc);
create index research_queue_priority_idx on public.research_queue(priority desc);
create index research_queue_status_idx on public.research_queue(research_status);

create table public.report_extraction_issues (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.source_reports(id) on delete cascade,
  page_number integer check(page_number is null or page_number>0), issue_type text not null,
  field_name text, raw_value text, message text not null, severity public.issue_severity not null,
  created_at timestamptz not null default now()
);
create index extraction_issues_report_idx on public.report_extraction_issues(report_id);
create index extraction_issues_severity_idx on public.report_extraction_issues(severity);

-- Parsed previews stay server-side and expire; raw archive paths are never returned to browsers.
create table public.import_previews (
  id uuid primary key default gen_random_uuid(), name text not null, file_hashes text[] not null,
  summary jsonb not null, payload jsonb not null, created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '2 hours'), confirmed_at timestamptz
);
create index import_previews_expiry_idx on public.import_previews(expires_at);

create or replace view public.ticker_category_frequency with (security_invoker=true) as
select a.ticker_id,t.symbol,a.category_id,c.name category_name,count(*)::bigint appearance_count,
 min(a.report_date) first_seen,max(a.report_date) last_seen
from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id
join public.market_categories c on c.id=a.category_id
group by a.ticker_id,t.symbol,a.category_id,c.name;

create or replace view public.import_data_quality with (security_invoker=true) as
select count(*)::bigint total_reports,
 count(*) filter(where import_status='completed')::bigint successfully_extracted,
 count(*) filter(where import_status='partial')::bigint partial_reports,
 count(*) filter(where import_status='failed')::bigint failed_reports,
  coalesce(sum(record_count),0)::bigint total_records,
  coalesce((select count(*) from public.tickers),0)::bigint unique_tickers,
  min(report_date) earliest_report,max(report_date) latest_report,
 coalesce((select count(*) from public.report_extraction_issues where severity='warning'),0)::bigint warnings,
 coalesce((select count(*) from public.report_extraction_issues where severity='error'),0)::bigint errors
from public.source_reports;

create or replace function public.rebuild_research_queue() returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  insert into public.research_queue(ticker_id,priority,reason)
  select s.ticker_id,
    case when s.biggest_gainer_count>=2 then 500+s.biggest_gainer_count*10+s.total_appearances
         when s.biggest_gainer_count=1 then 400+s.total_appearances
         when s.total_appearances>=2 then 300+s.total_appearances
         when s.biggest_decliner_count>0 then 200+s.biggest_decliner_count
         else 100+s.most_active_count end,
    case when s.biggest_gainer_count>=2 then 'Repeated Biggest Gainer'
         when s.biggest_gainer_count=1 then 'First Biggest Gainer Appearance'
         when s.total_appearances>=2 then 'High Market-Mover Frequency'
         when s.biggest_decliner_count>0 then 'Biggest Decliner' else 'Most Active' end
  from public.ticker_statistics s
  on conflict(ticker_id) do nothing;
  get diagnostics affected=row_count; return affected;
end $$;
revoke all on function public.rebuild_research_queue() from public,anon,authenticated;
grant execute on function public.rebuild_research_queue() to service_role;

alter table public.import_batches enable row level security;
alter table public.report_extraction_issues enable row level security;
alter table public.import_previews enable row level security;
create policy "Public read import batches" on public.import_batches for select to anon,authenticated using(true);
create policy "Public read extraction issues" on public.report_extraction_issues for select to anon,authenticated using(true);
-- No public policy for import_previews; only the server-side service role can access staged payloads.

create or replace function public.commit_import_preview(preview_uuid uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare p public.import_previews; b_id uuid; report jsonb; row_data jsonb; issue jsonb;
  r_id uuid; t_id uuid; c_id uuid; usable int; errs int; report_status public.import_status;
  success_count int:=0; partial_count int:=0; fail_count int:=0; record_total int:=0; new_files int:=0;
begin
  select * into p from public.import_previews where id=preview_uuid and confirmed_at is null and expires_at>now() for update;
  if not found then raise exception 'Preview not found, expired, or already confirmed'; end if;
  insert into public.import_batches(name,source_type,total_files,status,started_at)
    values(p.name,'scanz',jsonb_array_length(p.payload->'reports'),'processing',now()) returning id into b_id;
  for report in select value from jsonb_array_elements(p.payload->'reports') loop
    if exists(select 1 from public.source_reports where file_hash=report->>'fileHash') then continue; end if;
    new_files:=new_files+1; usable:=jsonb_array_length(report->'rows');
    select count(*) into errs from jsonb_array_elements(report->'issues') x where x->>'severity'='error';
    report_status:=case when usable=0 or report->>'reportDate' is null then 'failed'::public.import_status when errs>0 then 'partial'::public.import_status else 'completed'::public.import_status end;
    insert into public.source_reports(report_date,source_type,source_filename,import_status,page_count,extracted_at,import_batch_id,
      processing_started_at,processing_completed_at,error_message,warning_count,record_count,extraction_method,extraction_confidence,extracted_rows,file_hash)
    values(nullif(report->>'reportDate','')::date,'scanz',report->>'filename',report_status,(report->>'pageCount')::int,now(),b_id,now(),now(),
      case when report_status='failed' then 'No usable market-mover records were extracted.' else null end,
      (select count(*) from jsonb_array_elements(report->'issues') x where x->>'severity'='warning'),case when report_status='failed' then 0 else usable end,
      (report->>'extractionMethod')::public.extraction_method,nullif(report->>'extractionConfidence','')::numeric,report->'rows',report->>'fileHash') returning id into r_id;
    for issue in select value from jsonb_array_elements(report->'issues') loop
      insert into public.report_extraction_issues(report_id,page_number,issue_type,field_name,raw_value,message,severity)
      values(r_id,nullif(issue->>'pageNumber','')::int,coalesce(issue->>'issueType','unknown'),issue->>'fieldName',issue->>'rawValue',issue->>'message',(issue->>'severity')::public.issue_severity);
    end loop;
    if report->>'reportDate' is not null then
      for row_data in select value from jsonb_array_elements(report->'rows') loop
        insert into public.tickers(symbol) values(row_data->>'ticker') on conflict(symbol) do update set symbol=excluded.symbol returning id into t_id;
        select id into c_id from public.market_categories where name=row_data->>'category';
        if c_id is null then
          insert into public.report_extraction_issues(report_id,page_number,issue_type,field_name,raw_value,message,severity)
          values(r_id,nullif(row_data->>'pageNumber','')::int,'unrecognized_category','category',row_data->>'category','Category was not persisted because it was not canonical.','error');
          continue;
        end if;
        insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date,rank,price,change_amount,change_percent,trades,volume,dollar_volume,raw_values)
        values(t_id,r_id,c_id,(report->>'reportDate')::date,nullif(row_data->>'rank','')::int,nullif(row_data->>'price','')::numeric,
          nullif(row_data->>'changeAmount','')::numeric,nullif(row_data->>'changePercent','')::numeric,nullif(row_data->>'trades','')::bigint,
          nullif(row_data->>'volume','')::bigint,nullif(row_data->>'dollarVolume','')::numeric,row_data->'rawValues')
        on conflict(ticker_id,report_id,category_id) do nothing;
      end loop;
    end if;
    if report_status<>'failed' then record_total:=record_total+usable; end if;
    if report_status='completed' then success_count:=success_count+1; elsif report_status='partial' then partial_count:=partial_count+1; else fail_count:=fail_count+1; end if;
  end loop;
  perform public.rebuild_ticker_statistics(); perform public.rebuild_research_queue();
  update public.import_batches set processed_files=new_files,successful_files=success_count,partial_files=partial_count,failed_files=fail_count,
    total_records=record_total,completed_at=now(),status=case when success_count+partial_count=0 then 'failed'::public.import_batch_status
      when partial_count+fail_count>0 then 'completed_with_errors'::public.import_batch_status else 'completed'::public.import_batch_status end where id=b_id;
  update public.import_previews set confirmed_at=now() where id=preview_uuid;
  return b_id;
end $$;
revoke all on function public.commit_import_preview(uuid) from public,anon,authenticated;
grant execute on function public.commit_import_preview(uuid) to service_role;
