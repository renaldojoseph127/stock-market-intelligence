import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  TableCell,
} from "@/components/ui";
import { getCatalystAnalytics } from "@/lib/catalysts/queries";

const drill = (kind: string, value?: unknown) =>
  `/analytics/catalysts/drill-down?kind=${encodeURIComponent(kind)}${value == null ? "" : `&value=${encodeURIComponent(String(value))}`}`;
const DrillLink = ({
  kind,
  value,
  children,
}: {
  kind: string;
  value?: unknown;
  children: React.ReactNode;
}) => (
  <Link className="text-blue-400" href={drill(kind, value)}>
    {children}
  </Link>
);

export default async function CatalystAnalyticsPage() {
  const result = await getCatalystAnalytics();
  const d = result.data;
  const s = d.summary;
  const u = d.universe;
  return (
    <>
      <PageHeader
        title="Historical Catalyst Analytics"
        description="Coverage-aware descriptive event/mover associations. Relevance is not causation, prediction, or a trading signal."
      />
      <DatabaseNotice configured={result.configured} error={result.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="All Mover Appearances"
          value={u?.total_mover_appearances ?? 0}
          detail="Imported universe"
        />
        <StatCard
          label="Researched Appearances"
          value={
            u?.researched_mover_appearances ?? s?.researched_appearances ?? 0
          }
          detail="Analytics denominator"
        />
        <StatCard
          label="Identified Catalyst"
          value={s?.appearances_with_catalyst ?? 0}
        />
        <StatCard
          label="No Identified Catalyst"
          value={s?.no_identified_catalyst ?? 0}
        />
        <StatCard label="Partial Coverage" value={s?.partial_coverage ?? 0} />
        <StatCard
          label="Identified / Researched"
          value={
            s?.identified_percent_of_researched == null
              ? "—"
              : `${s.identified_percent_of_researched}%`
          }
        />
      </div>
      <div className="my-5 rounded border border-blue-500/20 bg-blue-500/5 p-4 text-sm">
        <Badge>Data mode: {u?.data_mode ?? "raw"}</Badge>
        <p className="mt-2 muted">
          “No identified catalyst” means no qualifying event was found in
          currently searched sources and windows. Unresearched appearances are
          excluded from percentages.{" "}
          <DrillLink kind="no_identified">
            Inspect covered appearances
          </DrillLink>
          .
        </p>
      </div>

      <section className="mt-8">
        <h2 className="mb-1 font-semibold">
          Most frequently observed catalyst types
        </h2>
        <p className="mb-3 text-xs muted">
          Historical metrics among researched mover associations only; they do
          not imply predictive power.
        </p>
        {d.types.length ? (
          <DataTable
            headers={[
              "Catalyst type",
              "Appearances",
              "Median change %",
              "Average change %",
              "Median volume",
              "Gainers",
              "Decliners",
              "Most active",
            ]}
          >
            {d.types.map((row: any) => (
              <tr key={row.catalyst_type}>
                <TableCell>
                  <DrillLink kind="type" value={row.catalyst_type}>
                    {row.catalyst_type}
                  </DrillLink>
                </TableCell>
                <TableCell>{row.associated_appearances}</TableCell>
                <TableCell>{row.median_change_percent ?? "—"}</TableCell>
                <TableCell>{row.average_change_percent ?? "—"}</TableCell>
                <TableCell>{row.median_volume ?? "—"}</TableCell>
                <TableCell>{row.gainer_count}</TableCell>
                <TableCell>{row.decliner_count}</TableCell>
                <TableCell>{row.most_active_count}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No researched catalyst analytics"
            description="Run bounded catalyst research for selected tickers or mover appearances first."
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Catalyst combinations</h2>
        {d.combinations.length ? (
          <DataTable
            headers={[
              "Combination",
              "Appearances",
              "Tickers",
              "Gainers",
              "Decliners",
              "Most active",
              "Median / average change %",
            ]}
          >
            {d.combinations.map((row: any) => (
              <tr key={row.combination}>
                <TableCell>
                  <DrillLink kind="combination" value={row.combination}>
                    {row.combination}
                  </DrillLink>
                </TableCell>
                <TableCell>{row.appearance_count}</TableCell>
                <TableCell>{row.ticker_count}</TableCell>
                <TableCell>{row.gainer_count}</TableCell>
                <TableCell>{row.decliner_count}</TableCell>
                <TableCell>{row.most_active_count}</TableCell>
                <TableCell>
                  {row.median_change_percent ?? "—"} /{" "}
                  {row.average_change_percent ?? "—"}
                </TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No multi-catalyst appearances"
            description="Combinations are derived only when multiple normalized event types relate to the same researched appearance."
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">
          Repeat catalyst behavior by ticker
        </h2>
        {d.repeats.length ? (
          <DataTable
            headers={[
              "Ticker",
              "Catalyst",
              "Events",
              "Mover associations",
              "First",
              "Last",
              "Median hours before",
            ]}
          >
            {d.repeats.map((row: any) => (
              <tr key={`${row.ticker_id}:${row.catalyst_type}`}>
                <TableCell>
                  <DrillLink kind="ticker" value={row.symbol}>
                    {row.symbol}
                  </DrillLink>
                </TableCell>
                <TableCell>{row.catalyst_type}</TableCell>
                <TableCell>{row.historical_event_count}</TableCell>
                <TableCell>{row.associated_mover_count}</TableCell>
                <TableCell>{row.first_seen}</TableCell>
                <TableCell>{row.last_seen}</TableCell>
                <TableCell>{row.median_hours_before_move ?? "—"}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No repeat behavior"
            description="No ticker has repeated researched event/mover associations yet."
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">SEC form analytics</h2>
        {d.forms.length ? (
          <DataTable
            headers={[
              "Form",
              "Filings observed",
              "Linked filings",
              "Mover appearances",
              "Median hours before",
              "Gainers",
              "Decliners",
              "Most active",
            ]}
          >
            {d.forms.map((row: any) => (
              <tr key={row.form_type}>
                <TableCell>
                  <DrillLink kind="form" value={row.form_type}>
                    {row.form_type}
                  </DrillLink>
                </TableCell>
                <TableCell>{row.filings_observed}</TableCell>
                <TableCell>{row.filings_linked_to_movers}</TableCell>
                <TableCell>{row.mover_appearances}</TableCell>
                <TableCell>{row.median_hours_before_move ?? "—"}</TableCell>
                <TableCell>{row.gainer_associations}</TableCell>
                <TableCell>{row.decliner_associations}</TableCell>
                <TableCell>{row.most_active_associations}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No SEC form analytics"
            description="No SEC filing metadata has been researched and linked."
          />
        )}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <Distribution
          title="Timing distribution"
          rows={d.timing}
          label="temporal_bucket"
          kind="timing"
        />
        <Distribution
          title="Catalysts by exchange"
          rows={d.exchanges}
          label="exchange"
          kind="exchange"
        />
        <Distribution
          title="Catalysts by mover category"
          rows={d.categories}
          label="category_name"
          kind="category"
        />
        <Distribution
          title="Before-move catalyst types"
          rows={d.beforeMove}
          label="catalyst_type"
          kind="type"
        />
        <Distribution
          title="Events by month"
          rows={d.monthly}
          label="event_month"
          kind="month"
        />
        <Distribution
          title="Events by year"
          rows={d.yearly}
          label="event_year"
          kind="year"
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Source operations and coverage</h2>
        {d.sources.length ? (
          <DataTable
            headers={[
              "Source",
              "Type",
              "Authority",
              "Events",
              "Linked",
              "Clustered duplicates",
              "Failures",
              "Requests",
              "Cache H/M",
              "Last success",
            ]}
          >
            {d.sources.map((row: any) => (
              <tr key={row.source_id}>
                <TableCell>
                  <DrillLink kind="source" value={row.source}>
                    {row.source}
                  </DrillLink>
                </TableCell>
                <TableCell>{row.source_type}</TableCell>
                <TableCell>{row.authority_level}</TableCell>
                <TableCell>{row.events_ingested}</TableCell>
                <TableCell>{row.events_linked}</TableCell>
                <TableCell>{row.duplicates_clustered}</TableCell>
                <TableCell>{row.failed_retrievals}</TableCell>
                <TableCell>{row.requests_made}</TableCell>
                <TableCell>
                  {row.cache_hits} / {row.cache_misses}
                </TableCell>
                <TableCell>{row.last_successful_retrieval ?? "—"}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No source operations"
            description="Provider activity will appear after bounded research runs."
          />
        )}
        <p className="mt-3 text-xs muted">
          Linked-event counts are operational coverage measures, not
          source-accuracy rankings.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Tickers with CIK", d.secCoverage?.tickers_with_cik],
          ["Tickers without CIK", d.secCoverage?.tickers_without_cik],
          [
            "SEC-researched tickers",
            d.secCoverage?.tickers_researched_through_sec,
          ],
          ["SEC failures", d.secCoverage?.sec_research_failures],
          ["Filings stored", d.secCoverage?.filings_stored],
          ["Filings classified", d.secCoverage?.filings_classified],
          ["Filings unresolved", d.secCoverage?.filings_unresolved],
        ].map(([label, value]) => (
          <StatCard
            key={String(label)}
            label={String(label)}
            value={value ?? 0}
          />
        ))}
      </section>
    </>
  );
}

function Distribution({
  title,
  rows,
  label,
  kind,
}: {
  title: string;
  rows: any[];
  label: string;
  kind: string;
}) {
  return (
    <div>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length ? (
        <DataTable
          headers={["Group", "Mover appearances", "Relationships / Events"]}
        >
          {rows.map((row: any, index: number) => (
            <tr key={`${row[label]}:${row.temporal_bucket ?? index}`}>
              <TableCell>
                <DrillLink kind={kind} value={row[label]}>
                  {row[label] ?? "Unknown"}
                </DrillLink>
              </TableCell>
              <TableCell>{row.mover_appearances ?? "—"}</TableCell>
              <TableCell>
                {row.relationships ?? row.events ?? row.temporal_bucket ?? "—"}
              </TableCell>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No covered observations"
          description="This analysis remains empty until researched relationships exist."
        />
      )}
    </div>
  );
}
