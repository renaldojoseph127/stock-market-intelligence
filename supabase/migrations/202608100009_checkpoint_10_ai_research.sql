-- Checkpoint 10: explainable, read-only natural-language research foundation.
create table public.research_workspaces(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0),description text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index research_workspaces_updated_idx on public.research_workspaces(updated_at desc);
create trigger research_workspaces_updated before update on public.research_workspaces for each row execute function public.set_updated_at();

create table public.saved_searches(
 id uuid primary key default gen_random_uuid(),workspace_id uuid references public.research_workspaces(id)on delete cascade,
 name text not null check(length(trim(name))>0),natural_language_query text not null check(length(trim(natural_language_query))>0),
 structured_query jsonb not null check(jsonb_typeof(structured_query)='object'),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index saved_searches_workspace_idx on public.saved_searches(workspace_id,updated_at desc);
create trigger saved_searches_updated before update on public.saved_searches for each row execute function public.set_updated_at();

create table public.research_workspace_items(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.research_workspaces(id)on delete cascade,
 item_type text not null check(item_type in('pinned_ticker','saved_comparison','saved_prompt','saved_filter')),
 name text not null check(length(trim(name))>0),ticker_id uuid references public.tickers(id)on delete cascade,
 content jsonb not null default'{}'check(jsonb_typeof(content)='object'),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint research_workspace_item_target check((item_type='pinned_ticker'and ticker_id is not null)or item_type<>'pinned_ticker')
);
create index research_workspace_items_workspace_idx on public.research_workspace_items(workspace_id,item_type,updated_at desc);
create unique index research_workspace_pinned_ticker_uidx on public.research_workspace_items(workspace_id,ticker_id)where item_type='pinned_ticker';
create trigger research_workspace_items_updated before update on public.research_workspace_items for each row execute function public.set_updated_at();

create table public.research_sessions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid references public.research_workspaces(id)on delete set null,
 title text not null default'New research session',context jsonb not null default'{}'check(jsonb_typeof(context)='object'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index research_sessions_workspace_idx on public.research_sessions(workspace_id,updated_at desc);
create trigger research_sessions_updated before update on public.research_sessions for each row execute function public.set_updated_at();

create table public.research_messages(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.research_sessions(id)on delete cascade,
 role text not null check(role in('user','assistant')),content text not null check(length(trim(content))>0),
 structured_query jsonb check(structured_query is null or jsonb_typeof(structured_query)='object'),
 evidence jsonb check(evidence is null or jsonb_typeof(evidence)='object'),created_at timestamptz not null default now()
);
create index research_messages_session_idx on public.research_messages(session_id,created_at);

create table public.research_history(
 id uuid primary key default gen_random_uuid(),workspace_id uuid references public.research_workspaces(id)on delete set null,
 session_id uuid references public.research_sessions(id)on delete set null,prompt text not null check(length(trim(prompt))>0),
 execution_time_ms integer not null check(execution_time_ms>=0),structured_query jsonb not null check(jsonb_typeof(structured_query)='object'),
 returned_record_count integer not null default 0 check(returned_record_count>=0),response_summary text not null,evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 status text not null check(status in('completed','clarification','rejected','failed')),created_at timestamptz not null default now()
);
create index research_history_created_idx on public.research_history(created_at desc);
create index research_history_workspace_idx on public.research_history(workspace_id,created_at desc);
create index research_history_session_idx on public.research_history(session_id,created_at);

-- Search documents are derived from authoritative Checkpoint 1-9 data and can be rebuilt without changing source records.
create table public.research_search_documents(
 domain text not null check(domain in('ticker','social_post','account','community','market_mover','pattern','alert','watchlist')),
 record_id uuid not null,title text not null,content text not null default'',route text not null,ticker_id uuid references public.tickers(id)on delete cascade,
 account_id uuid references public.social_accounts(id)on delete cascade,observation_date date,source_table text not null,methodology_version text,evidence jsonb not null default'{}'check(jsonb_typeof(evidence)='object'),
 search_vector tsvector generated always as(to_tsvector('simple',coalesce(title,'')||' '||coalesce(content,'')))stored,
 updated_at timestamptz not null default now(),primary key(domain,record_id)
);
create index research_search_documents_vector_idx on public.research_search_documents using gin(search_vector);
create index research_search_documents_domain_date_idx on public.research_search_documents(domain,observation_date desc);
create index research_search_documents_ticker_idx on public.research_search_documents(ticker_id,observation_date desc);
create index research_search_documents_account_idx on public.research_search_documents(account_id,observation_date desc);
create index research_search_documents_title_idx on public.research_search_documents(lower(title));

create or replace function public.rebuild_research_search_documents()returns jsonb language plpgsql security definer set search_path=public as $$
declare rebuilt integer;begin
 delete from public.research_search_documents;
 insert into public.research_search_documents(domain,record_id,title,content,route,ticker_id,account_id,observation_date,source_table,methodology_version,evidence)
 select'ticker',t.id,t.symbol,concat_ws(' ',t.company_name,t.exchange,t.sector,t.industry,t.country),'/tickers/'||t.symbol,t.id,null,null,'tickers',null,jsonb_build_object('ticker_id',t.id,'symbol',t.symbol,'company_name',t.company_name)
 from public.tickers t
 union all
 select'social_post',p.id,coalesce(nullif(p.title,''),left(coalesce(p.body,'Untitled social record'),120)),left(concat_ws(' ',p.body,s.name,c.name,t.symbol,t.company_name,t.sector,t.industry),4000),'/social/posts/'||p.id,coalesce(p.ticker_id,ptx.ticker_id),p.account_id,coalesce(p.posted_at,p.created_at)::date,'social_posts',null,jsonb_build_object('post_id',p.id,'source_id',p.source_id,'source_name',s.name,'community_name',c.name,'community_slug',c.slug,'post_url',p.post_url,'posted_at',p.posted_at)
 from public.social_posts p join public.social_sources s on s.id=p.source_id left join public.social_communities c on c.id=p.community_id left join lateral(select pt.ticker_id from public.post_tickers pt where pt.post_id=p.id order by pt.id limit 1)ptx on true left join public.tickers t on t.id=coalesce(p.ticker_id,ptx.ticker_id)
 union all
 select'account',a.id,a.username,concat_ws(' ',a.display_name,s.name,s.platform_type),'/promoters/'||a.id,null,a.id,coalesce(a.first_seen_at,a.created_at)::date,'social_accounts',null,jsonb_build_object('account_id',a.id,'username',a.username,'source_id',a.source_id,'platform',s.name)
 from public.social_accounts a join public.social_sources s on s.id=a.source_id
 union all
 select'community',c.id,c.name,concat_ws(' ',c.slug,c.community_type,c.description,s.name),'/social/'||coalesce(s.adapter_key,s.platform_type)||'?community='||coalesce(c.slug,c.id::text),null,null,c.created_at::date,'social_communities',null,jsonb_build_object('community_id',c.id,'source_id',c.source_id,'source',s.name,'slug',c.slug)
 from public.social_communities c join public.social_sources s on s.id=c.source_id
 union all
 select'market_mover',m.id,t.symbol||' · '||c.name,concat_ws(' ','rank',m.rank,'change',m.change_percent,'volume',m.volume,'report',r.source_filename),'/market-movers/'||m.id,m.ticker_id,null,m.report_date,'market_mover_appearances',null,jsonb_build_object('appearance_id',m.id,'report_id',m.report_id,'category_id',m.category_id,'report_date',m.report_date,'rank',m.rank,'change_percent',m.change_percent)
 from public.market_mover_appearances m join public.tickers t on t.id=m.ticker_id join public.market_categories c on c.id=m.category_id join public.source_reports r on r.id=m.report_id
 union all
 select'pattern',p.id,p.name,concat_ws(' ',p.code,p.description,c.name,p.pattern_type),'/patterns/'||p.id,null,null,p.created_at::date,'research_patterns',p.methodology_version,jsonb_build_object('pattern_id',p.id,'code',p.code,'category',c.name,'feature_version',p.feature_version)
 from public.research_patterns p join public.pattern_categories c on c.id=p.category_id
 union all
 select'alert',e.id,e.title,e.description,'/alerts/'||e.alert_rule_id||'#event-'||e.id,e.ticker_id,e.account_id,e.triggered_at::date,'alert_events',null,e.evidence||jsonb_build_object('alert_event_id',e.id,'alert_rule_id',e.alert_rule_id,'pattern_id',e.pattern_id)
 from public.alert_events e
 union all
 select'watchlist',w.id,w.name,coalesce(w.description,''),'/watchlists/'||w.id,null,null,w.created_at::date,'watchlists',null,jsonb_build_object('watchlist_id',w.id,'watchlist_type',w.watchlist_type)
 from public.watchlists w;
 get diagnostics rebuilt=row_count;
 return jsonb_build_object('documents_rebuilt',rebuilt,'rebuilt_at',now());
end$$;

create or replace function public.search_research_documents(p_query text,p_domains text[]default null,p_limit integer default 50)
returns table(domain text,record_id uuid,title text,snippet text,route text,ticker_id uuid,account_id uuid,observation_date date,source_table text,methodology_version text,relevance numeric,evidence jsonb)
language sql stable security invoker set search_path=public as $$
 with q as(select plainto_tsquery('simple',trim(p_query))query,lower(trim(p_query))needle)
 select d.domain,d.record_id,d.title,left(d.content,500),d.route,d.ticker_id,d.account_id,d.observation_date,d.source_table,d.methodology_version,
  round((ts_rank_cd(d.search_vector,q.query)+case when lower(d.title)=q.needle then 2 when lower(d.title)like q.needle||'%'then 1 when lower(d.title)like'%'||q.needle||'%'then .5 else 0 end)::numeric,4),d.evidence
 from public.research_search_documents d cross join q
 where trim(p_query)<>''and(p_domains is null or d.domain=any(p_domains))and(d.search_vector@@q.query or lower(d.title)like'%'||q.needle||'%'or lower(d.content)like'%'||q.needle||'%')
 order by 11 desc,d.observation_date desc nulls last,d.title limit greatest(1,least(p_limit,200))
$$;

create or replace function public.execute_research_query(p_intent text,p_filters jsonb default'{}',p_limit integer default 50)returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_filters jsonb:=coalesce(p_filters,'{}');v_limit integer:=greatest(1,least(p_limit,200));v_tickers text[];v_sources text[];v_from date;v_to date;v_records jsonb:='[]';v_tables text[];v_methods text[];v_limits text[]:=array['Results describe imported and derived historical observations only.','Missing source coverage and null values are not imputed.','No result is a prediction, recommendation, or trading signal.'];
begin
 if p_intent not in('semantic_search','social_before_movers','account_before_largest_move','feature_screen','source_sentiment_comparison','pattern_frequency','ticker_comparison','timeline','social_before_volume','sentiment_before_gainers','promotion_around_events')then raise exception'Unsupported research intent';end if;
 select array_agg(upper(value))into v_tickers from jsonb_array_elements_text(coalesce(v_filters->'tickers','[]'));
 select array_agg(lower(value))into v_sources from jsonb_array_elements_text(coalesce(v_filters->'sources','[]'));
 if coalesce(v_filters->>'from','')~'^\d{4}-\d{2}-\d{2}$'then v_from:=(v_filters->>'from')::date;end if;
 if coalesce(v_filters->>'to','')~'^\d{4}-\d{2}-\d{2}$'then v_to:=(v_filters->>'to')::date;end if;

 if p_intent='semantic_search'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(select s.*,f.attention_score,jsonb_build_array(jsonb_build_object('type',s.domain,'id',s.record_id,'label',s.title,'route',s.route,'source_table',s.source_table,'observation_date',s.observation_date))citations,'Matched indexed project records by full-text or partial label/content search after applying available metadata filters.'why from public.search_research_documents(coalesce(v_filters->>'search_text',''),null,least(200,v_limit*4))s left join public.tickers t on t.id=s.ticker_id left join lateral(select z.attention_score from public.ticker_research_features z where z.ticker_id=s.ticker_id and z.feature_version='features-v1'order by z.date desc limit 1)f on true where(v_sources is null or exists(select 1 from unnest(v_sources)z where z=lower(s.evidence->>'source_name')or(z='wallstreetbets'and lower(s.evidence->>'community_slug')='wallstreetbets')))and(v_filters->>'industry'is null or(v_filters->>'industry'='ai'and lower(concat_ws(' ',t.sector,t.industry,t.company_name))~'(^|[^a-z])(ai|artificial intelligence|machine learning)([^a-z]|$)')or(v_filters->>'industry'<>'ai'and lower(concat_ws(' ',t.sector,t.industry,t.company_name))like'%'||lower(v_filters->>'industry')||'%'))order by case when v_filters->>'order_by'='attention_score'then f.attention_score end desc nulls last,s.relevance desc limit v_limit)x;
  v_tables:=array['research_search_documents'];v_methods:=array['PostgreSQL simple full-text ranking plus exact/prefix/substring label matching'];
 elsif p_intent='social_before_movers'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select t.symbol,t.company_name,s.name source_name,sc.name community_name,a.username,p.id post_id,p.posted_at,m.id appearance_id,m.report_date,c.name category_name,c.exchange,c.category_type,m.rank,m.change_percent,m.volume,
    m.report_date-(p.posted_at at time zone'UTC')::date days_before_mover,'The imported social mention predates the imported market-mover report date.'why,
    jsonb_build_array(jsonb_build_object('type','ticker','id',t.id,'label',t.symbol,'route','/tickers/'||t.symbol,'source_table','tickers'),jsonb_build_object('type','post','id',p.id,'label',coalesce(a.username,s.name),'route','/social/posts/'||p.id,'source_table','social_posts','observation_date',p.posted_at::date),jsonb_build_object('type','market_mover','id',m.id,'label',c.name,'route','/market-movers/'||m.id,'source_table','market_mover_appearances','observation_date',m.report_date))citations
   from public.social_posts p join public.post_tickers pt on pt.post_id=p.id join public.tickers t on t.id=pt.ticker_id join public.social_sources s on s.id=p.source_id left join public.social_communities sc on sc.id=p.community_id left join public.social_accounts a on a.id=p.account_id join public.market_mover_appearances m on m.ticker_id=t.id join public.market_categories c on c.id=m.category_id
   where p.posted_at is not null and(p.posted_at at time zone'UTC')::date<m.report_date and(coalesce(v_filters->>'category_type','biggest_gainer')=''or c.category_type=coalesce(v_filters->>'category_type','biggest_gainer'))
    and(v_filters->>'exchange'is null or upper(c.exchange)=upper(v_filters->>'exchange'))and(v_from is null or m.report_date>=v_from)and(v_to is null or m.report_date<=v_to)
    and(v_tickers is null or t.symbol=any(v_tickers))and(v_sources is null or exists(select 1 from unnest(v_sources)z where z=lower(s.name)or(z='wallstreetbets'and lower(coalesce(sc.slug,sc.name))='wallstreetbets')))
   order by m.report_date desc,p.posted_at desc limit v_limit)x;
  v_tables:=array['social_posts','post_tickers','social_sources','social_communities','market_mover_appearances','market_categories','tickers'];v_methods:=array['UTC calendar-date ordering of normalized mentions and Scanz mover appearances'];v_limits:=array_append(v_limits,'A mention before a report date is temporal ordering, not evidence of causation.');
 elsif p_intent='account_before_largest_move'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   with ranked as(select m.*,c.name category_name,c.category_type,row_number()over(partition by m.ticker_id order by abs(m.change_percent)desc nulls last,m.report_date,m.id)rn from public.market_mover_appearances m join public.market_categories c on c.id=m.category_id)
   select t.symbol,a.username,s.name source_name,p.id post_id,p.posted_at,r.id appearance_id,r.report_date,r.category_name,r.change_percent,r.volume,r.report_date-(p.posted_at at time zone'UTC')::date days_before_move,'The account has a normalized post/ticker link before the largest absolute imported mover change for the ticker.'why,
    jsonb_build_array(jsonb_build_object('type','account','id',a.id,'label',a.username,'route','/promoters/'||a.id,'source_table','social_accounts'),jsonb_build_object('type','post','id',p.id,'label',coalesce(p.title,a.username),'route','/social/posts/'||p.id,'source_table','social_posts','observation_date',p.posted_at::date),jsonb_build_object('type','market_mover','id',r.id,'label',r.category_name,'route','/market-movers/'||r.id,'source_table','market_mover_appearances','observation_date',r.report_date))citations
   from ranked r join public.tickers t on t.id=r.ticker_id join public.post_tickers pt on pt.ticker_id=t.id join public.social_posts p on p.id=pt.post_id join public.social_accounts a on a.id=p.account_id join public.social_sources s on s.id=a.source_id
   where r.rn=1 and p.posted_at is not null and(p.posted_at at time zone'UTC')::date<r.report_date and(v_tickers is null or t.symbol=any(v_tickers))and(v_filters->>'account'is null or lower(a.username)=lower(v_filters->>'account'))order by r.report_date desc,p.posted_at desc limit v_limit)x;
  v_tables:=array['social_posts','post_tickers','social_accounts','social_sources','market_mover_appearances','market_categories','tickers'];v_methods:=array['Largest move = greatest absolute change_percent among imported mover appearances per ticker'];v_limits:=array_append(v_limits,'Largest move is limited to imported Scanz mover observations, not complete exchange price history.');
 elsif p_intent='feature_screen'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select f.id feature_id,t.id ticker_id,t.symbol,t.company_name,t.sector,t.industry,f.date,f.attention_score,f.sentiment_score,f.sentiment_change,f.promotion_intensity,f.hype_risk,f.relative_volume,f.volatility_expansion,f.mention_count,f.unique_accounts,f.unique_sources,f.methodology_version,f.feature_version,'The derived daily feature row satisfies every configured screen threshold and date filter.'why,
    jsonb_build_array(jsonb_build_object('type','ticker','id',t.id,'label',t.symbol,'route','/tickers/'||t.symbol,'source_table','tickers'),jsonb_build_object('type','feature','id',f.id,'label',f.date,'route','/tickers/'||t.symbol,'source_table','ticker_research_features','observation_date',f.date))citations
   from public.ticker_research_features f join public.tickers t on t.id=f.ticker_id where f.feature_version='features-v1'and(v_from is null or f.date>=v_from)and(v_to is null or f.date<=v_to)and(v_tickers is null or t.symbol=any(v_tickers))
    and(v_filters->>'attention_min'is null or f.attention_score>=(v_filters->>'attention_min')::numeric)and(v_filters->>'sentiment_min'is null or f.sentiment_score>=(v_filters->>'sentiment_min')::numeric)
    and(v_filters->>'promotion_min'is null or f.promotion_intensity>=(v_filters->>'promotion_min')::numeric)and(v_filters->>'industry'is null or(v_filters->>'industry'='ai'and lower(concat_ws(' ',t.sector,t.industry,t.company_name))~'(^|[^a-z])(ai|artificial intelligence|machine learning)([^a-z]|$)')or(v_filters->>'industry'<>'ai'and lower(concat_ws(' ',t.sector,t.industry,t.company_name))like'%'||lower(v_filters->>'industry')||'%'))
   order by case when v_filters->>'order_by'='sentiment_score'then f.sentiment_score when v_filters->>'order_by'='promotion_intensity'then f.promotion_intensity else f.attention_score end desc nulls last,f.date desc limit v_limit)x;
  v_tables:=array['ticker_research_features','tickers'];v_methods:=array['features-v1','rules-v1 where sentiment/scoring inputs are available'];
 elsif p_intent='source_sentiment_comparison'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   with b as(select t.id ticker_id,t.symbol,case when lower(coalesce(c.slug,c.name))='wallstreetbets'then'WallStreetBets'else s.name end source_group,so.sentiment_score,so.confidence_score,so.observation_date,so.model_version from public.sentiment_observations so join public.tickers t on t.id=so.ticker_id left join public.social_sources s on s.id=so.source_id left join public.social_communities c on c.id=so.community_id where(v_tickers is null or t.symbol=any(v_tickers))and(v_from is null or so.observation_date>=v_from)and(v_to is null or so.observation_date<=v_to))
   select ticker_id,symbol,source_group,count(*)observations,round(avg(sentiment_score),4)average_sentiment,round(percentile_cont(.5)within group(order by sentiment_score)::numeric,4)median_sentiment,round(avg(confidence_score),4)average_confidence,min(observation_date)first_observation,max(observation_date)last_observation,'Normalized sentiment observations were grouped by requested platform/community and ticker.'why,
    jsonb_build_array(jsonb_build_object('type','ticker','id',ticker_id,'label',symbol,'route','/tickers/'||symbol,'source_table','tickers'),jsonb_build_object('type','sentiment_group','id',ticker_id,'label',source_group,'route','/sentiment?ticker='||symbol,'source_table','sentiment_observations','observation_date',max(observation_date)))citations
   from b where(v_sources is null or exists(select 1 from unnest(v_sources)z where z=lower(source_group)))group by ticker_id,symbol,source_group order by symbol,source_group limit v_limit)x;
  v_tables:=array['sentiment_observations','social_sources','social_communities','tickers'];v_methods:=array['rules-v1 sentiment observations unless record model_version states otherwise'];v_limits:=array_append(v_limits,'Platform comparison reflects only imported records and available community/source attribution.');
 elsif p_intent='pattern_frequency'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select p.id pattern_id,p.name pattern_name,c.name category_name,p.methodology_version,p.feature_version,count(*)::bigint occurrences,count(distinct o.ticker_id)::bigint tickers,min(o.observation_date)first_seen,max(o.observation_date)last_seen,'Frequency counts deterministic stored pattern observations after applying ticker metadata and date filters.'why,
    jsonb_build_array(jsonb_build_object('type','pattern','id',p.id,'label',p.name,'route','/patterns/'||p.id,'source_table','research_patterns','observation_date',max(o.observation_date)))citations
   from public.pattern_observations o join public.research_patterns p on p.id=o.pattern_id join public.pattern_categories c on c.id=p.category_id join public.tickers t on t.id=o.ticker_id
   where(v_from is null or o.observation_date>=v_from)and(v_to is null or o.observation_date<=v_to)and(v_filters->>'industry'is null or lower(concat_ws(' ',t.sector,t.industry,t.company_name))like'%'||lower(v_filters->>'industry')||'%')
   group by p.id,c.name order by occurrences desc,p.name limit v_limit)x;
  v_tables:=array['pattern_observations','research_patterns','pattern_categories','tickers'];v_methods:=array['patterns-v1','features-v1'];
 elsif p_intent='ticker_comparison'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select t.id ticker_id,t.symbol,t.company_name,t.exchange,t.sector,t.industry,ts.total_appearances,ts.biggest_gainer_count,ts.biggest_decliner_count,ts.average_change_percent,f.date feature_date,f.sentiment_score,f.attention_score,f.promotion_intensity,f.hype_risk,f.relative_volume,f.volatility_expansion,ph.date price_date,ph.close_price,ph.volume,
    (select count(*)from public.pattern_observations o where o.ticker_id=t.id)pattern_occurrences,(select count(*)from public.post_tickers pt where pt.ticker_id=t.id)social_mentions,(select count(distinct p.account_id)from public.post_tickers pt join public.social_posts p on p.id=pt.post_id where pt.ticker_id=t.id)unique_accounts,'Each column is the latest available or all-history descriptive metric identified by its date and source table.'why,
    jsonb_build_array(jsonb_build_object('type','ticker','id',t.id,'label',t.symbol,'route','/tickers/'||t.symbol,'source_table','tickers'),jsonb_build_object('type','feature','id',f.id,'label',f.date,'route','/tickers/'||t.symbol,'source_table','ticker_research_features','observation_date',f.date),jsonb_build_object('type','price','id',ph.id,'label',ph.date,'route','/tickers/'||t.symbol,'source_table','price_history','observation_date',ph.date))citations
   from public.tickers t left join public.ticker_statistics ts on ts.ticker_id=t.id left join lateral(select*from public.ticker_research_features z where z.ticker_id=t.id and z.feature_version='features-v1'order by z.date desc limit 1)f on true left join lateral(select*from public.price_history_canonical z where z.ticker_id=t.id order by z.date desc limit 1)ph on true
   where v_tickers is not null and t.symbol=any(v_tickers)order by array_position(v_tickers,t.symbol)limit v_limit)x;
  v_tables:=array['tickers','ticker_statistics','ticker_research_features','price_history','pattern_observations','post_tickers','social_posts'];v_methods:=array['features-v1','canonical raw-close price selection','Checkpoint 1 ticker statistics'];
 elsif p_intent='timeline'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select f.id feature_id,t.id ticker_id,t.symbol,f.date,f.sentiment_score,f.attention_score,f.promotion_intensity,f.hype_risk,f.relative_volume,f.volatility_expansion,ph.id price_id,ph.close_price,ph.volume,(select count(*)from public.market_mover_appearances m where m.ticker_id=t.id and m.report_date=f.date)mover_events,(select count(*)from public.pattern_observations o where o.ticker_id=t.id and o.observation_date=f.date)pattern_occurrences,'Timeline points combine same-date derived features with canonical imported price and event counts; missing values remain null.'why,
    jsonb_build_array(jsonb_build_object('type','ticker','id',t.id,'label',t.symbol,'route','/tickers/'||t.symbol,'source_table','tickers'),jsonb_build_object('type','feature','id',f.id,'label',f.date,'route','/tickers/'||t.symbol,'source_table','ticker_research_features','observation_date',f.date))citations
   from public.ticker_research_features f join public.tickers t on t.id=f.ticker_id left join public.price_history_canonical ph on ph.ticker_id=f.ticker_id and ph.date=f.date where f.feature_version='features-v1'and(v_tickers is null or t.symbol=any(v_tickers))and(v_from is null or f.date>=v_from)and(v_to is null or f.date<=v_to)order by f.date,t.symbol limit v_limit)x;
  v_tables:=array['ticker_research_features','price_history','market_mover_appearances','pattern_observations','tickers'];v_methods:=array['features-v1','canonical raw-close price selection'];
 elsif p_intent='social_before_volume'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select t.id ticker_id,t.symbol,t.company_name,t.sector,t.industry,p.id post_id,p.posted_at,s.name source_name,sc.name community_name,vm.date volume_date,vm.relative_volume_20d,vm.volume_change_percent,vm.date-(p.posted_at at time zone'UTC')::date days_to_volume,'The normalized mention predates a later imported session whose relative volume meets the configured threshold.'why,
    jsonb_build_array(jsonb_build_object('type','post','id',p.id,'label',coalesce(p.title,s.name),'route','/social/posts/'||p.id,'source_table','social_posts','observation_date',p.posted_at::date),jsonb_build_object('type','price','id',vm.price_history_id,'label',vm.date,'route','/tickers/'||t.symbol,'source_table','price_daily_metrics','observation_date',vm.date))citations
   from public.social_posts p join public.post_tickers pt on pt.post_id=p.id join public.tickers t on t.id=pt.ticker_id join public.social_sources s on s.id=p.source_id left join public.social_communities sc on sc.id=p.community_id join lateral(select d.*from public.price_daily_metrics d where d.ticker_id=t.id and d.date>(p.posted_at at time zone'UTC')::date and d.date<=(p.posted_at at time zone'UTC')::date+30 and d.relative_volume_20d>=coalesce((v_filters->>'volume_min')::numeric,2)order by d.date limit 1)vm on true
   where p.posted_at is not null and(v_sources is null or exists(select 1 from unnest(v_sources)z where z=lower(s.name)or(z='wallstreetbets'and lower(coalesce(sc.slug,sc.name))='wallstreetbets')))and(v_filters->>'industry'is null or(v_filters->>'industry'='ai'and lower(concat_ws(' ',t.sector,t.industry,t.company_name))~'(^|[^a-z])(ai|artificial intelligence|machine learning)([^a-z]|$)')or(v_filters->>'industry'<>'ai'and lower(concat_ws(' ',t.sector,t.industry,t.company_name))like'%'||lower(v_filters->>'industry')||'%'))order by vm.date desc limit v_limit)x;
  v_tables:=array['social_posts','post_tickers','social_sources','social_communities','price_daily_metrics','tickers'];v_methods:=array['Checkpoint 7 relative volume versus prior 20 available sessions'];v_limits:=array_append(v_limits,'Theme labels such as AI are matched only against stored company, sector, and industry text.');
 elsif p_intent='sentiment_before_gainers'then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select t.id ticker_id,t.symbol,so.id sentiment_id,so.observation_date,so.sentiment,so.sentiment_score,so.confidence_score,m.id appearance_id,m.report_date,c.name category_name,m.change_percent,m.report_date-so.observation_date days_before_gainer,'A positive stored sentiment score predates an imported biggest-gainer appearance for the same ticker.'why,
    jsonb_build_array(jsonb_build_object('type','sentiment','id',so.id,'label',so.observation_date,'route','/sentiment?ticker='||t.symbol,'source_table','sentiment_observations','observation_date',so.observation_date),jsonb_build_object('type','market_mover','id',m.id,'label',c.name,'route','/market-movers/'||m.id,'source_table','market_mover_appearances','observation_date',m.report_date))citations
   from public.sentiment_observations so join public.tickers t on t.id=so.ticker_id join public.market_mover_appearances m on m.ticker_id=t.id join public.market_categories c on c.id=m.category_id where so.sentiment_score>coalesce((v_filters->>'sentiment_min')::numeric,0)and so.observation_date<m.report_date and c.category_type='biggest_gainer'and(v_filters->>'exchange'is null or upper(c.exchange)=upper(v_filters->>'exchange'))and(v_from is null or m.report_date>=v_from)and(v_to is null or m.report_date<=v_to)and(v_tickers is null or t.symbol=any(v_tickers))order by m.report_date desc,so.observation_date desc limit v_limit)x;
  v_tables:=array['sentiment_observations','market_mover_appearances','market_categories','tickers'];v_methods:=array['rules-v1 sentiment where available','Scanz category taxonomy'];v_limits:=array_append(v_limits,'Temporal sequence and positive language do not establish causation or future performance.');
 else
  select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_records from(
   select t.id ticker_id,t.symbol,e.id event_id,e.event_date,e.headline,case when coalesce(pe.event_start_at,pe.first_seen_at,pe.created_at)<e.event_date then'before'else'after'end period,count(*)promotion_events,round(avg(pe.promotion_intensity),2)average_promotion_intensity,round(avg(pe.unusual_attention_score),2)average_attention,round(avg(pe.hype_risk_score),2)average_hype_risk,'Promotion observations are grouped into the seven calendar days before or after each imported earnings event.'why,
    jsonb_build_array(jsonb_build_object('type','ticker_event','id',e.id,'label',coalesce(e.headline,'Earnings event'),'route','/tickers/'||t.symbol,'source_table','ticker_events','observation_date',e.event_date::date),jsonb_build_object('type','ticker','id',t.id,'label',t.symbol,'route','/tickers/'||t.symbol,'source_table','tickers'))citations
   from public.ticker_events e join public.tickers t on t.id=e.ticker_id join public.promotion_events pe on pe.ticker_id=e.ticker_id and coalesce(pe.event_start_at,pe.first_seen_at,pe.created_at)between e.event_date-interval'7 days'and e.event_date+interval'7 days'
   where e.event_type='earnings'and(v_tickers is null or t.symbol=any(v_tickers))and(v_from is null or e.event_date::date>=v_from)and(v_to is null or e.event_date::date<=v_to)group by t.id,e.id,case when coalesce(pe.event_start_at,pe.first_seen_at,pe.created_at)<e.event_date then'before'else'after'end order by e.event_date desc,t.symbol limit v_limit)x;
  v_tables:=array['promotion_events','ticker_events','tickers'];v_methods:=array['rules-v1 promotion descriptors','Seven-calendar-day event comparison'];v_limits:=array_append(v_limits,'Before/after comparisons are descriptive and do not attribute promotion activity to the event.');
 end if;
 return jsonb_build_object('intent',p_intent,'records',coalesce(v_records,'[]'),'record_count',jsonb_array_length(coalesce(v_records,'[]')),'tables',to_jsonb(v_tables),'methodology_versions',to_jsonb(v_methods),'limitations',to_jsonb(v_limits),'executed_at',now());
end$$;

select public.rebuild_research_search_documents();

do $$declare t text;begin foreach t in array array['research_workspaces','saved_searches','research_workspace_items','research_sessions','research_messages','research_history','research_search_documents']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;
revoke all on function public.rebuild_research_search_documents()from public,anon,authenticated;grant execute on function public.rebuild_research_search_documents()to service_role;
revoke all on function public.execute_research_query(text,jsonb,integer)from public,anon,authenticated;grant execute on function public.execute_research_query(text,jsonb,integer)to service_role;
grant execute on function public.search_research_documents(text,text[],integer)to anon,authenticated,service_role;
