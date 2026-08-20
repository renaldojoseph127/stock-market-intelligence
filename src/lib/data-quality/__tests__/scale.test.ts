import { describe, expect, it } from "vitest";
import { HistoricalDataQualityEngine } from "../engine";
import type { QualityAppearanceInput } from "../types";

describe("production-shaped audit scale", () => {
  it("analyzes 25,219 appearances deterministically in bounded slices", () => {
    const engine = new HistoricalDataQualityEngine(), total = 25_219, batchSize = 250;
    let processed = 0, findings = 0;
    for (let offset = 0; offset < total; offset += batchSize) {
      const batch: QualityAppearanceInput[] = Array.from({ length: Math.min(batchSize, total - offset) }, (_, index) => ({ id: `a-${offset + index}`, tickerId: `t-${(offset + index) % 4247}`, symbol: "SAFE", reportDate: "2026-01-01", categoryName: "NASDAQ Most Active", categoryType: "most_active", marketCap: 1_000_000_000, rank: null, price: 10, changeAmount: null, changePercent: 1, trades: 100, volume: 1000, dollarVolume: 10_000, rawValues: { price: "10.00", changePercent: "+1.00%" }, neighbors: [] }));
      const result = engine.rebuildFindings(batch);processed += result.length;findings += result.reduce((sum, row) => sum + row.findings.length, 0);
      expect(batch.length).toBeLessThanOrEqual(batchSize);
    }
    expect(processed).toBe(total);expect(findings).toBe(0);expect(Math.ceil(total / batchSize)).toBe(101);
  });
});
