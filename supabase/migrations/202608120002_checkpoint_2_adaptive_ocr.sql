-- Checkpoint 2 OCR accuracy repair: retain adaptive-pass diagnostics and keep
-- incomplete/high-error previews from being confirmed.

alter table public.source_reports
  add column if not exists extraction_diagnostics jsonb not null default '{}'::jsonb;

create or replace function public.commit_import_preview_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; p public.import_previews; result uuid; report jsonb;
begin
  select * into j from public.import_preview_jobs where id=p_job_id for update;
  if not found then raise exception 'Preview job not found'; end if;
  if j.status='confirmed' and j.import_batch_id is not null then return j.import_batch_id; end if;
  if j.status<>'completed' or j.preview_id is null then
    raise exception 'The preview job is not complete and cannot be confirmed';
  end if;
  if j.error_count>0 or j.usable_reports=0 or j.extracted_rows=0 then
    raise exception 'The preview contains extraction errors or no usable rows and cannot be confirmed';
  end if;

  select * into p from public.import_previews where id=j.preview_id;
  if not found then raise exception 'Completed preview payload not found'; end if;
  result:=public.commit_import_preview(j.preview_id);

  for report in select value from jsonb_array_elements(p.payload->'reports') loop
    update public.source_reports
    set extraction_diagnostics=coalesce(report->'extractionDiagnostics','{}'::jsonb)
    where import_batch_id=result and file_hash=report->>'fileHash';
  end loop;

  update public.import_preview_jobs
  set status='confirmed',confirmed_at=now(),import_batch_id=result
  where id=p_job_id;
  return result;
end $$;
revoke all on function public.commit_import_preview_job(uuid) from public,anon,authenticated;
grant execute on function public.commit_import_preview_job(uuid) to service_role;
