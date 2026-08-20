import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
const source=(file:string)=>readFile(path.join(process.cwd(),file),"utf8");

describe("Phase 2A.2.1 review UI safety", () => {
  it("uses server pagination, current-page selection, preview, and explicit confirmation", async () => { const[page,workspace,queries]=await Promise.all([source("src/app/data-quality/review/page.tsx"),source("src/components/repair-review-workspace.tsx"),source("src/lib/data-quality/queries.ts")]);expect(page).toContain("maximum 100 per request");expect(workspace).toContain("Select eligible on this page");expect(workspace).toContain("Preview Effective Result");expect(workspace).toContain("Confirm {confirmation.action}");expect(queries).toContain("Math.min(100");expect(`${page}\n${workspace}`).not.toMatch(/Approve All|approve all|Auto-fix|Repair all/); });
  it("exposes grouped Tier C decisions and audited repair reversion", async()=>{const[workspace,repairs]=await Promise.all([source("src/components/repair-review-workspace.tsx"),source("src/components/approved-repairs-table.tsx")]);expect(workspace).toContain("Approve coordinated row repair");expect(workspace).toContain("unknown price remains UNKNOWN");expect(repairs).toContain("Confirm revert");});
  it("caps every mutation endpoint at 25 and sends optimistic versions",async()=>{const files=await Promise.all(["batch-approve","batch-reject","grouped-row"].map(name=>source(`src/app/api/admin/data-quality/proposals/${name}/route.ts`)));for(const file of files){expect(file).toContain("REPAIR_REVIEW_BATCH_MAX");expect(file).toContain("updatedAt");}expect((await source("src/components/repair-review-workspace.tsx"))).toContain("proposal_updated_at");});
});
