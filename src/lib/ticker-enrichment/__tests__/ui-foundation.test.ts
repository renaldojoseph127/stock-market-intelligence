import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFile(path.join(process.cwd(), file), "utf8");

describe("Phase 2A.1 UI foundation", () => {
  it("shows real queue/provider/cache state and only selective controls", async () => {
    const [settings, controls, providers, tickers, detail, layout, refreshButton, dashboard] = await Promise.all([
      read("src/app/settings/ticker-enrichment/page.tsx"),
      read("src/components/metadata-management-controls.tsx"),
      read("src/app/settings/providers/page.tsx"),
      read("src/app/tickers/page.tsx"),
      read("src/app/tickers/[symbol]/page.tsx"),
      read("src/app/tickers/[symbol]/layout.tsx"),
      read("src/components/metadata-refresh-button.tsx"),
      read("src/components/scoring-dashboard.tsx"),
    ]);

    expect(settings).toContain("Pending Queue");
    expect(settings).toContain("Most Requested Tickers");
    expect(settings).toContain("Open Provider Conflicts");
    expect(controls).toContain("Process next batch");
    expect(controls).toContain("Enrich top popular");
    expect(controls).toContain("Request metadata");
    expect(controls).toContain("force: false");
    expect(controls).not.toContain("false ticker request(s) queued");
    expect(controls).not.toContain("Enrich all");
    expect(providers).toContain("Remaining Budget");
    expect(providers).toContain("Actual API keys are never returned");
    expect(tickers).toContain("<Pagination");
    expect(tickers).toContain("securityType");
    expect(tickers).toContain("No real ticker records match");
    expect(detail).toContain("Ticker Overview");
    expect(layout).toContain("MetadataRefreshButton");
    expect(refreshButton).toContain("Refresh Metadata");
    expect(layout).toContain("Last refreshed:");
    expect(dashboard).toContain("Metadata Intelligence");
    expect(dashboard).toContain("Cache Hit Rate");
  });

  it("keeps the legacy full-universe run API disabled", async () => {
    const route = await read("src/app/api/ticker-enrichment/runs/route.ts");
    expect(route).toContain("legacy enrichment runs are disabled");
    expect(route).toContain("{ status: 410 }");
  });
});
