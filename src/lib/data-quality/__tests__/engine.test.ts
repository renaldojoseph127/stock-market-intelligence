import { describe, expect, it } from "vitest";
import { HistoricalDataQualityEngine } from "../engine";
import type { QualityAppearanceInput, SequenceObservation } from "../types";

const neighbors = (prices = [180, 185, 190, 195, 200, 205, 210, 215]): SequenceObservation[] => prices.map((price, index) => ({ id: `neighbor-${index}`, reportDate: `2026-01-${String(index + 1).padStart(2, "0")}`, price, changePercent: 1 }));
const base = (overrides: Partial<QualityAppearanceInput> = {}): QualityAppearanceInput => ({ id: "appearance", tickerId: "ticker", symbol: "NVDA", reportDate: "2026-06-15", categoryName: "NASDAQ Most Active", categoryType: "most_active", categoryExchange: "NASDAQ", tickerExchange: "NASDAQ", securityType: "common_stock", marketCap: 5_000_000_000_000, rank: null, price: 200, changeAmount: null, changePercent: 1, trades: 1_000_000, volume: 100_000_000, dollarVolume: 20_000_000_000, rawValues: { line: "NVDA 200.00 +1.00% 1,000,000 100,000,000 $20,000,000,000", price: "200.00", changePercent: "+1.00%" }, neighbors: neighbors(), ...overrides });

describe("HistoricalDataQualityEngine", () => {
  const engine = new HistoricalDataQualityEngine();

  const priceAnomalies: Array<[string, string, number, number]> = [
    ["NVDA", "2026-06-15", 2121, 212.1], ["NVDA", "2026-05-21", 21947, 219.47], ["NVDA", "2026-04-22", 20241, 202.41], ["NVDA", "2026-03-18", 1805, 180.5], ["NVDA", "2026-02-05", 1728, 172.8], ["NVDA", "2025-11-24", 18255, 182.55], ["AAPL", "2026-03-20", 2483, 248.3], ["AAPL", "2025-08-08", 22935, 229.35],
  ];
  const percentageAnomalies: Array<[string, number, number]> = [["2025-12-24", -47, -.47], ["2025-12-11", -149, -1.49], ["2025-10-10", -486, -4.86]];

  it.each(priceAnomalies)("flags %s %s lost-decimal price %s and proposes %s without approval", (symbol, reportDate, price, expected) => {
    const volume = 100_000_000, row = base({ symbol, reportDate, price, volume, dollarVolume: expected * volume, rawValues: { line: `${symbol} ${price} +1.00% 1,000,000 100,000,000 $20,000,000,000`, price: String(price), changePercent: "+1.00%" } });
    const finding = engine.analyzeAppearance(row).findings.find(value => value.ruleId === "price_missing_decimal_v1");
    expect(finding).toBeDefined();
    expect(finding?.proposal?.proposedNumericValue).toBeCloseTo(expected);
    expect(finding?.confidenceScore).toBeLessThan(.99);
  });

  it.each([["NVDA", "2026-08-06", 218.91, "218.91"], ["NVDA", "2026-08-05", 219.7, "219.70"], ["AAPL", "2026-08-06", 312.48, "312.48"], ["AAPL", "2026-08-05", 310.79, "310.79"]])("does not flag clean %s %s price %s", (symbol, reportDate, price, token) => {
    const result = engine.analyzeAppearance(base({ symbol, reportDate, price, dollarVolume: price * 100_000_000, rawValues: { price: token, changePercent: "+1.00%", line: `${symbol} ${token} +1.00% 1,000,000 100,000,000 $20,000,000,000` } }));
    expect(result.findings.some(value => value.ruleId.includes("price_missing_decimal"))).toBe(false);
  });

  it.each(percentageAnomalies)("flags NVDA %s percentage decimal loss %s", (reportDate, changePercent, expected) => {
    const result = engine.analyzeAppearance(base({ reportDate, changePercent, rawValues: { price: "188.32", changePercent: `${changePercent}%`, line: `NVDA 188.32 ${changePercent}% 1,000,000 100,000,000 $18,832,000,000` } }));
    const finding = result.findings.find(value => value.ruleId === "percentage_decimal_loss_v1");
    expect(finding?.proposal?.proposedNumericValue).toBeCloseTo(expected);
  });

  it("detects and proposes the production AAPL column realignment without inventing a price", () => {
    const result = engine.analyzeAppearance(base({ symbol: "AAPL", reportDate: "2025-12-29", price: .11, changePercent: 22_736_610, trades: null, volume: null, dollarVolume: null, rawValues: { price: "+0.11%", changePercent: "22,736,610", line: "AAPL +0.11% 474,317 22,736,610 $6,221,002,094" } }));
    expect(result.findings.some(value => value.ruleId === "column_shift_v1")).toBe(true);
    expect(result.findings.find(value => value.ruleId === "column_shift_price_v1")?.proposal?.proposedNumericValue).toBeNull();
    expect(result.findings.find(value => value.ruleId === "column_shift_change_percent_v1")?.proposal?.proposedNumericValue).toBe(.11);
    expect(result.findings.find(value => value.ruleId === "column_shift_trades_v1")?.proposal?.proposedNumericValue).toBe(474317);
    expect(result.findings.find(value => value.ruleId === "column_shift_volume_v1")?.proposal?.proposedNumericValue).toBe(22736610);
  });

  it("detects extra decimals, impossible domains, count ordering, and dollar-volume inconsistency", () => {
    expect(engine.analyzeAppearance(base({ price: 2, dollarVolume: 20_000_000_000, rawValues: { price: "2.00" } })).findings.some(value => value.findingType === "possible_extra_decimal")).toBe(true);
    expect(engine.analyzeAppearance(base({ price: 0 })).findings.some(value => value.findingType === "impossible_price")).toBe(true);
    expect(engine.analyzeAppearance(base({ trades: 2000, volume: 1000 })).findings.some(value => value.ruleId === "trades_exceed_volume_v1")).toBe(true);
    expect(engine.analyzeAppearance(base({ dollarVolume: 2_000_000_000 })).findings.some(value => value.ruleId === "price_volume_dollar_consistency_v1")).toBe(true);
  });

  it("does not normalize legitimate penny/OTC and biggest-gainer extremes", () => {
    const penny = base({ symbol: "PENY", categoryName: "Biggest Penny Stock Gainers", categoryType: "biggest_gainer", categoryExchange: "PENNY", tickerExchange: "OTC", marketCap: null, price: .8, changePercent: 180, volume: 1_000_000, dollarVolume: 800_000, rawValues: { price: "0.80", changePercent: "+180%", line: "PENY 0.80 +180% 5,000 1,000,000 $800,000" }, neighbors: neighbors([.3, .4, .45, .5, .6, .65]) });
    const result = engine.analyzeAppearance(penny);
    expect(result.findings.some(value => value.ruleId === "percentage_decimal_loss_v1")).toBe(false);
    expect(result.findings.some(value => value.proposal?.proposalMethod === "decimal_restoration")).toBe(false);
  });

  it("produces the expected conservative review workload for the complete targeted production fixture", () => {
    const priceRows = priceAnomalies.map(([symbol, reportDate, price, expected], index) => base({ id: `price-${index}`, symbol, reportDate, price, dollarVolume: expected * 100_000_000, rawValues: { line: `${symbol} ${price} +1.00% 1,000,000 100,000,000 $${expected * 100_000_000}`, price: String(price), changePercent: "+1.00%" } }));
    const percentRows = percentageAnomalies.map(([reportDate, changePercent], index) => base({ id: `percent-${index}`, reportDate, changePercent, rawValues: { price: "188.32", changePercent: `${changePercent}%`, line: `NVDA 188.32 ${changePercent}% 1,000,000 100,000,000 $18,832,000,000` } }));
    const shifted = base({ id: "shifted", symbol: "AAPL", reportDate: "2025-12-29", price: .11, changePercent: 22_736_610, trades: null, volume: null, dollarVolume: null, rawValues: { price: "+0.11%", changePercent: "22,736,610", line: "AAPL +0.11% 474,317 22,736,610 $6,221,002,094" } });
    const results = engine.rebuildFindings([...priceRows, ...percentRows, shifted]);
    const findings = results.flatMap(result => result.findings), proposals = findings.flatMap(finding => finding.proposal ? [finding.proposal] : []);
    expect(findings).toHaveLength(34);
    expect(proposals).toHaveLength(16);
    expect(proposals.every(proposal => proposal.confidenceScore <= .99)).toBe(true);
    expect(proposals.every(proposal => !("status" in proposal))).toBe(true);
  });
});
