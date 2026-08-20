import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { qualityDataMode } from "../types";

const source = (file: string) => readFile(path.join(process.cwd(), file), "utf8");

describe("Phase 2A.2 UI and server safety foundation", () => {
  it("keeps raw mode as the explicit default", () => {
    expect(qualityDataMode(undefined)).toBe("raw");
    expect(qualityDataMode("raw")).toBe("raw");
    expect(qualityDataMode("effective")).toBe("effective");
    expect(qualityDataMode("unexpected")).toBe("raw");
  });

  it("exposes the review dashboard, evidence detail, and bounded audit controls", async () => {
    const [dashboard, detail, controls] = await Promise.all([
      source("src/app/data-quality/page.tsx"),
      source("src/app/data-quality/[findingId]/page.tsx"),
      source("src/components/data-quality-audit-controls.tsx"),
    ]);
    expect(dashboard).toContain("Historical Data Quality");
    expect(dashboard).toContain("Min confidence");
    expect(detail).toContain("Original observation");
    expect(detail).toContain("finding.detection_evidence");
    expect(detail).toContain("finding.source_evidence");
    expect(controls).toContain("Process next 250");
    expect(controls).not.toMatch(/setInterval|while\s*\(/);
  });

  it("routes every mutation through server RPCs and never updates imported appearances", async () => {
    const [route, audit, queries] = await Promise.all([
      source("src/app/api/admin/data-quality/findings/[id]/route.ts"),
      source("src/lib/data-quality/audit.ts"),
      source("src/lib/data-quality/queries.ts"),
    ]);
    expect(route).toContain("approve_market_data_proposal");
    expect(route).toContain("revert_market_data_repair");
    expect(route).toContain("createAdminClient");
    expect(`${route}\n${audit}\n${queries}`).not.toMatch(/from\(["']market_mover_appearances["']\)\.update/);
  });
});
