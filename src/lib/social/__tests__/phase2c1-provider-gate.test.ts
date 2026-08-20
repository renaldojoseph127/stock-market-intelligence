import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Phase 2C.1 provider gate and preview", () => {
  it("keeps approval, research, limited, and complete coverage states distinct", async () => {
    process.env.REDDIT_PROVIDER_MODE = "disabled";
    process.env.DEVVIT_REDDIT_ACCESS_APPROVED = "false";
    vi.resetModules();
    const { resolveSocialCoverageState } = await import("../coverage");
    expect(resolveSocialCoverageState()).toBe("awaiting_provider_approval");
    expect(resolveSocialCoverageState({ coverageStatus: "not_researched" })).toBe("not_researched");
    expect(resolveSocialCoverageState({ coverageStatus: "provider_limited" })).toBe("provider_limited");
    expect(resolveSocialCoverageState({ coverageStatus: "complete_for_provider_window" })).toBe("complete_for_provider_window");
    expect(resolveSocialCoverageState({ queueStatus: "pending" })).toBe("queued");
  });

  it.each([
    ["disabled", "false", "", ""],
    ["devvit_bridge", "false", "https://example.com/external/research", "devvit_at_test"],
    ["devvit_bridge", "true", "", "devvit_at_test"],
    ["devvit_bridge", "true", "https://example.com/external/research", ""],
  ])("performs zero bridge and database claim calls when mode=%s approval=%s", async (mode, approval, endpoint, token) => {
    process.env.REDDIT_PROVIDER_MODE = mode;
    process.env.DEVVIT_REDDIT_ACCESS_APPROVED = approval;
    process.env.DEVVIT_REDDIT_BRIDGE_URL = endpoint;
    process.env.DEVVIT_REDDIT_MANAGED_TOKEN = token;
    vi.resetModules();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const db = { rpc: vi.fn() };
    const { processSocialResearchQueue } = await import("../research-pipeline");
    const result = await processSocialResearchQueue(db);
    expect(result).toMatchObject({ claimed: 0, blocked: true, providerCalls: 0 });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the representative NVDA preview with no provider call and no secret material", async () => {
    process.env.REDDIT_PROVIDER_MODE = "disabled";
    process.env.DEVVIT_REDDIT_ACCESS_APPROVED = "false";
    process.env.DEVVIT_REDDIT_MANAGED_TOKEN = "devvit_at_should_never_render";
    vi.resetModules();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { buildSocialResearchPreview } = await import("../planner-preview");
    const preview = buildSocialResearchPreview({ ticker: "NVDA", tickerId: "ticker-id", companyName: "NVIDIA Corporation", appearanceId: "appearance-id", community: "wallstreetbets", dateFrom: "2026-07-07T00:00:00Z", dateTo: "2026-08-08T00:00:00Z" });
    expect(preview.queries.map((query) => query.query)).toEqual(["NVDA", "$NVDA", "NVIDIA"]);
    expect(preview).toMatchObject({ canQueue: false, externalProviderCalls: 0, expectedCoverageClassification: "awaiting_provider_approval" });
    expect(JSON.stringify(preview)).not.toContain("devvit_at_");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
