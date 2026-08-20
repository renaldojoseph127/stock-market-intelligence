-- Phase 2C.1: derived cross-source intelligence and social-ready research.
-- Authoritative market, event, and social source rows are never rewritten here.

-- Durable, user-authored research metadata stays separate from source evidence.
alter table public.research_workspace_items
 add column if not exists appearance_id uuid references public.market_mover_appearances(id) on delete cascade,
 add column if not exists event_id uuid references public.ticker_events(id) on delete cascade,
 add column if not exists social_post_id uuid references public.social_posts(id) on delete cascade,
 add column if not exists account_id uuid references public.social_accounts(id) on delete cascade;

alter table public.research_workspace_items drop constraint if exists research_workspace_items_item_type_check;
alter table public.research_workspace_items add constraint research_workspace_items_item_type_check check(item_type in(
 'pinned_ticker','saved_comparison','saved_prompt','saved_filter','saved_event','saved_filing','saved_catalyst_comparison','saved_timeline',
 'ticker','mover','catalyst','social_post','account','research_prompt','comparison','note'
));
alter table public.research_workspace_items drop constraint if exists research_workspace_item_target;
alter table public.research_workspace_items add constraint research_workspace_item_target check(
 (item_type in('pinned_ticker','ticker') and ticker_id is not null) or
 (item_type='mover' and appearance_id is not null and ticker_id is not null) or
 (item_type='catalyst' and event_id is not null) or
 (item_type='social_post' and social_post_id is not null) or
 (item_type='account' and account_id is not null) or
 item_type in('saved_comparison','saved_prompt','saved_filter','saved_event','saved_filing','saved_catalyst_comparison','saved_timeline','research_prompt','comparison','note')
);
create index if not exists research_workspace_items_appearance_idx on public.research_workspace_items(appearance_id,workspace_id) where appearance_id is not null;
create index if not exists research_workspace_items_event_idx on public.research_workspace_items(event_id,workspace_id) where event_id is not null;
create index if not exists research_workspace_items_social_idx on public.research_workspace_items(social_post_id,workspace_id) where social_post_id is not null;
create index if not exists research_workspace_items_account_idx on public.research_workspace_items(account_id,workspace_id) where account_id is not null;
create unique index if not exists research_workspace_mover_uidx on public.research_workspace_items(workspace_id,appearance_id) where item_type='mover';
create unique index if not exists research_workspace_ticker_uidx on public.research_workspace_items(workspace_id,ticker_id) where item_type='ticker';
create unique index if not exists research_workspace_catalyst_uidx on public.research_workspace_items(workspace_id,event_id) where item_type in('catalyst','saved_event');
create unique index if not exists research_workspace_social_post_uidx on public.research_workspace_items(workspace_id,social_post_id) where item_type='social_post';
create unique index if not exists research_workspace_account_uidx on public.research_workspace_items(workspace_id,account_id) where item_type='account';

create table public.research_notes(
 id uuid primary key default gen_random_uuid(),workspace_id uuid references public.research_workspaces(id) on delete cascade,
 subject_type text not null check(subject_type in('ticker','mover','catalyst','research_workspace')),
 ticker_id uuid references public.tickers(id) on delete cascade,appearance_id uuid references public.market_mover_appearances(id) on delete cascade,
 event_id uuid references public.ticker_events(id) on delete cascade,note text not null check(length(trim(note)) between 1 and 10000),
 created_by text not null default 'researcher',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((subject_type='ticker' and ticker_id is not null)or(subject_type='mover' and appearance_id is not null)or(subject_type='catalyst' and event_id is not null)or(subject_type='research_workspace' and workspace_id is not null))
);
create index research_notes_workspace_idx on public.research_notes(workspace_id,updated_at desc) where workspace_id is not null;
create index research_notes_ticker_idx on public.research_notes(ticker_id,updated_at desc) where ticker_id is not null;
create index research_notes_appearance_idx on public.research_notes(appearance_id,updated_at desc) where appearance_id is not null;
create index research_notes_event_idx on public.research_notes(event_id,updated_at desc) where event_id is not null;
create trigger research_notes_updated before update on public.research_notes for each row execute function public.set_updated_at();

create table public.research_tags(
 id uuid primary key default gen_random_uuid(),workspace_id uuid references public.research_workspaces(id) on delete cascade,
 subject_type text not null check(subject_type in('ticker','mover','catalyst','research_workspace')),
 ticker_id uuid references public.tickers(id) on delete cascade,appearance_id uuid references public.market_mover_appearances(id) on delete cascade,
 event_id uuid references public.ticker_events(id) on delete cascade,tag text not null check(tag~'^[a-z0-9][a-z0-9_\-]{0,39}$'),
 created_by text not null default 'researcher',created_at timestamptz not null default now(),
 check((subject_type='ticker' and ticker_id is not null)or(subject_type='mover' and appearance_id is not null)or(subject_type='catalyst' and event_id is not null)or(subject_type='research_workspace' and workspace_id is not null))
);
create index research_tags_workspace_idx on public.research_tags(workspace_id,tag) where workspace_id is not null;
create index research_tags_ticker_idx on public.research_tags(ticker_id,tag) where ticker_id is not null;
create index research_tags_appearance_idx on public.research_tags(appearance_id,tag) where appearance_id is not null;
create index research_tags_event_idx on public.research_tags(event_id,tag) where event_id is not null;
create unique index research_tags_target_uidx on public.research_tags(
 coalesce(workspace_id,'00000000-0000-0000-0000-000000000000'::uuid),subject_type,
 coalesce(ticker_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(appearance_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(event_id,'00000000-0000-0000-0000-000000000000'::uuid),tag
);

-- Blocked requests are inspectable and durable but never claimable by a worker.
alter table public.social_research_queue drop constraint if exists social_research_queue_status_check;
alter table public.social_research_queue add constraint social_research_queue_status_check check(status in(
 'pending','processing','completed','partial','rate_limited','not_available','deferred','failed','cancelled','approval_blocked'
));
create index if not exists social_research_queue_visibility_idx on public.social_research_queue(status,updated_at desc);
create index if not exists ticker_events_ticker_event_date_idx on public.ticker_events(ticker_id,event_date desc,id);
create index if not exists mma_ticker_report_date_id_idx on public.market_mover_appearances(ticker_id,report_date desc,id);
create index if not exists market_data_findings_appearance_state_idx on public.market_data_quality_findings(appearance_id,status,severity);
create index if not exists ticker_social_coverage_state_idx on public.ticker_social_coverage(ticker_id,coverage_status,last_researched_at desc);

-- Compact summaries use explicit coverage denominators and avoid giant JSON aggregates.
create or replace view public.ticker_intelligence_summary with(security_invoker=true)as
select t.id ticker_id,t.symbol,t.company_name,t.enrichment_status metadata_status,t.enrichment_source metadata_provider,t.metadata_updated_at,
 coalesce(m.market_appearances,0)::bigint market_appearances,coalesce(m.market_days,0)::bigint market_days,m.first_market_date,m.last_market_date,
 coalesce(c.researched_appearances,0)::bigint catalyst_researched_appearances,coalesce(c.identified_appearances,0)::bigint catalyst_identified_appearances,
 coalesce(c.no_identified_appearances,0)::bigint catalyst_no_identified_appearances,
 coalesce(s.researched_windows,0)::bigint social_researched_windows,coalesce(s.complete_windows,0)::bigint social_complete_windows,
 coalesce(s.limited_windows,0)::bigint social_limited_windows,coalesce(s.posts_found,0)::bigint social_posts_found,
 coalesce(q.finding_count,0)::bigint quality_finding_count,coalesce(q.open_findings,0)::bigint quality_open_findings,
 coalesce(q.repaired_fields,0)::bigint quality_repaired_fields,
 case when coalesce(q.open_high,0)>0 then'unresolved'when coalesce(q.open_findings,0)>0 then'flagged'when coalesce(q.repaired_fields,0)>0 then'repaired'else'clean'end quality_status
from public.tickers t
left join lateral(select count(*)market_appearances,count(distinct report_date)market_days,min(report_date)first_market_date,max(report_date)last_market_date from public.market_mover_appearances where ticker_id=t.id)m on true
left join lateral(select count(*)filter(where catalyst_status<>'not_researched')researched_appearances,count(*)filter(where catalyst_status='catalyst_found')identified_appearances,count(*)filter(where catalyst_status='no_identified_catalyst')no_identified_appearances from public.mover_catalyst_status where ticker_id=t.id)c on true
left join lateral(select count(*)filter(where coverage_status<>'not_researched')researched_windows,count(*)filter(where coverage_status='complete_for_provider_window')complete_windows,count(*)filter(where coverage_status in('partial','provider_limited','rate_limited','not_available','failed'))limited_windows,sum(posts_found)posts_found from public.ticker_social_coverage where ticker_id=t.id)s on true
left join lateral(select count(*)finding_count,count(*)filter(where status in('open','proposed'))open_findings,count(*)filter(where status in('open','proposed')and severity in('high','critical'))open_high,(select count(*)from public.market_data_effective_values e join public.market_mover_appearances a on a.id=e.appearance_id where a.ticker_id=t.id)repaired_fields from public.market_data_quality_findings where ticker_id=t.id)q on true;

create or replace view public.mover_intelligence_summary with(security_invoker=true)as
select e.id appearance_id,e.ticker_id,e.ticker_symbol symbol,e.report_date,e.category_name,
 e.raw_rank,e.raw_price,e.raw_change_amount,e.raw_change_percent,e.raw_trades,e.raw_volume,e.raw_dollar_volume,
 e.rank effective_rank,e.price effective_price,e.change_amount effective_change_amount,e.change_percent effective_change_percent,e.trades effective_trades,e.volume effective_volume,e.dollar_volume effective_dollar_volume,
 e.finding_count,e.open_finding_count,e.repaired_field_count,
 case when e.open_finding_count>0 and e.quality_status='review_recommended'then'unresolved'when e.open_finding_count>0 then'flagged'when e.repaired_field_count>0 then'repaired'else'clean'end quality_status,
 s.catalyst_status,s.event_count catalyst_count,
 coalesce(r.before_count,0)::bigint catalysts_before_move,coalesce(r.same_day_count,0)::bigint catalysts_same_day,coalesce(r.after_count,0)::bigint catalysts_after_move,
 coalesce(sc.coverage_status,'not_researched')social_coverage_status,coalesce(sc.pre_move_mentions,0)::bigint pre_move_social_mentions
from public.market_mover_appearances_effective e join public.mover_catalyst_status s on s.appearance_id=e.id
left join lateral(select count(*)filter(where relationship_type in('preceded_move','near_move'))before_count,count(*)filter(where relationship_type='same_day')same_day_count,count(*)filter(where relationship_type='followed_move')after_count from public.event_mover_relationships where appearance_id=e.id)r on true
left join lateral(select c.coverage_status,(select count(*)from public.social_mover_relationships x where x.mover_appearance_id=e.id and x.relationship_type='mentioned_before_move')pre_move_mentions from public.ticker_social_coverage c where c.ticker_id=e.ticker_id and e.report_date::timestamptz between c.date_from and c.date_to order by c.last_researched_at desc nulls last limit 1)sc on true;

create or replace view public.event_intelligence_summary with(security_invoker=true)as
select e.id event_id,e.ticker_id,e.ticker_symbol symbol,e.event_date,e.published_at,e.event_type,e.event_subtype,e.classified_type,e.classified_subtype,
 coalesce(r.mover_count,0)::bigint mover_relationship_count,coalesce(r.before_movers,0)::bigint related_before_movers,coalesce(r.same_day_movers,0)::bigint related_same_day_movers,coalesce(r.after_movers,0)::bigint related_after_movers,
 coalesce(sc.coverage_status,'not_researched')social_coverage_status
from public.event_intelligence e
left join lateral(select count(*)mover_count,count(*)filter(where relationship_type in('preceded_move','near_move'))before_movers,count(*)filter(where relationship_type='same_day')same_day_movers,count(*)filter(where relationship_type='followed_move')after_movers from public.event_mover_relationships where event_id=e.id)r on true
left join lateral(select c.coverage_status from public.ticker_social_coverage c where c.ticker_id=e.ticker_id and e.event_date between c.date_from and c.date_to order by c.last_researched_at desc nulls last limit 1)sc on true;

create or replace view public.cross_source_analytics_summary with(security_invoker=true)as
select count(*)::bigint total_mover_appearances,
 count(*)filter(where c.catalyst_status<>'not_researched')::bigint catalyst_researched_appearances,
 count(*)filter(where c.catalyst_status='catalyst_found')::bigint identified_catalyst_appearances,
 count(*)filter(where c.catalyst_status='no_identified_catalyst')::bigint no_identified_catalyst_appearances,
 count(*)filter(where q.open_finding_count>0)::bigint unresolved_quality_appearances,
 count(*)filter(where sc.coverage_status is not null and sc.coverage_status<>'not_researched')::bigint social_researched_appearances,
 count(*)filter(where sc.coverage_status='complete_for_provider_window')::bigint social_complete_appearances,
 count(*)filter(where sc.coverage_status in('partial','provider_limited','rate_limited','not_available','failed'))::bigint social_limited_appearances,
 count(*)filter(where sc.coverage_status='complete_for_provider_window'and exists(select 1 from public.social_mover_relationships sr where sr.mover_appearance_id=a.id and sr.relationship_type='mentioned_before_move'))::bigint complete_social_with_pre_move_evidence,
 count(*)filter(where sc.coverage_status='complete_for_provider_window'and not exists(select 1 from public.social_mover_relationships sr where sr.mover_appearance_id=a.id and sr.relationship_type='mentioned_before_move'))::bigint complete_social_without_identified_evidence
from public.market_mover_appearances a join public.mover_catalyst_status c on c.appearance_id=a.id join public.market_data_appearance_quality q on q.appearance_id=a.id
left join lateral(select x.coverage_status from public.ticker_social_coverage x where x.ticker_id=a.ticker_id and a.report_date::timestamptz between x.date_from and x.date_to order by x.last_researched_at desc nulls last limit 1)sc on true;

-- One bounded query surface preserves source IDs and provenance without merging source tables.
create or replace function public.get_cross_source_timeline(
 p_ticker_ids uuid[] default null,p_appearance_id uuid default null,p_event_id uuid default null,p_data_mode text default'raw',
 p_source_domains text[] default null,p_from timestamptz default null,p_to timestamptz default null,p_limit integer default 50,p_offset integer default 0
)returns table(
 id text,ticker_id uuid,occurred_at timestamptz,date date,source_domain text,event_type text,subtype text,headline text,summary text,
 source_name text,source_url text,relationship text,confidence numeric,coverage_status text,quality_status text,metadata jsonb,source_record_id uuid,total_count bigint
)language sql stable security invoker set search_path=public as $$
with items as(
 select 'market:'||m.id::text id,m.ticker_id,m.report_date::timestamptz occurred_at,m.report_date date,'market'::text source_domain,'market_mover'::text event_type,m.category_name subtype,
  m.ticker_symbol||' · '||m.category_name headline,
  'Rank '||coalesce((case when p_data_mode='effective'then m.rank else m.raw_rank end)::text,'—')||' · Price '||coalesce((case when p_data_mode='effective'then m.price else m.raw_price end)::text,'—')||' · Change '||coalesce((case when p_data_mode='effective'then m.change_percent else m.raw_change_percent end)::text,'—')||'%' summary,
  'Scanz'::text source_name,null::text source_url,'Historical market-mover appearance'::text relationship,null::numeric confidence,null::text coverage_status,
  case when m.open_finding_count>0 and m.quality_status='review_recommended'then'unresolved'when m.open_finding_count>0 then'flagged'when m.repaired_field_count>0 then'repaired'else'clean'end quality_status,
  jsonb_build_object('data_mode',p_data_mode,'category',m.category_name,'rank',case when p_data_mode='effective'then m.rank else m.raw_rank end,'price',case when p_data_mode='effective'then m.price else m.raw_price end,'change_percent',case when p_data_mode='effective'then m.change_percent else m.raw_change_percent end,'volume',case when p_data_mode='effective'then m.volume else m.raw_volume end,'raw',jsonb_build_object('rank',m.raw_rank,'price',m.raw_price,'change_percent',m.raw_change_percent,'volume',m.raw_volume),'effective',jsonb_build_object('rank',m.rank,'price',m.price,'change_percent',m.change_percent,'volume',m.volume),'repaired_field_count',m.repaired_field_count,'finding_count',m.finding_count,'route','/market-movers/'||m.id)metadata,m.id source_record_id
 from public.market_mover_appearances_effective m
 where(p_ticker_ids is null or m.ticker_id=any(p_ticker_ids))and(p_appearance_id is null or m.id=p_appearance_id)and(p_event_id is null or exists(select 1 from public.event_mover_relationships r where r.event_id=p_event_id and r.appearance_id=m.id))
 union all
 select 'catalyst:'||e.id::text,e.ticker_id,coalesce(e.published_at,e.event_date),e.event_date::date,'catalyst',e.event_type::text,coalesce(e.classified_subtype,e.event_subtype,e.classified_type),coalesce(e.normalized_headline,e.headline,e.event_type::text),coalesce(e.normalized_description,e.description),coalesce(e.registry_source_name,e.source_name,'Public source'),e.source_url,
  case when p_appearance_id is not null then coalesce((select r.relationship_type from public.event_mover_relationships r where r.event_id=e.id and r.appearance_id=p_appearance_id limit 1),'No linked relationship')else'Public catalyst event'end,e.classification_confidence,
  case when exists(select 1 from public.ticker_catalyst_coverage c where c.ticker_id=e.ticker_id and e.event_date::date between c.date_from and c.date_to and c.coverage_status='complete_for_configured_sources')then'complete_for_configured_sources'else'partial'end,null,
  jsonb_build_object('event_type',e.event_type,'event_subtype',e.event_subtype,'sec_form',e.sec_form_type,'is_primary_source',e.is_primary_source,'route','/events/'||e.id),e.id
 from public.event_intelligence e
 where e.event_status not in('duplicate','excluded','failed')and(p_ticker_ids is null or e.ticker_id=any(p_ticker_ids))and(p_event_id is null or e.id=p_event_id)and(p_appearance_id is null or exists(select 1 from public.event_mover_relationships r where r.event_id=e.id and r.appearance_id=p_appearance_id))
 union all
 select 'social:'||p.id::text,pt.ticker_id,p.posted_at,p.posted_at::date,'social','social_post',p.post_type,coalesce(p.title,left(p.body,160),'Unavailable social record'),left(p.body,500),s.name,p.post_url,
  case when p_appearance_id is null then'Stored social observation'else coalesce((select r.relationship_type from public.social_mover_relationships r where r.post_id=p.id and r.mover_appearance_id=p_appearance_id limit 1),'Stored social observation')end,null,cov.coverage_status,null,
  jsonb_build_object('community',c.name,'account_id',p.account_id,'availability',p.availability_status,'route','/social/posts/'||p.id),p.id
 from public.post_tickers pt join public.social_posts p on p.id=pt.post_id join public.social_sources s on s.id=p.source_id left join public.social_communities c on c.id=p.community_id
 left join lateral(select x.coverage_status from public.ticker_social_coverage x where x.ticker_id=pt.ticker_id and p.posted_at between x.date_from and x.date_to order by x.last_researched_at desc nulls last limit 1)cov on true
 where p.posted_at is not null and(p_ticker_ids is null or pt.ticker_id=any(p_ticker_ids))and(p_appearance_id is null or exists(select 1 from public.social_mover_relationships r where r.post_id=p.id and r.mover_appearance_id=p_appearance_id))and p_event_id is null
 union all
 select 'account:'||a.id::text||':'||p.id::text,pt.ticker_id,p.posted_at,p.posted_at::date,'account','account_activity',p.post_type,coalesce(a.display_name,a.username,'Observed account')||' mentioned the ticker',coalesce(p.title,left(p.body,300)),s.name,a.profile_url,
  'Account activity derived from a stored source post',null,cov.coverage_status,null,jsonb_build_object('account_id',a.id,'post_id',p.id,'username',a.username,'route','/promoters/'||a.id),a.id
 from public.post_tickers pt join public.social_posts p on p.id=pt.post_id join public.social_accounts a on a.id=p.account_id join public.social_sources s on s.id=a.source_id
 left join lateral(select x.coverage_status from public.ticker_social_coverage x where x.ticker_id=pt.ticker_id and p.posted_at between x.date_from and x.date_to order by x.last_researched_at desc nulls last limit 1)cov on true
 where p.posted_at is not null and(p_ticker_ids is null or pt.ticker_id=any(p_ticker_ids))and(p_appearance_id is null or exists(select 1 from public.social_mover_relationships r where r.post_id=p.id and r.mover_appearance_id=p_appearance_id))and p_event_id is null
 union all
 select 'sentiment:'||so.id::text,so.ticker_id,so.observation_date::timestamptz,so.observation_date,'sentiment','sentiment_observation',so.sentiment::text,so.sentiment::text||' sentiment',so.reason,'Derived sentiment',null,'Derived from stored social evidence',so.confidence_score,cov.coverage_status,null,jsonb_build_object('score',so.sentiment_score,'post_id',so.post_id,'route',case when so.post_id is null then null else'/social/posts/'||so.post_id end),so.id
 from public.sentiment_observations so left join lateral(select x.coverage_status from public.ticker_social_coverage x where x.ticker_id=so.ticker_id and so.observation_date::timestamptz between x.date_from and x.date_to order by x.last_researched_at desc nulls last limit 1)cov on true
 where(p_ticker_ids is null or so.ticker_id=any(p_ticker_ids))and p_appearance_id is null and p_event_id is null
 union all
 select 'attention:'||a.ticker_id::text||':'||a.observation_at::text||':'||a.window_days::text,a.ticker_id,a.observation_at::timestamptz,a.observation_at,'attention','attention_window',a.window_days||' day','Attention window',a.mention_count||' mention(s) across '||a.unique_accounts||' account(s)','Derived social attention',null,'Bounded attention observation',null,cov.coverage_status,null,jsonb_build_object('mention_count',a.mention_count,'unique_accounts',a.unique_accounts,'unique_communities',a.unique_communities,'attention_score',a.unusual_attention_score,'baseline_status',a.baseline_status,'scoring_version',a.scoring_version),null::uuid
 from public.social_attention_windows a left join lateral(select x.coverage_status from public.ticker_social_coverage x where x.ticker_id=a.ticker_id and a.observation_at::timestamptz between x.date_from and x.date_to order by x.last_researched_at desc nulls last limit 1)cov on true
 where(p_ticker_ids is null or a.ticker_id=any(p_ticker_ids))and p_appearance_id is null and p_event_id is null
),filtered as(select * from items where(p_source_domains is null or source_domain=any(p_source_domains))and(p_from is null or occurred_at>=p_from)and(p_to is null or occurred_at<=p_to)),numbered as(select filtered.*,count(*)over()total_count from filtered)
select * from numbered order by occurred_at desc,source_domain,id limit greatest(1,least(p_limit,100))offset greatest(0,p_offset)
$$;

-- Fixed cross-source AI intents. Results are evidence rows, never recommendations.
create or replace function public.execute_cross_source_research_query(p_intent text,p_filters jsonb default'{}',p_limit integer default 50)returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare f jsonb:=coalesce(p_filters,'{}');lim integer:=greatest(1,least(p_limit,100));symbols text[];ids uuid[];records jsonb:='[]';tables text[];limits jsonb:=jsonb_build_array('Results combine separately sourced historical evidence without inferring causation.','RAW market data is the default; approved effective overlays are labeled when requested.','Absent social evidence is not an absence claim unless recorded provider coverage is complete for the requested window.');begin
 if p_intent not in('ticker_intelligence_timeline','catalysts_before_move','catalysts_after_move','movers_without_identified_catalyst','quality_flagged_movers','compare_ticker_catalysts','cross_source_ticker_summary','social_before_move')then raise exception'Unsupported cross-source research intent';end if;
 select array_agg(upper(value))into symbols from jsonb_array_elements_text(coalesce(f->'tickers','[]'));
 select array_agg(id)into ids from public.tickers where symbols is null or symbol=any(symbols);
 if p_intent='ticker_intelligence_timeline'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select i.*,jsonb_build_array(jsonb_build_object('type',i.source_domain,'id',coalesce(i.source_record_id::text,i.id),'label',i.headline,'route',i.metadata->>'route','source_table',case i.source_domain when'market'then'market_mover_appearances'when'catalyst'then'ticker_events'when'social'then'social_posts'when'sentiment'then'sentiment_observations'when'account'then'social_accounts'else'social_attention_windows'end,'observation_date',i.date))citations,'Cross-source chronology; sequence does not establish causation.'why from public.get_cross_source_timeline(ids,null,null,coalesce(f->>'data_mode','raw'),null,case when(f->>'from')~'^\d{4}-\d{2}-\d{2}$'then(f->>'from')::timestamptz else null end,case when(f->>'to')~'^\d{4}-\d{2}-\d{2}$'then((f->>'to')||'T23:59:59Z')::timestamptz else null end,lim,0)i)x;tables:=array['market_mover_appearances','ticker_events','social_posts','social_accounts','sentiment_observations','social_attention_windows'];
 elsif p_intent in('catalysts_before_move','catalysts_after_move')then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select t.symbol,r.appearance_id,r.mover_date,e.id event_id,e.event_date,e.event_type,e.event_subtype,e.normalized_headline headline,r.relationship_type,r.temporal_bucket,r.catalyst_relevance,q.quality_status,q.finding_count "qualityFindingCount",q.repaired_field_count>0 "hasEffectiveRepair",coalesce(f->>'data_mode','raw')"dataMode",'Temporal relationship is descriptive; it is not causal evidence.'why,jsonb_build_array(jsonb_build_object('type','market_mover','id',r.appearance_id,'label',t.symbol||' '||r.mover_date,'route','/market-movers/'||r.appearance_id,'source_table','market_mover_appearances','observation_date',r.mover_date),jsonb_build_object('type','event','id',e.id,'label',coalesce(e.normalized_headline,e.headline,e.event_type::text),'route','/events/'||e.id,'source_table','ticker_events','observation_date',e.event_date::date))citations from public.event_mover_relationships r join public.event_intelligence e on e.id=r.event_id join public.tickers t on t.id=r.ticker_id join public.market_data_appearance_quality q on q.appearance_id=r.appearance_id where(ids is null or r.ticker_id=any(ids))and(case when p_intent='catalysts_before_move'then r.relationship_type in('preceded_move','same_day','near_move')else r.relationship_type='followed_move'end)order by r.mover_date desc,r.catalyst_relevance desc limit lim)x;tables:=array['event_mover_relationships','ticker_events','market_data_appearance_quality'];
 elsif p_intent='movers_without_identified_catalyst'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select t.symbol,m.appearance_id,m.report_date,m.catalyst_status,q.quality_status,q.finding_count "qualityFindingCount",q.repaired_field_count>0 "hasEffectiveRepair",coalesce(f->>'data_mode','raw')"dataMode",'No qualifying catalyst was identified only within recorded researched coverage.'why,jsonb_build_array(jsonb_build_object('type','market_mover','id',m.appearance_id,'label',t.symbol||' '||m.report_date,'route','/market-movers/'||m.appearance_id,'source_table','market_mover_appearances','observation_date',m.report_date))citations from public.mover_catalyst_status m join public.tickers t on t.id=m.ticker_id join public.market_data_appearance_quality q on q.appearance_id=m.appearance_id where m.catalyst_status='no_identified_catalyst'and(ids is null or m.ticker_id=any(ids))order by m.report_date desc limit lim)x;tables:=array['mover_catalyst_status','ticker_catalyst_coverage','market_data_appearance_quality'];
 elsif p_intent='quality_flagged_movers'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select t.symbol,q.appearance_id,q.report_date,q.quality_status,q.finding_count "qualityFindingCount",q.high_severity_count,q.repaired_field_count>0 "hasEffectiveRepair",coalesce(f->>'data_mode','raw')"dataMode",'Historical observation has unresolved data-quality findings.'why,jsonb_build_array(jsonb_build_object('type','market_mover','id',q.appearance_id,'label',t.symbol||' '||q.report_date,'route','/market-movers/'||q.appearance_id,'source_table','market_mover_appearances','observation_date',q.report_date))citations from public.market_data_appearance_quality q join public.tickers t on t.id=q.ticker_id where q.open_finding_count>0 and(ids is null or q.ticker_id=any(ids))order by q.report_date desc limit lim)x;tables:=array['market_data_appearance_quality','market_data_quality_findings'];
 elsif p_intent in('compare_ticker_catalysts','cross_source_ticker_summary')then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select s.*,'Counts preserve explicit catalyst and social researched denominators.'why,jsonb_build_array(jsonb_build_object('type','ticker','id',s.ticker_id,'label',s.symbol,'route','/tickers/'||s.symbol,'source_table','tickers'))citations from public.ticker_intelligence_summary s where(ids is null or s.ticker_id=any(ids))order by s.symbol limit lim)x;tables:=array['ticker_intelligence_summary','mover_catalyst_status','ticker_social_coverage','market_data_quality_findings'];
 else
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into records from(select d.*,'First known within recorded coverage; absent evidence is not an absence claim.'why,jsonb_build_array(jsonb_build_object('type','social_post','id',d.post_id,'label',coalesce(d.title,d.post_id::text),'route','/social/posts/'||d.post_id,'source_table','social_posts'),jsonb_build_object('type','market_mover','id',d.mover_appearance_id,'label',d.symbol||' '||d.mover_date,'route','/market-movers/'||d.mover_appearance_id,'source_table','market_mover_appearances'))citations from public.social_mover_relationship_detail d where d.relationship_type='mentioned_before_move'and(ids is null or d.ticker_id=any(ids))order by d.mover_date desc,d.mention_at limit lim)x;tables:=array['social_mover_relationships','social_posts','ticker_social_coverage'];
 end if;
 return jsonb_build_object('intent',p_intent,'records',records,'record_count',jsonb_array_length(records),'tables',to_jsonb(tables),'methodology_versions',jsonb_build_array('cross-source-timeline-v1','quality-overlay-v1','coverage-denominator-v1'),'limitations',limits,'executed_at',now());
end$$;

alter table public.research_notes enable row level security;
alter table public.research_tags enable row level security;
create policy "Public read research_notes" on public.research_notes for select to anon,authenticated using(true);
create policy "Public read research_tags" on public.research_tags for select to anon,authenticated using(true);
revoke all on function public.execute_cross_source_research_query(text,jsonb,integer)from public,anon,authenticated;
grant execute on function public.execute_cross_source_research_query(text,jsonb,integer)to service_role;
grant execute on function public.get_cross_source_timeline(uuid[],uuid,uuid,text,text[],timestamptz,timestamptz,integer,integer)to anon,authenticated,service_role;
