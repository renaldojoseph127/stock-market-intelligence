-- Phase 2A.2.1: conservative human triage and bounded, optimistic repair decisions.

alter table public.market_data_correction_proposals
  add column review_tier text check(review_tier in('A','B','C','D')),
  add column review_classifier_version text,
  add column review_tier_reason text,
  add column review_batch_eligible boolean not null default false,
  add column review_classified_at timestamptz;

create or replace function public.classify_market_data_repair_proposal()
returns trigger language plpgsql set search_path=public as $$
declare f public.market_data_quality_findings;strong_source boolean:=false;source_available boolean:=false;
begin
  select*into f from public.market_data_quality_findings where id=new.finding_id;
  if not found then raise exception'Proposal finding does not exist';end if;
  select nullif(a.raw_values->>'line','')is not null into source_available from public.market_mover_appearances a where a.id=new.appearance_id;
  strong_source:=coalesce(source_available,false)and(
    nullif(trim(f.evidence->>'rawPriceToken'),'')is not null or nullif(trim(f.evidence->>'rawPercentToken'),'')is not null
    or nullif(trim(f.evidence->>'rawLine'),'')is not null or nullif(trim(new.evidence->>'rawPriceToken'),'')is not null
    or nullif(trim(new.evidence->>'rawPercentToken'),'')is not null or nullif(trim(new.evidence->>'rawLine'),'')is not null);
  new.review_classifier_version:='repair-review-v1';new.review_classified_at:=now();
  if new.proposal_method='column_realignment'or f.finding_type in('possible_column_shift','ocr_alignment_error')then
    new.review_tier:='C';new.review_tier_reason:='Coordinated OCR column realignment requires grouped row review.';
  elsif f.finding_type in('thousands_separator_error','currency_format_error','percentage_format_error')
    and new.proposal_method='source_line_reparse'and new.confidence_score>=.99 and strong_source and new.proposed_value is not null then
    new.review_tier:='A';new.review_tier_reason:='Source punctuation and a deterministic normalization directly support the proposed value.';
  elsif new.proposal_method='decimal_restoration'and new.confidence_score>=.90 and strong_source and new.proposed_value is not null then
    new.review_tier:='B';new.review_tier_reason:='High-confidence decimal inference has source-token and continuity evidence but remains non-conclusive.';
  else
    new.review_tier:='D';new.review_tier_reason:='Evidence is insufficient for efficient batch approval or the proposal requires individual validation.';
  end if;
  new.review_batch_eligible:=new.review_tier in('A','B')and new.status='pending'and new.is_current
    and new.proposed_value is not null and f.status in('open','proposed')and f.rule_version='2a2-v1';
  return new;
end$$;

create trigger market_data_proposal_review_classifier
before insert or update on public.market_data_correction_proposals
for each row execute function public.classify_market_data_repair_proposal();

update public.market_data_correction_proposals set review_classifier_version='repair-review-v1';
alter table public.market_data_correction_proposals alter column review_tier set not null;
alter table public.market_data_correction_proposals alter column review_classifier_version set not null;
alter table public.market_data_correction_proposals alter column review_tier_reason set not null;
alter table public.market_data_correction_proposals alter column review_classified_at set not null;

create index market_data_proposals_review_queue_idx on public.market_data_correction_proposals(status,is_current,review_tier,confidence_score desc,created_at desc);
create index market_data_proposals_field_idx on public.market_data_correction_proposals(field_name);
create index market_data_proposals_finding_idx on public.market_data_correction_proposals(finding_id);
create index market_data_proposals_created_idx on public.market_data_correction_proposals(created_at desc);
create index market_data_proposals_appearance_field_idx on public.market_data_correction_proposals(appearance_id,field_name,status,is_current);
create index market_data_recompute_appearance_field_idx on public.market_data_recompute_queue(appearance_id,field_name,created_at desc);

create or replace function public.market_data_raw_field_value(p_appearance_id uuid,p_field_name text)returns text
language sql stable security definer set search_path=public as $$
 select case p_field_name when'rank'then a.rank::text when'price'then a.price::text when'change_amount'then a.change_amount::text
  when'change_percent'then a.change_percent::text when'trades'then a.trades::text when'volume'then a.volume::text
  when'dollar_volume'then a.dollar_volume::text else null end from public.market_mover_appearances a where a.id=p_appearance_id
$$;

create or replace view public.market_data_repair_review with(security_invoker=true)as
select p.id proposal_id,p.finding_id,p.appearance_id,p.field_name,p.original_value,p.proposed_value,p.proposed_numeric_value,
 p.proposal_method,p.confidence_score proposal_confidence,p.reason proposal_reason,p.evidence proposal_evidence,p.status proposal_status,p.is_current,p.created_at proposal_created_at,p.updated_at proposal_updated_at,
 p.review_classifier_version,p.review_tier base_review_tier,
 case when state.has_conflict then'D'else p.review_tier end review_tier,
 case when state.has_conflict then state.conflict_reason else p.review_tier_reason end review_tier_reason,
 (p.review_batch_eligible and not state.has_conflict and state.original_matches_raw and f.status in('open','proposed')and p.review_tier in('A','B'))batch_approval_eligible,
 state.has_conflict,state.conflict_reason,state.original_matches_raw,(e.appearance_id is not null)effective_value_exists,
 f.finding_type,f.severity,f.status finding_status,f.detected_at finding_detected_at,f.rule_id,f.rule_version,f.confidence_score finding_confidence,f.evidence finding_evidence,
 t.id ticker_id,t.symbol ticker_symbol,a.report_date,c.id category_id,c.name category_name,c.category_type,
 r.id report_id,r.source_filename,r.extraction_method,r.extraction_confidence,
 a.rank raw_rank,a.price raw_price,a.change_amount raw_change_amount,a.change_percent raw_change_percent,a.trades raw_trades,a.volume raw_volume,a.dollar_volume raw_dollar_volume,a.raw_values,
 nullif(a.raw_values->>'line','')raw_ocr_line,nullif(a.raw_values->>'sourcePageNumber','')source_page_number,
 nullif(a.raw_values->>'ocrPageProvenance','')ocr_page_provenance,
 (nullif(a.raw_values->>'line','')is not null)source_evidence_available,
 coalesce(nullif(a.raw_values->>'sourceImagePath',''),nullif(a.raw_values->>'cropArtifactPath',''))source_image_path,
 (nullif(a.raw_values->>'sourceImagePath','')is not null or nullif(a.raw_values->>'cropArtifactPath','')is not null)source_image_available,
 prev.price previous_price,prev.report_date previous_date,nxt.price next_price,nxt.report_date next_date,
 support.supporting_finding_count,groups.group_proposal_count,
 case f.severity when'critical'then 5 when'high'then 4 when'medium'then 3 when'low'then 2 else 1 end severity_rank,
 case when state.has_conflict then 4 when p.review_tier='A'then 1 when p.review_tier='B'then 2 when p.review_tier='C'then 3 else 4 end tier_order
from public.market_data_correction_proposals p
join public.market_data_quality_findings f on f.id=p.finding_id
join public.market_mover_appearances a on a.id=p.appearance_id
join public.tickers t on t.id=f.ticker_id join public.market_categories c on c.id=f.category_id join public.source_reports r on r.id=f.report_id
left join public.market_data_effective_values e on e.appearance_id=p.appearance_id and e.field_name=p.field_name
left join lateral(select count(*)::int active_count,count(distinct coalesce(x.proposed_value,'<NULL>'))::int distinct_values
 from public.market_data_correction_proposals x where x.appearance_id=p.appearance_id and x.field_name=p.field_name and x.status='pending'and x.is_current)conflicts on true
left join lateral(select case p.field_name when'rank'then a.rank::text when'price'then a.price::text when'change_amount'then a.change_amount::text
 when'change_percent'then a.change_percent::text when'trades'then a.trades::text when'volume'then a.volume::text when'dollar_volume'then a.dollar_volume::text else null end raw_text)raw on true
left join lateral(select (raw.raw_text is not distinct from p.original_value)original_matches_raw,
 (conflicts.active_count>1 or e.appearance_id is not null or raw.raw_text is distinct from p.original_value or not p.is_current or p.status='superseded')has_conflict,
 case when conflicts.active_count>1 then'multiple_active_proposals'when e.appearance_id is not null then'effective_value_exists'
  when raw.raw_text is distinct from p.original_value then'original_value_mismatch'when not p.is_current or p.status='superseded'then'superseded_proposal'else null end conflict_reason)state on true
left join lateral(select count(*)filter(where sf.status in('open','proposed'))::int supporting_finding_count from public.market_data_quality_findings sf where sf.appearance_id=p.appearance_id)support on true
left join lateral(select count(*)filter(where gp.status='pending'and gp.is_current and gp.proposal_method='column_realignment')::int group_proposal_count from public.market_data_correction_proposals gp where gp.appearance_id=p.appearance_id)groups on true
left join lateral(select h.report_date,h.price from public.market_mover_appearances h where h.ticker_id=a.ticker_id and h.id<>a.id and h.report_date<a.report_date order by h.report_date desc,h.id limit 1)prev on true
left join lateral(select h.report_date,h.price from public.market_mover_appearances h where h.ticker_id=a.ticker_id and h.id<>a.id and h.report_date>a.report_date order by h.report_date,h.id limit 1)nxt on true;

create or replace view public.market_data_repair_review_summary with(security_invoker=true)as
select count(*)filter(where proposal_status='pending'and is_current)::bigint pending_proposals,
 count(*)filter(where proposal_status='pending'and is_current and review_tier='A')::bigint tier_a,
 count(*)filter(where proposal_status='pending'and is_current and review_tier='B')::bigint tier_b,
 count(*)filter(where proposal_status='pending'and is_current and review_tier='C')::bigint tier_c,
 count(*)filter(where proposal_status='pending'and is_current and review_tier='D')::bigint tier_d,
 count(*)filter(where proposal_status='pending'and is_current and has_conflict)::bigint conflicts,
 (select count(*)from public.market_data_correction_proposals where approved_at>=date_trunc('day',now()))::bigint approved_today,
 (select count(*)from public.market_data_correction_proposals where rejected_at>=date_trunc('day',now()))::bigint rejected_today
from public.market_data_repair_review;

create or replace view public.market_data_approved_repairs with(security_invoker=true)as
select e.appearance_id,e.field_name,e.effective_value,e.effective_numeric_value,e.approved_at,e.approved_by,e.updated_at,
 p.id proposal_id,p.finding_id,p.proposal_method,p.confidence_score,p.review_tier,p.review_classifier_version,
 l.id repair_log_id,l.old_value raw_value,l.new_value,l.reason,l.evidence decision_evidence,
 a.report_date,t.symbol ticker_symbol,c.name category_name,
 coalesce(q.status,'not_required')recomputation_status,q.targets recomputation_targets,q.created_at recomputation_queued_at,q.completed_at recomputation_completed_at
from public.market_data_effective_values e join public.market_data_correction_proposals p on p.id=e.proposal_id
join public.market_data_repair_log l on l.id=e.repair_log_id join public.market_mover_appearances a on a.id=e.appearance_id
join public.tickers t on t.id=a.ticker_id join public.market_categories c on c.id=a.category_id
left join lateral(select rq.status,rq.targets,rq.created_at,rq.completed_at from public.market_data_recompute_queue rq
 where rq.appearance_id=e.appearance_id and rq.field_name=e.field_name order by rq.created_at desc limit 1)q on true;

create or replace function public.approve_market_data_proposal(p_proposal_id uuid,p_reviewed_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.market_data_correction_proposals;f public.market_data_quality_findings;a public.market_mover_appearances;e public.market_data_effective_values;l_id uuid;old_text text;action text:='approve';
begin
 if nullif(trim(p_reviewed_by),'')is null or nullif(trim(p_reason),'')is null then raise exception'Reviewer and reason are required';end if;
 select*into p from public.market_data_correction_proposals where id=p_proposal_id for update;if not found or p.status<>'pending'or not p.is_current then raise exception'Proposal is not pending/current';end if;
 perform pg_advisory_xact_lock(hashtext(p.appearance_id::text||':'||p.field_name));select*into f from public.market_data_quality_findings where id=p.finding_id for update;select*into a from public.market_mover_appearances where id=p.appearance_id;
 select*into e from public.market_data_effective_values where appearance_id=p.appearance_id and field_name=p.field_name for update;
 old_text:=case when e.appearance_id is not null then e.effective_value else public.market_data_raw_field_value(p.appearance_id,p.field_name)end;
 if e.appearance_id is not null then action:='supersede';update public.market_data_repair_log set reverted_at=now(),reverted_by=p_reviewed_by,revert_reason='Superseded by approved proposal '||p.id where id=e.repair_log_id and reverted_at is null;update public.market_data_correction_proposals set status='superseded',is_current=false,updated_at=now()where id=e.proposal_id;end if;
 update public.market_data_correction_proposals set status='approved',approved_at=now(),approved_by=p_reviewed_by,updated_at=now()where id=p.id;
 update public.market_data_quality_findings set status='approved',reviewed_at=now(),reviewed_by=p_reviewed_by,notes=p_reason where id=f.id;
 insert into public.market_data_repair_log(appearance_id,finding_id,proposal_id,field_name,old_value,new_value,repair_action,reason,evidence,performed_by)
 values(p.appearance_id,p.finding_id,p.id,p.field_name,old_text,p.proposed_value,action,p_reason,
  jsonb_build_object('proposal_method',p.proposal_method,'confidence_score',p.confidence_score,'review_classifier_version',p.review_classifier_version,'review_tier',p.review_tier,'proposal_rule_version',f.rule_version,'review_note',p_reason),p_reviewed_by)returning id into l_id;
 insert into public.market_data_effective_values(appearance_id,field_name,effective_value,effective_numeric_value,proposal_id,repair_log_id,approved_at,approved_by)
 values(p.appearance_id,p.field_name,p.proposed_value,p.proposed_numeric_value,p.id,l_id,now(),p_reviewed_by)
 on conflict(appearance_id,field_name)do update set effective_value=excluded.effective_value,effective_numeric_value=excluded.effective_numeric_value,proposal_id=excluded.proposal_id,repair_log_id=excluded.repair_log_id,approved_at=excluded.approved_at,approved_by=excluded.approved_by,updated_at=now();
 insert into public.market_data_recompute_queue(appearance_id,ticker_id,field_name,reason)values(a.id,a.ticker_id,p.field_name,'Effective value approved: '||p.id);
 return jsonb_build_object('proposal_id',p.id,'repair_log_id',l_id,'appearance_id',a.id,'field_name',p.field_name,'old_value',old_text,'effective_value',p.proposed_value,'recomputation_queued',true);
end$$;

create or replace function public.reject_market_data_proposal(p_proposal_id uuid,p_reviewed_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.market_data_correction_proposals;f public.market_data_quality_findings;l_id uuid;
begin
 if nullif(trim(p_reviewed_by),'')is null or nullif(trim(p_reason),'')is null then raise exception'Reviewer and reason are required';end if;
 select*into p from public.market_data_correction_proposals where id=p_proposal_id for update;if not found or p.status<>'pending'or not p.is_current then raise exception'Proposal is not pending/current';end if;
 select*into f from public.market_data_quality_findings where id=p.finding_id for update;
 update public.market_data_correction_proposals set status='rejected',rejected_at=now(),rejected_by=p_reviewed_by,updated_at=now()where id=p.id;
 update public.market_data_quality_findings set status='rejected',reviewed_at=now(),reviewed_by=p_reviewed_by,notes=p_reason where id=p.finding_id;
 insert into public.market_data_repair_log(appearance_id,finding_id,proposal_id,field_name,old_value,new_value,repair_action,reason,evidence,performed_by,reversible)
 values(p.appearance_id,p.finding_id,p.id,p.field_name,p.original_value,p.proposed_value,'reject',p_reason,
  jsonb_build_object('proposal_method',p.proposal_method,'confidence_score',p.confidence_score,'review_classifier_version',p.review_classifier_version,'review_tier',p.review_tier,'proposal_rule_version',f.rule_version,'review_note',p_reason),p_reviewed_by,false)returning id into l_id;
 return jsonb_build_object('proposal_id',p.id,'status','rejected','repair_log_id',l_id);
end$$;

create or replace function public.review_market_data_proposal_batch_item(p_action text,p_proposal_id uuid,p_expected_updated_at timestamptz,p_reviewed_by text,p_reason text)returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.market_data_correction_proposals;f public.market_data_quality_findings;raw_text text;conflicts int;result jsonb;
begin
 select*into p from public.market_data_correction_proposals where id=p_proposal_id for update;
 if not found then return jsonb_build_object('proposalId',p_proposal_id,'status','failed','reason','proposal_not_found');end if;
 if p_action='reject'and p.status='rejected'then return jsonb_build_object('proposalId',p.id,'status','skipped','reason','already_rejected');end if;
 if p_action='approve'and p.status in('approved','auto_approved')then return jsonb_build_object('proposalId',p.id,'status','skipped','reason','already_approved');end if;
 if p.status<>'pending'or not p.is_current then return jsonb_build_object('proposalId',p.id,'status','skipped','reason','proposal_not_pending_current');end if;
 if p_expected_updated_at is null then return jsonb_build_object('proposalId',p.id,'status','not_eligible','reason','missing_optimistic_version');end if;
 if p.updated_at<>p_expected_updated_at then return jsonb_build_object('proposalId',p.id,'status','stale','reason','stale_proposal');end if;
 select*into f from public.market_data_quality_findings where id=p.finding_id for update;
 if not found or f.status not in('open','proposed')then return jsonb_build_object('proposalId',p.id,'status','not_eligible','reason','finding_not_unresolved');end if;
 if f.rule_version<>'2a2-v1'or p.review_classifier_version<>'repair-review-v1'then return jsonb_build_object('proposalId',p.id,'status','not_eligible','reason','unrecognized_rule_or_classifier_version');end if;
 if not exists(select 1 from public.market_mover_appearances where id=p.appearance_id)then return jsonb_build_object('proposalId',p.id,'status','failed','reason','appearance_not_found');end if;
 raw_text:=public.market_data_raw_field_value(p.appearance_id,p.field_name);
 if raw_text is distinct from p.original_value then return jsonb_build_object('proposalId',p.id,'status','conflict','reason','original_value_mismatch');end if;
 if p_action='approve'then
  select count(*)::int into conflicts from public.market_data_correction_proposals x where x.appearance_id=p.appearance_id and x.field_name=p.field_name and x.status='pending'and x.is_current;
  if conflicts>1 then return jsonb_build_object('proposalId',p.id,'status','conflict','reason','multiple_active_proposals');end if;
  if exists(select 1 from public.market_data_effective_values e where e.appearance_id=p.appearance_id and e.field_name=p.field_name)then return jsonb_build_object('proposalId',p.id,'status','conflict','reason','effective_value_exists');end if;
  if p.proposed_value is null or p.review_tier not in('A','B')or not p.review_batch_eligible then return jsonb_build_object('proposalId',p.id,'status','not_eligible','reason','tier_or_value_not_batch_eligible');end if;
  result:=public.approve_market_data_proposal(p.id,p_reviewed_by,p_reason);
  return jsonb_build_object('proposalId',p.id,'status','approved','reason','approved','recomputationQueued',coalesce((result->>'recomputation_queued')::boolean,false),'result',result);
 elsif p_action='reject'then
  result:=public.reject_market_data_proposal(p.id,p_reviewed_by,p_reason);
  return jsonb_build_object('proposalId',p.id,'status','rejected','reason','rejected','result',result);
 end if;
 return jsonb_build_object('proposalId',p.id,'status','failed','reason','unsupported_action');
end$$;

create or replace function public.review_market_data_proposal_batch(p_action text,p_items jsonb,p_reviewed_by text,p_reason text,p_rejection_reason text default null)returns jsonb
language plpgsql security definer set search_path=public as $$
declare item jsonb;outcome jsonb;results jsonb:='[]'::jsonb;requested int;approved int:=0;rejected int:=0;skipped int:=0;failed int:=0;decision_reason text;state text;
begin
 if p_action not in('approve','reject')then raise exception'Unsupported batch review action';end if;
 if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array'then raise exception'Items must be a JSON array';end if;
 requested:=jsonb_array_length(p_items);if requested<1 or requested>25 then raise exception'Batch decisions require 1 to 25 proposals';end if;
 if requested<>(select count(distinct value->>'proposalId')from jsonb_array_elements(p_items))then raise exception'Duplicate proposal IDs are not allowed';end if;
 if nullif(trim(p_reviewed_by),'')is null then raise exception'Reviewer is required';end if;
 if p_action='approve'and nullif(trim(p_reason),'')is null then raise exception'Approval review note is required';end if;
 if p_action='reject'and(p_rejection_reason is null or p_rejection_reason not in('incorrect_decimal','legitimate_extreme_move','insufficient_evidence','wrong_column_alignment','external_reference_disagrees','duplicate_or_superseded','other'))then raise exception'A supported rejection reason is required';end if;
 decision_reason:=case when p_action='reject'then p_rejection_reason||case when nullif(trim(coalesce(p_reason,'')),'')is null then''else': '||trim(p_reason)end else trim(p_reason)end;
 for item in select value from jsonb_array_elements(p_items)loop
  begin outcome:=public.review_market_data_proposal_batch_item(p_action,(item->>'proposalId')::uuid,nullif(item->>'updatedAt','')::timestamptz,p_reviewed_by,decision_reason);
  exception when others then outcome:=jsonb_build_object('proposalId',item->>'proposalId','status','failed','reason',sqlerrm);end;
  results:=results||jsonb_build_array(outcome);state:=outcome->>'status';
  if state='approved'then approved:=approved+1;elsif state='rejected'then rejected:=rejected+1;elsif state='failed'then failed:=failed+1;else skipped:=skipped+1;end if;
 end loop;
 return jsonb_build_object('requested',requested,'approved',approved,'rejected',rejected,'skipped',skipped,'failed',failed,'results',results);
end$$;

create or replace function public.review_market_data_proposal_group(p_action text,p_items jsonb,p_reviewed_by text,p_reason text,p_rejection_reason text default null)returns jsonb
language plpgsql security definer set search_path=public as $$
declare ids uuid[];appearance_ids uuid[];v_appearance_id uuid;item jsonb;p public.market_data_correction_proposals;f public.market_data_quality_findings;active_count int;raw_text text;results jsonb:='[]'::jsonb;result jsonb;decision_reason text;
begin
 if p_action not in('approve','reject')then raise exception'Unsupported grouped review action';end if;
 if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array'or jsonb_array_length(p_items)<2 or jsonb_array_length(p_items)>25 then raise exception'Grouped review requires 2 to 25 proposals';end if;
 if nullif(trim(p_reviewed_by),'')is null then raise exception'Reviewer is required';end if;
 if p_action='approve'and nullif(trim(p_reason),'')is null then raise exception'Approval review note is required';end if;
 if p_action='reject'and(p_rejection_reason is null or p_rejection_reason not in('incorrect_decimal','legitimate_extreme_move','insufficient_evidence','wrong_column_alignment','external_reference_disagrees','duplicate_or_superseded','other'))then raise exception'A supported rejection reason is required';end if;
 select array_agg((value->>'proposalId')::uuid)into ids from jsonb_array_elements(p_items);
 if cardinality(ids)<>cardinality(array(select distinct unnest(ids)))then raise exception'Duplicate proposal IDs are not allowed';end if;
 perform 1 from public.market_data_correction_proposals where id=any(ids)order by appearance_id,field_name for update;
 if(select count(*)from public.market_data_correction_proposals where id=any(ids))<>cardinality(ids)then raise exception'One or more proposals do not exist';end if;
 select array_agg(distinct x.appearance_id)into appearance_ids from public.market_data_correction_proposals x where x.id=any(ids);
 if cardinality(appearance_ids)<>1 then raise exception'Grouped proposals must belong to one appearance';end if;v_appearance_id:=appearance_ids[1];
 select count(*)::int into active_count from public.market_data_correction_proposals where appearance_id=v_appearance_id and status='pending'and is_current and proposal_method='column_realignment';
 if active_count<>cardinality(ids)then raise exception'Select every active coordinated row proposal';end if;
 for item in select value from jsonb_array_elements(p_items)loop
  select*into p from public.market_data_correction_proposals where id=(item->>'proposalId')::uuid;
  if p.status<>'pending'or not p.is_current or p.proposal_method<>'column_realignment'or p.review_tier<>'C'then raise exception'Grouped proposal is not an active Tier C column realignment';end if;
  if nullif(item->>'updatedAt','')::timestamptz is distinct from p.updated_at then raise exception'stale_proposal';end if;
  select*into f from public.market_data_quality_findings where id=p.finding_id;
  if f.status not in('open','proposed')or f.rule_version<>'2a2-v1'or p.review_classifier_version<>'repair-review-v1'then raise exception'Grouped finding is not eligible';end if;
  raw_text:=public.market_data_raw_field_value(p.appearance_id,p.field_name);if raw_text is distinct from p.original_value then raise exception'original_value_mismatch';end if;
  if exists(select 1 from public.market_data_effective_values e where e.appearance_id=p.appearance_id and e.field_name=p.field_name)then raise exception'effective_value_exists';end if;
  if p.proposed_value is null and not(p.field_name='price'and coalesce(f.evidence->>'rawLine','')~'%')then raise exception'Unknown grouped values are allowed only for source-proven missing price';end if;
 end loop;
 decision_reason:=case when p_action='reject'then p_rejection_reason||case when nullif(trim(coalesce(p_reason,'')),'')is null then''else': '||trim(p_reason)end else trim(p_reason)end;
 for item in select value from jsonb_array_elements(p_items)loop
  if p_action='approve'then result:=public.approve_market_data_proposal((item->>'proposalId')::uuid,p_reviewed_by,decision_reason);else result:=public.reject_market_data_proposal((item->>'proposalId')::uuid,p_reviewed_by,decision_reason);end if;
  results:=results||jsonb_build_array(jsonb_build_object('proposalId',item->>'proposalId','status',case when p_action='approve'then'approved'else'rejected'end,'result',result));
 end loop;
 return jsonb_build_object('appearanceId',v_appearance_id,'requested',cardinality(ids),'approved',case when p_action='approve'then cardinality(ids)else 0 end,'rejected',case when p_action='reject'then cardinality(ids)else 0 end,'recomputationQueued',p_action='approve','results',results);
end$$;

do $$declare signature text;begin foreach signature in array array[
 'market_data_raw_field_value(uuid,text)','review_market_data_proposal_batch_item(text,uuid,timestamptz,text,text)',
 'review_market_data_proposal_batch(text,jsonb,text,text,text)','review_market_data_proposal_group(text,jsonb,text,text,text)'
]loop execute format('revoke all on function public.%s from public,anon,authenticated',signature);execute format('grant execute on function public.%s to service_role',signature);end loop;end$$;
