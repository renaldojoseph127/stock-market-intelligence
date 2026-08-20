import { describe, expect, it } from "vitest";
import { classifyCrossSourceSequence } from "../sequencing";

describe("cross-source sequencing", () => {
  it("refuses a definitive sequence without qualifying social coverage", () => {
    expect(
      classifyCrossSourceSequence({
        moveDate: "2026-08-06",
        catalystAt: "2026-08-05T13:00:00Z",
        socialAt: null,
        catalystIdentified: true,
        socialCoverageComplete: false,
      }),
    ).toBe("coverage_insufficient");
  });

  it("classifies deterministic evidence ordering once coverage qualifies", () => {
    expect(
      classifyCrossSourceSequence({
        moveDate: "2026-08-06",
        catalystAt: "2026-08-05T13:00:00Z",
        socialAt: "2026-08-03T15:00:00Z",
        catalystIdentified: true,
        socialCoverageComplete: true,
      }),
    ).toBe("social_before_catalyst_before_move");
    expect(
      classifyCrossSourceSequence({
        moveDate: "2026-08-06",
        catalystAt: "2026-08-03T13:00:00Z",
        socialAt: "2026-08-05T15:00:00Z",
        catalystIdentified: true,
        socialCoverageComplete: true,
      }),
    ).toBe("catalyst_before_social_before_move");
  });
});
