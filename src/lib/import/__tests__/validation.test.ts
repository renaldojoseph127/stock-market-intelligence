import { describe, expect, it } from "vitest";
import { parseMarketRow } from "../parsers/parse-market-row";
import { validateReport } from "../validation/validate-report";

describe("row validation", () => {
  it("parses a complete market row", () => {
    const { row } = parseMarketRow(
      "1  ABCD  $4.25  1.35  +46.55%  18350  12.045M  49.7M",
      "NASDAQ Biggest Gainers",
      1,
    );
    expect(row).toMatchObject({
      ticker: "ABCD",
      rank: 1,
      price: 4.25,
      changePercent: 46.55,
      volume: 12_045_000,
    });
  });
  it("recombines numeric signs and suffixes detached by OCR", () => {
    const { row } = parseMarketRow(
      "1 ABCD $ 4.25 + 1.35 + 46.55 % 18350 12.045 M 49.7 M",
      "NASDAQ Biggest Gainers",
      1,
    );
    expect(row).toMatchObject({
      ticker: "ABCD",
      price: 4.25,
      changeAmount: 1.35,
      changePercent: 46.55,
      volume: 12_045_000,
    });
  });
  it("aligns Scanz rows that omit the absolute change column", () => {
    const { row } = parseMarketRow(
      "1 ABCD $4.25 +46.55% 18350 12.045M 49.7M",
      "NASDAQ Biggest Gainers",
      1,
    );
    expect(row).toMatchObject({
      ticker: "ABCD",
      price: 4.25,
      changeAmount: null,
      changePercent: 46.55,
      trades: 18_350,
      volume: 12_045_000,
      dollarVolume: 49_700_000,
    });
  });
  it("records invalid ticker output", () =>
    expect(
      parseMarketRow("1  ???  $4.25", "NASDAQ Biggest Gainers", 1)
        .issues[0]?.issueType,
    ).toBe("invalid_ticker"));
  it("does not turn table headers or web prose into rows", () => {
    expect(
      parseMarketRow(
        "Rank Symbol Price Change Trades Volume",
        "NASDAQ Biggest Gainers",
        1,
      ).row,
    ).toBeNull();
    expect(
      parseMarketRow(
        "SIGN UP FOR MARKET ALERTS TODAY",
        "NASDAQ Biggest Gainers",
        1,
      ).row,
    ).toBeNull();
  });
  it("records an invalid numeric cell and stores NULL", () => {
    const result = parseMarketRow(
      "1 ABCD unreadable 1.2 +4% 5 10 20",
      "NASDAQ Biggest Gainers",
      1,
    );
    expect(result.row?.price).toBeNull();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        issueType: "invalid_numeric_value",
        fieldName: "price",
        rawValue: "unreadable",
      }),
    );
  });
  it("nulls impossible negative volume", () => {
    const result = parseMarketRow(
      "1 ABCD 1 1 1% 5 -10 20",
      "NASDAQ Biggest Gainers",
      1,
    );
    expect(result.row?.volume).toBeNull();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ fieldName: "volume" }),
    );
  });
  it("does not reject extreme gains", () =>
    expect(
      parseMarketRow(
        "1  ABCD  $1  2  +1500%",
        "NASDAQ Biggest Gainers",
        1,
      ).row?.changePercent,
    ).toBe(1500));
});

describe("report validation", () => {
  it("flags missing date, category, and rows", () =>
    expect(
      validateReport({
        filename: "x.pdf",
        fileHash: "x",
        reportDate: null,
        extractionMethod: "unknown",
        extractionConfidence: null,
        pageCount: 1,
        categories: [],
        rows: [],
        issues: [],
      }),
    ).toHaveLength(3));
});
