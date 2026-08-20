import { describe, expect, it } from "vitest";
import { parseDate, parseFilenameDate } from "../parsers/parse-date";
import { parseCategory } from "../parsers/parse-category";
import { CANONICAL_CATEGORIES } from "../parsers/category-map";
import { normalizeNumber } from "../parsers/normalize-number";
import { normalizeTicker } from "../parsers/normalize-ticker";

describe("date parsing", () => {
  it.each([
    ["08/10/2025", "2025-08-10"],
    ["08-10-2025", "2025-08-10"],
    ["2025-08-10", "2025-08-10"],
    ["O8/1O/2025", "2025-08-10"],
    ["August 10, 2025", "2025-08-10"],
    ["10 Aug 2025", "2025-08-10"],
  ])("parses %s", (value, wanted) => expect(parseDate(value)).toBe(wanted));
  it("extracts filename dates", () =>
    expect(parseFilenameDate("scanz_2025-08-10.pdf")).toBe("2025-08-10"));
  it("rejects impossible dates", () =>
    expect(parseDate("02/31/2025")).toBeNull());
});

describe("category normalization", () => {
  it.each([...CANONICAL_CATEGORIES])("recognizes %s", (value) =>
    expect(parseCategory(value)).toBe(value),
  );
  it.each([
    "NASDAQ Biggest Gainers",
    "Nasdaq Biggest Gainers",
    "NASDAQ BIGGEST GAINERS",
    "• NASDAQ Biggest Gainers | Scanz",
    "NASDA0 Biggest Galners",
    "NASSAD Biggest Gaimers",
  ])("canonicalizes OCR heading %s", (value) =>
    expect(parseCategory(value)).toBe("NASDAQ Biggest Gainers"),
  );
  it("does not merge categories", () =>
    expect(parseCategory("NASDAQ Movers")).toBeNull());
  it("repairs a bounded penny-heading glyph error", () =>
    expect(parseCategory("Biggest Peany Stock Decliners")).toBe(
      "Biggest Penny Stock Decliners",
    ));
});

describe("number normalization", () => {
  it.each([
    ["+124.75%", 124.75],
    ["-32.44%", -32.44],
    ["$0.38", 0.38],
    ["1.5M", 1_500_000],
    ["862K", 862_000],
    ["2.1B", 2_100_000_000],
    ["$1,234.50", 1_234.5],
  ])("normalizes %s", (value, wanted) =>
    expect(normalizeNumber(value)).toBe(wanted),
  );
  it("does not invent missing values", () =>
    expect(normalizeNumber("N/A")).toBeNull());
});

describe("ticker normalization", () => {
  it.each([
    [" abcd ", "ABCD"],
    ["brk.a", "BRK.A"],
    ["BRK.B", "BRK.B"],
  ])("normalizes %s", (value, wanted) =>
    expect(normalizeTicker(value)).toBe(wanted),
  );
  it.each(["A B", "$ABC", "???", ""])("rejects %s", (value) =>
    expect(normalizeTicker(value)).toBeNull(),
  );
});
