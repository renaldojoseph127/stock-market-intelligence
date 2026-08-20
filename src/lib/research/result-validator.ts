import type { QueryPlan, ResearchIntent } from "./types";
const intents = new Set<ResearchIntent>([
    "semantic_search",
    "metadata_screen",
    "social_before_movers",
    "account_before_largest_move",
    "feature_screen",
    "source_sentiment_comparison",
    "pattern_frequency",
    "ticker_comparison",
    "timeline",
    "social_before_volume",
    "sentiment_before_gainers",
    "promotion_around_events",
    "catalyst_before_movers",
    "catalyst_repeat_tickers",
    "catalyst_no_identified",
    "catalyst_comparison",
    "reddit_before_move",
    "wallstreetbets_before_move",
    "social_before_catalyst",
    "social_after_catalyst",
    "accounts_before_move",
    "sentiment_before_move",
    "attention_before_move",
    "community_comparison",
    "repeat_account_ticker",
    "social_without_identified_catalyst",
    "ticker_intelligence_timeline",
    "catalysts_before_move",
    "catalysts_after_move",
    "movers_without_identified_catalyst",
    "quality_flagged_movers",
    "compare_ticker_catalysts",
    "cross_source_ticker_summary",
    "social_before_move",
  ]),
  filterKeys = new Set([
    "tickers",
    "sources",
    "from",
    "to",
    "exchange",
    "sector",
    "industry",
    "security_type",
    "country",
    "market_cap_min",
    "market_cap_max",
    "category_type",
    "account",
    "attention_min",
    "sentiment_min",
    "promotion_min",
    "volume_min",
    "order_by",
    "search_text",
    "event_type",
    "catalyst_type",
    "sec_form",
    "temporal_bucket",
    "max_days_before",
    "coverage_status",
    "data_mode",
  ]);
export class ResultValidator {
  validatePlan(plan: QueryPlan) {
    if (plan.version !== "research-plan-v1" || !intents.has(plan.intent))
      throw new Error("Unsupported research plan.");
    if (!Number.isInteger(plan.limit) || plan.limit < 1 || plan.limit > 200)
      throw new Error("Research result limit is outside the permitted range.");
    for (const key of Object.keys(plan.filters))
      if (!filterKeys.has(key))
        throw new Error(`Unsupported research filter: ${key}`);
    for (const date of [plan.filters.from, plan.filters.to].filter(
      Boolean,
    ) as string[])
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error("Research dates must use YYYY-MM-DD.");
    for (const n of [
      plan.filters.attention_min,
      plan.filters.sentiment_min,
      plan.filters.promotion_min,
      plan.filters.volume_min,
      plan.filters.market_cap_min,
      plan.filters.market_cap_max,
      plan.filters.max_days_before,
    ].filter((x) => x != null))
      if (
        typeof n !== "number" ||
        !Number.isFinite(n) ||
        ([
          plan.filters.market_cap_min,
          plan.filters.market_cap_max,
          plan.filters.max_days_before,
        ].includes(n) &&
          n < 0)
      )
        throw new Error(
          "Research thresholds must be finite non-negative numbers where applicable.",
        );
    for (const values of [plan.filters.tickers, plan.filters.sources].filter(
      Boolean,
    ) as string[][])
      if (
        values.length > 20 ||
        values.some((x) => typeof x !== "string" || x.length > 100)
      )
        throw new Error("Research entity filters exceed the permitted bounds.");
    if (plan.filters.tickers?.some((x) => !/^[A-Z0-9.-]{1,15}$/.test(x)))
      throw new Error("Ticker filters must use canonical symbols.");
    if (plan.filters.search_text && plan.filters.search_text.length > 2000)
      throw new Error("Semantic search text is too long.");
    if (plan.filters.data_mode && !["raw", "effective"].includes(plan.filters.data_mode))
      throw new Error("Market data mode must be raw or effective.");
    if (
      plan.filters.category_type &&
      !["biggest_gainer", "biggest_decliner", "most_active"].includes(
        plan.filters.category_type,
      )
    )
      throw new Error("Unsupported market-mover category filter.");
    if (
      plan.filters.order_by &&
      ![
        "attention_score",
        "sentiment_score",
        "promotion_intensity",
        "market_cap",
      ].includes(plan.filters.order_by)
    )
      throw new Error("Unsupported research ordering.");
    if (
      plan.filters.temporal_bucket &&
      ![
        "same_session",
        "pre_market_same_day",
        "after_hours_previous_day",
        "within_24h_before",
        "1_to_3_days_before",
        "4_to_7_days_before",
        "8_to_30_days_before",
        "after_move",
        "unknown",
      ].includes(plan.filters.temporal_bucket)
    )
      throw new Error("Unsupported catalyst timing bucket.");
    return plan;
  }
  validateRecords(records: unknown): Record<string, unknown>[] {
    if (!Array.isArray(records))
      throw new Error(
        "Research execution returned an invalid record collection.",
      );
    return records
      .slice(0, 200)
      .filter((x) => x !== null && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }
}
