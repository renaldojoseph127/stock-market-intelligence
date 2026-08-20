-- Phase 2A.2: immutable-source historical data quality, review, and reversible effective values.

create table public.market_data_quality_audit_runs(
 id uuid primary key default gen_random_uuid(),
 status text not null default 'pending' check(status in('pending','running','completed','partial','failed','cancelled')),
 rule_version text not null,
 total_rows integer not null default 0 check(total_rows>=0),
 processed_rows integer not null default 0 check(processed_rows>=0),
 findings_created integer not null default 0 check(findings_created>=0),
 proposals_created integer not null default 0 check(proposals_created>=0),
 started_at timestamptz,updated_at timestamptz not null default now(),completed_at timestamptz,
 failure_message text,cursor bigint not null default 0 check(cursor>=0),created_at timestamptz not null default now()
);

create table public.market_data_quality_audit_items(
 id uuid primary key default gen_random_uuid(),audit_run_id uuid not null references public.market_data_quality_audit_runs(id) on delete cascade,
 appearance_id uuid not null references public.market_mover_appearances(id) on delete restrict,
 ordinal bigint not null check(ordinal>0),status text not null default 'pending' check(status in('pending','processing','completed','failed','cancelled')),
 attempts integer not null default 0 check(attempts>=0),claimed_at timestamptz,completed_at timestamptz,last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(audit_run_id,appearance_id),unique(audit_run_id,ordinal)
);

create table public.market_data_quality_findings(
 id uuid primary key default gen_random_uuid(),appearance_id uuid not null references public.market_mover_appearances(id) on delete restrict,
 ticker_id uuid not null references public.tickers(id) on delete restrict,report_id uuid not null references public.source_reports(id) on delete restrict,
 category_id uuid not null references public.market_categories(id) on delete restrict,audit_run_id uuid references public.market_data_quality_audit_runs(id) on delete set null,
 field_name text not null,finding_type text not null check(finding_type in(
  'possible_missing_decimal','possible_extra_decimal','possible_column_shift','impossible_percentage','impossible_price','impossible_volume','impossible_trades','impossible_dollar_volume','cross_field_inconsistency','historical_outlier','ticker_sequence_outlier','category_mismatch','date_mismatch','missing_required_value','ocr_alignment_error','thousands_separator_error','currency_format_error','percentage_format_error','duplicate_observation','proposal_conflict','other')),
 severity text not null check(severity in('info','low','medium','high','critical')),
 original_value text,numeric_original_value numeric,detected_at timestamptz not null default now(),rule_id text not null,rule_version text not null,
 confidence_score numeric not null check(confidence_score between 0 and 1),evidence jsonb not null default '{}'::jsonb,
 status text not null default 'open' check(status in('open','proposed','approved','rejected','auto_resolved','ignored','superseded')),
 reviewed_at timestamptz,reviewed_by text,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(appearance_id,field_name,rule_id,rule_version)
);

create table public.market_data_correction_proposals(
 id uuid primary key default gen_random_uuid(),finding_id uuid not null references public.market_data_quality_findings(id) on delete restrict,
 appearance_id uuid not null references public.market_mover_appearances(id) on delete restrict,field_name text not null,
 original_value text,proposed_value text,proposed_numeric_value numeric,proposal_method text not null check(proposal_method in(
  'decimal_restoration','column_realignment','source_line_reparse','ocr_reinspection','cross_day_continuity','cross_field_validation','manual_review','external_reference','other')),
 confidence_score numeric not null check(confidence_score between 0 and 1),reason text not null,evidence jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in('pending','approved','rejected','auto_approved','superseded')),
 is_current boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 approved_at timestamptz,approved_by text,rejected_at timestamptz,rejected_by text
);
create unique index market_data_proposals_one_current_idx on public.market_data_correction_proposals(finding_id) where is_current;

create table public.market_data_repair_log(
 id uuid primary key default gen_random_uuid(),appearance_id uuid not null references public.market_mover_appearances(id) on delete restrict,
 finding_id uuid references public.market_data_quality_findings(id) on delete restrict,proposal_id uuid references public.market_data_correction_proposals(id) on delete restrict,
 field_name text not null,old_value text,new_value text,repair_action text not null,reason text not null,evidence jsonb not null default '{}'::jsonb,
 performed_at timestamptz not null default now(),performed_by text not null,reversible boolean not null default true,
 reverted_at timestamptz,reverted_by text,revert_reason text
);

create table public.market_data_effective_values(
 appearance_id uuid not null references public.market_mover_appearances(id) on delete restrict,
 field_name text not null check(field_name in('rank','price','change_amount','change_percent','trades','volume','dollar_volume')),
 effective_value text,effective_numeric_value numeric,proposal_id uuid not null references public.market_data_correction_proposals(id) on delete restrict,
 repair_log_id uuid not null unique references public.market_data_repair_log(id) on delete restrict,
 approved_at timestamptz not null,approved_by text not null,updated_at timestamptz not null default now(),
 primary key(appearance_id,field_name)
);

create table public.market_data_recompute_queue(
 id uuid primary key default gen_random_uuid(),appearance_id uuid not null references public.market_mover_appearances(id) on delete restrict,
 ticker_id uuid not null references public.tickers(id) on delete restrict,field_name text not null,
 targets jsonb not null default '["ticker_statistics","historical_analytics","pattern_features","research_documents"]'::jsonb,
 data_mode text not null default 'effective' check(data_mode in('raw','effective')),status text not null default 'pending' check(status in('pending','processing','completed','failed')),
 reason text not null,created_at timestamptz not null default now(),completed_at timestamptz
);

create index market_data_findings_appearance_idx on public.market_data_quality_findings(appearance_id);
create index market_data_findings_ticker_idx on public.market_data_quality_findings(ticker_id);
create index market_data_findings_report_idx on public.market_data_quality_findings(report_id);
create index market_data_findings_status_idx on public.market_data_quality_findings(status);
create index market_data_findings_severity_idx on public.market_data_quality_findings(severity);
create index market_data_findings_type_idx on public.market_data_quality_findings(finding_type);
create index market_data_findings_field_idx on public.market_data_quality_findings(field_name);
create index market_data_findings_rule_idx on public.market_data_quality_findings(rule_id,rule_version);
create index market_data_findings_audit_idx on public.market_data_quality_findings(audit_run_id);
create index market_data_findings_confidence_idx on public.market_data_quality_findings(confidence_score desc);
create index market_data_proposals_appearance_idx on public.market_data_correction_proposals(appearance_id);
create index market_data_proposals_status_idx on public.market_data_correction_proposals(status);
create index market_data_proposals_confidence_idx on public.market_data_correction_proposals(confidence_score desc);
create index market_data_repair_appearance_idx on public.market_data_repair_log(appearance_id,performed_at desc);
create index market_data_audit_items_claim_idx on public.market_data_quality_audit_items(audit_run_id,status,ordinal);
create index market_data_audit_items_stale_idx on public.market_data_quality_audit_items(status,claimed_at);
create index market_data_audit_runs_status_idx on public.market_data_quality_audit_runs(status,created_at desc);
create index market_data_recompute_status_idx on public.market_data_recompute_queue(status,created_at);

create trigger market_data_runs_updated before update on public.market_data_quality_audit_runs for each row execute function public.set_updated_at();
create trigger market_data_items_updated before update on public.market_data_quality_audit_items for each row execute function public.set_updated_at();
create trigger market_data_findings_updated before update on public.market_data_quality_findings for each row execute function public.set_updated_at();
create trigger market_data_proposals_updated before update on public.market_data_correction_proposals for each row execute function public.set_updated_at();

create or replace function public.validate_market_data_effective_value()returns trigger language plpgsql set search_path=public as $$
declare l public.market_data_repair_log;p public.market_data_correction_proposals;
begin
 select*into l from public.market_data_repair_log where id=new.repair_log_id;
 if not found or l.appearance_id<>new.appearance_id or l.field_name<>new.field_name or l.repair_action not in('approve','auto_approve','supersede')then raise exception'Effective value requires a matching repair audit log';end if;
 select*into p from public.market_data_correction_proposals where id=new.proposal_id;
 if not found or p.appearance_id<>new.appearance_id or p.field_name<>new.field_name or p.status not in('approved','auto_approved')then raise exception'Effective value requires an approved matching proposal';end if;
 if new.field_name in('rank','trades','volume')and new.effective_numeric_value is not null and trunc(new.effective_numeric_value)<>new.effective_numeric_value then raise exception'Count effective values must be whole numbers';end if;
 return new;
end$$;
create trigger market_data_effective_value_guard before insert or update on public.market_data_effective_values for each row execute function public.validate_market_data_effective_value();

create or replace view public.market_data_appearance_quality with(security_invoker=true)as
select a.id appearance_id,a.ticker_id,a.report_id,a.category_id,a.report_date,
 coalesce(f.finding_count,0)::int finding_count,coalesce(f.total_finding_count,0)::int total_finding_count,coalesce(f.open_finding_count,0)::int open_finding_count,
 coalesce(f.high_severity_count,0)::int high_severity_count,coalesce(e.repaired_field_count,0)::int repaired_field_count,
 greatest(0,round(100-coalesce(f.penalty,0),2))::numeric quality_score,
 case when coalesce(f.open_finding_count,0)=0 then case when coalesce(e.repaired_field_count,0)>0 then'repaired'else'clean'end when coalesce(f.high_severity_count,0)>0 then'review_recommended'else'flagged'end quality_status
from public.market_mover_appearances a
left join lateral(select count(*)filter(where status in('open','proposed'))::int finding_count,count(*)::int total_finding_count,count(*)filter(where status in('open','proposed'))::int open_finding_count,
 count(*)filter(where severity in('high','critical')and status in('open','proposed'))::int high_severity_count,
 sum((case severity when'critical'then 35 when'high'then 20 when'medium'then 10 when'low'then 4 else 1 end)*confidence_score)filter(where status in('open','proposed'))penalty
 from public.market_data_quality_findings where appearance_id=a.id)f on true
left join lateral(select count(*)::int repaired_field_count from public.market_data_effective_values where appearance_id=a.id)e on true;

create or replace view public.market_mover_appearances_effective with(security_invoker=true)as
select a.id,a.ticker_id,a.report_id,a.category_id,a.report_date,t.symbol ticker_symbol,t.exchange ticker_exchange,t.sector ticker_sector,t.industry ticker_industry,t.security_type ticker_security_type,t.country ticker_country,t.market_cap ticker_market_cap,c.name category_name,c.category_type,c.exchange category_exchange,
 case when er.appearance_id is not null then er.effective_numeric_value::integer else a.rank end rank,
 case when ep.appearance_id is not null then ep.effective_numeric_value else a.price end price,
 case when eca.appearance_id is not null then eca.effective_numeric_value else a.change_amount end change_amount,
 case when ecp.appearance_id is not null then ecp.effective_numeric_value else a.change_percent end change_percent,
 case when et.appearance_id is not null then et.effective_numeric_value::bigint else a.trades end trades,
 case when ev.appearance_id is not null then ev.effective_numeric_value::bigint else a.volume end volume,
 case when ed.appearance_id is not null then ed.effective_numeric_value else a.dollar_volume end dollar_volume,
 a.rank raw_rank,a.price raw_price,a.change_amount raw_change_amount,a.change_percent raw_change_percent,a.trades raw_trades,a.volume raw_volume,a.dollar_volume raw_dollar_volume,
 a.raw_values,a.created_at,'effective'::text data_mode,q.quality_score,q.quality_status,q.finding_count,q.total_finding_count,q.open_finding_count,q.repaired_field_count
from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id
left join public.market_data_effective_values er on er.appearance_id=a.id and er.field_name='rank'
left join public.market_data_effective_values ep on ep.appearance_id=a.id and ep.field_name='price'
left join public.market_data_effective_values eca on eca.appearance_id=a.id and eca.field_name='change_amount'
left join public.market_data_effective_values ecp on ecp.appearance_id=a.id and ecp.field_name='change_percent'
left join public.market_data_effective_values et on et.appearance_id=a.id and et.field_name='trades'
left join public.market_data_effective_values ev on ev.appearance_id=a.id and ev.field_name='volume'
left join public.market_data_effective_values ed on ed.appearance_id=a.id and ed.field_name='dollar_volume'
left join public.market_data_appearance_quality q on q.appearance_id=a.id;

create or replace view public.market_data_source_evidence with(security_invoker=true)as
select a.*,t.symbol,t.exchange,t.security_type,t.market_cap,c.name category_name,c.category_type,c.exchange category_exchange,
 r.source_filename,r.original_path,r.extraction_method,r.extraction_confidence,r.page_count,r.file_hash,r.import_batch_id,
 a.raw_values->>'line' raw_ocr_line,a.raw_values->>'sourcePageNumber' source_page_number,
 a.raw_values->>'extractionMethod' parser_extraction_method,a.raw_values->>'extractionConfidence' parser_confidence,
 a.raw_values->>'ocrPageProvenance' ocr_page_provenance,
 coalesce(i.issues,'[]'::jsonb) import_issues
from public.market_mover_appearances a join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id join public.source_reports r on r.id=a.report_id
left join lateral(select jsonb_agg(jsonb_build_object('id',x.id,'page_number',x.page_number,'issue_type',x.issue_type,'field_name',x.field_name,'raw_value',x.raw_value,'message',x.message,'severity',x.severity)order by x.created_at)issues from public.report_extraction_issues x where x.report_id=a.report_id)i on true;

create or replace view public.market_data_ticker_quality_summary with(security_invoker=true)as
select t.id ticker_id,t.symbol,count(q.appearance_id)::int total_observations,count(q.appearance_id)filter(where q.finding_count>0)::int flagged_observations,
 count(q.appearance_id)filter(where q.repaired_field_count>0)::int repaired_observations,round(coalesce(avg(q.quality_score),100),2)quality_score,
 coalesce(sum(q.open_finding_count),0)::int open_findings,coalesce(sum(q.high_severity_count),0)::int high_severity_findings
from public.tickers t left join public.market_data_appearance_quality q on q.ticker_id=t.id group by t.id,t.symbol;

create or replace view public.market_data_report_quality_summary with(security_invoker=true)as
select r.id report_id,r.source_filename,r.report_date,count(q.appearance_id)::int total_rows,
 count(q.appearance_id)filter(where q.finding_count=0)::int clean_rows,count(q.appearance_id)filter(where q.finding_count>0)::int flagged_rows,
 count(q.appearance_id)filter(where q.high_severity_count>0)::int high_severity_rows,
 coalesce((select count(*)from public.market_data_correction_proposals p join public.market_data_quality_findings f on f.id=p.finding_id where f.report_id=r.id and p.is_current),0)::int repair_proposals,
 coalesce((select count(*)from public.market_data_effective_values e join public.market_mover_appearances a on a.id=e.appearance_id where a.report_id=r.id),0)::int approved_repairs
from public.source_reports r left join public.market_data_appearance_quality q on q.report_id=r.id group by r.id;

create or replace view public.market_data_quality_dashboard with(security_invoker=true)as
select count(q.appearance_id)::bigint total_appearances,
 count(q.appearance_id)filter(where q.finding_count=0)::bigint clean,
 count(q.appearance_id)filter(where q.finding_count>0)::bigint flagged,
 count(q.appearance_id)filter(where q.high_severity_count>0)::bigint high_severity,
 (select count(*)from public.market_data_quality_findings where status in('open','proposed'))::bigint open_findings,
 (select count(*)from public.market_data_correction_proposals where status='pending'and is_current)::bigint proposals_pending,
 (select count(*)from public.market_data_effective_values)::bigint approved_repairs,
 (select count(*)from public.market_data_correction_proposals where status='rejected')::bigint rejected_proposals,
 (select count(*)from public.market_data_repair_log where repair_action='revert')::bigint reverted_repairs,
 (select count(*)from public.market_data_quality_findings where severity='critical'and status in('open','proposed'))::bigint unresolved_critical_findings,
 (select count(*)from public.market_data_correction_proposals where confidence_score>=.9 and status='pending'and is_current)::bigint high_confidence_proposals
from public.market_data_appearance_quality q;

create or replace function public.start_market_data_quality_audit(p_rule_version text default '2a2-v1',p_appearance_ids uuid[] default null)returns uuid
language plpgsql security definer set search_path=public as $$
declare run_id uuid;existing_id uuid;total integer;
begin
 if p_appearance_ids is null then select id into existing_id from public.market_data_quality_audit_runs where rule_version=p_rule_version and status in('pending','running')order by created_at desc limit 1;
 if existing_id is not null then return existing_id;end if;end if;
 insert into public.market_data_quality_audit_runs(rule_version)values(p_rule_version)returning id into run_id;
 insert into public.market_data_quality_audit_items(audit_run_id,appearance_id,ordinal)
 select run_id,id,row_number()over(order by report_date,id)from public.market_mover_appearances where p_appearance_ids is null or id=any(p_appearance_ids);
 get diagnostics total=row_count;update public.market_data_quality_audit_runs set total_rows=total,status=case when total=0 then'completed'else'pending'end,completed_at=case when total=0 then now()end where id=run_id;
 return run_id;
end$$;

create or replace function public.claim_market_data_quality_audit_items(p_run_id uuid,p_limit integer default 250)returns setof public.market_data_quality_audit_items
language plpgsql security definer set search_path=public as $$
begin
 update public.market_data_quality_audit_items set status='pending',claimed_at=null,last_error='Recovered stale audit lease'where audit_run_id=p_run_id and status='processing'and claimed_at<now()-interval'10 minutes';
 update public.market_data_quality_audit_runs set status='running',started_at=coalesce(started_at,now())where id=p_run_id and status in('pending','running');
 return query with picked as(select id from public.market_data_quality_audit_items where audit_run_id=p_run_id and status='pending'order by ordinal for update skip locked limit greatest(1,least(coalesce(p_limit,250),1000)))
 update public.market_data_quality_audit_items i set status='processing',claimed_at=now(),attempts=attempts+1 from picked where i.id=picked.id returning i.*;
end$$;

create or replace function public.refresh_market_data_quality_audit_run(p_run_id uuid)returns jsonb
language plpgsql security definer set search_path=public as $$
declare total int;done int;failed int;pending int;last_cursor bigint;f_count int;p_count int;result jsonb;
begin
 select count(*)::int,count(*)filter(where status='completed')::int,count(*)filter(where status='failed')::int,count(*)filter(where status in('pending','processing'))::int,coalesce(max(ordinal)filter(where status in('completed','failed')),0)
 into total,done,failed,pending,last_cursor from public.market_data_quality_audit_items where audit_run_id=p_run_id;
 select count(*)::int into f_count from public.market_data_quality_findings where audit_run_id=p_run_id;
 select count(*)::int into p_count from public.market_data_correction_proposals p join public.market_data_quality_findings f on f.id=p.finding_id where f.audit_run_id=p_run_id and p.is_current;
 update public.market_data_quality_audit_runs set total_rows=total,processed_rows=done+failed,findings_created=f_count,proposals_created=p_count,cursor=last_cursor,
 status=case when pending=0 then case when failed>0 then'partial'else'completed'end else'running'end,
 completed_at=case when pending=0 then coalesce(completed_at,now())else null end where id=p_run_id returning to_jsonb(market_data_quality_audit_runs.*)into result;
 return result;
end$$;

create or replace function public.record_market_data_quality_batch(p_run_id uuid,p_results jsonb)returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;entry jsonb;finding jsonb;proposal jsonb;a public.market_mover_appearances;v_finding_id uuid;v_proposal_id uuid;
begin
 if jsonb_typeof(coalesce(p_results,'[]'::jsonb))<>'array'then raise exception'Results must be a JSON array';end if;
 for entry in select value from jsonb_array_elements(p_results)loop
  select*into a from public.market_mover_appearances where id=(entry->>'appearanceId')::uuid;
  if not found then continue;end if;
  if entry?'error'then update public.market_data_quality_audit_items set status='failed',last_error=entry->>'error',completed_at=now()where audit_run_id=p_run_id and appearance_id=a.id;continue;end if;
  for finding in select value from jsonb_array_elements(coalesce(entry->'findings','[]'::jsonb))loop
   insert into public.market_data_quality_findings(appearance_id,ticker_id,report_id,category_id,audit_run_id,field_name,finding_type,severity,original_value,numeric_original_value,rule_id,rule_version,confidence_score,evidence,status)
   values(a.id,a.ticker_id,a.report_id,a.category_id,p_run_id,finding->>'fieldName',finding->>'findingType',finding->>'severity',finding->>'originalValue',nullif(finding->>'numericOriginalValue','')::numeric,finding->>'ruleId',finding->>'ruleVersion',(finding->>'confidenceScore')::numeric,coalesce(finding->'evidence','{}'::jsonb),case when finding?'proposal'then'proposed'else'open'end)
   on conflict(appearance_id,field_name,rule_id,rule_version)do update set audit_run_id=excluded.audit_run_id,severity=excluded.severity,original_value=excluded.original_value,numeric_original_value=excluded.numeric_original_value,confidence_score=excluded.confidence_score,evidence=excluded.evidence,detected_at=now(),status=case when market_data_quality_findings.status in('approved','rejected','ignored','auto_resolved')then market_data_quality_findings.status else excluded.status end,updated_at=now()
   returning id into v_finding_id;
   proposal:=finding->'proposal';
   if proposal is not null and jsonb_typeof(proposal)='object'then
    select id into v_proposal_id from public.market_data_correction_proposals where finding_id=v_finding_id and is_current for update;
    if v_proposal_id is null then
     insert into public.market_data_correction_proposals(finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
     values(v_finding_id,a.id,finding->>'fieldName',finding->>'originalValue',proposal->>'proposedValue',nullif(proposal->>'proposedNumericValue','')::numeric,proposal->>'proposalMethod',(proposal->>'confidenceScore')::numeric,proposal->>'reason',coalesce(proposal->'evidence','{}'::jsonb));
    else update public.market_data_correction_proposals set proposed_value=proposal->>'proposedValue',proposed_numeric_value=nullif(proposal->>'proposedNumericValue','')::numeric,proposal_method=proposal->>'proposalMethod',confidence_score=(proposal->>'confidenceScore')::numeric,reason=proposal->>'reason',evidence=coalesce(proposal->'evidence','{}'::jsonb),updated_at=now()where id=v_proposal_id and status='pending';end if;
   end if;
  end loop;
  update public.market_data_quality_audit_items set status='completed',completed_at=now(),last_error=null where audit_run_id=p_run_id and appearance_id=a.id;
 end loop;
 return public.refresh_market_data_quality_audit_run(p_run_id);
end$$;

create or replace function public.approve_market_data_proposal(p_proposal_id uuid,p_reviewed_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.market_data_correction_proposals;f public.market_data_quality_findings;a public.market_mover_appearances;e public.market_data_effective_values;l_id uuid;old_text text;action text:='approve';
begin
 select*into p from public.market_data_correction_proposals where id=p_proposal_id for update;if not found or p.status<>'pending'or not p.is_current then raise exception'Proposal is not pending/current';end if;
 perform pg_advisory_xact_lock(hashtext(p.appearance_id::text||':'||p.field_name));select*into f from public.market_data_quality_findings where id=p.finding_id for update;select*into a from public.market_mover_appearances where id=p.appearance_id;
 select*into e from public.market_data_effective_values where appearance_id=p.appearance_id and field_name=p.field_name for update;
 old_text:=case when e.appearance_id is not null then e.effective_value else case p.field_name when'rank'then a.rank::text when'price'then a.price::text when'change_amount'then a.change_amount::text when'change_percent'then a.change_percent::text when'trades'then a.trades::text when'volume'then a.volume::text when'dollar_volume'then a.dollar_volume::text end end;
 if e.appearance_id is not null then action:='supersede';update public.market_data_repair_log set reverted_at=now(),reverted_by=p_reviewed_by,revert_reason='Superseded by approved proposal '||p.id where id=e.repair_log_id and reverted_at is null;update public.market_data_correction_proposals set status='superseded',is_current=false,updated_at=now()where id=e.proposal_id;end if;
 update public.market_data_correction_proposals set status='approved',approved_at=now(),approved_by=p_reviewed_by,updated_at=now()where id=p.id;
 update public.market_data_quality_findings set status='approved',reviewed_at=now(),reviewed_by=p_reviewed_by,notes=p_reason where id=f.id;
 insert into public.market_data_repair_log(appearance_id,finding_id,proposal_id,field_name,old_value,new_value,repair_action,reason,evidence,performed_by)
 values(p.appearance_id,p.finding_id,p.id,p.field_name,old_text,p.proposed_value,action,p_reason,jsonb_build_object('proposal_method',p.proposal_method,'confidence_score',p.confidence_score),p_reviewed_by)returning id into l_id;
 insert into public.market_data_effective_values(appearance_id,field_name,effective_value,effective_numeric_value,proposal_id,repair_log_id,approved_at,approved_by)
 values(p.appearance_id,p.field_name,p.proposed_value,p.proposed_numeric_value,p.id,l_id,now(),p_reviewed_by)
 on conflict(appearance_id,field_name)do update set effective_value=excluded.effective_value,effective_numeric_value=excluded.effective_numeric_value,proposal_id=excluded.proposal_id,repair_log_id=excluded.repair_log_id,approved_at=excluded.approved_at,approved_by=excluded.approved_by,updated_at=now();
 insert into public.market_data_recompute_queue(appearance_id,ticker_id,field_name,reason)values(a.id,a.ticker_id,p.field_name,'Effective value approved: '||p.id);
 return jsonb_build_object('proposal_id',p.id,'repair_log_id',l_id,'appearance_id',a.id,'field_name',p.field_name,'old_value',old_text,'effective_value',p.proposed_value);
end$$;

create or replace function public.reject_market_data_proposal(p_proposal_id uuid,p_reviewed_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$declare p public.market_data_correction_proposals;begin select*into p from public.market_data_correction_proposals where id=p_proposal_id for update;if not found or p.status<>'pending'then raise exception'Proposal is not pending';end if;update public.market_data_correction_proposals set status='rejected',rejected_at=now(),rejected_by=p_reviewed_by,updated_at=now()where id=p.id;update public.market_data_quality_findings set status='rejected',reviewed_at=now(),reviewed_by=p_reviewed_by,notes=p_reason where id=p.finding_id;return jsonb_build_object('proposal_id',p.id,'status','rejected');end$$;

create or replace function public.ignore_market_data_finding(p_finding_id uuid,p_reviewed_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$begin update public.market_data_quality_findings set status='ignored',reviewed_at=now(),reviewed_by=p_reviewed_by,notes=p_reason where id=p_finding_id and status in('open','proposed');if not found then raise exception'Finding is not reviewable';end if;update public.market_data_correction_proposals set status='superseded',is_current=false,updated_at=now()where finding_id=p_finding_id and status='pending'and is_current;return jsonb_build_object('finding_id',p_finding_id,'status','ignored');end$$;

create or replace function public.edit_market_data_proposal(p_proposal_id uuid,p_value text,p_numeric_value numeric,p_reviewed_by text,p_reason text)returns uuid
language plpgsql security definer set search_path=public as $$declare p public.market_data_correction_proposals;new_id uuid;begin select*into p from public.market_data_correction_proposals where id=p_proposal_id for update;if not found or p.status<>'pending'or not p.is_current then raise exception'Proposal is not editable';end if;update public.market_data_correction_proposals set status='superseded',is_current=false,updated_at=now()where id=p.id;insert into public.market_data_correction_proposals(finding_id,appearance_id,field_name,original_value,proposed_value,proposed_numeric_value,proposal_method,confidence_score,reason,evidence)
values(p.finding_id,p.appearance_id,p.field_name,p.original_value,p_value,p_numeric_value,'manual_review',p.confidence_score,p_reason,p.evidence||jsonb_build_object('edited_from',p.id,'edited_by',p_reviewed_by))returning id into new_id;return new_id;end$$;

create or replace function public.revert_market_data_repair(p_appearance_id uuid,p_field_name text,p_reverted_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$
declare e public.market_data_effective_values;a public.market_mover_appearances;l_id uuid;raw_text text;
begin perform pg_advisory_xact_lock(hashtext(p_appearance_id::text||':'||p_field_name));select*into e from public.market_data_effective_values where appearance_id=p_appearance_id and field_name=p_field_name for update;if not found then raise exception'No active effective repair exists';end if;select*into a from public.market_mover_appearances where id=p_appearance_id;
 raw_text:=case p_field_name when'rank'then a.rank::text when'price'then a.price::text when'change_amount'then a.change_amount::text when'change_percent'then a.change_percent::text when'trades'then a.trades::text when'volume'then a.volume::text when'dollar_volume'then a.dollar_volume::text else null end;
 insert into public.market_data_repair_log(appearance_id,finding_id,proposal_id,field_name,old_value,new_value,repair_action,reason,evidence,performed_by,reversible)
 select e.appearance_id,p.finding_id,e.proposal_id,e.field_name,e.effective_value,raw_text,'revert',p_reason,jsonb_build_object('reverted_repair_log_id',e.repair_log_id),p_reverted_by,false from public.market_data_correction_proposals p where p.id=e.proposal_id returning id into l_id;
 update public.market_data_repair_log set reverted_at=now(),reverted_by=p_reverted_by,revert_reason=p_reason where id=e.repair_log_id;
 update public.market_data_correction_proposals set status='superseded',is_current=false,updated_at=now()where id=e.proposal_id;
 update public.market_data_quality_findings set status='open',reviewed_at=now(),reviewed_by=p_reverted_by,notes='Repair reverted: '||p_reason where id=(select finding_id from public.market_data_correction_proposals where id=e.proposal_id);
 delete from public.market_data_effective_values where appearance_id=p_appearance_id and field_name=p_field_name;
 insert into public.market_data_recompute_queue(appearance_id,ticker_id,field_name,reason)values(a.id,a.ticker_id,p_field_name,'Effective repair reverted: '||l_id);
 return jsonb_build_object('appearance_id',a.id,'field_name',p_field_name,'restored_raw_value',raw_text,'repair_log_id',l_id);
end$$;

do $$declare t text;begin foreach t in array array['market_data_quality_audit_runs','market_data_quality_audit_items','market_data_quality_findings','market_data_correction_proposals','market_data_repair_log','market_data_effective_values','market_data_recompute_queue']loop execute format('alter table public.%I enable row level security',t);end loop;end$$;
create policy "Public read market data quality runs"on public.market_data_quality_audit_runs for select to anon,authenticated using(true);
create policy "Public read market data quality findings"on public.market_data_quality_findings for select to anon,authenticated using(true);
create policy "Public read market data proposals"on public.market_data_correction_proposals for select to anon,authenticated using(true);
create policy "Public read market data repair log"on public.market_data_repair_log for select to anon,authenticated using(true);
create policy "Public read market data effective values"on public.market_data_effective_values for select to anon,authenticated using(true);

do $$declare signature text;begin foreach signature in array array[
 'start_market_data_quality_audit(text,uuid[])','claim_market_data_quality_audit_items(uuid,integer)','refresh_market_data_quality_audit_run(uuid)','record_market_data_quality_batch(uuid,jsonb)',
 'approve_market_data_proposal(uuid,text,text)','reject_market_data_proposal(uuid,text,text)','ignore_market_data_finding(uuid,text,text)','edit_market_data_proposal(uuid,text,numeric,text,text)','revert_market_data_repair(uuid,text,text,text)'
]loop execute format('revoke all on function public.%s from public,anon,authenticated',signature);execute format('grant execute on function public.%s to service_role',signature);end loop;end$$;
