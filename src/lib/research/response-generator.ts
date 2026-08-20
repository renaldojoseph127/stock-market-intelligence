import type {
  DatabaseResearchResult,
  QueryPlan,
  ResearchEvidence,
} from "./types";
const labels: Record<QueryPlan["intent"], string> = {
  semantic_search: "indexed project record",
  metadata_screen: "ticker metadata match",
  social_before_movers: "social mention before a market-mover appearance",
  account_before_largest_move:
    "account mention before the largest imported move",
  feature_screen: "daily feature observation",
  source_sentiment_comparison: "source-level sentiment group",
  pattern_frequency: "pattern frequency",
  ticker_comparison: "ticker comparison",
  timeline: "historical timeline point",
  social_before_volume: "social mention before relative-volume expansion",
  sentiment_before_gainers:
    "sentiment observation before a biggest-gainer appearance",
  promotion_around_events: "promotion/earnings comparison group",
  catalyst_before_movers: "public event before a researched mover appearance",
  catalyst_repeat_tickers: "repeat catalyst/ticker relationship",
  catalyst_no_identified: "researched mover with no identified public catalyst",
  catalyst_comparison: "ticker catalyst evidence record",
  reddit_before_move:"Reddit observation before a historical mover date",
  wallstreetbets_before_move:"WallStreetBets observation before a historical mover date",
  social_before_catalyst:"social observation before a separately sourced catalyst",
  social_after_catalyst:"social observation after a separately sourced catalyst",
  accounts_before_move:"account observation before a historical mover date",
  sentiment_before_move:"stored sentiment observation before a historical mover date",
  attention_before_move:"derived attention window before a historical mover date",
  community_comparison:"coverage-limited community comparison",
  repeat_account_ticker:"repeat observed account/ticker relationship",
  social_without_identified_catalyst:"researched mover with social evidence and no separately identified catalyst",
  ticker_intelligence_timeline:"cross-source timeline observation",
  catalysts_before_move:"public catalyst observation before or on a mover date",
  catalysts_after_move:"public catalyst observation after a mover date",
  movers_without_identified_catalyst:"catalyst-researched mover without an identified event",
  quality_flagged_movers:"quality-flagged market observation",
  compare_ticker_catalysts:"ticker catalyst comparison",
  cross_source_ticker_summary:"coverage-aware ticker intelligence summary",
  social_before_move:"social observation before a historical mover date",
};
export class ResponseGenerator {
  generate(
    plan: QueryPlan,
    result: DatabaseResearchResult,
    evidence: ResearchEvidence,
  ) {
    const count = result.records.length,
      noun = labels[plan.intent],
      socialIntent = ["social_before_move","reddit_before_move","wallstreetbets_before_move","social_before_catalyst","social_after_catalyst","accounts_before_move","sentiment_before_move","attention_before_move","social_without_identified_catalyst"].includes(plan.intent),
      summary = count
        ? `Found ${count} ${noun}${count === 1 ? "" : "s"} in the available project data.`
        : socialIntent
          ? "No qualifying social evidence is currently available for this historical window. Coverage limitations are reported below; this is not an exhaustive absence claim."
          : `No matching ${noun}s were found in the currently available project data.`,
      why = count
        ? "Each row passed the visible structured filters and fixed read-only query path shown in the query preview."
        : "The query completed successfully, but no available records satisfied every structured filter.",
      calculations = [
        ...plan.aggregations,
        ...plan.grouping.map((x) => `Grouped by ${x}`),
      ].filter(Boolean);
    return {
      summary,
      why,
      calculations,
      assumptions: plan.assumptions,
      limitations: evidence.limitations,
    };
  }
}
