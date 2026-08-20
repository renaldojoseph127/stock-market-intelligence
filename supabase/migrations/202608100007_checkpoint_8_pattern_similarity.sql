create table public.pattern_categories(
 id uuid primary key default gen_random_uuid(),code text not null unique,name text not null unique,description text,display_order integer not null default 0,created_at timestamptz not null default now()
);
create table public.research_patterns(
 id uuid primary key default gen_random_uuid(),category_id uuid not null references public.pattern_categories(id)on delete restrict,code text not null unique,name text not null unique,description text not null,
 pattern_type text not null,methodology_version text not null,feature_version text not null,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index research_patterns_category_idx on public.research_patterns(category_id,active);
create table public.pattern_conditions(
 id uuid primary key default gen_random_uuid(),pattern_id uuid not null references public.research_patterns(id)on delete cascade,condition_type text not null,
 operator text not null check(operator in('>','>=','<','<=','=','between')),threshold numeric,configuration jsonb not null default'{}',created_at timestamptz not null default now(),unique(pattern_id,condition_type)
);
create index pattern_conditions_pattern_idx on public.pattern_conditions(pattern_id);

create table public.ticker_research_features(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,date date not null,
 sentiment_score numeric,sentiment_change numeric,attention_score numeric,mention_velocity numeric,promotion_intensity numeric,hype_risk numeric,
 relative_volume numeric,volatility numeric,volatility_expansion numeric,mention_count integer,unique_accounts integer,unique_sources integer,unique_communities integer,
 account_activity integer,pre_move_mentions integer,market_mover_count_30d integer,price_change numeric,methodology_version text not null,feature_version text not null,created_at timestamptz not null default now(),
 unique(ticker_id,date,feature_version)
);
create index ticker_research_features_ticker_date_idx on public.ticker_research_features(ticker_id,date desc);
create index ticker_research_features_version_date_idx on public.ticker_research_features(feature_version,date desc);

create table public.pattern_observations(
 id uuid primary key default gen_random_uuid(),pattern_id uuid not null references public.research_patterns(id)on delete cascade,ticker_id uuid not null references public.tickers(id)on delete cascade,
 observation_date date not null,start_timestamp timestamptz not null,end_timestamp timestamptz not null,confidence_score numeric check(confidence_score is null or confidence_score between 0 and 1),
 matched_conditions jsonb not null,methodology_version text not null,feature_version text not null,created_at timestamptz not null default now(),unique(pattern_id,ticker_id,observation_date,methodology_version,feature_version)
);
create index pattern_observations_pattern_idx on public.pattern_observations(pattern_id,observation_date desc);
create index pattern_observations_ticker_idx on public.pattern_observations(ticker_id,observation_date desc);
create index pattern_observations_date_idx on public.pattern_observations(observation_date desc);

create table public.pattern_outcomes(
 id uuid primary key default gen_random_uuid(),pattern_observation_id uuid not null unique references public.pattern_observations(id)on delete cascade,reference_price numeric,
 return_1d numeric,return_3d numeric,return_7d numeric,return_14d numeric,return_30d numeric,maximum_return numeric,maximum_return_date date,
 volume_change numeric,volatility_change numeric,created_at timestamptz not null default now()
);
create index pattern_outcomes_observation_idx on public.pattern_outcomes(pattern_observation_id);

create table public.pattern_statistics(
 pattern_id uuid primary key references public.research_patterns(id)on delete cascade,total_occurrences integer not null default 0,average_return_1d numeric,average_return_7d numeric,
 average_return_30d numeric,median_return_30d numeric,average_volume_change numeric,average_volatility_change numeric,positive_outcome_count integer not null default 0,
 negative_outcome_count integer not null default 0,last_seen date,updated_at timestamptz not null default now()
);

create table public.pattern_similarity_matches(
 id uuid primary key default gen_random_uuid(),ticker_id uuid not null references public.tickers(id)on delete cascade,source_feature_id uuid not null references public.ticker_research_features(id)on delete cascade,
 source_date date not null,reference_observation_id uuid not null references public.pattern_observations(id)on delete cascade,similarity_score numeric not null check(similarity_score between 0 and 100),
 matched_features jsonb not null,methodology_version text not null,feature_version text not null,created_at timestamptz not null default now(),unique(source_feature_id,reference_observation_id,methodology_version)
);
create index pattern_similarity_ticker_score_idx on public.pattern_similarity_matches(ticker_id,similarity_score desc);
create index pattern_similarity_reference_idx on public.pattern_similarity_matches(reference_observation_id);

create trigger research_patterns_updated before update on public.research_patterns for each row execute function public.set_updated_at();

insert into public.pattern_categories(code,name,description,display_order)values
('social','Social Patterns','Patterns derived from imported discussion, accounts, sentiment and attention.',10),
('market','Market Patterns','Patterns derived from historical market-mover, price, volume and volatility observations.',20),
('combined','Combined Patterns','Patterns requiring both social and market observations.',30);

insert into public.research_patterns(category_id,code,name,description,pattern_type,methodology_version,feature_version)
select c.id,v.code,v.name,v.description,v.pattern_type,'patterns-v1','features-v1'from public.pattern_categories c join(values
('social','attention_spike','Social Attention Spike','Unusual attention and mention velocity both exceed visible thresholds.','social'),
('social','sentiment_shift','Sentiment Shift','The absolute daily change in average ticker sentiment exceeds a visible threshold.','sentiment'),
('social','community_expansion','Community Expansion','Discussion appears across at least three distinct imported communities.','social'),
('social','account_activity_burst','Account Activity Burst','At least five distinct imported accounts mention the ticker on one date.','account'),
('market','volume_expansion','Volume Expansion','Relative volume exceeds twice the prior twenty-session average.','market'),
('market','volatility_expansion','Volatility Expansion','Five-session volatility exceeds twenty-session volatility by the configured ratio.','market'),
('market','repeated_market_mover','Repeated Market-Mover Appearance','At least two Scanz mover appearances occur within the trailing thirty calendar days.','market'),
('combined','social_volume_confirmation','Social + Volume Confirmation','Unusual attention and relative volume simultaneously exceed visible thresholds.','combined'),
('combined','early_mention_attention','Early Mention + Attention Increase','A traceable pre-mover account observation and elevated attention occur on the same feature date.','combined'),
('combined','multi_factor_setup','Multi-Factor Historical Setup','Attention, directional sentiment, relative volume and mention-count conditions occur together.','combined')
)v(category_code,code,name,description,pattern_type)on v.category_code=c.code;

insert into public.pattern_conditions(pattern_id,condition_type,operator,threshold,configuration)
select p.id,v.condition_type,v.operator,v.threshold,v.configuration from public.research_patterns p join(values
('attention_spike','attention_score','>=',80::numeric,'{"unit":"0-100"}'::jsonb),('attention_spike','mention_velocity','>=',100,'{"unit":"percent"}'),
('sentiment_shift','absolute_sentiment_change','>=',.40,'{"unit":"-1 to 1"}'),('community_expansion','unique_communities','>=',3,'{}'),
('account_activity_burst','unique_accounts','>=',5,'{}'),('volume_expansion','relative_volume','>=',2,'{"baseline_sessions":20}'),
('volatility_expansion','volatility_expansion','>=',1.5,'{"short_sessions":5,"long_sessions":20}'),('repeated_market_mover','market_mover_count_30d','>=',2,'{"calendar_days":30}'),
('social_volume_confirmation','attention_score','>=',60,'{}'),('social_volume_confirmation','relative_volume','>=',1.5,'{"baseline_sessions":20}'),
('early_mention_attention','pre_move_mentions','>=',1,'{}'),('early_mention_attention','attention_score','>=',50,'{}'),
('multi_factor_setup','attention_score','>=',50,'{}'),('multi_factor_setup','absolute_sentiment_score','>=',.20,'{}'),('multi_factor_setup','relative_volume','>=',1.5,'{"baseline_sessions":20}'),('multi_factor_setup','mention_count','>=',3,'{}')
)v(pattern_code,condition_type,operator,threshold,configuration)on p.code=v.pattern_code;

create or replace function public.cp8_condition_satisfied(p_value numeric,p_operator text,p_threshold numeric,p_configuration jsonb)returns boolean language sql immutable as $$
select case when p_value is null then false when p_operator='>'then p_value>p_threshold when p_operator='>='then p_value>=p_threshold when p_operator='<'then p_value<p_threshold when p_operator='<='then p_value<=p_threshold when p_operator='='then p_value=p_threshold when p_operator='between'then p_value between p_threshold and(p_configuration->>'maximum')::numeric else false end$$;

create or replace function public.rebuild_research_features(p_ticker_id uuid default null,p_start_date date default null,p_end_date date default null)returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;
begin
 delete from public.ticker_research_features f where f.feature_version='features-v1'and(p_ticker_id is null or f.ticker_id=p_ticker_id)and(p_start_date is null or f.date>=p_start_date)and(p_end_date is null or f.date<=p_end_date);
 with feature_dates as(
  select ticker_id,date from public.price_history_canonical union select ticker_id,period_start::date from public.ticker_attention_observations where period_type='daily'
  union select ticker_id,observation_date from public.sentiment_observations union select pt.ticker_id,(p.posted_at at time zone'UTC')::date from public.post_tickers pt join public.social_posts p on p.id=pt.post_id where p.posted_at is not null
  union select ticker_id,coalesce(event_start_at,first_seen_at,created_at)::date from public.promotion_events union select ticker_id,report_date from public.market_mover_appearances
 ),scoped as(select distinct ticker_id,date from feature_dates where(p_ticker_id is null or ticker_id=p_ticker_id)and(p_start_date is null or date>=p_start_date)and(p_end_date is null or date<=p_end_date))
 insert into public.ticker_research_features(ticker_id,date,sentiment_score,sentiment_change,attention_score,mention_velocity,promotion_intensity,hype_risk,relative_volume,volatility,volatility_expansion,mention_count,unique_accounts,unique_sources,unique_communities,account_activity,pre_move_mentions,market_mover_count_30d,price_change,methodology_version,feature_version)
 select d.ticker_id,d.date,s.average_sentiment_score,s.change_vs_prior,a.unusual_attention_score,a.mention_velocity,pr.promotion_intensity,pr.hype_risk_score,pm.relative_volume_20d,pm.volatility_20d,pm.volatility_expansion,
  social.mentions,social.accounts,social.sources,social.communities,social.accounts,early.pre_move,movers.mover_count,pm.daily_return,'patterns-v1','features-v1'
 from scoped d
 left join lateral(select average_sentiment_score,change_vs_prior from public.ticker_sentiment_period_comparison x where x.ticker_id=d.ticker_id and x.period_type='daily'and x.period_start::date=d.date order by x.period_start limit 1)s on true
 left join lateral(select unusual_attention_score,mention_velocity from public.ticker_attention_observations x where x.ticker_id=d.ticker_id and x.period_type='daily'and x.period_start::date=d.date order by x.period_start limit 1)a on true
 left join lateral(select avg(promotion_intensity)promotion_intensity,avg(hype_risk_score)hype_risk_score from public.promotion_events x where x.ticker_id=d.ticker_id and coalesce(x.event_start_at,x.first_seen_at,x.created_at)::date=d.date)pr on true
 left join lateral(select relative_volume_20d,volatility_20d,volatility_expansion,daily_return from public.price_daily_metrics x where x.ticker_id=d.ticker_id and x.date=d.date)pm on true
 left join lateral(select count(*)::int mentions,count(distinct p.account_id)::int accounts,count(distinct p.source_id)::int sources,count(distinct p.community_id)filter(where p.community_id is not null)::int communities from public.post_tickers pt join public.social_posts p on p.id=pt.post_id where pt.ticker_id=d.ticker_id and(p.posted_at at time zone'UTC')::date=d.date)social on true
 left join lateral(select count(distinct post_id)::int pre_move from public.account_mover_observations x where x.ticker_id=d.ticker_id and x.relationship_type='before_mover'and(x.mention_at at time zone'UTC')::date=d.date)early on true
 left join lateral(select count(distinct x.report_date)::int mover_count from public.market_mover_appearances x where x.ticker_id=d.ticker_id and x.report_date between d.date-29 and d.date)movers on true;
 get diagnostics rebuilt=row_count;return rebuilt;
end$$;

create or replace function public.rebuild_pattern_observations(p_ticker_id uuid default null,p_start_date date default null,p_end_date date default null)returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;
begin
 delete from public.pattern_observations o where o.methodology_version='patterns-v1'and(p_ticker_id is null or o.ticker_id=p_ticker_id)and(p_start_date is null or o.observation_date>=p_start_date)and(p_end_date is null or o.observation_date<=p_end_date);
 with candidates as(
  select p.id pattern_id,f.id feature_id,f.ticker_id,f.date,p.methodology_version,p.feature_version,count(c.id)condition_count,
   bool_and(public.cp8_condition_satisfied(v.source_value,c.operator,c.threshold,c.configuration))all_matched,
   jsonb_agg(jsonb_build_object('condition_type',c.condition_type,'operator',c.operator,'threshold',c.threshold,'configuration',c.configuration,'source_value',v.source_value,'satisfied',public.cp8_condition_satisfied(v.source_value,c.operator,c.threshold,c.configuration))order by c.condition_type)matched
  from public.ticker_research_features f cross join public.research_patterns p join public.pattern_conditions c on c.pattern_id=p.id
  cross join lateral(select case c.condition_type when'attention_score'then f.attention_score when'mention_velocity'then f.mention_velocity when'absolute_sentiment_change'then abs(f.sentiment_change)when'absolute_sentiment_score'then abs(f.sentiment_score)when'unique_communities'then f.unique_communities when'unique_accounts'then f.unique_accounts when'relative_volume'then f.relative_volume when'volatility_expansion'then f.volatility_expansion when'market_mover_count_30d'then f.market_mover_count_30d when'pre_move_mentions'then f.pre_move_mentions when'mention_count'then f.mention_count end::numeric source_value)v
  where f.feature_version='features-v1'and p.active and p.methodology_version='patterns-v1'and(p_ticker_id is null or f.ticker_id=p_ticker_id)and(p_start_date is null or f.date>=p_start_date)and(p_end_date is null or f.date<=p_end_date)
  group by p.id,f.id,f.ticker_id,f.date,p.methodology_version,p.feature_version
 )
 insert into public.pattern_observations(pattern_id,ticker_id,observation_date,start_timestamp,end_timestamp,confidence_score,matched_conditions,methodology_version,feature_version)
 select pattern_id,ticker_id,date,date::timestamptz,(date+1)::timestamptz,1,matched,methodology_version,feature_version from candidates where all_matched and condition_count>0;
 get diagnostics rebuilt=row_count;return rebuilt;
end$$;

create or replace function public.rebuild_pattern_outcomes(p_ticker_id uuid default null)returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;
begin
 delete from public.pattern_outcomes po using public.pattern_observations o where po.pattern_observation_id=o.id and(p_ticker_id is null or o.ticker_id=p_ticker_id);
 insert into public.pattern_outcomes(pattern_observation_id,reference_price,return_1d,return_3d,return_7d,return_14d,return_30d,maximum_return,maximum_return_date,volume_change,volatility_change)
 select o.id,ref.close_price,
  (p1.close_price-ref.close_price)/nullif(ref.close_price,0),(p3.close_price-ref.close_price)/nullif(ref.close_price,0),(p7.close_price-ref.close_price)/nullif(ref.close_price,0),(p14.close_price-ref.close_price)/nullif(ref.close_price,0),(p30.close_price-ref.close_price)/nullif(ref.close_price,0),mx.ret,mx.date,
  (p7.volume-ref.volume)::numeric/nullif(ref.volume,0),p7m.volatility_20d-refm.volatility_20d
 from public.pattern_observations o
 left join lateral(select p.*from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>=o.observation_date order by p.date limit 1)ref on true
 left join lateral(select p.*from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>ref.date order by p.date offset 0 limit 1)p1 on true
 left join lateral(select p.*from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>ref.date order by p.date offset 2 limit 1)p3 on true
 left join lateral(select p.*from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>ref.date order by p.date offset 6 limit 1)p7 on true
 left join lateral(select p.*from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>ref.date order by p.date offset 13 limit 1)p14 on true
 left join lateral(select p.*from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>ref.date order by p.date offset 29 limit 1)p30 on true
 left join lateral(select y.ret,y.date from(select(p.close_price-ref.close_price)/nullif(ref.close_price,0)ret,p.date from public.price_history_canonical p where p.ticker_id=o.ticker_id and p.date>ref.date order by p.date limit 30)y order by y.ret desc,y.date limit 1)mx on true
 left join public.price_daily_metrics refm on refm.price_history_id=ref.id left join public.price_daily_metrics p7m on p7m.price_history_id=p7.id
 where p_ticker_id is null or o.ticker_id=p_ticker_id;
 get diagnostics rebuilt=row_count;return rebuilt;
end$$;

create or replace function public.rebuild_pattern_statistics()returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;begin delete from public.pattern_statistics;insert into public.pattern_statistics(pattern_id,total_occurrences,average_return_1d,average_return_7d,average_return_30d,median_return_30d,average_volume_change,average_volatility_change,positive_outcome_count,negative_outcome_count,last_seen)
select p.id,count(o.id)::int,avg(po.return_1d),avg(po.return_7d),avg(po.return_30d),percentile_cont(.5)within group(order by po.return_30d),avg(po.volume_change),avg(po.volatility_change),count(*)filter(where po.return_30d>0)::int,count(*)filter(where po.return_30d<0)::int,max(o.observation_date)from public.research_patterns p left join public.pattern_observations o on o.pattern_id=p.id left join public.pattern_outcomes po on po.pattern_observation_id=o.id group by p.id;get diagnostics rebuilt=row_count;return rebuilt;end$$;

create or replace function public.cp8_feature_similarity(p_source_id uuid,p_reference_id uuid)returns table(similarity_score numeric,matched_features jsonb)language sql stable set search_path=public as $$
with pair as(select a.*,b.sentiment_score b_sentiment,b.attention_score b_attention,b.promotion_intensity b_promotion,b.hype_risk b_hype,b.relative_volume b_volume,b.volatility b_volatility,b.mention_count b_mentions,b.unique_accounts b_accounts,b.unique_sources b_sources,b.unique_communities b_communities from public.ticker_research_features a join public.ticker_research_features b on b.id=p_reference_id where a.id=p_source_id),features as(
select x.name,x.source_value,x.reference_value,x.weight,case when x.source_value is null or x.reference_value is null then null else greatest(0,100-least(100,abs(x.source_value-x.reference_value)/x.scale*100))end feature_similarity from pair p cross join lateral(values
('sentiment',p.sentiment_score,p.b_sentiment,15::numeric,2::numeric),('attention',p.attention_score,p.b_attention,20,100),('promotion_intensity',p.promotion_intensity,p.b_promotion,10,100),('hype_risk',p.hype_risk,p.b_hype,5,100),('relative_volume',p.relative_volume,p.b_volume,15,5),('volatility',p.volatility,p.b_volatility,10,.20),('mention_count',p.mention_count::numeric,p.b_mentions::numeric,10,10),('unique_accounts',p.unique_accounts::numeric,p.b_accounts::numeric,5,10),('unique_sources',p.unique_sources::numeric,p.b_sources::numeric,5,5),('unique_communities',p.unique_communities::numeric,p.b_communities::numeric,5,10))x(name,source_value,reference_value,weight,scale))
select round(sum(feature_similarity*weight)/nullif(sum(weight)filter(where feature_similarity is not null),0),2),jsonb_agg(jsonb_build_object('feature',name,'source_value',source_value,'reference_value',reference_value,'weight',weight,'feature_similarity',round(feature_similarity,2),'available',feature_similarity is not null)order by name)from features$$;

create or replace function public.find_similar_situations(p_ticker_id uuid,p_date date,p_limit integer default 20)returns table(reference_observation_id uuid,pattern_id uuid,reference_ticker_id uuid,reference_date date,similarity_score numeric,matched_features jsonb)language sql stable security invoker set search_path=public as $$
with source as(select id,ticker_id,date from public.ticker_research_features where ticker_id=p_ticker_id and date<=p_date and feature_version='features-v1'order by date desc limit 1)
select o.id,o.pattern_id,o.ticker_id,o.observation_date,s.similarity_score,s.matched_features from source f join public.pattern_observations o on o.observation_date<f.date join public.ticker_research_features rf on rf.ticker_id=o.ticker_id and rf.date=o.observation_date and rf.feature_version=o.feature_version cross join lateral public.cp8_feature_similarity(f.id,rf.id)s where s.similarity_score is not null order by s.similarity_score desc,o.observation_date desc limit greatest(1,least(p_limit,100))$$;

create or replace function public.rebuild_pattern_similarities(p_ticker_id uuid default null)returns integer language plpgsql security definer set search_path=public as $$
declare rebuilt integer;
begin delete from public.pattern_similarity_matches where p_ticker_id is null or ticker_id=p_ticker_id;
 with latest as(select distinct on(ticker_id)id,ticker_id,date,feature_version from public.ticker_research_features where feature_version='features-v1'and(p_ticker_id is null or ticker_id=p_ticker_id)order by ticker_id,date desc),ranked as(
 select f.id source_id,f.ticker_id,f.date,o.id observation_id,s.similarity_score,s.matched_features,row_number()over(partition by f.id order by s.similarity_score desc,o.observation_date desc)rn from latest f join public.pattern_observations o on o.observation_date<f.date join public.ticker_research_features rf on rf.ticker_id=o.ticker_id and rf.date=o.observation_date and rf.feature_version=o.feature_version cross join lateral public.cp8_feature_similarity(f.id,rf.id)s where s.similarity_score is not null)
 insert into public.pattern_similarity_matches(ticker_id,source_feature_id,source_date,reference_observation_id,similarity_score,matched_features,methodology_version,feature_version)select ticker_id,source_id,date,observation_id,similarity_score,matched_features,'similarity-v1','features-v1'from ranked where rn<=20;
 get diagnostics rebuilt=row_count;return rebuilt;
end$$;

create or replace function public.rebuild_cp8_patterns(p_ticker_id uuid default null,p_start_date date default null,p_end_date date default null)returns jsonb language plpgsql security definer set search_path=public as $$
declare features integer;observations integer;outcomes integer;statistics integer;similarities integer;begin features:=public.rebuild_research_features(p_ticker_id,p_start_date,p_end_date);observations:=public.rebuild_pattern_observations(p_ticker_id,p_start_date,p_end_date);outcomes:=public.rebuild_pattern_outcomes(p_ticker_id);statistics:=public.rebuild_pattern_statistics();similarities:=public.rebuild_pattern_similarities(p_ticker_id);return jsonb_build_object('features',features,'observations',observations,'outcomes',outcomes,'statistics',statistics,'similarities',similarities,'methodology_version','patterns-v1','feature_version','features-v1');end$$;

create or replace view public.pattern_library_detail with(security_invoker=true)as select p.*,c.code category_code,c.name category_name,coalesce(s.total_occurrences,0)total_occurrences,s.average_return_1d,s.average_return_7d,s.average_return_30d,s.median_return_30d,s.average_volume_change,s.average_volatility_change,coalesce(s.positive_outcome_count,0)positive_outcome_count,coalesce(s.negative_outcome_count,0)negative_outcome_count,s.last_seen from public.research_patterns p join public.pattern_categories c on c.id=p.category_id left join public.pattern_statistics s on s.pattern_id=p.id;
create or replace view public.pattern_observation_detail with(security_invoker=true)as select o.*,p.code pattern_code,p.name pattern_name,c.name category_name,t.symbol,po.reference_price,po.return_1d,po.return_3d,po.return_7d,po.return_14d,po.return_30d,po.maximum_return,po.maximum_return_date,po.volume_change,po.volatility_change,f.sentiment_score,f.sentiment_change,f.attention_score,f.mention_velocity,f.promotion_intensity,f.hype_risk,f.relative_volume,f.volatility,f.volatility_expansion,f.mention_count,f.unique_accounts,f.unique_sources,f.unique_communities from public.pattern_observations o join public.research_patterns p on p.id=o.pattern_id join public.pattern_categories c on c.id=p.category_id join public.tickers t on t.id=o.ticker_id left join public.pattern_outcomes po on po.pattern_observation_id=o.id left join public.ticker_research_features f on f.ticker_id=o.ticker_id and f.date=o.observation_date and f.feature_version=o.feature_version;
create or replace view public.pattern_similarity_detail with(security_invoker=true)as select m.*,st.symbol source_symbol,o.ticker_id reference_ticker_id,rt.symbol reference_symbol,o.observation_date reference_date,o.pattern_id,p.name pattern_name,po.return_1d,po.return_7d,po.return_30d,po.maximum_return from public.pattern_similarity_matches m join public.tickers st on st.id=m.ticker_id join public.pattern_observations o on o.id=m.reference_observation_id join public.tickers rt on rt.id=o.ticker_id join public.research_patterns p on p.id=o.pattern_id left join public.pattern_outcomes po on po.pattern_observation_id=o.id;

do $$declare t text;begin foreach t in array array['pattern_categories','research_patterns','pattern_conditions','ticker_research_features','pattern_observations','pattern_outcomes','pattern_statistics','pattern_similarity_matches']loop execute format('alter table public.%I enable row level security',t);execute format('create policy "Public read %1$s" on public.%1$I for select to anon, authenticated using (true)',t);end loop;end$$;
revoke all on function public.rebuild_research_features(uuid,date,date)from public,anon,authenticated;grant execute on function public.rebuild_research_features(uuid,date,date)to service_role;
revoke all on function public.rebuild_pattern_observations(uuid,date,date)from public,anon,authenticated;grant execute on function public.rebuild_pattern_observations(uuid,date,date)to service_role;
revoke all on function public.rebuild_pattern_outcomes(uuid)from public,anon,authenticated;grant execute on function public.rebuild_pattern_outcomes(uuid)to service_role;
revoke all on function public.rebuild_pattern_statistics()from public,anon,authenticated;grant execute on function public.rebuild_pattern_statistics()to service_role;
revoke all on function public.rebuild_pattern_similarities(uuid)from public,anon,authenticated;grant execute on function public.rebuild_pattern_similarities(uuid)to service_role;
revoke all on function public.rebuild_cp8_patterns(uuid,date,date)from public,anon,authenticated;grant execute on function public.rebuild_cp8_patterns(uuid,date,date)to service_role;
grant execute on function public.find_similar_situations(uuid,date,integer)to anon,authenticated;
