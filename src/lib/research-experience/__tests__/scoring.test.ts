import { describe, expect, it } from "vitest";
import { calculateResearchPriority, scoreHistoricalMoverSimilarity } from "../scoring";
import { RESEARCH_PRIORITY_VERSION, SIMILARITY_ALGORITHM_VERSION, type SimilarityObservation } from "../types";

const observation = (overrides: Partial<SimilarityObservation> = {}): SimilarityObservation => ({
  id: "a",
  exchange: "NASDAQ",
  categoryId: "gainers",
  changePercent: 80,
  price: 4.5,
  volume: 1_000_000,
  repeatMover: true,
  catalystStatus: "not_researched",
  qualityStatus: "clean",
  validChange: true,
  validPrice: true,
  validVolume: true,
  ...overrides,
});

describe("Phase 2C.2 deterministic research algorithms", () => {
  it("produces an auditable non-predictive priority with documented v1 weights", () => {
    const input = {
      changePercent: 80,
      repeatCount: 8,
      catalystStatus: "no_identified_catalyst",
      socialCoverageStatus: "not_researched",
      qualityStatus: "clean",
      savedResearch: true,
      importedWithin30Days: true,
    };
    const first = calculateResearchPriority(input);
    const second = calculateResearchPriority(input);
    expect(first).toEqual(second);
    expect(first.version).toBe(RESEARCH_PRIORITY_VERSION);
    expect(first.score).toBe(89);
    expect(first.reasons).toEqual(expect.arrayContaining([
      "Large historical move +20",
      "Repeated mover +14",
      "No identified catalyst +15",
      "Social coverage not researched +10",
    ]));
    expect(JSON.stringify(first).toLowerCase()).not.toMatch(/buy|sell|alpha|expected return|price target/);
  });

  it("weights category, price, and volume while excluding unresolved numeric dimensions", () => {
    const target = observation();
    const same = scoreHistoricalMoverSimilarity(target, observation({ id: "b", changePercent: 76, volume: 1_500_000 }));
    const different = scoreHistoricalMoverSimilarity(target, observation({ id: "c", exchange: "NYSE", categoryId: "decliners", price: 150, volume: 100 }));
    expect(same.version).toBe(SIMILARITY_ALGORITHM_VERSION);
    expect(same.score).toBeGreaterThan(different.score);
    expect(same.reasons).toEqual(expect.arrayContaining(["Same mover category", "Similar price band", "Similar volume band"]));

    const excluded = scoreHistoricalMoverSimilarity(
      observation({ validChange: false, validPrice: false, validVolume: false }),
      observation({ id: "d", validChange: false, validPrice: false, validVolume: false }),
    );
    expect(excluded.availableWeight).toBe(50);
    expect(excluded.reasons).not.toEqual(expect.arrayContaining(["Similar price band", "Similar volume band"]));
  });
});

