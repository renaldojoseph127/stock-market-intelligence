import Link from "next/link";
import { Badge, DataTable, EmptyState, TableCell } from "@/components/ui";
import { ProviderCoverageCard } from "@/components/provider-coverage-card";

const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: value.includes("T00:00:00") ? undefined : "short",
        timeZone: "America/New_York",
      }).format(new Date(value))
    : "Date unavailable";
const relation = (row: any) => row.top_relationship ?? row.relationship ?? null;
export function CatalystTimeline({
  events,
  movers = [],
}: {
  events: any[];
  movers?: any[];
}) {
  const rows = [
    ...events.map((row) => ({
      kind: "event" as const,
      date: (row.event ?? row).published_at ?? (row.event ?? row).event_date,
      row,
    })),
    ...movers.map((row) => ({
      kind: "mover" as const,
      date: `${row.report_date}T00:00:00Z`,
      row,
    })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (!rows.length)
    return (
      <EmptyState
        title="No catalyst timeline observations"
        description="No qualifying public event or imported market-mover appearance is available for this view."
      />
    );
  return (
    <DataTable
      headers={[
        "Date / Time",
        "Type",
        "Headline",
        "Source",
        "Relation to mover",
        "Catalyst relevance",
      ]}
    >
      {rows.map((item) => {
        if (item.kind === "mover") {
          const mover = item.row;
          return (
            <tr key={`mover:${mover.id}`}>
              <TableCell>{mover.report_date}</TableCell>
              <TableCell>
                <Badge tone="warning">Market mover</Badge>
              </TableCell>
              <TableCell>
                <Link
                  className="text-blue-400"
                  href={`/market-movers/${mover.id}`}
                >
                  {mover.category_name ?? "Imported mover appearance"}
                </Link>
                <div className="text-xs muted">
                  Change{" "}
                  {mover.raw_change_percent ?? mover.change_percent ?? "—"}% ·
                  Volume {mover.raw_volume ?? mover.volume ?? "—"}
                </div>
              </TableCell>
              <TableCell>Imported Scanz report</TableCell>
              <TableCell>
                Date-only reference; intraday sequence unknown
              </TableCell>
              <TableCell>—</TableCell>
            </tr>
          );
        }
        const row = item.row,
          event = row.event ?? row,
          link = row.event ? row : relation(row);
        return (
          <tr key={`${event.id}:${row.appearance_id ?? "ticker"}`}>
            <TableCell>
              {when(event.published_at ?? event.event_date)}
            </TableCell>
            <TableCell>
              <Badge>
                {event.classified_subtype ??
                  event.event_subtype ??
                  event.classified_type ??
                  event.event_type}
              </Badge>
            </TableCell>
            <TableCell className="max-w-md whitespace-normal">
              <Link className="text-blue-400" href={`/events/${event.id}`}>
                {event.normalized_headline ??
                  event.headline ??
                  "Untitled event"}
              </Link>
            </TableCell>
            <TableCell>
              {event.registry_source_name ?? event.source_name ?? "Unknown"}
              {event.is_primary_source && (
                <div className="text-xs text-emerald-300">Primary source</div>
              )}
            </TableCell>
            <TableCell className="max-w-xs whitespace-normal">
              {link ? (
                <>
                  <div>
                    {String(link.relationship_type).replaceAll("_", " ")}
                  </div>
                  <div className="text-xs muted">
                    {String(link.temporal_bucket).replaceAll("_", " ")}
                  </div>
                </>
              ) : (
                "No linked mover in this view"
              )}
            </TableCell>
            <TableCell>
              {link?.catalyst_relevance ?? "—"}
              {link && (
                <div className="text-xs muted">
                  0–100 relevance, not causation probability
                </div>
              )}
            </TableCell>
          </tr>
        );
      })}
    </DataTable>
  );
}

export function CatalystCoverage({ coverage }: { coverage: any[] }) {
  if (!coverage.length)
    return (
      <div className="panel p-4 text-sm">
        <strong>Not researched</strong>
        <p className="mt-1 muted">
          No catalyst source/window coverage is recorded. Absence of records is
          not evidence that no catalyst existed.
        </p>
      </div>
    );
  const latest = coverage[0],
    noneFound =
      latest.coverage_status === "complete_for_configured_sources" &&
      Number(latest.events_found) === 0;
  return (
    <div>
      <ProviderCoverageCard coverage={latest} />
      {noneFound && (
        <p className="mt-2 rounded border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
          No identified public catalyst was found in the currently searched
          sources and window. This does not mean no catalyst existed.
        </p>
      )}
    </div>
  );
}
