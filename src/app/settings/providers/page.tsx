import { DatabaseNotice } from "@/components/database-notice";
import { Badge, DataTable, EmptyState, PageHeader, StatCard, TableCell } from "@/components/ui";
import { redditProviderStatusForDisplay } from "@/lib/social/coverage";
import { socialProviderRegistry } from "@/lib/social/provider-registry";
import { getSocialResearchManagement } from "@/lib/social/queries";
import { metadataConfig } from "@/lib/ticker-enrichment/config";
import { getOnDemandManagement } from "@/lib/ticker-enrichment/queries";

export const dynamic = "force-dynamic";

const yes = (value: boolean) => (value ? "Yes" : "No");

export default async function Page() {
  const [metadata, social] = await Promise.all([
    getOnDemandManagement(),
    getSocialResearchManagement(),
  ]);
  const { providers, health, usage, intelligence } = metadata.data;
  const byHealth = new Map(health.map((row: any) => [row.provider, row]));
  const byUsage = new Map(usage.map((row: any) => [row.provider, row]));
  const provider = redditProviderStatusForDisplay();
  const registry = socialProviderRegistry();
  const runtime = social.data.provider ?? {};
  const daily = social.data.usage?.[0] ?? {};
  return (
    <>
      <PageHeader title="Data Providers" description="Server-only provider readiness, health, capability limits, and quota usage. Actual API keys are never returned; secret values, prefixes, lengths, and metadata stay server-only." />
      <DatabaseNotice configured={metadata.configured && social.configured} error={metadata.error || social.error} />
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Reddit / Devvit Provider Status</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Mode" value={provider.mode} />
          <StatCard label="Approval" value={provider.approval ? "Acknowledged" : "Pending"} />
          <StatCard label="Devvit bridge" value={provider.devvitBridgeStatus} />
          <StatCard label="Endpoint configured" value={yes(provider.endpointConfigured)} />
          <StatCard label="Managed token configured" value={yes(provider.managedTokenConfigured)} />
          <StatCard label="Provider enabled" value={yes(provider.providerEnabled)} />
        </div>
        <div className="mt-4 panel p-4 text-sm">
          <div className="flex flex-wrap gap-3">
            <Badge tone={provider.providerEnabled ? "positive" : "warning"}>{runtime.provider_status ?? provider.state}</Badge>
            <span>{provider.message}</span>
          </div>
          <p className="mt-2 muted">Requests reserved today: {daily.requests_reserved ?? 0} · cache hits: {daily.cache_hits ?? 0} · last success: {runtime.last_successful_sync_at ?? "Never"}.</p>
        </div>
      </section>
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Social Provider Registry & Capability Matrix</h2>
        <DataTable headers={["Provider", "State", "Search posts", "Comments", "Historical search", "Exact date filter", "Account lookup", "Rate limit known", "External approval"]}>
          {registry.map((entry) => (
            <tr key={entry.key}>
              <TableCell>{entry.name}</TableCell>
              <TableCell><Badge tone={entry.state === "available" ? "positive" : "warning"}>{entry.state}</Badge></TableCell>
              <TableCell>{yes(entry.capabilities.search_posts)}</TableCell>
              <TableCell>{yes(entry.capabilities.comments)}</TableCell>
              <TableCell>{yes(entry.capabilities.historical_search)}</TableCell>
              <TableCell>{yes(entry.capabilities.exact_date_filter)}</TableCell>
              <TableCell>{yes(entry.capabilities.account_lookup)}</TableCell>
              <TableCell>{yes(entry.capabilities.rate_limit_known)}</TableCell>
              <TableCell>{yes(entry.capabilities.external_approval_required)}</TableCell>
            </tr>
          ))}
        </DataTable>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {registry.map((entry) => (
            <details className="panel p-4 text-sm" key={entry.key}>
              <summary className="cursor-pointer font-medium">{entry.name} limitations</summary>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs muted">
                {entry.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
            </details>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Company Metadata Providers</h2>
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Daily Budget" value={metadataConfig.dailyBudget} />
          <StatCard label="Calls Today" value={intelligence.api_calls_today} />
          <StatCard label="Remaining" value={intelligence.remaining_daily_budget} />
        </div>
        {providers.length ? (
          <DataTable headers={["Priority", "Provider", "Configuration", "Health", "Calls Today", "Remaining Budget", "Success Rate", "Rate Limits", "Last Success", "Last Error"]}>
            {providers.map((item, index) => {
              const healthRow: any = byHealth.get(item.name);
              const usageRow: any = byUsage.get(item.name);
              const completed = Number(usageRow?.calls_succeeded ?? 0) + Number(usageRow?.calls_failed ?? 0);
              const rate = completed ? `${((Number(usageRow?.calls_succeeded ?? 0) / completed) * 100).toFixed(1)}%` : "—";
              return (
                <tr key={item.name}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell><Badge tone={item.configured ? "positive" : "warning"}>{item.configured ? "configured" : "not configured"}</Badge></TableCell>
                  <TableCell>{healthRow?.status ?? (item.configured ? "not checked" : "unconfigured")}</TableCell>
                  <TableCell>{usageRow?.calls_attempted ?? 0}</TableCell>
                  <TableCell>{intelligence.remaining_daily_budget}</TableCell>
                  <TableCell>{rate}</TableCell>
                  <TableCell>{usageRow?.calls_rate_limited ?? 0}</TableCell>
                  <TableCell>{healthRow?.last_successful_call ?? "—"}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{healthRow?.last_error ?? "—"}</TableCell>
                </tr>
              );
            })}
          </DataTable>
        ) : <EmptyState title="No metadata providers registered" description="Provider implementations are registered server-side and never expose credentials to the browser." />}
      </section>
    </>
  );
}
