import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Cross-Source breakdown query architecture", () => {
  it("uses one multi-dimension RPC and one materialized RAW appearance base", async () => {
    const [queries, migration] = await Promise.all([
      readFile(path.join(process.cwd(), "src/lib/research-experience/queries.ts"), "utf8"),
      readFile(
        path.join(
          process.cwd(),
          "supabase/migrations/202608200001_phase_2c2_cross_source_breakdowns.sql",
        ),
        "utf8",
      ),
    ]);

    expect(queries.match(/db\.rpc\("get_research_experience_breakdowns"/g)).toHaveLength(1);
    expect(queries).not.toContain('db.rpc("get_research_experience_breakdown",');
    expect(migration.toLowerCase()).toContain("with base as materialized");
    expect(migration.match(/from public\.market_mover_appearances a/g)).toHaveLength(1);
    expect(migration.toLowerCase()).toContain("security invoker");
  });
});
