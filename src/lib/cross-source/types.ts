import type { Json } from "@/lib/database.types";

export const TIMELINE_DOMAINS = [
  "market",
  "catalyst",
  "social",
  "sentiment",
  "attention",
  "account",
] as const;

export type IntelligenceSourceDomain = (typeof TIMELINE_DOMAINS)[number];
export type MarketDataMode = "raw" | "effective";
export type IntelligenceQualityStatus =
  | "clean"
  | "flagged"
  | "repaired"
  | "unresolved";

export interface IntelligenceTimelineItem {
  id: string;
  ticker_id: string;
  occurred_at: string;
  date: string;
  source_domain: IntelligenceSourceDomain;
  event_type: string;
  subtype: string | null;
  headline: string;
  summary: string | null;
  source_name: string;
  source_url: string | null;
  relationship: string | null;
  confidence: number | null;
  coverage_status: string | null;
  quality_status: IntelligenceQualityStatus | null;
  metadata: Json;
  source_record_id: string | null;
  total_count: number;
}

export interface CrossSourceTimelineQuery {
  tickerIds?: string[];
  appearanceId?: string;
  eventId?: string;
  dataMode?: MarketDataMode;
  sourceDomains?: IntelligenceSourceDomain[];
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface CrossSourceTimelineResult {
  items: IntelligenceTimelineItem[];
  page: number;
  pageSize: number;
  total: number;
  dataMode: MarketDataMode;
}

export type CrossSourceSequence =
  | "social_before_catalyst_before_move"
  | "catalyst_before_social_before_move"
  | "social_and_catalyst_same_day_before_move"
  | "social_before_move_no_identified_catalyst"
  | "catalyst_before_move_no_social_evidence"
  | "coverage_insufficient"
  | "other";
