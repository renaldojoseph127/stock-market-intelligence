import type { CrossSourceBreakdownGroups } from "../lib/research-experience/breakdowns";
import { DataTable, EmptyState, TableCell } from "./ui";

const BREAKDOWN_SECTIONS = [
  ["Exchange Breakdown", "exchange"],
  ["Market Category Breakdown", "category"],
  ["Monthly Coverage", "month"],
  ["Quality State", "quality"],
  ["Repeat-Mover Status", "repeat_status"],
  ["Social Coverage Status", "social_coverage"],
] as const;

const percent = (numerator: unknown, denominator: unknown) => {
  const n = Number(numerator ?? 0);
  const d = Number(denominator ?? 0);
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
};

const BreakdownTable = ({ rows }: { rows: CrossSourceBreakdownGroups[keyof CrossSourceBreakdownGroups] }) => rows.length ? (
  <DataTable headers={["Group", "All Appearances", "Catalyst Researched", "Identified", "No Identified", "Quality Flagged", "Social Researched", "Social Complete"]}>
    {rows.map((row) => <tr key={`${row.dimension}-${row.group_key}`}><TableCell>{row.group_key}</TableCell><TableCell>{row.total_appearances}</TableCell><TableCell>{row.catalyst_researched}<div className="text-xs muted">denominator</div></TableCell><TableCell>{row.identified_catalyst}<div className="text-xs muted">{percent(row.identified_catalyst, row.catalyst_researched)} researched</div></TableCell><TableCell>{row.no_identified_catalyst}</TableCell><TableCell>{row.quality_flagged}</TableCell><TableCell>{row.social_researched}<div className="text-xs muted">denominator</div></TableCell><TableCell>{row.social_complete}</TableCell></tr>)}
  </DataTable>
) : <EmptyState title="No qualifying analytics groups" description="The current persisted coverage contains no rows for this bounded breakdown." />;

export function CrossSourceBreakdownTables({
  breakdowns,
}: {
  breakdowns: CrossSourceBreakdownGroups;
}) {
  return BREAKDOWN_SECTIONS.map(([title, dimension]) => (
    <section className="mb-8" key={dimension}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <BreakdownTable rows={breakdowns[dimension]} />
    </section>
  ));
}
