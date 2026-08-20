import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import { SocialCoverageState } from "@/components/social-coverage-state";
import { SocialPostsTable } from "@/components/social-components";
import { DataTable, EmptyState, PageHeader, StatCard, TableCell, TickerLink } from "@/components/ui";
import { redditProviderStatusForDisplay } from "@/lib/social/coverage";
import {
  getHistoricalSocialAnalytics,
  getSocialOverview,
  getSocialResearchManagement,
} from "@/lib/social/queries";

export const dynamic = "force-dynamic";

export default async function SocialIntelligencePage() {
  const [overview, analytics, management] = await Promise.all([
    getSocialOverview(),
    getHistoricalSocialAnalytics(),
    getSocialResearchManagement(),
  ]);
  const data = overview.data;
  const social = analytics.data.overview ?? {};
  const queue = management.data.summary ?? {};
  const provider = redditProviderStatusForDisplay();
  return (
    <>
      <PageHeader title="Social Intelligence" description="Coverage-aware social research infrastructure and stored evidence. Correlation does not establish causation, promotion, prediction, or investment merit." />
      <DatabaseNotice configured={overview.configured && analytics.configured && management.configured} error={overview.error || analytics.error || management.error} />
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reddit Provider Status" value={provider.state.replaceAll("_", " ")} />
        <StatCard label="Social Tickers Researched" value={social.researched_tickers ?? 0} />
        <StatCard label="Posts Stored" value={social.posts_ingested ?? data.counts.posts} />
        <StatCard label="Comments Stored" value={social.comments_ingested ?? 0} />
        <StatCard label="Accounts Observed" value={social.accounts_observed ?? data.counts.accounts} />
        <StatCard label="Pre-Move Mentions" value={social.pre_move_mentions ?? 0} />
        <StatCard label="Coverage Complete" value={social.complete_coverage ?? 0} />
        <StatCard label="Coverage Partial / Limited" value={social.partial_or_limited_coverage ?? 0} />
        <StatCard label="Research Queue" value={(queue.pending ?? 0) + (queue.processing ?? 0)} />
        <StatCard label="Ticker Mentions" value={data.counts.mentions} />
        <StatCard label="Unresolved Mentions" value={data.counts.unresolved} />
        <StatCard label="Import Runs" value={data.counts.runs} />
      </div>
      <SocialCoverageState state={provider.state} />
      <section className="panel mt-4 p-5">
        <h2 className="font-semibold">Reddit research infrastructure is ready.</h2>
        <p className="mt-2 text-sm muted">Live collection is awaiting provider approval. Once an approved Devvit app, managed token, bridge endpoint, provider mode, and approval acknowledgement are configured, the existing layer can add real evidence without a UI or schema redesign.</p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {["Pre-move discussion", "Community comparisons", "Account relationships", "Sentiment", "Attention", "Catalyst/social sequencing"].map((item) => <div key={item} className="rounded border border-[#334158] p-3">{item}</div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link className="text-blue-400" href="/settings/social-research">Preview a bounded research plan</Link>
          <Link className="text-blue-400" href="/settings/providers">Inspect provider capabilities</Link>
          <Link className="text-blue-400" href="/analytics/cross-source">Cross-source analytics</Link>
        </div>
      </section>
      <h2 className="mb-3 mt-8 font-semibold">Most Discussed Tickers</h2>
      {data.tickers.length ? (
        <DataTable headers={["Ticker", "Mentions", "Unique Accounts", "Sources", "First Mention", "Last Mention"]}>
          {data.tickers.map((row: any) => (
            <tr key={row.ticker_id}>
              <TableCell><TickerLink symbol={row.symbol} /></TableCell>
              <TableCell>{row.total_mentions}</TableCell>
              <TableCell>{row.unique_accounts}</TableCell>
              <TableCell>{row.unique_sources}</TableCell>
              <TableCell>{row.first_mention ?? "—"}</TableCell>
              <TableCell>{row.last_mention ?? "—"}</TableCell>
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState title="No researched social evidence" description="No real resolved ticker mentions are stored. Provider approval is pending; zero is the honest current value." />}
      <h2 className="mb-3 mt-8 font-semibold">Recent Social Evidence</h2>
      <SocialPostsTable posts={data.recent} />
      <h2 className="mb-3 mt-8 font-semibold">Source Coverage</h2>
      <DataTable headers={["Provider", "Status", "Records", "Historical Backfill", "Last Attempt", "Last Success"]}>
        {data.coverage.map((row: any) => (
          <tr key={row.id}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.ingestion_status}</TableCell>
            <TableCell>{row.records}</TableCell>
            <TableCell>{row.historical_backfill_supported ? "Supported" : "Unavailable"}</TableCell>
            <TableCell>{row.last_attempted_sync_at ?? "Never"}</TableCell>
            <TableCell>{row.last_successful_sync_at ?? "Never"}</TableCell>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
