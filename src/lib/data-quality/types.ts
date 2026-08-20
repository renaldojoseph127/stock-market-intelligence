export type DataMode = "raw" | "effective";
export const qualityDataMode = (value: unknown): DataMode => value === "effective" ? "effective" : "raw";
export type QualitySeverity = "info" | "low" | "medium" | "high" | "critical";
export type FindingType = "possible_missing_decimal" | "possible_extra_decimal" | "possible_column_shift" | "impossible_percentage" | "impossible_price" | "impossible_volume" | "impossible_trades" | "impossible_dollar_volume" | "cross_field_inconsistency" | "historical_outlier" | "ticker_sequence_outlier" | "category_mismatch" | "date_mismatch" | "missing_required_value" | "ocr_alignment_error" | "thousands_separator_error" | "currency_format_error" | "percentage_format_error" | "duplicate_observation" | "proposal_conflict" | "other";
export type QualityField = "row" | "rank" | "price" | "change_amount" | "change_percent" | "trades" | "volume" | "dollar_volume";

export interface QualityProposalDraft {
  proposedValue: string | null;
  proposedNumericValue: number | null;
  proposalMethod: "decimal_restoration" | "column_realignment" | "source_line_reparse" | "ocr_reinspection" | "cross_day_continuity" | "cross_field_validation" | "manual_review" | "external_reference" | "other";
  confidenceScore: number;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface QualityFindingDraft {
  fieldName: QualityField;
  findingType: FindingType;
  severity: QualitySeverity;
  originalValue: string | null;
  numericOriginalValue: number | null;
  ruleId: string;
  ruleVersion: string;
  confidenceScore: number;
  evidence: Record<string, unknown>;
  proposal?: QualityProposalDraft;
}

export interface SequenceObservation { id: string; reportDate: string; price: number | null; changePercent: number | null; }

export interface QualityAppearanceInput {
  id: string;
  tickerId: string;
  symbol: string;
  reportDate: string;
  categoryName: string;
  categoryType: string;
  categoryExchange?: string | null;
  tickerExchange?: string | null;
  securityType?: string | null;
  marketCap?: number | null;
  rank: number | null;
  price: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  trades: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rawValues?: Record<string, unknown> | null;
  source?: Record<string, unknown>;
  neighbors?: SequenceObservation[];
}

export interface QualityAuditResult { appearanceId: string; findings: QualityFindingDraft[]; }
