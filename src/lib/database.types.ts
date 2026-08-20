export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type ImportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed";
export type SentimentKind =
  | "very_bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "very_bearish";
export type ResearchStatus = "pending" | "researching" | "completed" | "failed";
export type EventType =
  | "news"
  | "earnings"
  | "sec_filing"
  | "offering"
  | "reverse_split"
  | "stock_split"
  | "fda"
  | "contract"
  | "merger"
  | "acquisition"
  | "social_spike"
  | "short_squeeze"
  | "analyst"
  | "other";
export type ImportBatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed";
export type ExtractionMethod =
  | "pdf_text"
  | "ocr"
  | "hybrid"
  | "manual"
  | "unknown";
export interface Ticker {
  id: string;
  symbol: string;
  company_name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  float_shares: number | null;
  shares_outstanding: number | null;
  country: string | null;
  website: string | null;
  security_type:
    | "common_stock"
    | "preferred_stock"
    | "ETF"
    | "ETN"
    | "warrant"
    | "unit"
    | "ADR"
    | "closed_end_fund"
    | "other"
    | null;
  primary_exchange: string | null;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
  currency: string | null;
  active: boolean | null;
  delisted: boolean | null;
  enrichment_source: string | null;
  enrichment_status:
    | "pending"
    | "queued"
    | "enriching"
    | "enriched"
    | "complete"
    | "partial"
    | "not_found"
    | "failed"
    | "stale"
    | "skipped";
  enriched_at: string | null;
  enrichment_error: string | null;
  metadata_updated_at: string | null;
  metadata_version: string | null;
  next_metadata_refresh_at: string | null;
  metadata_refresh_attempts: number;
  metadata_priority: number;
  metadata_last_requested_at: string | null;
  last_not_found_at: string | null;
  next_retry_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}
export interface TickerPopularity {
  ticker_id: string;
  search_count: number;
  ticker_page_views: number;
  ai_search_count: number;
  watchlist_additions: number;
  alert_count: number;
  pattern_match_count: number;
  last_requested_at: string | null;
  popularity_score: number;
  updated_at: string;
}
export interface TickerMetadataQueue {
  id: string;
  ticker_id: string;
  priority: number;
  reason: string;
  reasons: Json;
  required_fields: Json;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "deferred"
    | "failed"
    | "cancelled";
  provider: string | null;
  attempts: number;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  available_after: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
export interface MetadataProviderUsage {
  id: string;
  provider: string;
  usage_date: string;
  calls_attempted: number;
  calls_succeeded: number;
  calls_failed: number;
  calls_rate_limited: number;
  cache_hits: number;
  cache_misses: number;
  provider_calls_avoided: number;
  created_at: string;
  updated_at: string;
}
export interface MetadataProviderHealth {
  provider: string;
  status:
    | "healthy"
    | "degraded"
    | "rate_limited"
    | "unavailable"
    | "unconfigured";
  consecutive_failures: number;
  rate_limited_until: string | null;
  last_successful_call: string | null;
  last_error: string | null;
  last_error_at: string | null;
  updated_at: string;
}
export interface TickerEnrichmentRun {
  id: string;
  provider: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled";
  mode: "pending" | "all" | "failed" | "selected";
  provider_chain: string[];
  batch_size: number;
  max_attempts: number;
  total_tickers: number;
  processed_tickers: number;
  enriched_tickers: number;
  partial_tickers: number;
  not_found_tickers: number;
  failed_tickers: number;
  cursor_ordinal: number;
  last_symbol: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}
export interface TickerEnrichmentRunItem {
  id: string;
  enrichment_run_id: string;
  ticker_id: string;
  symbol: string;
  ordinal: number;
  status:
    | "pending"
    | "processing"
    | "enriched"
    | "partial"
    | "not_found"
    | "failed"
    | "skipped";
  attempt_count: number;
  provider: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}
export interface TickerEnrichmentError {
  id: string;
  enrichment_run_id: string;
  ticker_id: string | null;
  symbol: string;
  provider: string;
  error_type: string;
  error_message: string;
  retryable: boolean;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}
export interface TickerMetadataSource {
  id: string;
  ticker_id: string;
  field_name: string;
  provider: string;
  source_value: string | null;
  source_timestamp: string | null;
  confidence: number | null;
  created_at: string;
}
export interface TickerMetadataConflict {
  id: string;
  ticker_id: string;
  field_name: string;
  existing_value: string;
  incoming_value: string;
  provider: string;
  source_timestamp: string | null;
  status: "open" | "accepted_existing" | "accepted_incoming" | "dismissed";
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}
export interface TickerStatistics {
  ticker_id: string;
  total_appearances: number;
  most_active_count: number;
  biggest_gainer_count: number;
  biggest_decliner_count: number;
  first_appearance: string | null;
  last_appearance: string | null;
  highest_recorded_gain: number | null;
  largest_recorded_decline: number | null;
  average_change_percent: number | null;
  average_volume: number | null;
  updated_at: string;
}
export interface SourceReport {
  id: string;
  report_date: string | null;
  source_type: string | null;
  source_filename: string | null;
  original_path: string | null;
  import_status: ImportStatus;
  page_count: number | null;
  extracted_at: string | null;
  extraction_diagnostics: Json;
  created_at: string;
}
export interface ImportBatch {
  id: string;
  name: string;
  source_type: string;
  total_files: number;
  processed_files: number;
  successful_files: number;
  partial_files: number;
  failed_files: number;
  total_records: number;
  status: ImportBatchStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
export interface ImportPreviewJob {
  id: string;
  archive_name: string;
  archive_hash: string;
  total_files: number;
  files_processed: number;
  usable_reports: number;
  extracted_rows: number;
  warning_count: number;
  error_count: number;
  current_filename: string | null;
  status:
    | "uploading"
    | "queued"
    | "processing"
    | "finalizing"
    | "completed"
    | "committing"
    | "failed"
    | "cancelled"
    | "confirmed";
  failure_message: string | null;
  preview_id: string | null;
  import_batch_id: string | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  confirmed_at: string | null;
  expires_at: string;
  created_at: string;
  finalization_status: "pending" | "running" | "paused" | "completed";
  reports_finalized: number;
  rows_finalized: number;
  finalization_cursor: number;
  finalization_started_at: string | null;
  finalization_updated_at: string | null;
  finalization_completed_at: string | null;
  commit_status: "pending" | "running" | "paused" | "completed";
  commit_stage:
    | "pending"
    | "reports"
    | "issues"
    | "appearances"
    | "derived"
    | "completed";
  reports_committed: number;
  rows_committed: number;
  issues_committed: number;
  commit_started_at: string | null;
  commit_updated_at: string | null;
  commit_completed_at: string | null;
}
export interface ImportPreviewJobFile {
  id: string;
  job_id: string;
  ordinal: number;
  filename: string;
  file_hash: string;
  metadata_date: string | null;
  storage_path: string | null;
  status:
    | "uploading"
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "duplicate"
    | "cancelled";
  report_payload: Json | null;
  row_count: number;
  warning_count: number;
  error_count: number;
  error_message: string | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
}
export interface ExtractionIssue {
  id: string;
  report_id: string;
  page_number: number | null;
  issue_type: string;
  field_name: string | null;
  raw_value: string | null;
  message: string;
  severity: "warning" | "error";
  created_at: string;
}
export interface MarketCategory {
  id: string;
  name: string;
  exchange: string | null;
  category_type: "most_active" | "biggest_gainer" | "biggest_decliner";
  display_order: number;
  created_at: string;
}
export interface MarketMoverAppearance {
  id: string;
  ticker_id: string;
  report_id: string;
  category_id: string;
  report_date: string;
  rank: number | null;
  price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  trades: number | null;
  volume: number | null;
  dollar_volume: number | null;
  created_at: string;
}
export interface MarketDataQualityAuditRun {
  id: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled";
  rule_version: string;
  total_rows: number;
  processed_rows: number;
  findings_created: number;
  proposals_created: number;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  failure_message: string | null;
  cursor: number;
  created_at: string;
}
export interface MarketDataQualityFinding {
  id: string;
  appearance_id: string;
  ticker_id: string;
  report_id: string;
  category_id: string;
  audit_run_id: string | null;
  field_name: string;
  finding_type: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  original_value: string | null;
  numeric_original_value: number | null;
  detected_at: string;
  rule_id: string;
  rule_version: string;
  confidence_score: number;
  evidence: Json;
  status:
    | "open"
    | "proposed"
    | "approved"
    | "rejected"
    | "auto_resolved"
    | "ignored"
    | "superseded";
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface MarketDataCorrectionProposal {
  id: string;
  finding_id: string;
  appearance_id: string;
  field_name: string;
  original_value: string | null;
  proposed_value: string | null;
  proposed_numeric_value: number | null;
  proposal_method: string;
  confidence_score: number;
  reason: string;
  evidence: Json;
  status: "pending" | "approved" | "rejected" | "auto_approved" | "superseded";
  is_current: boolean;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  review_tier: "A" | "B" | "C" | "D";
  review_classifier_version: string;
  review_tier_reason: string;
  review_batch_eligible: boolean;
  review_classified_at: string;
}
export interface SocialSource {
  id: string;
  name: string;
  platform_type: string;
  base_url: string | null;
  ingestion_enabled: boolean;
  adapter_key: string | null;
  historical_backfill_supported: boolean;
  last_successful_sync_at: string | null;
  last_attempted_sync_at: string | null;
  provider_status:"healthy"|"degraded"|"rate_limited"|"unavailable"|"unconfigured"|"authorization_required";
  provider_status_reason:string|null;
  last_rate_limit_used:number|null;
  last_rate_limit_remaining:number|null;
  last_rate_limit_reset_seconds:number|null;
  last_rate_limit_observed_at:string|null;
  last_error:string|null;
  created_at: string;
  updated_at: string;
}
export interface SocialAccount {
  id: string;
  source_id: string;
  username: string;
  display_name: string | null;
  profile_url: string | null;
  followers: number | null;
  external_account_id: string | null;
  account_metadata: Json | null;
  is_deleted: boolean;
  is_suspended: boolean;
  account_status:"active"|"deleted"|"suspended"|"unavailable"|"unknown";
  account_created_at:string|null;
  last_verified_at:string|null;
  provider_metadata:Json;
  is_promoter_candidate: boolean;
  promoter_status: "unreviewed" | "candidate" | "tracked" | "dismissed";
  promoter_status_reason: string | null;
  first_promoter_flagged_at: string | null;
  last_promoter_reviewed_at: string | null;
  promoter_notes: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SocialResearchQueue{id:string;ticker_id:string;appearance_id:string|null;source_id:string;community:string|null;date_from:string;date_to:string;priority:number;reason:string;status:"pending"|"processing"|"completed"|"partial"|"rate_limited"|"not_available"|"deferred"|"failed"|"cancelled"|"approval_blocked";cursor_state:Json|null;attempts:number;available_after:string|null;posts_found:number;comments_found:number;accounts_found:number;coverage_status:string|null;last_error:string|null;started_at:string|null;updated_at:string;completed_at:string|null;created_at:string}
export interface TickerSocialCoverage{id:string;ticker_id:string;source_id:string;community:string|null;date_from:string;date_to:string;last_researched_at:string|null;posts_found:number;comments_found:number;accounts_found:number;coverage_status:"complete_for_provider_window"|"partial"|"provider_limited"|"rate_limited"|"not_available"|"not_researched"|"failed";provider_cursor_exhausted:boolean|null;limitations:Json;query_evidence:Json;created_at:string;updated_at:string}
export interface SocialProviderUsage{provider:string;usage_date:string;requests_reserved:number;requests_succeeded:number;requests_failed:number;requests_rate_limited:number;cache_hits:number;cache_misses:number;updated_at:string}
export interface SocialMoverRelationship{id:string;post_id:string;account_id:string|null;ticker_id:string;mover_appearance_id:string;mention_at:string;mover_date:string;minutes_before_move:number|null;hours_before_move:number|null;days_before_move:number|null;temporal_bucket:string;relationship_type:string;confidence:number;method_version:string;created_at:string}
export interface SocialCatalystRelationship{id:string;ticker_id:string;post_id:string;event_id:string;post_at:string;event_at:string;time_difference_minutes:number|null;time_difference_hours:number|null;time_difference_days:number|null;relationship_type:string;confidence:number;method_version:string;created_at:string}
export interface SocialAttentionWindow{ticker_id:string;observation_at:string;window_days:1|3|7|14|30;mention_count:number;comment_count:number;unique_accounts:number;unique_communities:number;engagement_total:number|null;baseline_median:number|null;attention_ratio:number|null;robust_z_score:number|null;baseline_status:"available"|"insufficient_history";unusual_attention_score:number|null;scoring_version:string;calculated_at:string}
export interface ResearchQueue {
  id: string;
  ticker_id: string;
  priority: number;
  research_status: ResearchStatus;
  reason: string | null;
  first_queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}
export interface PriceHistory {
  id: string;
  ticker_id: string;
  date: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number;
  adjusted_close: number | null;
  volume: number;
  trades: number | null;
  vwap: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}
export interface PriceImportRun {
  id: string;
  source: string;
  ticker_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  records_discovered: number;
  records_inserted: number;
  records_updated: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}
export interface PriceImportError {
  id: string;
  import_run_id: string;
  ticker_id: string | null;
  date: string | null;
  error_type: string;
  error_message: string;
  raw_record: Json | null;
  created_at: string;
}
export interface PriceDailyMetric {
  price_history_id: string;
  ticker_id: string;
  date: string;
  daily_return: number | null;
  return_3d: number | null;
  return_5d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
  average_volume_5d: number | null;
  average_volume_20d: number | null;
  average_volume_60d: number | null;
  relative_volume_5d: number | null;
  relative_volume_20d: number | null;
  relative_volume_60d: number | null;
  volume_change_percent: number | null;
  volume_acceleration: number | null;
  volatility_5d: number | null;
  volatility_20d: number | null;
  volatility_60d: number | null;
  volatility_expansion: number | null;
  calculated_at: string;
}
export interface SocialMarketOutcome {
  id: string;
  post_id: string;
  ticker_id: string;
  account_id: string | null;
  mention_timestamp: string;
  reference_date: string | null;
  price_at_mention: number | null;
  return_1d: number | null;
  return_3d: number | null;
  return_7d: number | null;
  return_14d: number | null;
  return_30d: number | null;
  max_return_after_mention: number | null;
  max_return_date: string | null;
  min_return_after_mention: number | null;
  min_return_date: string | null;
  volume_change_1d: number | null;
  volume_change_7d: number | null;
  created_at: string;
}
export interface ResearchPattern {
  id: string;
  category_id: string;
  code: string;
  name: string;
  description: string;
  pattern_type: string;
  methodology_version: string;
  feature_version: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export interface PatternObservation {
  id: string;
  pattern_id: string;
  ticker_id: string;
  observation_date: string;
  start_timestamp: string;
  end_timestamp: string;
  confidence_score: number | null;
  matched_conditions: Json;
  methodology_version: string;
  feature_version: string;
  created_at: string;
}
export interface PatternSimilarityMatch {
  id: string;
  ticker_id: string;
  source_feature_id: string;
  source_date: string;
  reference_observation_id: string;
  similarity_score: number;
  matched_features: Json;
  methodology_version: string;
  feature_version: string;
  created_at: string;
}
export type WatchlistEntityType = "ticker" | "account" | "pattern";
export type WatchlistType = "personal" | "research" | "team" | "system";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertEventStatus = "new" | "reviewed" | "dismissed" | "archived";
export interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  watchlist_type: WatchlistType;
  created_at: string;
  updated_at: string;
}
export interface WatchlistEntity {
  id: string;
  watchlist_id: string;
  entity_type: WatchlistEntityType;
  ticker_id: string | null;
  account_id: string | null;
  pattern_id: string | null;
  created_at: string;
}
export interface WatchlistTag {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}
export interface WatchlistEntityTag {
  id: string;
  watchlist_entity_id: string;
  tag_id: string;
}
export interface WatchlistNote {
  id: string;
  watchlist_id: string;
  entity_id: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  watchlist_id: string | null;
  entity_type: WatchlistEntityType;
  ticker_id: string | null;
  account_id: string | null;
  pattern_id: string | null;
  condition_type: string;
  condition_configuration: Json;
  severity: AlertSeverity;
  created_at: string;
  updated_at: string;
}
export interface AlertEvent {
  id: string;
  alert_rule_id: string;
  ticker_id: string | null;
  account_id: string | null;
  pattern_id: string | null;
  triggered_at: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  evidence: Json;
  status: AlertEventStatus;
  created_at: string;
}
export interface AlertRun {
  id: string;
  run_type: "batch" | "incremental" | "retry" | "manual";
  status: "running" | "completed" | "partial" | "failed";
  rules_checked: number;
  alerts_created: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}
export interface AlertDeduplication {
  id: string;
  alert_rule_id: string;
  entity_key: string;
  reference_timestamp: string;
  hash: string;
  created_at: string;
}
export interface NotificationPreference {
  id: string;
  user_id: string | null;
  email_enabled: boolean;
  in_app_enabled: boolean;
  created_at: string;
  updated_at: string;
}
export interface NotificationHistory {
  id: string;
  alert_event_id: string;
  channel: "in_app" | "email";
  status: "pending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}
export interface AlertBacktest {
  id: string;
  alert_rule_id: string;
  start_date: string;
  end_date: string;
  alerts_found: number;
  created_at: string;
}
export interface AlertBacktestEvent {
  id: string;
  backtest_id: string;
  ticker_id: string | null;
  account_id: string | null;
  pattern_id: string | null;
  event_date: string;
  evidence: Json;
  created_at: string;
}
export interface ResearchWorkspace {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "follow_up" | "complete" | "archived";
  created_at: string;
  updated_at: string;
}
export interface SavedSearch {
  id: string;
  workspace_id: string | null;
  name: string;
  natural_language_query: string;
  structured_query: Json;
  created_at: string;
  updated_at: string;
}
export interface ResearchWorkspaceItem {
  id: string;
  workspace_id: string;
  item_type:
    | "pinned_ticker"
    | "saved_comparison"
    | "saved_prompt"
    | "saved_filter"
    | "saved_event"
    | "saved_filing"
    | "saved_catalyst_comparison"
    | "saved_timeline"
    | "ticker"
    | "mover"
    | "catalyst"
    | "social_post"
    | "account"
    | "research_prompt"
    | "comparison"
    | "note";
  name: string;
  ticker_id: string | null;
  appearance_id: string | null;
  event_id: string | null;
  social_post_id: string | null;
  account_id: string | null;
  content: Json;
  created_at: string;
  updated_at: string;
}
export interface SavedResearchView {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  source_page: "market_movers" | "cross_source_analytics" | "ai_search" | "research_today" | "ticker_history";
  route: string;
  filters: Json;
  data_mode: "raw" | "effective";
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface ResearchQuestion {
  id: string;
  workspace_id: string;
  question: string;
  status: "open" | "answered" | "deferred";
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface ResearchChecklistItem {
  id: string;
  workspace_id: string;
  item_key: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface ResearchBriefSnapshot {
  id: string;
  workspace_id: string;
  brief_type: "ticker" | "mover";
  ticker_id: string;
  appearance_id: string | null;
  data_mode: "raw" | "effective";
  research_brief_version: string;
  title: string;
  provenance: Json;
  coverage: Json;
  generated_at: string;
  created_at: string;
}
export interface ResearchNote {
  id:string;workspace_id:string|null;subject_type:"ticker"|"mover"|"catalyst"|"research_workspace";
  ticker_id:string|null;appearance_id:string|null;event_id:string|null;note:string;created_by:string;created_at:string;updated_at:string;
}
export interface ResearchTag {
  id:string;workspace_id:string|null;subject_type:"ticker"|"mover"|"catalyst"|"research_workspace";
  ticker_id:string|null;appearance_id:string|null;event_id:string|null;tag:string;created_by:string;created_at:string;
}
export interface ResearchSession {
  id: string;
  workspace_id: string | null;
  title: string;
  context: Json;
  created_at: string;
  updated_at: string;
}
export interface ResearchMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  structured_query: Json | null;
  evidence: Json | null;
  created_at: string;
}
export interface ResearchHistory {
  id: string;
  workspace_id: string | null;
  session_id: string | null;
  prompt: string;
  execution_time_ms: number;
  structured_query: Json;
  returned_record_count: number;
  response_summary: string;
  evidence: Json;
  status: "completed" | "clarification" | "rejected" | "failed";
  created_at: string;
}
export interface ResearchSearchDocument {
  domain:
    | "ticker"
    | "social_post"
    | "account"
    | "community"
    | "market_mover"
    | "pattern"
    | "alert"
    | "watchlist"
    | "event"
    | "filing";
  record_id: string;
  title: string;
  content: string;
  route: string;
  ticker_id: string | null;
  account_id: string | null;
  observation_date: string | null;
  source_table: string;
  methodology_version: string | null;
  evidence: Json;
  updated_at: string;
}
export interface EventSource {
  id: string;
  name: string;
  source_type:
    | "sec"
    | "company_ir"
    | "government"
    | "news_api"
    | "rss"
    | "manual"
    | "other";
  base_url: string | null;
  authority_level: "primary" | "secondary" | "aggregator";
  enabled: boolean;
  priority: number;
  requires_api_key: boolean;
  configuration: Json;
  created_at: string;
  updated_at: string;
}
export interface CatalystDefinition {
  id: string;
  event_type: string;
  event_subtype: string | null;
  display_name: string;
  description: string;
  classification_version: string;
  created_at: string;
  updated_at: string;
}
export interface TickerEvent {
  id: string;
  ticker_id: string;
  event_date: string;
  event_type: EventType;
  headline: string | null;
  description: string | null;
  source_url: string | null;
  source_id: string | null;
  external_event_id: string | null;
  event_subtype: string | null;
  published_at: string | null;
  effective_at: string | null;
  source_name: string | null;
  source_type: string | null;
  source_document_url: string | null;
  source_document_type: string | null;
  sec_accession_number: string | null;
  sec_form_type: string | null;
  sec_cik: string | null;
  event_status:
    | "observed"
    | "normalized"
    | "linked"
    | "unresolved"
    | "duplicate"
    | "excluded"
    | "failed";
  event_confidence: number | null;
  ingestion_method: string | null;
  raw_title: string | null;
  raw_summary: string | null;
  normalized_headline: string | null;
  normalized_description: string | null;
  is_primary_source: boolean;
  market_session:
    | "pre_market"
    | "regular_session"
    | "after_hours"
    | "unknown"
    | null;
  classification_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
}
export interface SecFiling {
  id: string;
  event_id: string | null;
  ticker_id: string | null;
  cik: string;
  accession_number: string;
  form_type: string;
  filing_date: string;
  report_date: string | null;
  accepted_at: string | null;
  primary_document: string | null;
  filing_url: string;
  primary_document_url: string | null;
  items: string[] | null;
  description: string | null;
  is_amendment: boolean;
  raw_metadata: Json;
  created_at: string;
  updated_at: string;
}
export interface EventClassificationEvidence {
  id: string;
  event_id: string;
  classifier_id: string;
  classification_version: string;
  candidate_type: string;
  candidate_subtype: string | null;
  confidence: number;
  reason: string;
  evidence: Json;
  created_at: string;
}
export interface CatalystResearchQueue {
  id: string;
  ticker_id: string;
  appearance_id: string | null;
  priority: number;
  reason:
    | "ticker_page"
    | "market_mover"
    | "ai_search"
    | "watchlist"
    | "manual"
    | "historical_backfill"
    | "research_workspace"
    | "pattern_match"
    | "retry";
  status:
    | "pending"
    | "processing"
    | "completed"
    | "partial"
    | "deferred"
    | "failed"
    | "cancelled";
  date_from: string;
  date_to: string;
  required_sources: Json;
  source_scope_key: string;
  attempts: number;
  available_after: string | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface TickerCatalystCoverage {
  id: string;
  ticker_id: string;
  date_from: string;
  date_to: string;
  source_scope_key: string;
  sources_checked: Json;
  last_researched_at: string | null;
  sec_checked: boolean;
  news_checked: boolean;
  company_ir_checked: boolean;
  events_found: number;
  coverage_status:
    | "complete_for_configured_sources"
    | "partial"
    | "not_researched"
    | "failed";
  limitations: Json;
  created_at: string;
  updated_at: string;
}
export interface EventMoverRelationship {
  id: string;
  event_id: string;
  appearance_id: string;
  ticker_id: string;
  relationship_type:
    | "preceded_move"
    | "same_day"
    | "followed_move"
    | "near_move"
    | "historical_context";
  event_at: string | null;
  mover_date: string;
  minutes_before_move: number | null;
  hours_before_move: number | null;
  days_before_move: number | null;
  temporal_bucket:
    | "same_session"
    | "pre_market_same_day"
    | "after_hours_previous_day"
    | "within_24h_before"
    | "1_to_3_days_before"
    | "4_to_7_days_before"
    | "8_to_30_days_before"
    | "after_move"
    | "unknown";
  confidence: number;
  catalyst_relevance: number;
  reason: string;
  score_evidence: Json;
  created_at: string;
}
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type GenericTable = Table<Record<string, unknown>>;
type GenericView = { Row: Record<string, unknown>; Relationships: [] };
export interface Database {
  public: {
    Tables: {
      tickers: Table<Ticker>;
      ticker_statistics: Table<TickerStatistics>;
      ticker_enrichment_runs: Table<TickerEnrichmentRun>;
      ticker_enrichment_run_items: Table<TickerEnrichmentRunItem>;
      ticker_enrichment_errors: Table<TickerEnrichmentError>;
      ticker_metadata_sources: Table<TickerMetadataSource>;
      ticker_metadata_conflicts: Table<TickerMetadataConflict>;
      ticker_popularity: Table<TickerPopularity>;
      ticker_metadata_queue: Table<TickerMetadataQueue>;
      metadata_provider_usage: Table<MetadataProviderUsage>;
      metadata_provider_health: Table<MetadataProviderHealth>;
      source_reports: Table<SourceReport>;
      market_categories: Table<MarketCategory>;
      market_mover_appearances: Table<MarketMoverAppearance>;
      market_data_quality_audit_runs: Table<MarketDataQualityAuditRun>;
      market_data_quality_audit_items: GenericTable;
      market_data_quality_findings: Table<MarketDataQualityFinding>;
      market_data_correction_proposals: Table<MarketDataCorrectionProposal>;
      market_data_repair_log: GenericTable;
      market_data_effective_values: GenericTable;
      market_data_recompute_queue: GenericTable;
      social_sources: Table<SocialSource>;
      social_accounts: Table<SocialAccount>;
      research_queue: Table<ResearchQueue>;
      import_batches: Table<ImportBatch>;
      report_extraction_issues: Table<ExtractionIssue>;
      import_preview_jobs: Table<ImportPreviewJob>;
      import_preview_job_files: Table<ImportPreviewJobFile>;
      social_posts: GenericTable;
      social_research_queue:Table<SocialResearchQueue>;
      ticker_social_coverage:Table<TickerSocialCoverage>;
      social_provider_cache:GenericTable;
      social_provider_daily_usage:Table<SocialProviderUsage>;
      social_provider_runs:GenericTable;
      social_provider_failures:GenericTable;
      social_post_research_tags:GenericTable;
      social_mover_relationships:Table<SocialMoverRelationship>;
      social_catalyst_relationships:Table<SocialCatalystRelationship>;
      social_attention_windows:Table<SocialAttentionWindow>;
      social_content_compliance_log:GenericTable;
      post_tickers: GenericTable;
      sentiment_observations: GenericTable;
      promotion_events: GenericTable;
      promoter_statistics: GenericTable;
      ticker_events: Table<TickerEvent>;
      event_sources: Table<EventSource>;
      catalyst_definitions: Table<CatalystDefinition>;
      sec_filings: Table<SecFiling>;
      event_classification_evidence: Table<EventClassificationEvidence>;
      event_clusters: GenericTable;
      event_cluster_members: GenericTable;
      event_cluster_candidates: GenericTable;
      event_cluster_reviews: GenericTable;
      catalyst_research_queue: Table<CatalystResearchQueue>;
      event_source_cache: GenericTable;
      cik_resolution_cache: GenericTable;
      catalyst_provider_failures: GenericTable;
      catalyst_provider_runs: GenericTable;
      filing_document_evidence: GenericTable;
      event_normalization_history: GenericTable;
      manual_event_audit: GenericTable;
      ticker_catalyst_coverage: Table<TickerCatalystCoverage>;
      event_mover_relationships: Table<EventMoverRelationship>;
      watchlists: Table<Watchlist>;
      watchlist_tickers: GenericTable;
      watchlist_entities: Table<WatchlistEntity>;
      watchlist_tags: Table<WatchlistTag>;
      watchlist_entity_tags: Table<WatchlistEntityTag>;
      watchlist_notes: Table<WatchlistNote>;
      alert_rules: Table<AlertRule>;
      alert_events: Table<AlertEvent>;
      alert_runs: Table<AlertRun>;
      alert_deduplication: Table<AlertDeduplication>;
      notification_preferences: Table<NotificationPreference>;
      notification_history: Table<NotificationHistory>;
      alert_backtests: Table<AlertBacktest>;
      alert_backtest_events: Table<AlertBacktestEvent>;
      import_previews: GenericTable;
      analytics_methodologies: GenericTable;
      analytics_settings: GenericTable;
      research_reason_types: GenericTable;
      ticker_research_reasons: GenericTable;
      social_communities: GenericTable;
      social_import_runs: GenericTable;
      social_raw_records: GenericTable;
      social_import_errors: GenericTable;
      unresolved_ticker_mentions: GenericTable;
      account_mover_observations: GenericTable;
      account_ticker_statistics: GenericTable;
      promoter_notes: GenericTable;
      promoter_candidate_settings: GenericTable;
      scoring_methodologies: GenericTable;
      ticker_sentiment_statistics: GenericTable;
      ticker_attention_observations: GenericTable;
      attention_score_components: GenericTable;
      promotion_score_components: GenericTable;
      hype_risk_components: GenericTable;
      analytics_runs: GenericTable;
      price_history: Table<PriceHistory>;
      price_import_runs: Table<PriceImportRun>;
      price_import_errors: Table<PriceImportError>;
      price_daily_metrics: Table<PriceDailyMetric>;
      ticker_price_events: GenericTable;
      social_market_outcomes: Table<SocialMarketOutcome>;
      account_market_statistics: GenericTable;
      ticker_social_outcomes: GenericTable;
      pattern_categories: GenericTable;
      research_patterns: Table<ResearchPattern>;
      pattern_conditions: GenericTable;
      ticker_research_features: GenericTable;
      pattern_observations: Table<PatternObservation>;
      pattern_outcomes: GenericTable;
      pattern_statistics: GenericTable;
      pattern_similarity_matches: Table<PatternSimilarityMatch>;
      research_workspaces: Table<ResearchWorkspace>;
      saved_searches: Table<SavedSearch>;
      research_workspace_items: Table<ResearchWorkspaceItem>;
      saved_research_views: Table<SavedResearchView>;
      research_questions: Table<ResearchQuestion>;
      research_checklist_items: Table<ResearchChecklistItem>;
      research_brief_snapshots: Table<ResearchBriefSnapshot>;
      research_notes: Table<ResearchNote>;
      research_tags: Table<ResearchTag>;
      research_sessions: Table<ResearchSession>;
      research_messages: Table<ResearchMessage>;
      research_history: Table<ResearchHistory>;
      research_search_documents: Table<ResearchSearchDocument>;
    };
    Views: {
      recent_reports_with_counts: {
        Row: SourceReport & { ticker_records: number };
        Relationships: [];
      };
      ticker_category_frequency: GenericView;
      import_data_quality: GenericView;
      ticker_recurrence_summary: GenericView;
      ticker_category_transitions: GenericView;
      ticker_transition_summary: GenericView;
      transition_statistics: GenericView;
      ticker_category_type_summary: GenericView;
      category_statistics: GenericView;
      extreme_move_summary: GenericView;
      ticker_mover_cycles: GenericView;
      research_priority_summary: GenericView;
      research_priority_detail: GenericView;
      research_queue_analytics: GenericView;
      historical_analytics_coverage: GenericView;
      social_ticker_statistics: GenericView;
      social_account_statistics: GenericView;
      social_mention_mover_proximity: GenericView;
      social_source_coverage: GenericView;
      social_mover_relationship_detail:GenericView;
      social_catalyst_relationship_detail:GenericView;
      social_analytics_summary:GenericView;
      social_pre_move_analytics_universe:GenericView;
      social_pre_move_sentiment_distribution:GenericView;
      social_pre_move_community_distribution:GenericView;
      social_pre_move_attention_distribution:GenericView;
      social_catalyst_analytics:GenericView;
      social_mover_context:GenericView;
      repeat_account_ticker_relationships:GenericView;
      social_provider_analytics:GenericView;
      social_research_management:GenericView;
      social_combined_timeline:GenericView;
      social_compliance_due:GenericView;
      sentiment_observation_detail: GenericView;
      source_sentiment_statistics: GenericView;
      community_sentiment_statistics: GenericView;
      account_sentiment_statistics: GenericView;
      account_ticker_sentiment_statistics: GenericView;
      ticker_sentiment_period_comparison: GenericView;
      attention_observation_detail: GenericView;
      promotion_event_detail: GenericView;
      price_history_canonical: { Row: PriceHistory; Relationships: [] };
      price_history_detail: GenericView;
      social_market_outcome_detail: GenericView;
      market_mover_price_outcomes: GenericView;
      pattern_library_detail: GenericView;
      pattern_observation_detail: GenericView;
      pattern_observation_metadata_detail: GenericView;
      pattern_similarity_detail: GenericView;
      ticker_metadata_coverage: GenericView;
      ticker_metadata_conflict_review: GenericView;
      metadata_intelligence_dashboard: GenericView;
      market_data_appearance_quality: GenericView;
      market_mover_appearances_effective: GenericView;
      market_data_source_evidence: GenericView;
      market_data_ticker_quality_summary: GenericView;
      market_data_report_quality_summary: GenericView;
      market_data_quality_dashboard: GenericView;
      market_data_repair_review: GenericView;
      market_data_repair_review_summary: GenericView;
      market_data_approved_repairs: GenericView;
      event_intelligence: GenericView;
      mover_catalyst_status: GenericView;
      market_mover_intelligence: GenericView;
      catalyst_analytics_summary: GenericView;
      catalyst_type_performance: GenericView;
      catalyst_timing_distribution: GenericView;
      catalyst_exchange_distribution: GenericView;
      catalyst_mover_category_distribution: GenericView;
      catalyst_before_move_analysis: GenericView;
      catalyst_before_move_detail: GenericView;
      catalyst_analytics_universe: GenericView;
      catalyst_combinations: GenericView;
      catalyst_combination_detail: GenericView;
      ticker_repeat_catalyst_behavior: GenericView;
      sec_form_analytics: GenericView;
      event_source_analytics: GenericView;
      sec_ingestion_coverage: GenericView;
      catalyst_monthly_distribution: GenericView;
      catalyst_yearly_distribution: GenericView;
      catalyst_research_management: GenericView;
      ticker_research_profile: GenericView;
      research_priority_candidates: GenericView;
      research_coverage_backlog: GenericView;
      workspace_activity_summary: GenericView;
      research_quality_field_counts: GenericView;
      research_repair_method_counts: GenericView;
      ticker_intelligence_summary: GenericView;
      mover_intelligence_summary: GenericView;
      event_intelligence_summary: GenericView;
      cross_source_analytics_summary: GenericView;
      catalyst_alert_candidate_events: GenericView;
      alert_candidate_events: GenericView;
      watchlist_summary: GenericView;
      watchlist_entity_detail: GenericView;
      watchlist_current_intelligence: GenericView;
      alert_rule_detail: GenericView;
      alert_event_detail: GenericView;
      alert_backtest_detail: GenericView;
    };
    Functions: {
      rebuild_ticker_statistics: {
        Args: Record<never, never>;
        Returns: number;
      };
      rebuild_research_queue: { Args: Record<never, never>; Returns: number };
      catalyst_priority_base: { Args: { p_reason: string }; Returns: number };
      queue_catalyst_research: {
        Args: {
          p_ticker_id: string;
          p_appearance_id?: string | null;
          p_reason?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_required_sources?: Json;
        };
        Returns: string;
      };
      claim_catalyst_research_queue: {
        Args: { p_limit?: number; p_queue_id?: string | null };
        Returns: CatalystResearchQueue[];
      };
      finish_catalyst_research_queue: {
        Args: {
          p_queue_id: string;
          p_status: string;
          p_error?: string | null;
          p_available_after?: string | null;
        };
        Returns: Json;
      };
      start_market_data_quality_audit: {
        Args: { p_rule_version?: string; p_appearance_ids?: string[] | null };
        Returns: string;
      };
      claim_market_data_quality_audit_items: {
        Args: { p_run_id: string; p_limit?: number };
        Returns: Record<string, unknown>[];
      };
      refresh_market_data_quality_audit_run: {
        Args: { p_run_id: string };
        Returns: Json;
      };
      record_market_data_quality_batch: {
        Args: { p_run_id: string; p_results: Json };
        Returns: Json;
      };
      approve_market_data_proposal: {
        Args: {
          p_proposal_id: string;
          p_reviewed_by: string;
          p_reason: string;
        };
        Returns: Json;
      };
      reject_market_data_proposal: {
        Args: {
          p_proposal_id: string;
          p_reviewed_by: string;
          p_reason: string;
        };
        Returns: Json;
      };
      review_market_data_proposal_batch: {
        Args: {
          p_action: string;
          p_items: Json;
          p_reviewed_by: string;
          p_reason: string;
          p_rejection_reason?: string | null;
        };
        Returns: Json;
      };
      review_market_data_proposal_group: {
        Args: {
          p_action: string;
          p_items: Json;
          p_reviewed_by: string;
          p_reason: string;
          p_rejection_reason?: string | null;
        };
        Returns: Json;
      };
      ignore_market_data_finding: {
        Args: { p_finding_id: string; p_reviewed_by: string; p_reason: string };
        Returns: Json;
      };
      edit_market_data_proposal: {
        Args: {
          p_proposal_id: string;
          p_value: string | null;
          p_numeric_value: number | null;
          p_reviewed_by: string;
          p_reason: string;
        };
        Returns: string;
      };
      revert_market_data_repair: {
        Args: {
          p_appearance_id: string;
          p_field_name: string;
          p_reverted_by: string;
          p_reason: string;
        };
        Returns: Json;
      };
      commit_import_preview: {
        Args: { preview_uuid: string };
        Returns: string;
      };
      claim_import_preview_job_files: {
        Args: { p_job_id: string; p_limit?: number };
        Returns: ImportPreviewJobFile[];
      };
      refresh_import_preview_job: { Args: { p_job_id: string }; Returns: Json };
      normalize_import_count: {
        Args: { p_value: string; p_raw_value?: string | null };
        Returns: number | null;
      };
      begin_import_preview_finalization: {
        Args: { p_job_id: string };
        Returns: Json;
      };
      finalize_import_preview_job_batch: {
        Args: { p_job_id: string; p_limit?: number };
        Returns: Json;
      };
      finalize_import_preview_job: {
        Args: { p_job_id: string };
        Returns: string | null;
      };
      begin_import_preview_commit: {
        Args: { p_job_id: string };
        Returns: Json;
      };
      commit_import_preview_job_batch: {
        Args: {
          p_job_id: string;
          p_report_limit?: number;
          p_row_limit?: number;
          p_issue_limit?: number;
        };
        Returns: Json;
      };
      commit_import_preview_job: {
        Args: { p_job_id: string };
        Returns: string;
      };
      refresh_historical_analytics: {
        Args: Record<never, never>;
        Returns: Json;
      };
      get_ticker_transitions: {
        Args: { max_days?: number };
        Returns: Record<string, unknown>[];
      };
      get_pre_move_history: {
        Args: { extreme_appearance_id: string; days_before?: number };
        Returns: Record<string, unknown>[];
      };
      get_post_move_history: {
        Args: { extreme_appearance_id: string; days_after?: number };
        Returns: Record<string, unknown>[];
      };
      rebuild_cp6_analytics: {
        Args: {
          p_ticker_id?: string | null;
          p_source_id?: string | null;
          p_start_at?: string | null;
          p_end_at?: string | null;
        };
        Returns: Json;
      };
      rebuild_price_daily_metrics: {
        Args: { p_ticker_id?: string | null };
        Returns: number;
      };
      rebuild_market_outcomes: {
        Args: { p_ticker_id?: string | null };
        Returns: Json;
      };
      rebuild_cp7_analytics: {
        Args: { p_ticker_id?: string | null };
        Returns: Json;
      };
      rebuild_research_features: {
        Args: {
          p_ticker_id?: string | null;
          p_start_date?: string | null;
          p_end_date?: string | null;
        };
        Returns: number;
      };
      rebuild_pattern_observations: {
        Args: {
          p_ticker_id?: string | null;
          p_start_date?: string | null;
          p_end_date?: string | null;
        };
        Returns: number;
      };
      rebuild_pattern_outcomes: {
        Args: { p_ticker_id?: string | null };
        Returns: number;
      };
      rebuild_pattern_statistics: {
        Args: Record<never, never>;
        Returns: number;
      };
      rebuild_pattern_similarities: {
        Args: { p_ticker_id?: string | null };
        Returns: number;
      };
      rebuild_cp8_patterns: {
        Args: {
          p_ticker_id?: string | null;
          p_start_date?: string | null;
          p_end_date?: string | null;
        };
        Returns: Json;
      };
      find_similar_situations: {
        Args: { p_ticker_id: string; p_date: string; p_limit?: number };
        Returns: Record<string, unknown>[];
      };
      find_similar_historical_movers: {
        Args: { p_appearance_id: string; p_limit?: number };
        Returns: Record<string, unknown>[];
      };
      get_research_experience_breakdown: {
        Args: { p_dimension: string; p_limit?: number };
        Returns: Record<string, unknown>[];
      };
      alert_condition_met: {
        Args: { p_condition: string; p_value: number; p_configuration: Json };
        Returns: boolean;
      };
      alert_reference_bucket: {
        Args: { p_configuration: Json; p_timestamp: string };
        Returns: string;
      };
      evaluate_alert_rules: {
        Args: {
          p_since?: string | null;
          p_rule_id?: string | null;
          p_run_type?: "batch" | "incremental" | "retry" | "manual";
          p_limit?: number;
        };
        Returns: Json;
      };
      run_alert_backtest: {
        Args: { p_rule_id: string; p_start_date: string; p_end_date: string };
        Returns: string;
      };
      rebuild_research_search_documents: {
        Args: Record<never, never>;
        Returns: Json;
      };
      refresh_ticker_research_documents: {
        Args: { p_ticker_ids?: string[] | null };
        Returns: number;
      };
      execute_ticker_metadata_research: {
        Args: { p_filters?: Json; p_limit?: number };
        Returns: Json;
      };
      start_ticker_enrichment_run: {
        Args: {
          p_provider: string;
          p_mode?: string;
          p_ticker_ids?: string[] | null;
          p_provider_chain?: string[] | null;
          p_batch_size?: number;
          p_max_attempts?: number;
        };
        Returns: string;
      };
      claim_ticker_enrichment_items: {
        Args: { p_run_id: string; p_limit?: number };
        Returns: TickerEnrichmentRunItem[];
      };
      apply_ticker_enrichment_result: {
        Args: {
          p_run_id: string;
          p_item_id: string;
          p_provider: string;
          p_status: string;
          p_metadata?: Json;
          p_error_type?: string | null;
          p_error_message?: string | null;
          p_retryable?: boolean;
        };
        Returns: Json;
      };
      record_ticker_enrichment_error: {
        Args: {
          p_run_id: string;
          p_item_id: string;
          p_provider: string;
          p_error_type: string;
          p_error_message: string;
          p_retryable?: boolean;
        };
        Returns: string;
      };
      refresh_ticker_enrichment_run: {
        Args: { p_run_id: string };
        Returns: Json;
      };
      cancel_ticker_enrichment_run: {
        Args: { p_run_id: string };
        Returns: Json;
      };
      metadata_priority_base: { Args: { p_reason: string }; Returns: number };
      calculate_ticker_metadata_priority: {
        Args: { p_ticker_id: string; p_reason: string };
        Returns: number;
      };
      track_ticker_popularity: {
        Args: { p_ticker_id: string; p_event: string; p_increment?: number };
        Returns: number;
      };
      queue_ticker_metadata: {
        Args: {
          p_ticker_id: string;
          p_reason: string;
          p_required_fields?: Json;
          p_priority?: number | null;
          p_available_after?: string | null;
        };
        Returns: string;
      };
      claim_ticker_metadata_queue: {
        Args: { p_limit?: number; p_queue_id?: string | null };
        Returns: TickerMetadataQueue[];
      };
      reserve_metadata_provider_call: {
        Args: { p_provider: string; p_daily_budget?: number };
        Returns: boolean;
      };
      record_metadata_cache_event: {
        Args: { p_provider: string; p_hit: boolean; p_avoided?: boolean };
        Returns: undefined;
      };
      finish_metadata_provider_call: {
        Args: {
          p_provider: string;
          p_outcome: string;
          p_error?: string | null;
          p_cooldown_seconds?: number | null;
        };
        Returns: undefined;
      };
      apply_ticker_metadata_queue_result: {
        Args: {
          p_queue_id: string;
          p_provider: string;
          p_status: string;
          p_metadata?: Json;
          p_error_type?: string | null;
          p_error_message?: string | null;
          p_retryable?: boolean;
          p_stale_days?: number;
          p_not_found_days?: number;
          p_max_retries?: number;
        };
        Returns: Json;
      };
      finish_ticker_metadata_queue: {
        Args: {
          p_queue_id: string;
          p_status: string;
          p_provider?: string | null;
          p_error?: string | null;
          p_available_after?: string | null;
        };
        Returns: Json;
      };
      queue_selective_ticker_metadata: {
        Args: {
          p_selector: string;
          p_limit?: number;
          p_required_fields?: Json;
        };
        Returns: number;
      };
      search_research_documents: {
        Args: {
          p_query: string;
          p_domains?: string[] | null;
          p_limit?: number;
        };
        Returns: Record<string, unknown>[];
      };
      execute_research_query: {
        Args: { p_intent: string; p_filters?: Json; p_limit?: number };
        Returns: Json;
      };
      queue_catalyst_selection: {
        Args: {
          p_selection: string;
          p_ticker_ids?: string[] | null;
          p_watchlist_id?: string | null;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      retry_failed_catalyst_research: {
        Args: { p_limit?: number };
        Returns: number;
      };
      create_manual_catalyst_event: {
        Args: {
          p_ticker_id: string;
          p_event_at: string;
          p_event_type: string;
          p_event_subtype?: string | null;
          p_headline: string;
          p_source_url: string;
          p_source_name: string;
          p_notes?: string | null;
          p_actor: string;
          p_reason: string;
        };
        Returns: string;
      };
      correct_catalyst_event: {
        Args: {
          p_event_id: string;
          p_normalized_headline?: string | null;
          p_normalized_description?: string | null;
          p_event_subtype?: string | null;
          p_actor: string;
          p_reason: string;
        };
        Returns: Json;
      };
      review_event_cluster_candidate: {
        Args: {
          p_candidate_id: string;
          p_decision: string;
          p_actor: string;
          p_reason: string;
        };
        Returns: Json;
      };
      refresh_catalyst_search_document: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      execute_catalyst_research_query: {
        Args: { p_intent: string; p_filters?: Json; p_limit?: number };
        Returns: Json;
      };
      queue_social_research:{Args:{p_ticker_id:string;p_appearance_id?:string|null;p_reason?:string;p_community?:string|null;p_date_from?:string|null;p_date_to?:string|null};Returns:string};
      claim_social_research_queue:{Args:{p_limit?:number;p_queue_id?:string|null};Returns:SocialResearchQueue[]};
      finish_social_research_queue:{Args:{p_queue_id:string;p_status:string;p_coverage_status:string;p_posts:number;p_comments:number;p_accounts:number;p_cursor_state?:Json|null;p_error?:string|null;p_available_after?:string|null};Returns:Json};
      reserve_social_provider_request:{Args:{p_provider:string;p_daily_budget:number};Returns:boolean};
      record_social_provider_request:{Args:{p_provider:string;p_outcome:string;p_cache_hit?:boolean};Returns:undefined};
      queue_social_research_selection:{Args:{p_selection:string;p_ticker_ids?:string[]|null;p_appearance_id?:string|null;p_watchlist_id?:string|null;p_limit?:number;p_community?:string|null};Returns:Json};
      rebuild_phase2c_social_derivatives:{Args:{p_ticker_ids?:string[]|null};Returns:Json};
      refresh_social_search_documents:{Args:{p_ticker_ids?:string[]|null};Returns:number};
      execute_social_research_query:{Args:{p_intent:string;p_filters?:Json;p_limit?:number};Returns:Json};
      execute_cross_source_research_query:{Args:{p_intent:string;p_filters?:Json;p_limit?:number};Returns:Json};
      get_cross_source_timeline:{Args:{p_ticker_ids?:string[]|null;p_appearance_id?:string|null;p_event_id?:string|null;p_data_mode?:string;p_source_domains?:string[]|null;p_from?:string|null;p_to?:string|null;p_limit?:number;p_offset?:number};Returns:Record<string,unknown>[]};
      revoke_social_provider:{Args:{p_source_id:string;p_reason:string;p_remove_content?:boolean};Returns:Json};
    };
    Enums: {
      import_status: ImportStatus;
      sentiment_kind: SentimentKind;
      research_status: ResearchStatus;
      ticker_event_type: EventType;
      import_batch_status: ImportBatchStatus;
      extraction_method: ExtractionMethod;
      issue_severity: "warning" | "error";
    };
    CompositeTypes: Record<never, never>;
  };
}
