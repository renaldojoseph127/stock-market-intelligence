import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  TableCell,
} from "@/components/ui";
import { getCatalystDrillDown } from "@/lib/catalysts/queries";

export default async function CatalystDrillDown({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const result = await getCatalystDrillDown(p);
  return (
    <>
      <PageHeader
        title="Catalyst Analytics Evidence"
        description={`${p.kind ?? "type"}${p.value ? `: ${p.value}` : ""}. Underlying events and mover observations; raw market-data mode and temporal association only.`}
      />
      <DatabaseNotice configured={result.configured} error={result.error} />
      {result.data.length ? (
        <DataTable
          headers={[
            "Ticker / Event",
            "Date",
            "Category / Type",
            "Timing / Coverage",
            "Change %",
            "Evidence",
          ]}
        >
          {result.data.map((row: any, index: number) => (
            <tr
              key={row.relationship_id ?? row.appearance_id ?? row.id ?? index}
            >
              <TableCell>
                {row.symbol ?? row.ticker_symbol ?? "—"}
                {row.id && (
                  <div>
                    <Link
                      className="text-xs text-blue-400"
                      href={`/events/${row.id}`}
                    >
                      Open event
                    </Link>
                  </div>
                )}
              </TableCell>
              <TableCell>{row.report_date ?? row.event_date}</TableCell>
              <TableCell>
                {row.category_name ??
                  row.event_subtype ??
                  row.event_type ??
                  row.catalyst_status}
              </TableCell>
              <TableCell>
                <Badge>
                  {row.temporal_bucket ?? row.catalyst_status ?? "observed"}
                </Badge>
              </TableCell>
              <TableCell>{row.change_percent ?? "—"}</TableCell>
              <TableCell>
                {row.appearance_id ? (
                  <Link
                    className="text-blue-400"
                    href={`/market-movers/${row.appearance_id}`}
                  >
                    Mover detail
                  </Link>
                ) : row.source_url ? (
                  <span>{row.source_name ?? "Public source"}</span>
                ) : (
                  "—"
                )}
              </TableCell>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No underlying evidence"
          description="No researched records match this aggregate selection."
        />
      )}
      <div className="mt-5 flex gap-3 text-sm">
        <Link className="text-blue-400" href="/analytics/catalysts">
          Back to analytics
        </Link>
        {result.page > 1 && (
          <Link
            className="text-blue-400"
            href={`/analytics/catalysts/drill-down?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter((entry): entry is [string, string] => Boolean(entry[1]))), page: String(result.page - 1) })}`}
          >
            Previous
          </Link>
        )}
        {result.data.length === result.pageSize && (
          <Link
            className="text-blue-400"
            href={`/analytics/catalysts/drill-down?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter((entry): entry is [string, string] => Boolean(entry[1]))), page: String(result.page + 1) })}`}
          >
            Next
          </Link>
        )}
      </div>
    </>
  );
}
