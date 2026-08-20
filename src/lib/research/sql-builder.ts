import type { QueryPlan, SafeResearchOperation } from "./types";
import { ResultValidator } from "./result-validator";
export class SQLBuilder {
  constructor(private validator = new ResultValidator()) {}
  build(plan: QueryPlan): SafeResearchOperation {
    this.validator.validatePlan(plan);
    if (plan.clarification || plan.safetyRejection)
      throw new Error(
        "A clarification or rejected request cannot be executed.",
      );
    const crossSourceIntents = [
      "ticker_intelligence_timeline",
      "catalysts_before_move",
      "catalysts_after_move",
      "movers_without_identified_catalyst",
      "quality_flagged_movers",
      "compare_ticker_catalysts",
      "cross_source_ticker_summary",
      "social_before_move",
    ];
    return crossSourceIntents.includes(plan.intent)
      ? {
          rpc: "execute_cross_source_research_query",
          parameters: {
            p_intent: plan.intent,
            p_filters: plan.filters,
            p_limit: plan.limit,
          },
        }
      : plan.intent === "metadata_screen"
      ? {
          rpc: "execute_ticker_metadata_research",
          parameters: {
            p_intent: plan.intent,
            p_filters: plan.filters,
            p_limit: plan.limit,
          },
        }
      : (["reddit_before_move","wallstreetbets_before_move","social_before_catalyst","social_after_catalyst","accounts_before_move","sentiment_before_move","attention_before_move","community_comparison","repeat_account_ticker","social_without_identified_catalyst"] as string[]).includes(plan.intent)
        ? {rpc:"execute_social_research_query",parameters:{p_intent:plan.intent,p_filters:plan.filters,p_limit:plan.limit}}
      : plan.intent.startsWith("catalyst_")
        ? {
            rpc: "execute_catalyst_research_query",
            parameters: {
              p_intent: plan.intent,
              p_filters: plan.filters,
              p_limit: plan.limit,
            },
          }
        : {
            rpc: "execute_research_query",
            parameters: {
              p_intent: plan.intent,
              p_filters: plan.filters,
              p_limit: plan.limit,
            },
          };
  }
}
