import { describe, expect, it } from "vitest";
import { QueryPlanner } from "../query-planner";
import { ResearchPlanner } from "../research-planner";
import { SQLBuilder } from "../sql-builder";
import { ResponseGenerator } from "../response-generator";

const plan = (question: string) =>
  new QueryPlanner().createPlan(new ResearchPlanner().analyze(question));

describe("Phase 2C.1 cross-source AI intents", () => {
  it.each([
    ["Show the NVDA cross-source timeline", "ticker_intelligence_timeline"],
    ["Show catalysts before the move for NVDA", "catalysts_before_move"],
    ["Show catalysts after the move for NVDA", "catalysts_after_move"],
    ["Show movers without identified catalyst", "movers_without_identified_catalyst"],
    ["Show quality-flagged movers", "quality_flagged_movers"],
    ["Compare ticker catalysts for AAPL and NVDA", "compare_ticker_catalysts"],
    ["Show the NVDA cross-source ticker summary", "cross_source_ticker_summary"],
    ["What was Reddit saying before NVDA moved?", "social_before_move"],
  ])("routes %s through the bounded cross-source RPC", (question, intent) => {
    const value = plan(question);
    expect(value.intent).toBe(intent);
    expect(new SQLBuilder().build(value).rpc).toBe("execute_cross_source_research_query");
    expect(value.assumptions.join(" ")).toMatch(/RAW|provenance|researched denominator/i);
  });

  it("preserves explicit effective-data requests", () => {
    expect(plan("Show quality-flagged movers using effective market data").filters.data_mode).toBe("effective");
  });

  it("does not describe an empty social result as exhaustive coverage", () => {
    const value = plan("What was Reddit saying before NVDA moved?");
    const evidence = {
      tablesConsulted: ["ticker_social_coverage"], supportingRecords: [], observationDates: [], appliedFilters: value.filters,
      methodologyVersions: ["coverage-denominator-v1"], limitations: ["Reddit provider disabled pending access approval."], assumptions: value.assumptions, generatedAt: "2026-08-18T00:00:00Z",
    };
    const answer = new ResponseGenerator().generate(value, {
      intent: value.intent, records: [], record_count: 0, tables: ["ticker_social_coverage"], methodology_versions: ["coverage-denominator-v1"], limitations: evidence.limitations, executed_at: evidence.generatedAt,
    }, evidence);
    expect(answer.summary).toMatch(/No qualifying social evidence|not an exhaustive absence claim/i);
    expect(answer.summary).not.toMatch(/No Reddit activity/i);
  });
});
