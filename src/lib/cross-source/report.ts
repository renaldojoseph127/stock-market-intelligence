import type {
  IntelligenceTimelineItem,
  MarketDataMode,
} from "./types";

export interface TickerResearchBrief {
  title: string;
  tickerOverview: Record<string, unknown>;
  historicalMoverSummary: Record<string, unknown>;
  catalystTimeline: IntelligenceTimelineItem[];
  socialCoverage: { state: string; explanation: string };
  dataQuality: Record<string, unknown>;
  researchLimitations: string[];
  dataMode: MarketDataMode;
  generatedAt: string;
}

export function buildTickerResearchBrief(input: {
  symbol: string;
  summary: Record<string, any>;
  timeline: IntelligenceTimelineItem[];
  socialCoverageState: string;
  socialCoverageExplanation: string;
  dataMode?: MarketDataMode;
}): TickerResearchBrief {
  const dataMode = input.dataMode === "effective" ? "effective" : "raw";
  return {
    title: `${input.symbol} Ticker Research Brief`,
    tickerOverview: {
      symbol: input.symbol,
      companyName: input.summary.company_name ?? null,
      metadataStatus: input.summary.metadata_status ?? "unknown",
      metadataProvider: input.summary.metadata_provider ?? null,
    },
    historicalMoverSummary: {
      appearances: Number(input.summary.market_appearances ?? 0),
      reportDays: Number(input.summary.market_days ?? 0),
      firstDate: input.summary.first_market_date ?? null,
      lastDate: input.summary.last_market_date ?? null,
      dataMode,
    },
    catalystTimeline: input.timeline.filter(
      (item) => item.source_domain === "catalyst",
    ),
    socialCoverage: {
      state: input.socialCoverageState,
      explanation: input.socialCoverageExplanation,
    },
    dataQuality: {
      status: input.summary.quality_status ?? "clean",
      findingCount: Number(input.summary.quality_finding_count ?? 0),
      openFindings: Number(input.summary.quality_open_findings ?? 0),
      approvedRepairFields: Number(input.summary.quality_repaired_fields ?? 0),
    },
    researchLimitations: [
      "Market observations default to immutable RAW values; approved EFFECTIVE overlays are labeled when selected.",
      "Catalyst relationships are temporal evidence and do not establish causation.",
      input.socialCoverageExplanation,
      "This historical brief is not a prediction, recommendation, or trading signal.",
    ],
    dataMode,
    generatedAt: new Date().toISOString(),
  };
}
