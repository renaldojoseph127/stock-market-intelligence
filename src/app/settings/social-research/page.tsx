import { DatabaseNotice } from "@/components/database-notice";
import { SocialCoverageState } from "@/components/social-coverage-state";
import { SocialResearchManagement } from "@/components/social-research-management";
import { SocialResearchPreview } from "@/components/social-research-preview";
import { Badge, DataTable, EmptyState, PageHeader, StatCard, TableCell } from "@/components/ui";
import { redditConfiguration, socialResearchConfig } from "@/lib/social/config";
import { getSocialResearchManagement } from "@/lib/social/queries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await getSocialResearchManagement();
  const data = result.data;
  const provider = redditConfiguration();
  const summary = data.summary ?? {};
  const blocked = data.queue.filter((row: any) => row.status === "approval_blocked").length;
  const providerLimited = data.queue.filter((row: any) => row.status !== "approval_blocked" && row.coverage_status === "provider_limited").length;
  return (
    <>
      <PageHeader title="Social Research Management" description="Preview and inspect selective social research plans. Live Reddit collection remains blocked until provider approval and complete server-only configuration." />
      <DatabaseNotice configured={result.configured} error={result.error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
        <StatCard label="Pending" value={summary.pending ?? 0} />
        <StatCard label="Processing" value={summary.processing ?? 0} />
        <StatCard label="Deferred" value={summary.deferred_or_limited ?? 0} />
        <StatCard label="Failed Today" value={summary.failed_today ?? 0} />
        <StatCard label="Completed Today" value={summary.completed_today ?? 0} />
        <StatCard label="Provider Limited" value={providerLimited} />
        <StatCard label="Approval Blocked" value={blocked} />
        <StatCard label="Records Today" value={summary.records_ingested_today ?? 0} />
      </section>
      <div className="my-5">
        <SocialCoverageState />
        <p className="mt-2 text-xs muted">
          Mode: {socialResearchConfig.redditProviderMode} · hard application budget: {socialResearchConfig.dailyRequestBudget} requests/day · cache: {socialResearchConfig.cacheTtlHours} hours. Tokens and credentials remain server-only.
        </p>
      </div>
      <SocialResearchManagement providerEnabled={provider.ready} blockedReason={provider.message} />
      <SocialResearchPreview />
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Recent Durable Queue & Plans</h2>
        {data.queue.length ? (
          <DataTable headers={["Ticker", "Community", "Reason", "Window", "Status", "Coverage", "Attempts", "Current limitation"]}>
            {data.queue.map((row: any) => (
              <tr key={row.id}>
                <TableCell>{row.tickers?.symbol}</TableCell>
                <TableCell>{row.community ?? "Bounded defaults"}</TableCell>
                <TableCell>{row.reason}</TableCell>
                <TableCell>{row.date_from} – {row.date_to}</TableCell>
                <TableCell><Badge>{row.status}</Badge></TableCell>
                <TableCell>{row.coverage_status ?? "not_researched"}</TableCell>
                <TableCell>{row.attempts}</TableCell>
                <TableCell className="max-w-sm whitespace-normal">{row.last_error ?? "—"}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Queue is empty" description="No universe-wide backfill is scheduled. Use preview to validate a bounded plan without provider calls." />}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Recorded Coverage</h2>
        {data.coverage.length ? (
          <DataTable headers={["Ticker", "Source", "Community", "Window", "Status", "Posts", "Comments", "Accounts", "Researched"]}>
            {data.coverage.map((row: any) => (
              <tr key={row.id}>
                <TableCell>{row.tickers?.symbol}</TableCell>
                <TableCell>{row.social_sources?.name}</TableCell>
                <TableCell>{row.community ?? "Multiple"}</TableCell>
                <TableCell>{row.date_from} – {row.date_to}</TableCell>
                <TableCell><Badge>{row.coverage_status}</Badge></TableCell>
                <TableCell>{row.posts_found}</TableCell>
                <TableCell>{row.comments_found}</TableCell>
                <TableCell>{row.accounts_found}</TableCell>
                <TableCell>{row.last_researched_at ?? "—"}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="No social coverage" description="Not researched is distinct from researched with zero qualifying evidence." />}
      </section>
    </>
  );
}
