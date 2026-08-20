import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
const read = (file: string) => readFile(path.join(process.cwd(), file), "utf8");
describe("Phase 2B UI and API foundation", () => {
  it("adds event detail, ticker/mover research, timeline, coverage, and analytics routes", async () => {
    const files = await Promise.all([
        read("src/app/events/[id]/page.tsx"),
        read("src/app/tickers/[symbol]/page.tsx"),
        read("src/app/market-movers/[id]/page.tsx"),
        read("src/app/analytics/catalysts/page.tsx"),
        read("src/components/catalyst-timeline.tsx"),
        read("src/components/catalyst-research-button.tsx"),
      ]),
      text = files.join("\n");
    for (const phrase of [
      "Research catalysts",
      "Catalysts / Public Events",
      "Nearby Catalysts",
      "Historical Catalyst Analytics",
      "No identified public catalyst",
      "not causation probability",
    ])
      expect(text).toContain(phrase);
  });
  it("queues persisted work before invoking the bounded processor", async () => {
    const [control, queue, worker] = await Promise.all([
      read("src/components/catalyst-research-button.tsx"),
      read("src/app/api/catalysts/research/route.ts"),
      read("src/app/api/admin/catalysts/queue/process/route.ts"),
    ]);
    expect(control.indexOf("/api/catalysts/research")).toBeLessThan(
      control.indexOf("/api/admin/catalysts/queue/process"),
    );
    expect(queue).toContain("queue_catalyst_research");
    expect(worker).toContain("Math.min(Number(body.limit)||1,5)");
  });
  it("does not add mass backfill, prediction, or causal claims", async () => {
    const text = (
      await Promise.all([
        read("src/components/catalyst-research-button.tsx"),
        read("src/app/analytics/catalysts/page.tsx"),
        read("src/components/catalyst-timeline.tsx"),
      ])
    ).join("\n");
    expect(text).not.toMatch(
      /research all|backfill all|buy signal|sell signal|probability this caused/i,
    );
  });
  it("adds continuation management, drill-down, safe links, workspaces, and fixed AI execution", async () => {
    const [
      management,
      controls,
      drillDown,
      eventPage,
      aiRoute,
      sqlBuilder,
      workspaceForms,
    ] = await Promise.all([
      read("src/app/settings/catalyst-research/page.tsx"),
      read("src/components/catalyst-management-controls.tsx"),
      read("src/app/analytics/catalysts/drill-down/page.tsx"),
      read("src/app/events/[id]/page.tsx"),
      read("src/app/api/ai-search/route.ts"),
      read("src/lib/research/sql-builder.ts"),
      read("src/components/research-workspace-forms.tsx"),
    ]);
    expect(management).toContain("Provider health");
    expect(controls).toContain("Research selected ticker");
    expect(controls).not.toMatch(
      /value=["']research_all|action:\s*["']backfill_all/i,
    );
    expect(drillDown).toContain("pageSize");
    expect(eventPage).toContain("safeExternalUrl");
    expect(aiRoute).toContain("ResearchEngine");
    expect(sqlBuilder).toContain("execute_catalyst_research_query");
    for (const itemType of [
      "saved_event",
      "saved_filing",
      "saved_catalyst_comparison",
      "saved_timeline",
    ])
      expect(workspaceForms).toContain(itemType);
  });
});
