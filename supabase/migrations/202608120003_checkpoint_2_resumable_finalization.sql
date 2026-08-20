-- Checkpoint 2 production recovery: resumable preview finalization and import.
-- Completed OCR payloads stay in import_preview_job_files and are never
-- reconstructed into one archive-sized JSON document.

alter table public.import_preview_jobs
  drop constraint if exists import_preview_jobs_status_check;
alter table public.import_preview_jobs
  add constraint import_preview_jobs_status_check check(status in (
    'uploading','queued','processing','finalizing','completed','committing',
    'failed','cancelled','confirmed'
  ));
drop index if exists public.import_preview_jobs_active_archive_unique;
create unique index import_preview_jobs_active_archive_unique
  on public.import_preview_jobs(archive_hash)
  where status in ('uploading','queued','processing','finalizing','completed','committing');

alter table public.import_preview_jobs
  add column if not exists finalization_status text not null default 'pending'
    check(finalization_status in ('pending','running','paused','completed')),
  add column if not exists reports_finalized integer not null default 0
    check(reports_finalized>=0),
  add column if not exists rows_finalized bigint not null default 0
    check(rows_finalized>=0),
  add column if not exists finalization_cursor integer not null default -1,
  add column if not exists finalization_started_at timestamptz,
  add column if not exists finalization_updated_at timestamptz,
  add column if not exists finalization_completed_at timestamptz,
  add column if not exists commit_status text not null default 'pending'
    check(commit_status in ('pending','running','paused','completed')),
  add column if not exists commit_stage text not null default 'pending'
    check(commit_stage in ('pending','reports','issues','appearances','derived','completed')),
  add column if not exists reports_committed integer not null default 0
    check(reports_committed>=0),
  add column if not exists rows_committed bigint not null default 0
    check(rows_committed>=0),
  add column if not exists issues_committed integer not null default 0
    check(issues_committed>=0),
  add column if not exists commit_started_at timestamptz,
  add column if not exists commit_updated_at timestamptz,
  add column if not exists commit_completed_at timestamptz;

create table public.import_preview_staged_reports (
  job_id uuid not null references public.import_preview_jobs(id) on delete cascade,
  file_id uuid not null unique references public.import_preview_job_files(id) on delete cascade,
  ordinal integer not null check(ordinal>=0),
  filename text not null,
  file_hash text not null,
  original_status text not null,
  has_report_payload boolean not null default false,
  usable boolean not null default false,
  report_date date,
  source_date date,
  extraction_method public.extraction_method not null default 'unknown',
  extraction_confidence numeric,
  page_count integer not null default 0,
  categories jsonb not null default '[]'::jsonb,
  row_count integer not null default 0 check(row_count>=0),
  warning_count integer not null default 0 check(warning_count>=0),
  error_count integer not null default 0 check(error_count>=0),
  extraction_diagnostics jsonb not null default '{}'::jsonb,
  source_report_id uuid references public.source_reports(id) on delete set null,
  report_committed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(job_id,ordinal)
);
create index import_preview_staged_reports_commit_idx
  on public.import_preview_staged_reports(job_id,report_committed_at,ordinal);
create index import_preview_staged_reports_hash_idx
  on public.import_preview_staged_reports(file_hash);

create table public.import_preview_staged_rows (
  job_id uuid not null,
  report_ordinal integer not null,
  row_ordinal integer not null check(row_ordinal>=0),
  category text,
  ticker text,
  rank integer,
  price numeric,
  change_amount numeric,
  change_percent numeric,
  trades bigint,
  volume bigint,
  dollar_volume numeric,
  page_number integer,
  raw_values jsonb not null default '{}'::jsonb,
  appearance_id uuid references public.market_mover_appearances(id) on delete set null,
  committed_at timestamptz,
  primary key(job_id,report_ordinal,row_ordinal),
  foreign key(job_id,report_ordinal)
    references public.import_preview_staged_reports(job_id,ordinal) on delete cascade
);
create index import_preview_staged_rows_commit_idx
  on public.import_preview_staged_rows(job_id,committed_at,report_ordinal,row_ordinal);

create table public.import_preview_staged_issues (
  job_id uuid not null,
  report_ordinal integer not null,
  issue_ordinal integer not null check(issue_ordinal>=0),
  page_number integer,
  issue_type text not null,
  field_name text,
  raw_value text,
  message text not null,
  severity public.issue_severity not null,
  extraction_issue_id uuid references public.report_extraction_issues(id) on delete set null,
  committed_at timestamptz,
  primary key(job_id,report_ordinal,issue_ordinal),
  foreign key(job_id,report_ordinal)
    references public.import_preview_staged_reports(job_id,ordinal) on delete cascade
);
create index import_preview_staged_issues_commit_idx
  on public.import_preview_staged_issues(job_id,committed_at,report_ordinal,issue_ordinal);

create table public.import_preview_staged_categories (
  job_id uuid not null references public.import_preview_jobs(id) on delete cascade,
  name text not null,
  primary key(job_id,name)
);

alter table public.import_preview_staged_reports enable row level security;
alter table public.import_preview_staged_rows enable row level security;
alter table public.import_preview_staged_issues enable row level security;
alter table public.import_preview_staged_categories enable row level security;
-- No browser policies: staged extraction data remains service-role-only.

create or replace function public.begin_import_preview_finalization(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; active_count integer; terminal_count integer;
  new_preview_id uuid;
begin
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if not found then raise exception 'Preview job not found'; end if;
  if j.status in ('completed','committing','confirmed') then return to_jsonb(j); end if;
  if j.status in ('failed','cancelled') then
    raise exception 'A failed or cancelled preview job cannot be finalized';
  end if;

  select count(*) filter(where status in ('uploading','queued','processing')),
         count(*) filter(where status in ('completed','failed','duplicate','cancelled'))
  into active_count,terminal_count
  from public.import_preview_job_files where job_id=p_job_id;
  if active_count>0 or terminal_count<>j.total_files then return to_jsonb(j); end if;

  if j.preview_id is null then
    insert into public.import_previews(name,file_hashes,summary,payload,expires_at)
    values(
      j.archive_name,'{}'::text[],
      jsonb_build_object(
        'filesDetected',j.total_files,'reportsDetected',0,
        'earliestDate',null,'latestDate',null,'categories','[]'::jsonb,
        'expectedRows',j.extracted_rows,'potentialDuplicates',0,
        'warnings',j.warning_count,'errors',j.error_count
      ),
      jsonb_build_object('normalized',true,'jobId',j.id),
      greatest(j.expires_at,now()+interval '7 days')
    ) returning id into new_preview_id;
  else new_preview_id:=j.preview_id;
  end if;

  update public.import_preview_jobs set
    status='finalizing',preview_id=new_preview_id,finalization_status='running',
    finalization_started_at=coalesce(finalization_started_at,now()),
    finalization_updated_at=now(),current_filename=null,
    failure_message=null,expires_at=greatest(expires_at,now()+interval '7 days')
  where id=p_job_id returning * into j;
  return to_jsonb(j);
end $$;

create or replace function public.finalize_import_preview_job_batch(
  p_job_id uuid,p_limit integer default 10
) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; f public.import_preview_job_files;
  payload jsonb; row_data jsonb; issue_data jsonb; category_name text;
  row_position bigint; issue_position bigint; last_ordinal integer;
  v_summary jsonb; v_duplicates jsonb; report_count integer; duplicate_count integer;
  earliest date; latest date;
begin
  if p_limit<1 or p_limit>20 then raise exception 'Finalization limit must be between 1 and 20'; end if;
  perform public.begin_import_preview_finalization(p_job_id);
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if j.status in ('completed','committing','confirmed') then return to_jsonb(j); end if;
  if j.status<>'finalizing' then return to_jsonb(j); end if;
  last_ordinal:=j.finalization_cursor;

  for f in
    select * from public.import_preview_job_files
    where job_id=p_job_id and ordinal>j.finalization_cursor
      and status in ('completed','failed','duplicate','cancelled')
    order by ordinal limit p_limit
  loop
    payload:=f.report_payload;
    insert into public.import_preview_staged_reports(
      job_id,file_id,ordinal,filename,file_hash,original_status,
      has_report_payload,usable,report_date,source_date,extraction_method,
      extraction_confidence,page_count,categories,row_count,warning_count,
      error_count,extraction_diagnostics
    ) values(
      p_job_id,f.id,f.ordinal,f.filename,f.file_hash,f.status,
      payload is not null,
      f.status='completed' and nullif(payload->>'reportDate','') is not null and f.row_count>0,
      nullif(payload->>'reportDate','')::date,
      nullif(payload->>'sourceDate','')::date,
      case when payload->>'extractionMethod' in ('pdf_text','ocr','hybrid','manual','unknown')
        then (payload->>'extractionMethod')::public.extraction_method
        else 'unknown'::public.extraction_method end,
      nullif(payload->>'extractionConfidence','')::numeric,
      coalesce(nullif(payload->>'pageCount','')::integer,0),
      coalesce(payload->'categories','[]'::jsonb),f.row_count,f.warning_count,
      f.error_count,coalesce(payload->'extractionDiagnostics','{}'::jsonb)
    ) on conflict(job_id,ordinal) do nothing;

    if payload is not null then
      insert into public.import_preview_staged_rows(
        job_id,report_ordinal,row_ordinal,category,ticker,rank,price,
        change_amount,change_percent,trades,volume,dollar_volume,page_number,raw_values
      )
      select p_job_id,f.ordinal,(r.ordinality-1)::integer,r.value->>'category',
        r.value->>'ticker',nullif(r.value->>'rank','')::integer,
        nullif(r.value->>'price','')::numeric,
        nullif(r.value->>'changeAmount','')::numeric,
        nullif(r.value->>'changePercent','')::numeric,
        nullif(r.value->>'trades','')::bigint,
        nullif(r.value->>'volume','')::bigint,
        nullif(r.value->>'dollarVolume','')::numeric,
        nullif(r.value->>'pageNumber','')::integer,
        coalesce(r.value->'rawValues','{}'::jsonb)
      from jsonb_array_elements(coalesce(payload->'rows','[]'::jsonb))
        with ordinality r(value,ordinality)
      on conflict(job_id,report_ordinal,row_ordinal) do nothing;

      insert into public.import_preview_staged_issues(
        job_id,report_ordinal,issue_ordinal,page_number,issue_type,
        field_name,raw_value,message,severity
      )
      select p_job_id,f.ordinal,(x.ordinality-1)::integer,
        nullif(x.value->>'pageNumber','')::integer,
        coalesce(nullif(x.value->>'issueType',''),'unknown'),
        x.value->>'fieldName',x.value->>'rawValue',
        coalesce(nullif(x.value->>'message',''),'Unspecified extraction issue.'),
        case when x.value->>'severity'='error' then 'error'::public.issue_severity
          else 'warning'::public.issue_severity end
      from jsonb_array_elements(coalesce(payload->'issues','[]'::jsonb))
        with ordinality x(value,ordinality)
      on conflict(job_id,report_ordinal,issue_ordinal) do nothing;

      insert into public.import_preview_staged_categories(job_id,name)
      select p_job_id,c.value
      from jsonb_array_elements_text(coalesce(payload->'categories','[]'::jsonb)) c(value)
      where nullif(c.value,'') is not null on conflict do nothing;
    end if;
    last_ordinal:=f.ordinal;
  end loop;

  update public.import_preview_jobs set
    finalization_cursor=greatest(finalization_cursor,last_ordinal),
    reports_finalized=(select count(*) from public.import_preview_staged_reports where job_id=p_job_id),
    rows_finalized=coalesce((select sum(row_count) from public.import_preview_staged_reports where job_id=p_job_id),0),
    finalization_status='running',finalization_updated_at=now(),
    expires_at=greatest(expires_at,now()+interval '7 days')
  where id=p_job_id returning * into j;

  if not exists(
    select 1 from public.import_preview_job_files
    where job_id=p_job_id and ordinal>j.finalization_cursor
      and status in ('completed','failed','duplicate','cancelled')
  ) and j.reports_finalized=j.total_files then
    select count(*) filter(where original_status='completed' and has_report_payload),
      count(*) filter(where original_status='duplicate'),min(report_date),max(report_date)
    into report_count,duplicate_count,earliest,latest
    from public.import_preview_staged_reports where job_id=p_job_id;
    select coalesce(jsonb_agg(filename order by ordinal),'[]'::jsonb)
      into v_duplicates from public.import_preview_staged_reports
      where job_id=p_job_id and original_status='duplicate';
    v_summary:=jsonb_build_object(
      'filesDetected',j.total_files,'reportsDetected',report_count,
      'earliestDate',earliest,'latestDate',latest,
      'categories',coalesce((select jsonb_agg(name order by name) from public.import_preview_staged_categories where job_id=p_job_id),'[]'::jsonb),
      'expectedRows',j.extracted_rows,'potentialDuplicates',duplicate_count,
      'warnings',j.warning_count,'errors',j.error_count
    );
    update public.import_previews set
      file_hashes=coalesce((select array_agg(file_hash order by ordinal) from public.import_preview_staged_reports where job_id=p_job_id and original_status='completed'),'{}'::text[]),
      summary=v_summary,
      payload=jsonb_build_object('normalized',true,'jobId',p_job_id,'summary',v_summary,'duplicates',v_duplicates),
      expires_at=greatest(expires_at,now()+interval '7 days')
    where id=j.preview_id;
    update public.import_preview_jobs set
      status='completed',finalization_status='completed',
      finalization_updated_at=now(),finalization_completed_at=now(),
      completed_at=now(),current_filename=null,expires_at=greatest(expires_at,now()+interval '7 days')
    where id=p_job_id returning * into j;
  end if;
  return to_jsonb(j);
end $$;

-- Compatibility wrapper: one bounded batch only. Callers must poll/resume.
create or replace function public.finalize_import_preview_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  result:=public.finalize_import_preview_job_batch(p_job_id,10);
  return nullif(result->>'preview_id','')::uuid;
end $$;

create or replace function public.begin_import_preview_commit(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; result uuid;
begin
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if not found then raise exception 'Preview job not found'; end if;
  if j.status='confirmed' and j.import_batch_id is not null then return to_jsonb(j); end if;
  if j.status='committing' and j.import_batch_id is not null then return to_jsonb(j); end if;
  if j.status<>'completed' or j.finalization_status<>'completed' or j.preview_id is null then
    raise exception 'The preview job is not finalized and cannot be confirmed';
  end if;
  if j.usable_reports=0 or j.extracted_rows=0 then
    raise exception 'The preview contains no usable rows and cannot be confirmed';
  end if;
  insert into public.import_batches(name,source_type,total_files,status,started_at)
  values(j.archive_name,'scanz',
    (select count(*) from public.import_preview_staged_reports where job_id=p_job_id and original_status='completed'),
    'processing',now()) returning id into result;
  update public.import_preview_jobs set
    status='committing',import_batch_id=result,commit_status='running',
    commit_stage='reports',commit_started_at=coalesce(commit_started_at,now()),
    commit_updated_at=now(),failure_message=null,
    expires_at=greatest(expires_at,now()+interval '7 days')
  where id=p_job_id returning * into j;
  return to_jsonb(j);
end $$;

create or replace function public.commit_import_preview_job_batch(
  p_job_id uuid,p_report_limit integer default 10,
  p_row_limit integer default 500,p_issue_limit integer default 500
) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; staged public.import_preview_staged_reports;
  staged_row public.import_preview_staged_rows; staged_issue public.import_preview_staged_issues;
  v_source_id uuid; v_ticker_id uuid; v_category_id uuid;
  v_appearance_id uuid; v_issue_id uuid;
  payload jsonb; report_status public.import_status; invalid_message text;
begin
  if p_report_limit<1 or p_report_limit>20 then raise exception 'Report commit limit must be between 1 and 20'; end if;
  if p_row_limit<1 or p_row_limit>1000 then raise exception 'Row commit limit must be between 1 and 1000'; end if;
  if p_issue_limit<1 or p_issue_limit>1000 then raise exception 'Issue commit limit must be between 1 and 1000'; end if;
  perform public.begin_import_preview_commit(p_job_id);
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if j.status='confirmed' then return to_jsonb(j); end if;
  if j.status<>'committing' then return to_jsonb(j); end if;

  if j.commit_stage='reports' then
    for staged in
      select * from public.import_preview_staged_reports
      where job_id=p_job_id and report_committed_at is null
      order by ordinal limit p_report_limit
    loop
      v_source_id:=null;
      if staged.original_status='completed' and staged.has_report_payload then
        select id into v_source_id from public.source_reports where file_hash=staged.file_hash;
        if v_source_id is null then
          report_status:=case when not staged.usable then 'failed'::public.import_status
            when staged.error_count>0 then 'partial'::public.import_status
            else 'completed'::public.import_status end;
          select report_payload into payload from public.import_preview_job_files where id=staged.file_id;
          insert into public.source_reports(
            report_date,source_type,source_filename,import_status,page_count,
            extracted_at,import_batch_id,processing_started_at,processing_completed_at,
            error_message,warning_count,record_count,extraction_method,
            extraction_confidence,extracted_rows,file_hash,extraction_diagnostics
          ) values(
            staged.report_date,'scanz',staged.filename,report_status,staged.page_count,
            now(),j.import_batch_id,now(),now(),
            case when report_status='failed' then 'No usable market-mover records were extracted.' else null end,
            staged.warning_count,case when report_status='failed' then 0 else staged.row_count end,
            staged.extraction_method,staged.extraction_confidence,
            coalesce(payload->'rows','[]'::jsonb),staged.file_hash,staged.extraction_diagnostics
          ) returning id into v_source_id;
        end if;
      end if;
      update public.import_preview_staged_reports set
        source_report_id=v_source_id,report_committed_at=now()
      where job_id=p_job_id and ordinal=staged.ordinal;
    end loop;
    update public.import_preview_jobs set
      reports_committed=(select count(*) from public.import_preview_staged_reports where job_id=p_job_id and report_committed_at is not null),
      commit_updated_at=now(),expires_at=greatest(expires_at,now()+interval '7 days')
    where id=p_job_id returning * into j;
    if exists(select 1 from public.import_preview_staged_reports where job_id=p_job_id and report_committed_at is null) then return to_jsonb(j); end if;
    update public.import_preview_jobs set commit_stage='issues',commit_updated_at=now()
      where id=p_job_id returning * into j;
  end if;

  if j.commit_stage='issues' then
    for staged_issue in
      select x.* from public.import_preview_staged_issues x
      where x.job_id=p_job_id and x.committed_at is null
      order by x.report_ordinal,x.issue_ordinal limit p_issue_limit
    loop
      select source_report_id into v_source_id from public.import_preview_staged_reports
        where job_id=p_job_id and ordinal=staged_issue.report_ordinal;
      v_issue_id:=null;
      if v_source_id is not null then
        insert into public.report_extraction_issues(
          report_id,page_number,issue_type,field_name,raw_value,message,severity
        ) values(
          v_source_id,staged_issue.page_number,staged_issue.issue_type,
          staged_issue.field_name,staged_issue.raw_value,staged_issue.message,
          staged_issue.severity
        ) returning id into v_issue_id;
      end if;
      update public.import_preview_staged_issues set
        extraction_issue_id=v_issue_id,committed_at=now()
      where job_id=p_job_id and report_ordinal=staged_issue.report_ordinal
        and issue_ordinal=staged_issue.issue_ordinal;
    end loop;
    update public.import_preview_jobs set
      issues_committed=(select count(*) from public.import_preview_staged_issues where job_id=p_job_id and committed_at is not null),
      commit_updated_at=now(),expires_at=greatest(expires_at,now()+interval '7 days')
    where id=p_job_id returning * into j;
    if exists(select 1 from public.import_preview_staged_issues where job_id=p_job_id and committed_at is null) then return to_jsonb(j); end if;
    update public.import_preview_jobs set commit_stage='appearances',commit_updated_at=now()
      where id=p_job_id returning * into j;
  end if;

  if j.commit_stage='appearances' then
    for staged_row in
      select x.* from public.import_preview_staged_rows x
      where x.job_id=p_job_id and x.committed_at is null
      order by x.report_ordinal,x.row_ordinal limit p_row_limit
    loop
      select source_report_id into v_source_id from public.import_preview_staged_reports
        where job_id=p_job_id and ordinal=staged_row.report_ordinal;
      v_appearance_id:=null; v_ticker_id:=null; v_category_id:=null; invalid_message:=null;
      if v_source_id is not null then
        select id into v_category_id from public.market_categories where name=staged_row.category;
        if v_category_id is null then invalid_message:='Category was not persisted because it was not canonical.';
        elsif staged_row.ticker is null or staged_row.ticker !~ '^[A-Z0-9.\-]{1,15}$' then
          invalid_message:='Ticker was not persisted because it was not canonical.';
        else
          insert into public.tickers(symbol) values(staged_row.ticker)
          on conflict(symbol) do update set symbol=excluded.symbol returning id into v_ticker_id;
          insert into public.market_mover_appearances(
            ticker_id,report_id,category_id,report_date,rank,price,change_amount,
            change_percent,trades,volume,dollar_volume,raw_values
          )
          select v_ticker_id,v_source_id,v_category_id,r.report_date,staged_row.rank,
            staged_row.price,staged_row.change_amount,staged_row.change_percent,
            staged_row.trades,staged_row.volume,staged_row.dollar_volume,staged_row.raw_values
          from public.import_preview_staged_reports r
          where r.job_id=p_job_id and r.ordinal=staged_row.report_ordinal and r.report_date is not null
          on conflict(ticker_id,report_id,category_id) do nothing
          returning id into v_appearance_id;
          if v_appearance_id is null then
            select id into v_appearance_id from public.market_mover_appearances
            where market_mover_appearances.ticker_id=v_ticker_id
              and report_id=v_source_id and market_mover_appearances.category_id=v_category_id;
          end if;
        end if;
        if invalid_message is not null then
          insert into public.report_extraction_issues(
            report_id,page_number,issue_type,field_name,raw_value,message,severity
          ) values(
            v_source_id,staged_row.page_number,'unrecognized_category',
            case when v_category_id is null then 'category' else 'ticker' end,
            case when v_category_id is null then staged_row.category else staged_row.ticker end,
            invalid_message,'error'
          );
        end if;
      end if;
      update public.import_preview_staged_rows set
        appearance_id=v_appearance_id,committed_at=now()
      where job_id=p_job_id and report_ordinal=staged_row.report_ordinal
        and row_ordinal=staged_row.row_ordinal;
    end loop;
    update public.import_preview_jobs set
      rows_committed=(select count(*) from public.import_preview_staged_rows where job_id=p_job_id and committed_at is not null),
      commit_updated_at=now(),expires_at=greatest(expires_at,now()+interval '7 days')
    where id=p_job_id returning * into j;
    if exists(select 1 from public.import_preview_staged_rows where job_id=p_job_id and committed_at is null) then return to_jsonb(j); end if;
    update public.import_preview_jobs set commit_stage='derived',commit_updated_at=now()
      where id=p_job_id returning * into j;
  end if;

  if j.commit_stage='derived' then
    perform public.rebuild_ticker_statistics();
    perform public.rebuild_research_queue();
    update public.import_batches b set
      processed_files=(select count(*) from public.source_reports r where r.import_batch_id=b.id),
      successful_files=(select count(*) from public.source_reports r where r.import_batch_id=b.id and r.import_status='completed'),
      partial_files=(select count(*) from public.source_reports r where r.import_batch_id=b.id and r.import_status='partial'),
      failed_files=(select count(*) from public.source_reports r where r.import_batch_id=b.id and r.import_status='failed'),
      total_records=coalesce((select sum(r.record_count) from public.source_reports r where r.import_batch_id=b.id),0),
      completed_at=now(),
      status=case
        when not exists(select 1 from public.source_reports r where r.import_batch_id=b.id and r.import_status in ('completed','partial')) then 'failed'::public.import_batch_status
        when exists(select 1 from public.source_reports r where r.import_batch_id=b.id and r.import_status in ('partial','failed')) then 'completed_with_errors'::public.import_batch_status
        else 'completed'::public.import_batch_status end
    where b.id=j.import_batch_id;
    update public.import_previews set confirmed_at=now() where id=j.preview_id;
    update public.import_preview_jobs set
      status='confirmed',commit_status='completed',commit_stage='completed',
      commit_updated_at=now(),commit_completed_at=now(),confirmed_at=now(),
      completed_at=coalesce(completed_at,now())
    where id=p_job_id returning * into j;
  end if;
  return to_jsonb(j);
end $$;

-- Compatibility entry point starts/resumes the same import batch but performs
-- no archive-sized commit. The HTTP layer calls the bounded batch RPC.
create or replace function public.commit_import_preview_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  result:=public.begin_import_preview_commit(p_job_id);
  return nullif(result->>'import_batch_id','')::uuid;
end $$;

revoke all on function public.begin_import_preview_finalization(uuid) from public,anon,authenticated;
revoke all on function public.finalize_import_preview_job_batch(uuid,integer) from public,anon,authenticated;
revoke all on function public.finalize_import_preview_job(uuid) from public,anon,authenticated;
revoke all on function public.begin_import_preview_commit(uuid) from public,anon,authenticated;
revoke all on function public.commit_import_preview_job_batch(uuid,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.commit_import_preview_job(uuid) from public,anon,authenticated;
grant execute on function public.begin_import_preview_finalization(uuid) to service_role;
grant execute on function public.finalize_import_preview_job_batch(uuid,integer) to service_role;
grant execute on function public.finalize_import_preview_job(uuid) to service_role;
grant execute on function public.begin_import_preview_commit(uuid) to service_role;
grant execute on function public.commit_import_preview_job_batch(uuid,integer,integer,integer) to service_role;
grant execute on function public.commit_import_preview_job(uuid) to service_role;

-- Preserve the exact production recovery candidate until the deployed server
-- has resumed it. This changes no child status or persisted OCR payload.
update public.import_preview_jobs set expires_at=greatest(expires_at,now()+interval '7 days')
where id='1442107e-8cf9-4dd1-bb23-ff50744ac04d'::uuid
  and status in ('processing','finalizing','completed','committing');
