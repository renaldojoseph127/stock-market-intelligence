import {
  CatalystManagementControls,
  ClusterReviewActions,
  ManualCatalystEventForm,
} from "@/components/catalyst-management-controls";
import { DatabaseNotice } from "@/components/database-notice";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  TableCell,
} from "@/components/ui";
import { getCatalystResearchManagement } from "@/lib/catalysts/queries";

export const dynamic = "force-dynamic";

export default async function CatalystResearchSettings() {
  const result = await getCatalystResearchManagement();
  const d = result.data;
  const s = d.summary ?? {};
  return (
    <>
      <PageHeader
        title="Catalyst Research Management"
        description="Selective, persisted, cache-first SEC and public-event research. Credentials remain server-only."
      />
      <DatabaseNotice configured={result.configured} error={result.error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Queue depth", s.queue_depth],
          ["Processing", s.currently_processing],
          ["Completed today", s.completed_today],
          ["Failed today", s.failed_today],
          ["Deferred", s.deferred],
          ["SEC requests today", s.sec_requests_today],
          ["Cache hits", s.cache_hits_today],
          ["Cache misses", s.cache_misses_today],
          ["Last SEC success", s.last_sec_success],
        ].map(([label, value]) => (
          <StatCard
            key={String(label)}
            label={String(label)}
            value={value ?? 0}
          />
        ))}
        <div className="panel p-4">
          <div className="text-xs uppercase muted">Provider health</div>
          <div className="mt-2">
            <Badge
              tone={
                d.provider.status === "healthy"
                  ? "positive"
                  : d.provider.status === "unavailable" ||
                      d.provider.status === "unconfigured"
                    ? "negative"
                    : "warning"
              }
            >
              {d.provider.status}
            </Badge>
          </div>
          <p className="mt-2 text-xs muted">
            {d.provider.requestsPerSecond} requests/second maximum
          </p>
        </div>
      </section>
      {!d.provider.configured && (
        <p className="my-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          Live SEC access is disabled. Set a genuine <code>SEC_USER_AGENT</code>{" "}
          containing the application name and a real contact email or URL. No
          identity is fabricated.
        </p>
      )}
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Selective research controls</h2>
        <CatalystManagementControls watchlists={d.watchlists} />
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Manual public-source event entry</h2>
        <p className="mb-3 text-xs muted">
          Use only when legitimate public evidence was found outside configured
          adapters. HTTPS source, actor, and reason are mandatory and audited.
        </p>
        <ManualCatalystEventForm />
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">SEC coverage</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(d.secCoverage ?? {}).map(([label, value]) => (
            <StatCard
              key={label}
              label={label.replaceAll("_", " ")}
              value={value as any}
            />
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Recent queue</h2>
        {d.queue.length ? (
          <DataTable
            headers={[
              "Ticker",
              "Reason",
              "Window",
              "Priority",
              "Status",
              "Attempts",
              "Error",
              "Updated",
            ]}
          >
            {d.queue.map((row: any) => (
              <tr key={row.id}>
                <TableCell>{row.tickers?.symbol}</TableCell>
                <TableCell>{row.reason}</TableCell>
                <TableCell>
                  {row.date_from} – {row.date_to}
                </TableCell>
                <TableCell>{row.priority}</TableCell>
                <TableCell>
                  <Badge>{row.status}</Badge>
                </TableCell>
                <TableCell>{row.attempts}</TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  {row.last_error ?? "—"}
                </TableCell>
                <TableCell>{row.updated_at}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="Queue is empty"
            description="Research is triggered only by explicit, bounded selections."
          />
        )}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Persisted provider failures</h2>
        {d.failures.length ? (
          <DataTable
            headers={[
              "Ticker",
              "Source",
              "Window",
              "Attempt",
              "HTTP",
              "Type",
              "Retryable",
              "Available",
              "Message",
            ]}
          >
            {d.failures.map((row: any) => (
              <tr key={row.id}>
                <TableCell>{row.tickers?.symbol}</TableCell>
                <TableCell>{row.event_sources?.name}</TableCell>
                <TableCell>
                  {row.date_from} – {row.date_to}
                </TableCell>
                <TableCell>{row.attempt}</TableCell>
                <TableCell>{row.http_status ?? "—"}</TableCell>
                <TableCell>{row.error_type}</TableCell>
                <TableCell>{row.retryable ? "yes" : "no"}</TableCell>
                <TableCell>{row.available_after ?? "—"}</TableCell>
                <TableCell className="max-w-sm whitespace-normal">
                  {row.error_message}
                </TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No provider failures"
            description="No persisted SEC retrieval failure exists."
          />
        )}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Uncertain duplicate candidates</h2>
        {d.clusterCandidates.length ? (
          <DataTable
            headers={[
              "Ticker",
              "Event A",
              "Event B",
              "Similarity",
              "Reason",
              "Review",
            ]}
          >
            {d.clusterCandidates.map((row: any) => (
              <tr key={row.id}>
                <TableCell>{row.tickers?.symbol}</TableCell>
                <TableCell className="whitespace-normal">
                  {row.event_a?.event_date}
                  <br />
                  {row.event_a?.source_name}: {row.event_a?.headline}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.event_b?.event_date}
                  <br />
                  {row.event_b?.source_name}: {row.event_b?.headline}
                </TableCell>
                <TableCell>{row.similarity}</TableCell>
                <TableCell className="whitespace-normal">
                  {row.reason}
                </TableCell>
                <TableCell>
                  <ClusterReviewActions candidateId={row.id} />
                </TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No uncertain clusters"
            description="Low-confidence matches are not automatically merged."
          />
        )}
      </section>
    </>
  );
}
