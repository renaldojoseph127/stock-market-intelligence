import { DatabaseNotice } from "@/components/database-notice";
import { Badge, DataTable, EmptyState, PageHeader, StatCard, TableCell } from "@/components/ui";
import { getSystemStatus } from "@/lib/research-experience/queries";
import { redditConfiguration } from "@/lib/social/config";
import { catalystConfig, validSecUserAgent } from "@/lib/catalysts/config";
import { providerReadiness } from "@/lib/ticker-enrichment/providers";

export const dynamic = "force-dynamic";

const aggregate = (rows: any[]) =>
  rows.reduce((acc: Record<string, number>, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

const healthBadge = (health: string) => (
  <Badge tone={health === "healthy" ? "positive" : health === "disabled" || health === "approval_pending" || health === "not_configured" ? "warning" : "negative"}>{health}</Badge>
);

export default async function SystemStatusPage() {
  const result = await getSystemStatus();
  const provider = redditConfiguration();
  const redditHealth = provider.ready ? "healthy" : provider.status === "authorization_required" ? "approval_pending" : "disabled";
  const metadataConfigured = providerReadiness().some((entry) => entry.configured);
  const catalystConfigured = validSecUserAgent(catalystConfig.secUserAgent);
  const queueRows = Object.entries(result.data.queues ?? {}).map(([name, rows]) => ({ name, states: aggregate(rows as any[]) }));
  const latest = result.data.latestRuns ?? {};
  return (
    <>
      <PageHeader title="System Status" description="Non-secret operational readiness for the standalone Historical Research Database. Approval-pending providers are not reported as unhealthy." />
      <DatabaseNotice configured={result.configured} error={result.error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Database" value={result.configured ? "healthy" : "not_configured"} />
        <StatCard label="Scanz Imports" value={Number(result.data.counts?.source_reports) ? "healthy" : "not_configured"} detail={`${result.data.counts?.source_reports ?? 0} source reports`} />
        <StatCard label="Metadata Provider" value={metadataConfigured ? "healthy" : "not_configured"} detail={`${result.data.counts?.ticker_metadata_sources ?? 0} source observations`} />
        <StatCard label="SEC Catalyst" value={catalystConfigured ? "healthy" : "not_configured"} detail={`${result.data.counts?.ticker_events ?? 0} events`} />
        <StatCard label="Reddit / Devvit" value={redditHealth} detail="No provider call while disabled" />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Provider Health</h2>
        <DataTable headers={["Subsystem", "Health", "Configuration / Coverage", "Secrets"]}>
          <tr><TableCell>Database</TableCell><TableCell>{healthBadge(result.configured ? "healthy" : "not_configured")}</TableCell><TableCell>{result.data.counts?.market_mover_appearances ?? 0} mover appearances</TableCell><TableCell>Not exposed</TableCell></tr>
          <tr><TableCell>Metadata</TableCell><TableCell>{healthBadge(metadataConfigured ? "healthy" : "not_configured")}</TableCell><TableCell>{metadataConfigured ? "At least one server provider configured" : "No configured provider"}</TableCell><TableCell>Not exposed</TableCell></tr>
          <tr><TableCell>SEC</TableCell><TableCell>{healthBadge(catalystConfigured ? "healthy" : "not_configured")}</TableCell><TableCell>Public catalyst research source · {result.data.counts?.ticker_events ?? 0} stored events</TableCell><TableCell>User agent and provider settings withheld</TableCell></tr>
          <tr><TableCell>Reddit / Devvit</TableCell><TableCell>{healthBadge(redditHealth)}</TableCell><TableCell>{provider.message}</TableCell><TableCell>Tokens, URLs, and key metadata not exposed</TableCell></tr>
        </DataTable>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Queue States</h2>
        {queueRows.length ? <DataTable headers={["Queue", "Observed states", "Bounded behavior"]}>{queueRows.map((queue) => <tr key={queue.name}><TableCell>{queue.name.replaceAll("_", " ")}</TableCell><TableCell className="whitespace-normal">{Object.entries(queue.states).map(([state, count]) => `${state}: ${count}`).join(" · ") || "Empty"}</TableCell><TableCell>Workers claim bounded persisted batches.</TableCell></tr>)}</DataTable> : <EmptyState title="Queue state unavailable" description="Queue state is shown only from the connected database." />}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Latest Recorded Runs</h2>
        <DataTable headers={["Subsystem", "Status", "Completed", "Created"]}>
          {Object.entries(latest).map(([name, run]: [string, any]) => <tr key={name}><TableCell>{name}</TableCell><TableCell>{run?.status ?? "No recorded run"}</TableCell><TableCell>{run?.completed_at ?? "—"}</TableCell><TableCell>{run?.created_at ?? "—"}</TableCell></tr>)}
        </DataTable>
      </section>

      <section className="panel mt-8 p-5 text-sm">
        <h2 className="font-semibold">Migration Readiness</h2>
        <p className="mt-2 muted">Application source expects migration {result.data.migrations?.expectedLatest ?? "202608200001"}. Hosted migration application is verified during deployment with the Supabase CLI; migration history and credentials are not exposed through this page.</p>
      </section>
    </>
  );
}
