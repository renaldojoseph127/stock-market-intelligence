export const CROSS_SOURCE_BREAKDOWN_DIMENSIONS = [
  "exchange",
  "category",
  "month",
  "quality",
  "repeat_status",
  "social_coverage",
] as const;

export type CrossSourceBreakdownDimension =
  (typeof CROSS_SOURCE_BREAKDOWN_DIMENSIONS)[number];

export type CrossSourceBreakdownRow = {
  dimension: CrossSourceBreakdownDimension;
  group_key: string;
  total_appearances: number;
  catalyst_researched: number;
  identified_catalyst: number;
  no_identified_catalyst: number;
  quality_flagged: number;
  social_researched: number;
  social_complete: number;
};

export type CrossSourceBreakdownGroups = Record<
  CrossSourceBreakdownDimension,
  CrossSourceBreakdownRow[]
>;

const emptyGroups = (): CrossSourceBreakdownGroups => ({
  exchange: [],
  category: [],
  month: [],
  quality: [],
  repeat_status: [],
  social_coverage: [],
});

const isDimension = (value: string): value is CrossSourceBreakdownDimension =>
  CROSS_SOURCE_BREAKDOWN_DIMENSIONS.includes(value as CrossSourceBreakdownDimension);

export function groupCrossSourceBreakdownRows(
  input: unknown,
): CrossSourceBreakdownGroups {
  const groups = emptyGroups();
  if (!Array.isArray(input)) return groups;

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as Record<string, unknown>;
    const dimension = String(row.dimension ?? "").trim().toLowerCase();
    if (!isDimension(dimension)) continue;
    groups[dimension].push({
      ...(row as unknown as CrossSourceBreakdownRow),
      dimension,
    });
  }

  return groups;
}
