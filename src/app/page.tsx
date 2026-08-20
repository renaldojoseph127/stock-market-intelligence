import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import {
  CoverageBadge,
  Pagination,
  QualityBadge,
  ResearchCandidateFilters,
  ResearchCandidatesTable,
} from "@/components/research-experience";
import { SaveResearchView } from "@/components/research-experience-actions";
import { Badge, DataTable, EmptyState, PageHeader, StatCard, TableCell } from "@/components/ui";
import { getCrossSourceAnalytics } from "@/lib/cross-source/queries";
import { catalystConfig, validSecUserAgent } from "@/lib/catalysts/config";
import { getCategories, getCounts, getRecentReports } from "@/lib/queries";
import { getResearchWorkspaces, getWorkspacePicker } from "@/lib/research/queries";
import { getCoverageBacklog, getResearchCandidates } from "@/lib/research-experience/queries";
import { redditConfiguration } from "@/lib/social/config";
import { getMetadataCoverage } from "@/lib/ticker-enrichment/queries";

const n = (value: unknown) => new Intl.NumberFormat("en-US").format(Number(value ?? 0));

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [counts, candidates, categories, cross, backlog, workspaces, picker, reports, metadata] = await Promise.all([
    getCounts(),
    getResearchCandidates(params, { defaultSize: 20 }),
    getCategories(),
    getCrossSourceAnalytics(),
    getCoverageBacklog(8),
    getResearchWorkspaces(),
    getWorkspacePicker(),
    getRecentReports(),
    getMetadataCoverage(),
  ]);
  const error = counts.error || candidates.error || categories.error || cross.error || backlog.error || workspaces.error || reports.error || metadata.error;
  const analytics = cross.data ?? {};
  const provider = redditConfiguration();
  const catalystReady = validSecUserAgent(catalystConfig.secUserAgent);
  const metadataAvailable = Number(metadata.data.enriched_tickers ?? 0);
  return (
    <>
      <PageHeader
        title="Historical Research Command Center"
        description="Discover persisted historical research candidates, inspect evidence coverage, and continue saved case work. Nothing on this page is a trading recommendation."
        action={<Link href="/research" className="rounded bg-blue-600 px-4 py-2 text-sm">Open Research Today</Link>}
      />
      <DatabaseNotice configured={counts.configured} error={error} />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Research Today</h2><p className="text-xs muted">Historical research candidates ranked by deterministic, non-predictive investigation priority.</p></div>
          <SaveResearchView sourcePage="research_today" route="/" filters={params} dataMode="raw" workspaces={picker.data} />
        </div>
        <ResearchCandidateFilters params={params} categories={categories.data} actionLabel="Filter candidates" />
        <ResearchCandidatesTable rows={candidates.data} />
        <Pagination path="/" params={params} page={candidates.page} pageSize={candidates.pageSize} total={candidates.total} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Database Coverage</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Unique Tickers" value={n(counts.data.tickers)} />
          <StatCard label="Mover Appearances" value={n(counts.data.appearances)} />
          <StatCard label="Source Reports" value={n(counts.data.reports)} />
          <StatCard label="Catalyst Researched" value={n(analytics.catalyst_researched_appearances)} detail="Explicit researched denominator" />
          <StatCard label="Unresolved Quality" value={n(analytics.unresolved_quality_appearances)} />
          <StatCard label="Social Researched" value={n(analytics.social_researched_appearances)} detail={provider.ready ? "Recorded windows only" : "Provider approval pending"} />
        </div>
      </section>

      <section className="mb-8 grid gap-5 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold">Catalyst Research Coverage</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Researched" value={n(analytics.catalyst_researched_appearances)} />
            <StatCard label="Identified" value={n(analytics.identified_catalyst_appearances)} />
            <StatCard label="No Identified Catalyst" value={n(analytics.no_identified_catalyst_appearances)} detail="Within researched coverage only" />
          </div>
          <Link className="mt-3 inline-block text-sm text-blue-400" href="/analytics/cross-source">Inspect researched denominators</Link>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Provider / Coverage Status</h2>
          <div className="panel grid gap-4 p-5 sm:grid-cols-3">
            <div><div className="text-xs muted">Metadata</div><div className="mt-2"><Badge tone={metadataAvailable ? "positive" : "warning"}>{metadataAvailable ? `${n(metadataAvailable)} cached` : "partial / unavailable"}</Badge></div></div>
            <div><div className="text-xs muted">SEC catalyst source</div><div className="mt-2"><CoverageBadge status={catalystReady ? "complete_for_configured_sources" : "not_configured"} /></div></div>
            <div><div className="text-xs muted">Reddit / Devvit</div><div className="mt-2"><CoverageBadge status={provider.ready ? "complete_for_provider_window" : "approval_pending"} /></div></div>
          </div>
          <p className="mt-2 text-xs muted">Approval-pending is not unhealthy. No Reddit request is made while the provider is disabled.</p>
        </div>
      </section>

      <section className="mb-8 grid gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Data Quality Review</h2><Link className="text-sm text-blue-400" href="/data-quality">Open review</Link></div>
          {backlog.data.length ? <DataTable headers={["Ticker", "Date", "Reason", "Quality", "Priority"]}>{backlog.data.slice(0, 6).map((row: any) => <tr key={`${row.appearance_id}-${row.backlog_type}`}><TableCell><Link className="text-blue-400" href={`/market-movers/${row.appearance_id}`}>{row.symbol}</Link></TableCell><TableCell>{row.report_date}</TableCell><TableCell>{row.backlog_type.replaceAll("_", " ")}</TableCell><TableCell><QualityBadge status={row.quality_status} /></TableCell><TableCell>{row.research_priority_score}</TableCell></tr>)}</DataTable> : <EmptyState title="No coverage backlog candidates" description="No persisted mover currently satisfies the bounded backlog criteria." />}
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Saved Research</h2><Link className="text-sm text-blue-400" href="/research-workspaces">Manage cases</Link></div>
          {workspaces.data.length ? <div className="grid gap-3 sm:grid-cols-2">{workspaces.data.slice(0, 6).map((workspace: any) => <Link className="panel p-4 hover:border-blue-500/40" href={`/research-workspaces/${workspace.id}`} key={workspace.id}><div className="flex items-center justify-between gap-2"><h3 className="font-medium text-blue-300">{workspace.name}</h3><Badge>{workspace.status}</Badge></div><p className="mt-2 text-xs muted">{workspace.item_count} evidence item(s) · {workspace.open_questions} open question(s)</p><p className="mt-1 text-[10px] muted">Last activity {workspace.last_activity_at}</p></Link>)}</div> : <EmptyState title="No saved research cases" description="Create a workspace to pin evidence, questions, comparisons, and brief snapshots." />}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Recent Historical Imports</h2>
        {reports.data.length ? <DataTable headers={["Report Date", "Filename", "Status", "Ticker Records"]}>{reports.data.map((report: any) => <tr key={report.id}><TableCell>{report.report_date}</TableCell><TableCell>{report.source_filename ?? "—"}</TableCell><TableCell><Badge tone={report.import_status === "completed" ? "positive" : "warning"}>{report.import_status}</Badge></TableCell><TableCell>{n(report.ticker_records)}</TableCell></tr>)}</DataTable> : <EmptyState title="No imported Scanz history" description="Import real historical reports before research candidates can be derived." />}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Getting Started</h2>
        <p className="mt-1 text-sm muted">Readiness reflects real persisted state; no demo data is created.</p>
        <ol className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <li><Badge tone={counts.data.reports ? "positive" : "warning"}>1</Badge><span className="ml-2">Import market history · {counts.data.reports ? "available" : "not available"}</span></li>
          <li><Badge tone={metadataAvailable ? "positive" : "warning"}>2</Badge><span className="ml-2">Enrich ticker metadata · {metadataAvailable ? "available / partial" : "not started"}</span></li>
          <li><Badge tone={Number(analytics.unresolved_quality_appearances) >= 0 ? "positive" : "warning"}>3</Badge><span className="ml-2">Review data quality · audit available</span></li>
          <li><Badge tone={catalystReady ? "positive" : "warning"}>4</Badge><span className="ml-2">Research catalysts · {catalystReady ? "SEC source configured" : "SEC source not configured"}</span></li>
          <li><Badge tone="positive">5</Badge><span className="ml-2">Review cross-source intelligence</span></li>
          <li><Badge tone="positive">6</Badge><span className="ml-2">Save research workspaces · ready</span></li>
          <li><Badge tone="warning">7</Badge><span className="ml-2">Social intelligence · provider approval pending</span></li>
        </ol>
      </section>
    </>
  );
}
