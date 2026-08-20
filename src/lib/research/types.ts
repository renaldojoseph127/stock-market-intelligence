export type ResearchIntent =
  | "semantic_search"
  | "metadata_screen"
  | "social_before_movers"
  | "account_before_largest_move"
  | "feature_screen"
  | "source_sentiment_comparison"
  | "pattern_frequency"
  | "ticker_comparison"
  | "timeline"
  | "social_before_volume"
  | "sentiment_before_gainers"
  | "promotion_around_events"
  | "catalyst_before_movers"
  | "catalyst_repeat_tickers"
  | "catalyst_no_identified"
  | "catalyst_comparison"
  | "reddit_before_move"
  | "wallstreetbets_before_move"
  | "social_before_catalyst"
  | "social_after_catalyst"
  | "accounts_before_move"
  | "sentiment_before_move"
  | "attention_before_move"
  | "community_comparison"
  | "repeat_account_ticker"
  | "social_without_identified_catalyst"
  | "ticker_intelligence_timeline"
  | "catalysts_before_move"
  | "catalysts_after_move"
  | "movers_without_identified_catalyst"
  | "quality_flagged_movers"
  | "compare_ticker_catalysts"
  | "cross_source_ticker_summary"
  | "social_before_move";
export type ResearchStatus =
  | "completed"
  | "clarification"
  | "rejected"
  | "failed";
export interface ResearchFilters {
  tickers?: string[];
  sources?: string[];
  from?: string;
  to?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  security_type?: string;
  country?: string;
  market_cap_min?: number;
  market_cap_max?: number;
  category_type?: string;
  account?: string;
  attention_min?: number;
  sentiment_min?: number;
  promotion_min?: number;
  volume_min?: number;
  order_by?: string;
  search_text?: string;
  event_type?: string;
  catalyst_type?: string;
  sec_form?: string;
  temporal_bucket?: string;
  max_days_before?: number;
  coverage_status?: string;
  data_mode?: "raw" | "effective";
}
export interface ResearchEntities {
  tickers: string[];
  accounts: string[];
  sources: string[];
  domains: string[];
}
export interface QueryPlan {
  version: "research-plan-v1";
  intent: ResearchIntent;
  question: string;
  entities: ResearchEntities;
  filters: ResearchFilters;
  aggregations: string[];
  joins: string[];
  grouping: string[];
  ordering: { field: string; direction: "asc" | "desc" }[];
  limit: number;
  assumptions: string[];
  visualization: "timeline" | "comparison" | null;
  clarification?: string;
  safetyRejection?: string;
}
export interface ResearchDraft {
  question: string;
  intent?: ResearchIntent;
  entities: Partial<ResearchEntities>;
  filters: ResearchFilters;
  assumptions: string[];
  followUp: boolean;
  clarification?: string;
  safetyRejection?: string;
  visualization?: QueryPlan["visualization"];
}
export interface SafeResearchOperation {
  rpc:
    | "execute_research_query"
    | "execute_ticker_metadata_research"
    | "execute_catalyst_research_query"
    | "execute_social_research_query"
    | "execute_cross_source_research_query";
  parameters: {
    p_intent: ResearchIntent;
    p_filters: ResearchFilters;
    p_limit: number;
  };
}
export interface ResearchCitation {
  type: string;
  id: string;
  label: string;
  route: string;
  source_table: string;
  observation_date?: string | null;
}
export interface ResearchEvidence {
  tablesConsulted: string[];
  supportingRecords: ResearchCitation[];
  observationDates: string[];
  appliedFilters: ResearchFilters;
  methodologyVersions: string[];
  limitations: string[];
  assumptions: string[];
  generatedAt: string;
}
export interface DatabaseResearchResult {
  intent: ResearchIntent;
  records: Record<string, unknown>[];
  record_count: number;
  tables: string[];
  methodology_versions: string[];
  limitations: string[];
  executed_at: string;
}
export interface ResearchAnswer {
  status: ResearchStatus;
  sessionId?: string;
  historyId?: string;
  plan: QueryPlan;
  summary: string;
  why: string;
  calculations: string[];
  assumptions: string[];
  limitations: string[];
  records: Record<string, unknown>[];
  evidence: ResearchEvidence | null;
  executionTimeMs: number;
}
export interface ResearchContext {
  previousPlan?: QueryPlan | null;
}
export interface ResearchExecutor {
  execute(operation: SafeResearchOperation): Promise<DatabaseResearchResult>;
}
