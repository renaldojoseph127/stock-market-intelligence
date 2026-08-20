import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrossSourceBreakdownTables } from "../../../components/cross-source-breakdown-tables";
import { groupCrossSourceBreakdownRows } from "../breakdowns";

describe("Cross-Source breakdown query architecture", () => {
  it("uses one multi-dimension RPC and one materialized RAW appearance base", async () => {
    const [queries, breakdownMigration, backlogMigration] = await Promise.all([
      readFile(path.join(process.cwd(), "src/lib/research-experience/queries.ts"), "utf8"),
      readFile(
        path.join(
          process.cwd(),
          "supabase/migrations/202608200001_phase_2c2_cross_source_breakdowns.sql",
        ),
        "utf8",
      ),
      readFile(
        path.join(
          process.cwd(),
          "supabase/migrations/202608200002_phase_2c2_cross_source_backlog.sql",
        ),
        "utf8",
      ),
    ]);

    expect(queries.match(/db\.rpc\("get_research_experience_breakdowns"/g)).toHaveLength(1);
    expect(queries).not.toContain('db.rpc("get_research_experience_breakdown",');
    expect(queries.match(/db\.rpc\("get_research_coverage_backlog"/g)).toHaveLength(1);
    expect(queries).not.toContain('db.from("research_coverage_backlog")');
    expect(breakdownMigration.toLowerCase()).toContain("with base as materialized");
    expect(breakdownMigration.match(/from public\.market_mover_appearances a/g)).toHaveLength(1);
    expect(breakdownMigration.toLowerCase()).toContain("security invoker");
    expect(backlogMigration.toLowerCase()).toContain("base as materialized");
    expect(backlogMigration.match(/from public\.market_mover_appearances appearance/g)).toHaveLength(1);
    expect(backlogMigration.toLowerCase()).toContain("security invoker");
  });

  it("maps production quality and repeat-status rows into explicit UI buckets", () => {
    const common = {
      catalyst_researched: 6,
      identified_catalyst: 6,
      no_identified_catalyst: 0,
      quality_flagged: 3_906,
      social_researched: 0,
      social_complete: 0,
    };
    const grouped = groupCrossSourceBreakdownRows([
      { ...common, dimension: "exchange", group_key: "NASDAQ", total_appearances: 20_000 },
      { ...common, dimension: "category", group_key: "NASDAQ Biggest Gainers", total_appearances: 3_000 },
      { ...common, dimension: "month", group_key: "2025-08", total_appearances: 2_000 },
      { ...common, dimension: "quality", group_key: "clean", total_appearances: 21_313 },
      { ...common, dimension: "quality", group_key: "flagged", total_appearances: 3_906 },
      { ...common, dimension: "repeat_status", group_key: "repeat_mover", total_appearances: 23_679 },
      { ...common, dimension: "repeat_status", group_key: "single_appearance", total_appearances: 1_540 },
      { ...common, dimension: "social_coverage", group_key: "not_researched", total_appearances: 25_219 },
    ]);

    expect(grouped.quality.map(({ group_key, total_appearances }) => ({ group_key, total_appearances }))).toEqual([
      { group_key: "clean", total_appearances: 21_313 },
      { group_key: "flagged", total_appearances: 3_906 },
    ]);
    expect(grouped.repeat_status.map(({ group_key, total_appearances }) => ({ group_key, total_appearances }))).toEqual([
      { group_key: "repeat_mover", total_appearances: 23_679 },
      { group_key: "single_appearance", total_appearances: 1_540 },
    ]);
    expect(Object.values(grouped).every((rows) => rows.length > 0)).toBe(true);

    const html = renderToStaticMarkup(createElement(CrossSourceBreakdownTables, { breakdowns: grouped }));
    for (const heading of [
      "Exchange Breakdown", "Market Category Breakdown", "Monthly Coverage", "Quality State",
      "Repeat-Mover Status", "Social Coverage Status",
    ]) expect(html).toContain(heading);
    expect(html).toContain("clean");
    expect(html).toContain("21313");
    expect(html).toContain("repeat_mover");
    expect(html).toContain("23679");
    expect(html).not.toContain("No qualifying analytics groups");
  });
});
