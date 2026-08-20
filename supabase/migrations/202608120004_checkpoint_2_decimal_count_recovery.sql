-- Checkpoint 2 production recovery: persisted OCR count fields may contain a
-- dot thousands separator (for example, 7.133 means 7,133 trades). Keep the
-- count destinations as bigint, but normalize their persisted text safely
-- instead of casting a decimal string directly to bigint.

create or replace function public.normalize_import_count(
  p_value text,
  p_raw_value text default null
) returns bigint
language plpgsql
immutable
set search_path=public
as $$
declare
  v_raw text:=btrim(coalesce(nullif(p_raw_value,''),p_value));
  v_count numeric;
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then return null; end if;

  -- Scanz count columns use grouped whole numbers. OCR can preserve the
  -- visual separator as a period, while JSON numeric normalization turns
  -- 44.430 into 44.43. Prefer the unmodified raw cell when it has canonical
  -- three-digit grouping, and remove the grouping separators deterministically.
  if v_raw ~ '^\+?[0-9]{1,3}([.,][0-9]{3})+$' then
    v_count:=replace(replace(v_raw,'.',''),',','')::numeric;
  elsif v_raw ~ '^\+?[0-9]+([.][0-9]+)?[KMBkmb]$' then
    -- The parser has already expanded an explicit K/M/B count suffix in the
    -- JSON value. Round that expanded value, not the raw abbreviated token.
    v_count:=round(replace(btrim(p_value),',','')::numeric);
  elsif p_raw_value is not null and nullif(btrim(p_raw_value),'') is not null
    and v_raw !~ '^\+?[0-9]+([.,][0-9]+)?$' then
    -- A percentage, currency value, or other malformed OCR token is not a
    -- reliable count. Preserve it in raw provenance and stage NULL.
    return null;
  else
    v_count:=replace(btrim(p_value),',','')::numeric;
    -- Counts cannot be fractional. For a plain numeric OCR value that is not
    -- grouped notation, use deterministic nearest-integer rounding.
    v_count:=round(v_count);
  end if;

  if v_count<0 or v_count>9223372036854775807::numeric then return null; end if;
  return v_count::bigint;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end $$;

revoke all on function public.normalize_import_count(text,text)
  from public,anon,authenticated;
grant execute on function public.normalize_import_count(text,text)
  to service_role;

create or replace function public.finalize_import_preview_job_batch(
  p_job_id uuid,p_limit integer default 10
) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.import_preview_jobs; f public.import_preview_job_files;
  payload jsonb; last_ordinal integer;
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
        public.normalize_import_count(
          r.value->>'trades',r.value#>>'{rawValues,trades}'
        ),
        public.normalize_import_count(
          r.value->>'volume',r.value#>>'{rawValues,volume}'
        ),
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

revoke all on function public.finalize_import_preview_job_batch(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.finalize_import_preview_job_batch(uuid,integer)
  to service_role;
