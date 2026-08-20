-- Checkpoint 2 production repair: durable, bounded Scanz preview processing.
-- Raw market observations and all later-checkpoint analytics remain unchanged.

create table public.import_preview_jobs (
  id uuid primary key default gen_random_uuid(),
  archive_name text not null,
  archive_hash text not null check(length(archive_hash)=64),
  total_files integer not null default 0 check(total_files>=0),
  files_processed integer not null default 0 check(files_processed>=0 and files_processed<=total_files),
  usable_reports integer not null default 0 check(usable_reports>=0),
  extracted_rows integer not null default 0 check(extracted_rows>=0),
  warning_count integer not null default 0 check(warning_count>=0),
  error_count integer not null default 0 check(error_count>=0),
  current_filename text,
  status text not null default 'uploading' check(status in ('uploading','queued','processing','completed','failed','cancelled','confirmed')),
  failure_message text,
  preview_id uuid unique references public.import_previews(id) on delete set null,
  import_batch_id uuid unique references public.import_batches(id) on delete set null,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now()
);

create unique index import_preview_jobs_active_archive_unique
  on public.import_preview_jobs(archive_hash)
  where status in ('uploading','queued','processing','completed');
create index import_preview_jobs_status_updated_idx on public.import_preview_jobs(status,updated_at);
create index import_preview_jobs_expiry_idx on public.import_preview_jobs(expires_at);

create table public.import_preview_job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_preview_jobs(id) on delete cascade,
  ordinal integer not null check(ordinal>=0),
  filename text not null,
  file_hash text not null check(length(file_hash)=64),
  metadata_date date,
  storage_path text,
  status text not null default 'uploading' check(status in ('uploading','queued','processing','completed','failed','duplicate','cancelled')),
  report_payload jsonb,
  row_count integer not null default 0 check(row_count>=0),
  warning_count integer not null default 0 check(warning_count>=0),
  error_count integer not null default 0 check(error_count>=0),
  error_message text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(job_id,ordinal)
);
create index import_preview_job_files_claim_idx on public.import_preview_job_files(job_id,status,ordinal);
create index import_preview_job_files_hash_idx on public.import_preview_job_files(file_hash);

create or replace function public.touch_import_preview_job_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
create trigger touch_import_preview_jobs before update on public.import_preview_jobs
for each row execute function public.touch_import_preview_job_updated_at();
create trigger touch_import_preview_job_files before update on public.import_preview_job_files
for each row execute function public.touch_import_preview_job_updated_at();

alter table public.import_preview_jobs enable row level security;
alter table public.import_preview_job_files enable row level security;
-- Jobs and work items contain private staged extraction data. They are only
-- accessed by server routes through the service role and an opaque job UUID.

create or replace function public.claim_import_preview_job_files(p_job_id uuid,p_limit integer default 2)
returns setof public.import_preview_job_files
language plpgsql security definer set search_path=public as $$
begin
  if p_limit<1 or p_limit>10 then raise exception 'Batch limit must be between 1 and 10'; end if;
  if not exists(
    select 1 from public.import_preview_jobs
    where id=p_job_id and status in ('queued','processing') and expires_at>now()
  ) then return; end if;

  -- A terminated request can be safely retried after a conservative lease.
  update public.import_preview_job_files
  set status='queued',started_at=null
  where job_id=p_job_id and status='processing' and updated_at<now()-interval '3 minutes';

  return query
  with candidates as (
    select id from public.import_preview_job_files
    where job_id=p_job_id and status='queued'
    order by ordinal
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.import_preview_job_files f
    set status='processing',started_at=coalesce(f.started_at,now())
    from candidates c where f.id=c.id
    returning f.*
  )
  select * from claimed order by ordinal;

  update public.import_preview_jobs
  set status='processing',started_at=coalesce(started_at,now())
  where id=p_job_id and status='queued';
end $$;

create or replace function public.refresh_import_preview_job(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  update public.import_preview_jobs j set
    files_processed=(select count(*) from public.import_preview_job_files f where f.job_id=j.id and f.status in ('completed','failed','duplicate','cancelled')),
    usable_reports=(select count(*) from public.import_preview_job_files f where f.job_id=j.id and f.status='completed' and nullif(f.report_payload->>'reportDate','') is not null and jsonb_array_length(coalesce(f.report_payload->'rows','[]'::jsonb))>0),
    extracted_rows=coalesce((select sum(f.row_count) from public.import_preview_job_files f where f.job_id=j.id),0),
    warning_count=coalesce((select sum(f.warning_count) from public.import_preview_job_files f where f.job_id=j.id),0),
    error_count=coalesce((select sum(f.error_count) from public.import_preview_job_files f where f.job_id=j.id),0),
    current_filename=(select f.filename from public.import_preview_job_files f where f.job_id=j.id and f.status='processing' order by f.ordinal limit 1)
  where j.id=p_job_id and j.status not in ('cancelled','failed','confirmed');
  select to_jsonb(j) into result from public.import_preview_jobs j where j.id=p_job_id;
  return result;
end $$;

create or replace function public.finalize_import_preview_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  j public.import_preview_jobs;
  reports jsonb:='[]'::jsonb;
  duplicates jsonb:='[]'::jsonb;
  hashes text[]:='{}'::text[];
  categories jsonb:='[]'::jsonb;
  summary jsonb;
  payload jsonb;
  new_preview_id uuid;
  report_count integer:=0;
  duplicate_count integer:=0;
  earliest text;
  latest text;
begin
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if not found then raise exception 'Preview job not found'; end if;
  if j.preview_id is not null then return j.preview_id; end if;
  if j.status in ('cancelled','failed','confirmed') then return null; end if;
  if exists(select 1 from public.import_preview_job_files where job_id=p_job_id and status in ('uploading','queued','processing')) then return null; end if;

  select coalesce(jsonb_agg(report_payload order by ordinal),'[]'::jsonb),
         coalesce(array_agg(file_hash order by ordinal),'{}'::text[]),count(*)
  into reports,hashes,report_count
  from public.import_preview_job_files where job_id=p_job_id and status='completed' and report_payload is not null;
  select coalesce(jsonb_agg(filename order by ordinal),'[]'::jsonb),count(*)
  into duplicates,duplicate_count
  from public.import_preview_job_files where job_id=p_job_id and status='duplicate';
  select min(nullif(report_payload->>'reportDate','')),max(nullif(report_payload->>'reportDate',''))
  into earliest,latest from public.import_preview_job_files where job_id=p_job_id and status='completed';
  select coalesce(jsonb_agg(category order by category),'[]'::jsonb) into categories
  from (
    select distinct jsonb_array_elements_text(coalesce(f.report_payload->'categories','[]'::jsonb)) category
    from public.import_preview_job_files f where f.job_id=p_job_id and f.status='completed'
  ) distinct_categories;

  summary:=jsonb_build_object(
    'filesDetected',j.total_files,'reportsDetected',report_count,
    'earliestDate',earliest,'latestDate',latest,'categories',categories,
    'expectedRows',j.extracted_rows,'potentialDuplicates',duplicate_count,
    'warnings',j.warning_count,'errors',j.error_count
  );
  payload:=jsonb_build_object('name',j.archive_name,'reports',reports,'duplicates',duplicates,'summary',summary);
  insert into public.import_previews(name,file_hashes,summary,payload,expires_at)
  values(j.archive_name,hashes,summary,payload,j.expires_at) returning id into new_preview_id;
  update public.import_preview_jobs set preview_id=new_preview_id,status='completed',current_filename=null,
    completed_at=now(),files_processed=total_files where id=p_job_id;
  return new_preview_id;
end $$;

revoke all on function public.claim_import_preview_job_files(uuid,integer) from public,anon,authenticated;
revoke all on function public.refresh_import_preview_job(uuid) from public,anon,authenticated;
revoke all on function public.finalize_import_preview_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_import_preview_job_files(uuid,integer) to service_role;
grant execute on function public.refresh_import_preview_job(uuid) to service_role;
grant execute on function public.finalize_import_preview_job(uuid) to service_role;

create or replace function public.commit_import_preview_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; result uuid;
begin
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if not found then raise exception 'Preview job not found'; end if;
  if j.status='confirmed' and j.import_batch_id is not null then return j.import_batch_id; end if;
  if j.status<>'completed' or j.preview_id is null then
    raise exception 'The preview job is not complete and cannot be confirmed';
  end if;
  result:=public.commit_import_preview(j.preview_id);
  update public.import_preview_jobs set status='confirmed',confirmed_at=now(),import_batch_id=result where id=p_job_id;
  return result;
end $$;
revoke all on function public.commit_import_preview_job(uuid) from public,anon,authenticated;
grant execute on function public.commit_import_preview_job(uuid) to service_role;
