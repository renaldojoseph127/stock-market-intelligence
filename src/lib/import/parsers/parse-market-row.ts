import { normalizeInteger, normalizeNumber } from "./normalize-number";
import { normalizeTicker } from "./normalize-ticker";
import type { Issue, MarketRow } from "../types";

const HEADER_TOKENS = new Set([
  "RANK",
  "SYMBOL",
  "TICKER",
  "PRICE",
  "CHANGE",
  "TRADES",
  "VOLUME",
]);

function compactDetachedNumericTokens(tokens: string[]) {
  const compacted: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (/^[$+\-]$/.test(token) && next && /\d/.test(next)) {
      compacted.push(`${token}${next}`);
      index += 1;
      continue;
    }
    if (/^(?:%|[KMB])$/i.test(token) && compacted.length) {
      compacted[compacted.length - 1] += token;
      continue;
    }
    compacted.push(token);
  }
  return compacted;
}

export function parseMarketRow(
  line: string,
  category: string,
  pageNumber: number,
): { row: MarketRow | null; issues: Issue[] } {
  const cells = compactDetachedNumericTokens(
    line.trim().split(/\s+/).filter(Boolean),
  );
  const issues: Issue[] = [];
  if (cells.length < 2) return { row: null, issues };

  let rank = normalizeInteger(cells[0]);
  if (rank == null && /^[I|L]$/i.test(cells[0]) && cells.length > 2) rank = 1;
  const tickerIndex = rank == null ? 0 : 1;
  const tickerToken = cells[tickerIndex]?.replace(/^\$/, "") ?? "";
  if (HEADER_TOKENS.has(tickerToken.toUpperCase())) {
    return { row: null, issues };
  }

  const ticker = normalizeTicker(tickerToken);
  const offset = tickerIndex + 1;
  if (!ticker) {
    issues.push({
      pageNumber,
      issueType: "invalid_ticker",
      fieldName: "ticker",
      rawValue: cells[tickerIndex],
      message: "Ticker did not match supported exchange symbol conventions.",
      severity: "warning",
    });
    return { row: null, issues };
  }

  const extractedRaw = cells.slice(offset);
  // Narrative text and web chrome can look like a ticker. A real Scanz row has
  // multiple numeric cells; requiring two prevents that text from becoming a
  // fabricated mover while still allowing partially recovered rows.
  const reliableNumericCells = extractedRaw
    .slice(0, 6)
    .filter((value) => normalizeNumber(value) != null).length;
  if (reliableNumericCells < 2) return { row: null, issues: [] };

  // Current Scanz tables can omit the absolute change column and expose
  // Symbol, Last, %Chg, Trades, Volume, and $Volume. Anchor on the explicit
  // percent token so those five numeric cells do not shift into the six-field
  // database schema; the unavailable change amount remains honestly NULL.
  const percentIndex = extractedRaw
    .slice(0, 3)
    .findIndex((value) => value.includes("%"));
  const raw =
    percentIndex === 1
      ? [extractedRaw[0], "", ...extractedRaw.slice(1)]
      : extractedRaw;

  const fields = [
    "price",
    "change_amount",
    "change_percent",
    "trades",
    "volume",
    "dollar_volume",
  ];
  const nums = raw.map((value, index) => {
    const number = normalizeNumber(value);
    if (number == null && value && !/^(?:N\/?A|--?)$/i.test(value)) {
      issues.push({
        pageNumber,
        issueType: "invalid_numeric_value",
        fieldName: fields[index] ?? "unknown",
        rawValue: value,
        message:
          "The extracted value was not a reliable number and was stored as NULL.",
        severity: "warning",
      });
    }
    return number;
  });

  if (rank != null && rank <= 0) {
    issues.push({
      pageNumber,
      issueType: "invalid_numeric_value",
      fieldName: "rank",
      rawValue: cells[0],
      message: "Rank must be positive.",
      severity: "warning",
    });
    rank = null;
  }
  for (const [index, field] of [
    [0, "price"],
    [3, "trades"],
    [4, "volume"],
    [5, "dollar_volume"],
  ] as const) {
    if (nums[index] != null && nums[index]! < 0) {
      issues.push({
        pageNumber,
        issueType: "invalid_numeric_value",
        fieldName: field,
        rawValue: raw[index],
        message: `${field} cannot be negative and was stored as NULL.`,
        severity: "warning",
      });
      nums[index] = null;
    }
  }

  return {
    row: {
      category,
      ticker,
      rank,
      price: nums[0] ?? null,
      changeAmount: nums[1] ?? null,
      changePercent: nums[2] ?? null,
      trades: nums[3] ?? null,
      volume: nums[4] ?? null,
      dollarVolume: nums[5] ?? null,
      pageNumber,
      rawValues: {
        line,
        price: raw[0] ?? "",
        changeAmount: raw[1] ?? "",
        changePercent: raw[2] ?? "",
        trades: raw[3] ?? "",
        volume: raw[4] ?? "",
        dollarVolume: raw[5] ?? "",
      },
    },
    issues,
  };
}
