alter table public.watchlists add column if not exists owner_id uuid;
alter table public.watchlists add column if not exists watchlist_type text not null default'research';
alter table public.watchlists add constraint watchlists_type_check check(watchlist_type in('personal','research','team','system'));
alter table public.watchlist_tickers add column if not exists priority integer;
alter table public.watchlist_tickers add column if not exists updated_at timestamptz not null default now();
create index watchlists_type_idx on public.watchlists(watchlist_type,updated_at desc);
create index watchlist_tickers_priority_idx on public.watchlist_tickers(watchlist_id,priority desc nulls last);
create trigger watchlist_tickers_updated before update on public.watchlist_tickers for each row execute function public.set_updated_at();

create table public.watchlist_entities(
 id uuid primary key default gen_random_uuid(),watchlist_id uuid not null references public.watchlists(id)on delete cascade,entity_type text not null check(entity_type in('ticker','account','pattern')),
 ticker_id uuid references public.tickers(id)on delete cascade,account_id uuid references public.social_accounts(id)on delete cascade,pattern_id uuid references public.research_patterns(id)on delete cascade,created_at timestamptz not null default now(),
 constraint watchlist_entity_target_check check((entity_type='ticker'and ticker_id is not null and account_id is null and pattern_id is null)or(entity_type='account'and account_id is not null and ticker_id is null and pattern_id is null)or(entity_type='pattern'and pattern_id is not null and ticker_id is null and account_id is null))
);
create unique index watchlist_entity_ticker_uidx on public.watchlist_entities(watchlist_id,ticker_id)where entity_type='ticker';
create unique index watchlist_entity_account_uidx on public.watchlist_entities(watchlist_id,account_id)where entity_type='account';
create unique index watchlist_entity_pattern_uidx on public.watchlist_entities(watchlist_id,pattern_id)where entity_type='pattern';
create index watchlist_entities_list_type_idx on public.watchlist_entities(watchlist_id,entity_type);

insert into public.watchlist_entities(watchlist_id,entity_type,ticker_id,created_at)select watchlist_id,'ticker',ticker_id,added_at from public.watchlist_tickers on conflict do nothing;

create table public.watchlist_tags(id uuid primary key default gen_random_uuid(),name text not null unique,description text,created_at timestamptz not null default now());
create table public.watchlist_entity_tags(id uuid primary key default gen_random_uuid(),watchlist_entity_id uuid not null references public.watchlist_entities(id)on delete cascade,tag_id uuid not null references public.watchlist_tags(id)on delete cascade,unique(watchlist_entity_id,tag_id));
create index watchlist_entity_tags_entity_idx on public.watchlist_entity_tags(watchlist_entity_id);
create table public.watchlist_notes(id uuid primary key default gen_random_uuid(),watchlist_id uuid not null references public.watchlists(id)on delete cascade,entity_id uuid references public.watchlist_entities(id)on delete cascade,note text not null check(length(trim(note))>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index watchlist_notes_list_idx on public.watchlist_notes(watchlist_id,created_at desc);
create trigger watchlist_notes_updated before update on public.watchlist_notes for each row execute function public.set_updated_at();

create table public.alert_rules(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0),description text not null default'',enabled boolean not null default true,watchlist_id uuid references public.watchlists(id)on delete cascade,
 entity_type text not null check(entity_type in('ticker','account','pattern')),ticker_id uuid references public.tickers(id)on delete cascade,account_id uuid references public.social_accounts(id)on delete cascade,pattern_id uuid references public.research_patterns(id)on delete cascade,
 condition_type text not null check(condition_type in('unusual_attention_score_above','attention_increase_percentage','sentiment_score_above','sentiment_score_below','sentiment_change','promotion_intensity_above','hype_risk_above','pattern_detected','similarity_score_above','market_mover_detected','volume_expansion','volatility_expansion','mention_count_increase','new_account_activity','new_source_activity')),
 condition_configuration jsonb not null,severity text not null default'medium'check(severity in('low','medium','high','critical')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint alert_rule_target_check check((entity_type='ticker'and account_id is null and pattern_id is null)or(entity_type='account'and ticker_id is null and pattern_id is null)or(entity_type='pattern'and ticker_id is null and account_id is null))
);
create index alert_rules_enabled_idx on public.alert_rules(enabled)where enabled;
create index alert_rules_condition_idx on public.alert_rules(condition_type,enabled);
create index alert_rules_watchlist_idx on public.alert_rules(watchlist_id);
create trigger alert_rules_updated before update on public.alert_rules for each row execute function public.set_updated_at();

create or replace function public.validate_alert_rule()returns trigger language plpgsql as $$
declare needs_value boolean;
begin
 if jsonb_typeof(new.condition_configuration)<>'object'then raise exception'Alert configuration must be a JSON object';end if;
 if coalesce(new.condition_configuration->>'frequency','once_per_event')not in('once_per_event','once_per_day','once_per_week')then raise exception'Invalid alert frequency';end if;
 if new.condition_configuration?'operator'and new.condition_configuration->>'operator'not in('>','>=','<','<=','=','change_by')then raise exception'Invalid alert operator';end if;
 needs_value:=new.condition_type not in('pattern_detected','market_mover_detected','new_account_activity','new_source_activity');
 if needs_value and(not(new.condition_configuration?'value')or jsonb_typeof(new.condition_configuration->'value')not in('number','string'))then raise exception'Alert threshold value is required';end if;
 if new.condition_configuration?'value'then perform(new.condition_configuration->>'value')::numeric;end if;
 return new;
exception when invalid_text_representation then raise exception'Alert threshold must be numeric';end$$;
create trigger validate_alert_rule_before_write before insert or update on public.alert_rules for each row execute function public.validate_alert_rule();

create table public.alert_events(
 id uuid primary key default gen_random_uuid(),alert_rule_id uuid not null references public.alert_rules(id)on delete cascade,ticker_id uuid references public.tickers(id)on delete cascade,account_id uuid references public.social_accounts(id)on delete cascade,pattern_id uuid references public.research_patterns(id)on delete cascade,
 triggered_at timestamptz not null,severity text not null check(severity in('low','medium','high','critical')),title text not null,description text not null,evidence jsonb not null check(jsonb_typeof(evidence)='object'and evidence<>'{}'),status text not null default'new'check(status in('new','reviewed','dismissed','archived')),created_at timestamptz not null default now()
);
create index alert_events_rule_idx on public.alert_events(alert_rule_id,triggered_at desc);
create index alert_events_ticker_idx on public.alert_events(ticker_id,triggered_at desc);
create index alert_events_account_idx on public.alert_events(account_id,triggered_at desc);
create index alert_events_pattern_idx on public.alert_events(pattern_id,triggered_at desc);
create index alert_events_triggered_idx on public.alert_events(triggered_at desc);
create index alert_events_status_idx on public.alert_events(status,triggered_at desc);

create table public.alert_runs(id uuid primary key default gen_random_uuid(),run_type text not null check(run_type in('batch','incremental','retry','manual')),status text not null check(status in('running','completed','partial','failed')),rules_checked integer not null default 0,alerts_created integer not null default 0,started_at timestamptz not null default now(),completed_at timestamptz,error_message text,created_at timestamptz not null default now());
create index alert_runs_started_idx on public.alert_runs(started_at desc);

create table public.alert_deduplication(id uuid primary key default gen_random_uuid(),alert_rule_id uuid not null references public.alert_rules(id)on delete cascade,entity_key text not null,reference_timestamp timestamptz not null,hash text not null,created_at timestamptz not null default now(),unique(alert_rule_id,entity_key,reference_timestamp,hash));
create index alert_dedup_rule_entity_idx on public.alert_deduplication(alert_rule_id,entity_key,reference_timestamp desc);

create table public.notification_preferences(id uuid primary key default gen_random_uuid(),user_id uuid,email_enabled boolean not null default false,in_app_enabled boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index notification_preferences_user_uidx on public.notification_preferences(coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid));
create trigger notification_preferences_updated before update on public.notification_preferences for each row execute function public.set_updated_at();
insert into public.notification_preferences(user_id,email_enabled,in_app_enabled)values(null,false,true)on conflict do nothing;

create table public.notification_history(id uuid primary key default gen_random_uuid(),alert_event_id uuid not null references public.alert_events(id)on delete cascade,channel text not null check(channel in('in_app','email')),status text not null check(status in('pending','sent','failed','skipped')),sent_at timestamptz,error_message text,created_at timestamptz not null default now(),unique(alert_event_id,channel));
create index notification_history_event_idx on public.notification_history(alert_event_id);
create index notification_history_created_idx on public.notification_history(created_at desc);

create table public.alert_backtests(id uuid primary key default gen_random_uuid(),alert_rule_id uuid not null references public.alert_rules(id)on delete cascade,start_date date not null,end_date date not null,alerts_found integer not null default 0,created_at timestamptz not null default now(),check(start_date<=end_date));
create index alert_backtests_rule_idx on public.alert_backtests(alert_rule_id,created_at desc);
create table public.alert_backtest_events(id uuid primary key default gen_random_uuid(),backtest_id uuid not null references public.alert_backtests(id)on delete cascade,ticker_id uuid references public.tickers(id)on delete cascade,account_id uuid references public.social_accounts(id)on delete cascade,pattern_id uuid references public.research_patterns(id)on delete cascade,event_date date not null,evidence jsonb not null check(jsonb_typeof(evidence)='object'and evidence<>'{}'),created_at timestamptz not null default now());
create index alert_backtest_events_test_idx on public.alert_backtest_events(backtest_id,event_date desc);

create or replace view public.alert_candidate_events with(security_invoker=true)as
with features as(select f.*,lag(attention_score)over(partition by ticker_id order by date)previous_attention,lag(mention_count)over(partition by ticker_id order by date)previous_mentions,lag(unique_sources)over(partition by ticker_id order by date)previous_sources from public.ticker_research_features f where feature_version='features-v1'),feature_events as(
 select f.ticker_id,null::uuid account_id,null::uuid pattern_id,f.date::timestamptz reference_timestamp,x.condition_type,x.current_value,x.previous_value,
 jsonb_build_object('condition_type',x.condition_type,'current_value',x.current_value,'previous_value',x.previous_value,'feature_date',f.date,'feature_version',f.feature_version,'source','ticker_research_features')evidence,
 'ticker:'||f.ticker_id::text entity_key from features f cross join lateral(values
 ('unusual_attention_score_above',f.attention_score,null::numeric),('attention_increase_percentage',case when f.previous_attention=0 then case when f.attention_score>0 then 100 else 0 end when f.previous_attention is null then null else 100*(f.attention_score-f.previous_attention)/abs(f.previous_attention)end,f.previous_attention),
 ('sentiment_score_above',f.sentiment_score,null::numeric),('sentiment_score_below',f.sentiment_score,null::numeric),('sentiment_change',abs(f.sentiment_change),f.sentiment_score-f.sentiment_change),
 ('promotion_intensity_above',f.promotion_intensity,null::numeric),('hype_risk_above',f.hype_risk,null::numeric),('volume_expansion',f.relative_volume,null::numeric),('volatility_expansion',f.volatility_expansion,null::numeric),
 ('mention_count_increase',case when f.previous_mentions=0 then case when f.mention_count>0 then 100 else 0 end when f.previous_mentions is null then null else 100*(f.mention_count-f.previous_mentions)::numeric/abs(f.previous_mentions)end,f.previous_mentions::numeric),
 ('new_source_activity',case when coalesce(f.unique_sources,0)>coalesce(f.previous_sources,0)then(f.unique_sources-coalesce(f.previous_sources,0))::numeric else 0 end,f.previous_sources::numeric))x(condition_type,current_value,previous_value)
),pattern_events as(select o.ticker_id,null::uuid account_id,o.pattern_id,o.start_timestamp reference_timestamp,'pattern_detected'::text condition_type,1::numeric current_value,null::numeric previous_value,jsonb_build_object('condition_type','pattern_detected','pattern_observation_id',o.id,'pattern_id',o.pattern_id,'matched_conditions',o.matched_conditions,'observation_date',o.observation_date,'source','pattern_observations')evidence,'pattern:'||o.pattern_id::text||':ticker:'||o.ticker_id::text entity_key from public.pattern_observations o),
similarity_events as(select m.ticker_id,null::uuid account_id,o.pattern_id,m.source_date::timestamptz reference_timestamp,'similarity_score_above'::text condition_type,m.similarity_score current_value,null::numeric previous_value,jsonb_build_object('condition_type','similarity_score_above','similarity_match_id',m.id,'reference_observation_id',m.reference_observation_id,'similarity_score',m.similarity_score,'matched_features',m.matched_features,'source','pattern_similarity_matches')evidence,'ticker:'||m.ticker_id::text||':pattern:'||o.pattern_id::text entity_key from public.pattern_similarity_matches m join public.pattern_observations o on o.id=m.reference_observation_id),
mover_events as(select m.ticker_id,null::uuid account_id,null::uuid pattern_id,m.report_date::timestamptz reference_timestamp,'market_mover_detected'::text condition_type,1::numeric current_value,null::numeric previous_value,jsonb_build_object('condition_type','market_mover_detected','appearance_id',m.id,'report_date',m.report_date,'rank',m.rank,'change_percent',m.change_percent,'volume',m.volume,'source','market_mover_appearances')evidence,'ticker:'||m.ticker_id::text entity_key from public.market_mover_appearances m),
account_events as(select pt.ticker_id,p.account_id,null::uuid pattern_id,date_trunc('day',p.posted_at)reference_timestamp,'new_account_activity'::text condition_type,count(*)::numeric current_value,null::numeric previous_value,jsonb_build_object('condition_type','new_account_activity','account_id',p.account_id,'ticker_id',pt.ticker_id,'activity_date',date_trunc('day',p.posted_at)::date,'post_count',count(*),'source','social_posts')evidence,'account:'||p.account_id::text||':ticker:'||pt.ticker_id::text entity_key from public.social_posts p join public.post_tickers pt on pt.post_id=p.id where p.account_id is not null group by p.account_id,pt.ticker_id,date_trunc('day',p.posted_at))
select*from feature_events where current_value is not null union all select*from pattern_events union all select*from similarity_events union all select*from mover_events union all select*from account_events;

create or replace function public.alert_condition_met(p_condition text,p_value numeric,p_configuration jsonb)returns boolean language sql immutable as $$select case when p_value is null then false when p_condition in('pattern_detected','market_mover_detected','new_account_activity','new_source_activity')then p_value>0 when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='>'then p_value>(p_configuration->>'value')::numeric when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='>='then p_value>=(p_configuration->>'value')::numeric when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='<'then p_value<(p_configuration->>'value')::numeric when coalesce(p_configuration->>'operator',case when p_condition='sentiment_score_below'then'<'else'>='end)='<='then p_value<=(p_configuration->>'value')::numeric when p_configuration->>'operator'='='then p_value=(p_configuration->>'value')::numeric when p_configuration->>'operator'='change_by'then abs(p_value)>=(p_configuration->>'value')::numeric else false end$$;
create or replace function public.alert_reference_bucket(p_configuration jsonb,p_timestamp timestamptz)returns timestamptz language sql immutable as $$select case coalesce(p_configuration->>'frequency','once_per_event')when'once_per_day'then date_trunc('day',p_timestamp)when'once_per_week'then date_trunc('week',p_timestamp)else p_timestamp end$$;

create or replace function public.evaluate_alert_rules(p_since timestamptz default null,p_rule_id uuid default null,p_run_type text default'manual',p_limit integer default 10000)returns jsonb language plpgsql security definer set search_path=public as $$
declare run_id uuid;checked integer;created integer:=0;r record;dedup_id uuid;event_id uuid;bucket timestamptz;event_hash text;
begin
 insert into public.alert_runs(run_type,status)values(case when p_run_type in('batch','incremental','retry','manual')then p_run_type else'manual'end,'running')returning id into run_id;select count(*)::int into checked from public.alert_rules where enabled and(p_rule_id is null or id=p_rule_id);
 for r in select ar.*,c.ticker_id candidate_ticker,c.account_id candidate_account,c.pattern_id candidate_pattern,c.reference_timestamp,c.current_value,c.previous_value,c.evidence,c.entity_key from public.alert_rules ar join public.alert_candidate_events c on c.condition_type=ar.condition_type
  where ar.enabled and(p_rule_id is null or ar.id=p_rule_id)and(p_since is null or c.reference_timestamp>=p_since)and public.alert_condition_met(ar.condition_type,c.current_value,ar.condition_configuration)
  and(ar.ticker_id is null or ar.ticker_id=c.ticker_id)and(ar.account_id is null or ar.account_id=c.account_id)and(ar.pattern_id is null or ar.pattern_id=c.pattern_id)
  and(ar.watchlist_id is null or exists(select 1 from public.watchlist_entities we where we.watchlist_id=ar.watchlist_id and((we.entity_type='ticker'and we.ticker_id=c.ticker_id)or(we.entity_type='account'and we.account_id=c.account_id)or(we.entity_type='pattern'and we.pattern_id=c.pattern_id))))
  and((ar.entity_type='ticker'and c.ticker_id is not null)or(ar.entity_type='account'and c.account_id is not null)or(ar.entity_type='pattern'and c.pattern_id is not null))order by c.reference_timestamp limit greatest(1,least(p_limit,100000))
 loop
  bucket:=public.alert_reference_bucket(r.condition_configuration,r.reference_timestamp);event_hash:=md5(r.id::text||'|'||r.entity_key||'|'||bucket::text||'|'||r.condition_type);
  dedup_id:=null;insert into public.alert_deduplication(alert_rule_id,entity_key,reference_timestamp,hash)values(r.id,r.entity_key,bucket,event_hash)on conflict do nothing returning id into dedup_id;
  if dedup_id is not null then
   insert into public.alert_events(alert_rule_id,ticker_id,account_id,pattern_id,triggered_at,severity,title,description,evidence)
   values(r.id,r.candidate_ticker,r.candidate_account,r.candidate_pattern,r.reference_timestamp,r.severity,r.name,'Historical research condition met: '||r.condition_type,
    r.evidence||jsonb_build_object('rule_id',r.id,'condition',r.condition_type,'operator',coalesce(r.condition_configuration->>'operator',case when r.condition_type='sentiment_score_below'then'<'else'>='end),'threshold',r.condition_configuration->'value','current_value',r.current_value,'previous_value',r.previous_value,'timestamp',r.reference_timestamp,'frequency',coalesce(r.condition_configuration->>'frequency','once_per_event')))
   returning id into event_id;
   insert into public.notification_history(alert_event_id,channel,status,sent_at)values(event_id,'in_app','sent',now());created:=created+1;
  end if;
 end loop;
 update public.alert_runs set status='completed',rules_checked=checked,alerts_created=created,completed_at=now()where id=run_id;return jsonb_build_object('run_id',run_id,'status','completed','rules_checked',checked,'alerts_created',created);
exception when others then insert into public.alert_runs(id,run_type,status,rules_checked,alerts_created,started_at,completed_at,error_message)values(run_id,case when p_run_type in('batch','incremental','retry','manual')then p_run_type else'manual'end,'failed',coalesce(checked,0),created,now(),now(),sqlerrm);return jsonb_build_object('run_id',run_id,'status','failed','rules_checked',coalesce(checked,0),'alerts_created',created,'error',sqlerrm);end$$;

create or replace function public.run_alert_backtest(p_rule_id uuid,p_start_date date,p_end_date date)returns uuid language plpgsql security definer set search_path=public as $$
declare test_id uuid;found integer;begin if p_start_date>p_end_date then raise exception'Invalid backtest date range';end if;insert into public.alert_backtests(alert_rule_id,start_date,end_date)values(p_rule_id,p_start_date,p_end_date)returning id into test_id;
insert into public.alert_backtest_events(backtest_id,ticker_id,account_id,pattern_id,event_date,evidence)
select test_id,c.ticker_id,c.account_id,c.pattern_id,c.reference_timestamp::date,c.evidence||jsonb_build_object('condition',r.condition_type,'threshold',r.condition_configuration->'value','current_value',c.current_value,'historical_backtest',true)
from public.alert_rules r join public.alert_candidate_events c on c.condition_type=r.condition_type where r.id=p_rule_id and c.reference_timestamp::date between p_start_date and p_end_date and public.alert_condition_met(r.condition_type,c.current_value,r.condition_configuration)
and(r.ticker_id is null or r.ticker_id=c.ticker_id)and(r.account_id is null or r.account_id=c.account_id)and(r.pattern_id is null or r.pattern_id=c.pattern_id)
and(r.watchlist_id is null or exists(select 1 from public.watchlist_entities we where we.watchlist_id=r.watchlist_id and((we.entity_type='ticker'and we.ticker_id=c.ticker_id)or(we.entity_type='account'and we.account_id=c.account_id)or(we.entity_type='pattern'and we.pattern_id=c.pattern_id))));get diagnostics found=row_count;update public.alert_backtests set alerts_found=found where id=test_id;return test_id;end$$;

create or replace view public.watchlist_summary with(security_invoker=true)as select w.*,count(distinct e.id)filter(where e.entity_type='ticker')::bigint ticker_count,count(distinct e.id)filter(where e.entity_type='account')::bigint account_count,count(distinct e.id)filter(where e.entity_type='pattern')::bigint pattern_count,count(distinct ae.id)filter(where ae.triggered_at>=now()-interval'7 days')::bigint recent_alert_count from public.watchlists w left join public.watchlist_entities e on e.watchlist_id=w.id left join public.alert_rules ar on ar.watchlist_id=w.id left join public.alert_events ae on ae.alert_rule_id=ar.id group by w.id;
create or replace view public.watchlist_entity_detail with(security_invoker=true)as select e.*,t.symbol,a.username,s.name account_platform,p.name pattern_name,c.name pattern_category from public.watchlist_entities e left join public.tickers t on t.id=e.ticker_id left join public.social_accounts a on a.id=e.account_id left join public.social_sources s on s.id=a.source_id left join public.research_patterns p on p.id=e.pattern_id left join public.pattern_categories c on c.id=p.category_id;
create or replace view public.watchlist_current_intelligence with(security_invoker=true)as select e.*,t.symbol,a.username,p.name pattern_name,f.date intelligence_date,f.sentiment_score,f.sentiment_change,f.attention_score,f.promotion_intensity,f.hype_risk,f.relative_volume,f.volatility_expansion,ais.total_posts account_posts,ais.total_ticker_mentions account_mentions,ps.total_occurrences pattern_occurrences,ps.last_seen pattern_last_seen from public.watchlist_entities e left join public.tickers t on t.id=e.ticker_id left join public.social_accounts a on a.id=e.account_id left join public.research_patterns p on p.id=e.pattern_id left join lateral(select x.*from public.ticker_research_features x where x.ticker_id=e.ticker_id and x.feature_version='features-v1'order by x.date desc limit 1)f on true left join public.account_intelligence_summary ais on ais.account_id=e.account_id left join public.pattern_statistics ps on ps.pattern_id=e.pattern_id;
create or replace view public.alert_rule_detail with(security_invoker=true)as select r.*,w.name watchlist_name,t.symbol,a.username,p.name pattern_name,(select max(e.triggered_at)from public.alert_events e where e.alert_rule_id=r.id)last_triggered,(select count(*)from public.alert_events e where e.alert_rule_id=r.id)event_count from public.alert_rules r left join public.watchlists w on w.id=r.watchlist_id left join public.tickers t on t.id=r.ticker_id left join public.social_accounts a on a.id=r.account_id left join public.research_patterns p on p.id=r.pattern_id;
create or replace view public.alert_event_detail with(security_invoker=true)as select e.*,r.name rule_name,r.condition_type,r.condition_configuration,t.symbol,a.username,p.name pattern_name from public.alert_events e join public.alert_rules r on r.id=e.alert_rule_id left join public.tickers t on t.id=e.ticker_id left join public.social_accounts a on a.id=e.account_id left join public.research_patterns p on p.id=e.pattern_id;
create or replace view public.alert_backtest_detail with(security_invoker=true)as select b.*,r.name rule_name,r.condition_type from public.alert_backtests b join public.alert_rules r on r.id=b.alert_rule_id;

do $$declare t text;begin foreach t in array array['watchlist_entities','watchlist_tags','watchlist_entity_tags','watchlist_notes','alert_rules','alert_events','alert_runs','alert_deduplication','notification_preferences','notification_history','alert_backtests','alert_backtest_events']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;
revoke all on function public.evaluate_alert_rules(timestamptz,uuid,text,integer)from public,anon,authenticated;grant execute on function public.evaluate_alert_rules(timestamptz,uuid,text,integer)to service_role;
revoke all on function public.run_alert_backtest(uuid,date,date)from public,anon,authenticated;grant execute on function public.run_alert_backtest(uuid,date,date)to service_role;
