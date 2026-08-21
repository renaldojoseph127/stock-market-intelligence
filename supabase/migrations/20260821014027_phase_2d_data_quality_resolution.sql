-- Phase 2D: deterministic, auditable data-quality resolution over immutable RAW observations.
-- All repairs remain opt-in EFFECTIVE overlays. This migration never updates imported values.

create index if not exists market_data_findings_resolution_queue_idx
on public.market_data_quality_findings(confidence_score desc,field_name,finding_type,appearance_id)
include(ticker_id,report_id,category_id,severity,original_value,numeric_original_value)
where status in('open','proposed');

create index if not exists market_data_proposals_resolution_queue_idx
on public.market_data_correction_proposals(confidence_score desc,proposal_method,appearance_id,field_name)
include(finding_id,proposed_value,proposed_numeric_value,review_batch_eligible,updated_at)
where status='pending'and is_current;

create index if not exists market_data_effective_values_proposal_idx
on public.market_data_effective_values(proposal_id);

create or replace function public.market_data_resolution_impact(
 p_field_name text,p_raw_value numeric,p_proposed_value numeric,p_raw_price numeric,p_raw_change_percent numeric,
 p_raw_volume numeric,p_raw_dollar_volume numeric,p_category_type text,p_total_appearances bigint
)returns jsonb
language sql immutable parallel safe set search_path=public as $$
 with v as(select
  case when p_field_name='price'then p_proposed_value else p_raw_price end projected_price,
  case when p_field_name='change_percent'then p_proposed_value else p_raw_change_percent end projected_change,
  case when p_field_name='volume'then p_proposed_value else p_raw_volume end projected_volume,
  case when p_field_name='dollar_volume'then p_proposed_value else p_raw_dollar_volume end projected_dollar_volume)
 select jsonb_build_object(
  'dataMode',jsonb_build_object('default','raw','approvalEffect','effective_overlay_only','rawValueUnchanged',true),
  'magnitude',jsonb_build_object('before',abs(p_raw_change_percent),'after',abs(v.projected_change),'changes',p_field_name='change_percent'and p_proposed_value is distinct from p_raw_value),
  'moverClassification',jsonb_build_object(
    'categoryType',p_category_type,
    'beforeDirection',case when p_raw_change_percent>0 then'gainer'when p_raw_change_percent<0 then'decliner'else'flat_or_unknown'end,
    'afterDirection',case when v.projected_change>0 then'gainer'when v.projected_change<0 then'decliner'else'flat_or_unknown'end,
    'categoryLabelChanges',false,
    'note','Imported category labels are immutable; only effective direction consistency may change.'),
  'historicalResearchPriority',jsonb_build_object(
    'version','historical-research-priority-v1','rawScoreUnchanged',true,'affectedComponent',case when p_field_name='change_percent'then'magnitude'else'none'end,
    'magnitudePointsBefore',case when p_raw_change_percent is null then 0 else least(25,round(abs(p_raw_change_percent)/4,2))end,
    'magnitudePointsAfter',case when v.projected_change is null then 0 else least(25,round(abs(v.projected_change)/4,2))end),
  'repeatMoverProfile',jsonb_build_object(
    'totalAppearances',coalesce(p_total_appearances,0),'membershipChanges',false,
    'affectedAggregate',case when p_field_name='change_percent'then'average_and_extreme_change'when p_field_name in('price','volume','dollar_volume')then p_field_name||'_derived_metrics'else'none'end,
    'note','A targeted EFFECTIVE recomputation is queued after approval.'),
  'historicalMoverSimilarity',jsonb_build_object(
    'version','historical-mover-similarity-v1','rawSimilarityUnchanged',true,
    'affectedDimensions',case when p_field_name='price'then jsonb_build_array('price_band')when p_field_name='change_percent'then jsonb_build_array('magnitude')when p_field_name in('volume','dollar_volume')then jsonb_build_array('liquidity')else'[]'::jsonb end),
  'priceVolumeMetrics',jsonb_build_object(
    'priceBefore',p_raw_price,'priceAfter',v.projected_price,'volumeBefore',p_raw_volume,'volumeAfter',v.projected_volume,
    'reportedDollarVolumeBefore',p_raw_dollar_volume,'reportedDollarVolumeAfter',v.projected_dollar_volume,
    'calculatedPriceTimesVolumeBefore',p_raw_price*p_raw_volume,'calculatedPriceTimesVolumeAfter',v.projected_price*v.projected_volume),
  'lookAheadSafety',jsonb_build_object('futureReturnsUsed',false,'laterPricesUsed',false,'laterDiscussionUsed',false,'laterOutcomesUsed',false)
 )from v
$$;

create or replace view public.market_data_resolution_queue with(security_invoker=true)as
with supporting as(
 select appearance_id,count(*)filter(where status in('open','proposed'))::int unresolved_finding_count
 from public.market_data_quality_findings group by appearance_id
),active_fields as(
 select appearance_id,field_name,count(*)::int active_proposal_count
 from public.market_data_correction_proposals where status='pending'and is_current group by appearance_id,field_name
),base as(
 select
  f.id finding_id,f.appearance_id,f.ticker_id,f.report_id,f.category_id,f.field_name,f.finding_type,f.severity,
  f.original_value,f.numeric_original_value,f.confidence_score finding_confidence,f.evidence finding_evidence,f.status finding_status,
  f.rule_id,f.rule_version,f.detected_at,
  p.id proposal_id,p.proposed_value,p.proposed_numeric_value,p.proposal_method,p.confidence_score proposal_confidence,
  p.reason proposal_reason,p.evidence proposal_evidence,p.status proposal_status,p.is_current,p.updated_at proposal_updated_at,
  p.review_tier,p.review_tier_reason,p.review_batch_eligible,
  t.symbol ticker_symbol,a.report_date,c.name category_name,c.category_type,r.source_filename,r.extraction_method,r.extraction_confidence,
  a.rank raw_rank,a.price raw_price,a.change_amount raw_change_amount,a.change_percent raw_change_percent,a.trades raw_trades,
  a.volume raw_volume,a.dollar_volume raw_dollar_volume,a.raw_values,
  coalesce(ts.total_appearances,1)::bigint total_ticker_appearances,coalesce(s.unresolved_finding_count,0)unresolved_finding_count,
  coalesce(af.active_proposal_count,0)active_proposal_count,(ev.appearance_id is not null)effective_value_exists,
  case p.field_name when'rank'then a.rank::text when'price'then a.price::text when'change_amount'then a.change_amount::text
    when'change_percent'then a.change_percent::text when'trades'then a.trades::text when'volume'then a.volume::text
    when'dollar_volume'then a.dollar_volume::text else null end raw_field_value,
  case when p.id is null then false
    when p.proposal_method in('column_realignment','source_line_reparse')then true
    else coalesce(p.evidence->>'lookAheadPolicy','')in('prior_observations_only','same_day_source_only')end look_ahead_safe,
  case when p.proposal_method in('decimal_restoration','column_realignment','source_line_reparse','cross_field_validation','cross_day_continuity')
    and p.proposed_value is not null then true else false end deterministic_qualified
 from public.market_data_quality_findings f
 join public.market_mover_appearances a on a.id=f.appearance_id
 join public.tickers t on t.id=f.ticker_id join public.market_categories c on c.id=f.category_id join public.source_reports r on r.id=f.report_id
 left join public.market_data_correction_proposals p on p.finding_id=f.id and p.is_current
 left join public.market_data_effective_values ev on ev.appearance_id=f.appearance_id and ev.field_name=f.field_name
 left join public.ticker_statistics ts on ts.ticker_id=f.ticker_id
 left join supporting s on s.appearance_id=f.appearance_id left join active_fields af on af.appearance_id=f.appearance_id and af.field_name=f.field_name
),scored as(
 select b.*,
  case when coalesce(b.proposal_confidence,b.finding_confidence)>=.90 then'HIGH'when coalesce(b.proposal_confidence,b.finding_confidence)>=.70 then'MEDIUM'else'LOW'end confidence_band,
  least(100,
    case b.field_name when'change_percent'then 25 when'price'then 25 when'dollar_volume'then 20 when'volume'then 15 when'trades'then 10 else 5 end+
    round(coalesce(b.proposal_confidence,b.finding_confidence)*20)+
    case b.finding_type when'possible_column_shift'then 20 when'ocr_alignment_error'then 20 when'possible_missing_decimal'then 18 when'cross_field_inconsistency'then 15 when'ticker_sequence_outlier'then 10 else 5 end+
    case when b.total_ticker_appearances>1 then 10 else 0 end+
    case when b.deterministic_qualified and b.look_ahead_safe then 15 else 0 end
  )::numeric resolution_priority_score
 from base b
)
select s.*,
 case when s.resolution_priority_score>=80 then'critical'when s.resolution_priority_score>=60 then'high'when s.resolution_priority_score>=40 then'medium'else'low'end priority_band,
 array_remove(array[
  case when s.field_name in('price','change_percent')then'high-impact analytical field'end,
  case when s.total_ticker_appearances>1 then'repeat-mover relevance'end,
  case when s.deterministic_qualified then'deterministic candidate available'end,
  case when s.look_ahead_safe then'look-ahead-safe evidence'end
 ],null)::text[] priority_reasons,
 case
  when s.proposal_id is null then array['No deterministic proposal is currently available from same-day or prior-only evidence.']::text[]
  when not s.look_ahead_safe then array['Legacy proposal is not certified as prior-only and is excluded from Phase 2D bulk approval.']::text[]
  when s.proposal_method='column_realignment'then array['Approve as an atomic coordinated-row repair; an unknown price remains unknown.']::text[]
  when s.proposal_method='cross_field_validation'then array['Reported dollar volume can use a methodology different from last price multiplied by volume. Manual review is required.']::text[]
  when s.proposal_method='cross_day_continuity'then array['Splits and other corporate actions can create legitimate sequence changes. Manual review is required.']::text[]
  else coalesce(array(select jsonb_array_elements_text(coalesce(s.proposal_evidence->'resolutionWarnings','[]'::jsonb))),array[]::text[])
 end warnings,
 jsonb_build_object(
  'reportId',s.report_id,'sourceFilename',s.source_filename,'reportDate',s.report_date,'extractionMethod',s.extraction_method,
  'extractionConfidence',s.extraction_confidence,'sourcePageNumber',nullif(s.raw_values->>'sourcePageNumber',''),
  'rawOcrLine',nullif(s.raw_values->>'line',''),'ocrPageProvenance',s.raw_values->'ocrPageProvenance','rawValues',s.raw_values
 )source_provenance,
 public.market_data_resolution_impact(s.field_name,s.numeric_original_value,s.proposed_numeric_value,s.raw_price,s.raw_change_percent,s.raw_volume,s.raw_dollar_volume,s.category_type,s.total_ticker_appearances)impact_analysis,
 (s.proposal_id is not null and s.proposal_status='pending'and s.is_current and s.review_batch_eligible and s.review_tier in('A','B')
  and s.proposal_method in('decimal_restoration','source_line_reparse')and s.proposal_confidence>=.90 and s.look_ahead_safe
  and not s.effective_value_exists and s.active_proposal_count=1 and s.raw_field_value is not distinct from s.original_value)resolution_bulk_eligible,
 coalesce(s.proposal_status,s.finding_status)resolution_status
from scored s;

create or replace function public.get_market_data_resolution_queue(
 p_ticker text default null,p_date_from date default null,p_date_to date default null,p_field text default null,
 p_finding_type text default null,p_repair_method text default null,p_confidence_band text default null,
 p_status text default'unresolved',p_priority text default null,p_cursor_priority numeric default null,
 p_cursor_finding_id uuid default null,p_limit integer default 50
)returns setof public.market_data_resolution_queue
language sql stable security invoker set search_path=public as $$
 select q from public.market_data_resolution_queue q
 where(nullif(trim(p_ticker),'')is null or q.ticker_symbol=upper(trim(p_ticker)))
  and(p_date_from is null or q.report_date>=p_date_from)and(p_date_to is null or q.report_date<=p_date_to)
  and(nullif(p_field,'')is null or q.field_name=p_field)and(nullif(p_finding_type,'')is null or q.finding_type=p_finding_type)
  and(nullif(p_repair_method,'')is null or q.proposal_method=p_repair_method)
  and(nullif(p_confidence_band,'')is null or q.confidence_band=upper(p_confidence_band))
  and(case when coalesce(nullif(p_status,''),'unresolved')='unresolved'then q.finding_status in('open','proposed')else q.resolution_status=p_status end)
  and(nullif(p_priority,'')is null or q.priority_band=p_priority)
  and(p_cursor_priority is null or q.resolution_priority_score<p_cursor_priority
    or(q.resolution_priority_score=p_cursor_priority and(p_cursor_finding_id is null or q.finding_id<p_cursor_finding_id)))
 order by q.resolution_priority_score desc,q.finding_id desc limit least(100,greatest(1,coalesce(p_limit,50)))
$$;

create or replace function public.get_market_data_resolution_summary()
returns table(
 total_appearances bigint,unresolved_findings bigint,repairable_high_confidence bigint,medium_confidence_queue bigint,
 low_confidence_manual_queue bigint,approved_overlays bigint,affected_appearances bigint,clean_appearances bigint,
 effective_overlay_appearances bigint,clean_raw_coverage_percent numeric,effective_overlay_coverage_percent numeric
)language sql stable security invoker set search_path=public as $$
 with totals as(select count(*)::bigint total from public.market_mover_appearances),
 unresolved as(select count(*)::bigint findings,count(distinct appearance_id)::bigint appearances from public.market_data_quality_findings where status in('open','proposed')),
 queue as(select
   count(*)filter(where finding_status in('open','proposed')and confidence_band='HIGH'and deterministic_qualified and look_ahead_safe)::bigint high,
   count(*)filter(where finding_status in('open','proposed')and confidence_band='MEDIUM'and deterministic_qualified and look_ahead_safe)::bigint medium,
   count(*)filter(where finding_status in('open','proposed')and(confidence_band='LOW'or not deterministic_qualified or not look_ahead_safe))::bigint low
  from public.market_data_resolution_queue),
 overlays as(select count(*)::bigint fields,count(distinct appearance_id)::bigint appearances from public.market_data_effective_values)
 select t.total,u.findings,q.high,q.medium,q.low,o.fields,u.appearances,(t.total-u.appearances)::bigint,o.appearances,
  case when t.total=0 then 0 else round(100*(t.total-u.appearances)::numeric/t.total,2)end,
  case when t.total=0 then 0 else round(100*o.appearances::numeric/t.total,2)end
 from totals t cross join unresolved u cross join queue q cross join overlays o
$$;

create or replace function public.get_market_data_resolution_breakdowns(p_limit integer default 24)
returns table(dimension text,group_key text,item_count bigint,affected_appearances bigint)
language sql stable security invoker set search_path=public as $$
 with base as(
  select f.appearance_id,f.field_name,f.finding_type,f.status,
   coalesce(p.proposal_method,'no_proposal')proposal_method,
   case when coalesce(p.confidence_score,f.confidence_score)>=.90 then'HIGH'when coalesce(p.confidence_score,f.confidence_score)>=.70 then'MEDIUM'else'LOW'end confidence_band
  from public.market_data_quality_findings f left join public.market_data_correction_proposals p on p.finding_id=f.id and p.is_current
 ),groups as(
  select'field'::text dimension,field_name group_key,count(*)::bigint item_count,count(distinct appearance_id)::bigint affected_appearances from base group by field_name
  union all select'finding_type',finding_type,count(*)::bigint,count(distinct appearance_id)::bigint from base group by finding_type
  union all select'method',proposal_method,count(*)::bigint,count(distinct appearance_id)::bigint from base group by proposal_method
  union all select'confidence',confidence_band,count(*)::bigint,count(distinct appearance_id)::bigint from base group by confidence_band
  union all select'status',status,count(*)::bigint,count(distinct appearance_id)::bigint from base group by status
 ),ranked as(select g.*,row_number()over(partition by dimension order by item_count desc,group_key)rn from groups g)
 select dimension,group_key,item_count,affected_appearances from ranked where rn<=least(100,greatest(1,coalesce(p_limit,24)))order by dimension,item_count desc,group_key
$$;

create or replace view public.market_data_resolution_proposals with(security_invoker=true)as
select r.*,
 case when r.review_tier in('A','B')and r.proposal_method in('decimal_restoration','source_line_reparse')
   and r.proposal_confidence>=.90 and(r.proposal_method='source_line_reparse'or coalesce(r.proposal_evidence->>'lookAheadPolicy','')in('prior_observations_only','same_day_source_only'))
   and r.batch_approval_eligible then true else false end resolution_bulk_eligible,
 case when r.proposal_confidence>=.90 then'HIGH'when r.proposal_confidence>=.70 then'MEDIUM'else'LOW'end confidence_band,
 q.resolution_priority_score,q.priority_band,q.priority_reasons,q.source_provenance,q.warnings,q.impact_analysis,q.look_ahead_safe
from public.market_data_repair_review r
left join public.market_data_resolution_queue q on q.proposal_id=r.proposal_id;

create or replace function public.review_market_data_resolution_batch(
 p_items jsonb,p_reviewed_by text,p_reason text
)returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb;p public.market_data_correction_proposals;
begin
 if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array'or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>25 then
  raise exception'Phase 2D bulk approval requires 1 to 25 proposals';end if;
 for item in select value from jsonb_array_elements(p_items)loop
  select*into p from public.market_data_correction_proposals where id=(item->>'proposalId')::uuid;
  if not found or p.status<>'pending'or not p.is_current or not p.review_batch_eligible or p.review_tier not in('A','B')
   or p.proposal_method not in('decimal_restoration','source_line_reparse')or p.confidence_score<.90
   or(p.proposal_method='decimal_restoration'and coalesce(p.evidence->>'lookAheadPolicy','')not in('prior_observations_only','same_day_source_only'))then
   raise exception'Proposal % is not a safely qualified deterministic Phase 2D bulk repair',item->>'proposalId';
  end if;
 end loop;
 return public.review_market_data_proposal_batch('approve',p_items,p_reviewed_by,p_reason,null);
end$$;

grant select on public.market_data_resolution_queue,public.market_data_resolution_proposals to anon,authenticated;
grant execute on function public.market_data_resolution_impact(text,numeric,numeric,numeric,numeric,numeric,numeric,text,bigint)to anon,authenticated;
grant execute on function public.get_market_data_resolution_queue(text,date,date,text,text,text,text,text,text,numeric,uuid,integer)to anon,authenticated;
grant execute on function public.get_market_data_resolution_summary()to anon,authenticated;
grant execute on function public.get_market_data_resolution_breakdowns(integer)to anon,authenticated;
revoke all on function public.review_market_data_resolution_batch(jsonb,text,text)from public,anon,authenticated;
grant execute on function public.review_market_data_resolution_batch(jsonb,text,text)to service_role;
