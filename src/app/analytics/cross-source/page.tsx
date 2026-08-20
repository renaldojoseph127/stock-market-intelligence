import Link from "next/link";
import { CrossSourceBreakdownTables } from "@/components/cross-source-breakdown-tables";
import { DatabaseNotice } from "@/components/database-notice";
import { CoverageBadge, QualityBadge } from "@/components/research-experience";
import { SaveResearchView } from "@/components/research-experience-actions";
import { SocialCoverageState } from "@/components/social-coverage-state";
import { Badge, DataTable, EmptyState, PageHeader, StatCard, TableCell } from "@/components/ui";
import { getCrossSourceAnalytics } from "@/lib/cross-source/queries";
import { getWorkspacePicker } from "@/lib/research/queries";
import { getCoverageBacklog, getCrossSourceResearchBreakdowns } from "@/lib/research-experience/queries";

const percent = (numerator: unknown, denominator: unknown) => {
  const n = Number(numerator ?? 0);
  const d = Number(denominator ?? 0);
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
};

export default async function CrossSourceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [result, breakdowns, backlog, workspaces] = await Promise.all([
    getCrossSourceAnalytics(),
    getCrossSourceResearchBreakdowns(),
    getCoverageBacklog(50, params.backlog),
    getWorkspacePicker(),
  ]);
  const data = result.data ?? {};
  const catalystDenominator = Number(data.catalyst_researched_appearances ?? 0);
  const socialDenominator = Number(data.social_complete_appearances ?? 0);
  return (
    <>
      <PageHeader title="Cross-Source Analytics" description="Coverage-aware historical market, catalyst, quality, and social evidence. Every percentage names its researched denominator." action={<SaveResearchView sourcePage="cross_source_analytics" route="/analytics/cross-source" filters={params} workspaces={workspaces.data} />} />
      <DatabaseNotice configured={result.configured} error={result.error || breakdowns.error || backlog.error || workspaces.error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="All Mover Appearances" value={data.total_mover_appearances ?? 0} detail="Imported market universe; not an analytics denominator by default" />
        <StatCard label="Catalyst Researched" value={catalystDenominator} detail="Explicit catalyst denominator" />
        <StatCard label="Identified Catalyst" value={data.identified_catalyst_appearances ?? 0} detail={`${percent(data.identified_catalyst_appearances, catalystDenominator)} of catalyst-researched`} />
        <StatCard label="No Identified Catalyst" value={data.no_identified_catalyst_appearances ?? 0} detail={`${percent(data.no_identified_catalyst_appearances, catalystDenominator)} of catalyst-researched`} />
        <StatCard label="Unresolved Quality Flags" value={data.unresolved_quality_appearances ?? 0} />
        <StatCard label="Social Researched" value={data.social_researched_appearances ?? 0} detail="Includes partial/limited coverage" />
        <StatCard label="Social Complete Window" value={socialDenominator} detail="Only valid social absence denominator" />
        <StatCard label="Social Partial / Limited" value={data.social_limited_appearances ?? 0} />
        <StatCard label="Pre-Move Social Evidence" value={data.complete_social_with_pre_move_evidence ?? 0} detail={socialDenominator ? `${percent(data.complete_social_with_pre_move_evidence, socialDenominator)} of complete windows` : "Percentage withheld: no complete social denominator"} />
        <StatCard label="No Identified Social Evidence" value={data.complete_social_without_identified_evidence ?? 0} detail={socialDenominator ? `${percent(data.complete_social_without_identified_evidence, socialDenominator)} of complete windows` : "Not reported as no activity while coverage is absent"} />
      </section>
      <div className="my-6"><SocialCoverageState /></div>

      <CrossSourceBreakdownTables breakdowns={breakdowns.data} />

      <section className="mb-8 grid gap-6 xl:grid-cols-2">
        <div><h2 className="mb-3 font-semibold">Catalyst Type Analytics</h2>{breakdowns.data.catalystTypes?.length ? <DataTable headers={["Catalyst Type", "Associated Movers", "Gainers", "Decliners", "Most Active"]}>{breakdowns.data.catalystTypes.map((row: any) => <tr key={row.catalyst_type}><TableCell>{row.catalyst_type}</TableCell><TableCell>{row.associated_appearances}</TableCell><TableCell>{row.gainer_count}</TableCell><TableCell>{row.decliner_count}</TableCell><TableCell>{row.most_active_count}</TableCell></tr>)}</DataTable> : <EmptyState title="No identified catalyst types" description="Catalyst-type metrics require linked public event evidence." />}</div>
        <div><h2 className="mb-3 font-semibold">Catalyst Timing</h2>{breakdowns.data.catalystTiming?.length ? <DataTable headers={["Temporal Bucket", "Mover Appearances", "Relationships"]}>{breakdowns.data.catalystTiming.map((row: any) => <tr key={row.temporal_bucket}><TableCell>{row.temporal_bucket}</TableCell><TableCell>{row.mover_appearances}</TableCell><TableCell>{row.relationships}</TableCell></tr>)}</DataTable> : <EmptyState title="No catalyst timing records" description="No linked catalyst/mover relationships are available." />}</div>
      </section>

      <section className="mb-8 grid gap-6 xl:grid-cols-2">
        <div><h2 className="mb-3 font-semibold">Field-Level Quality Findings</h2>{breakdowns.data.qualityFields?.length ? <DataTable headers={["Field", "Finding", "Status", "Count"]}>{breakdowns.data.qualityFields.map((row: any) => <tr key={`${row.field_name}-${row.finding_type}-${row.status}`}><TableCell>{row.field_name}</TableCell><TableCell>{row.finding_type}</TableCell><TableCell><QualityBadge status={row.status === "approved" ? "repaired" : row.status === "open" || row.status === "proposed" ? "unresolved" : "clean"} /></TableCell><TableCell>{row.finding_count}</TableCell></tr>)}</DataTable> : <EmptyState title="No quality findings" description="No field-level findings exist in current coverage." />}</div>
        <div><h2 className="mb-3 font-semibold">Repair Methods & Confidence</h2>{breakdowns.data.repairMethods?.length ? <DataTable headers={["Method", "Proposal Status", "Confidence Band", "Count"]}>{breakdowns.data.repairMethods.map((row: any) => <tr key={`${row.proposal_method}-${row.status}-${row.confidence_band}`}><TableCell>{row.proposal_method}</TableCell><TableCell><Badge>{row.status}</Badge></TableCell><TableCell>{row.confidence_band}</TableCell><TableCell>{row.proposal_count}</TableCell></tr>)}</DataTable> : <EmptyState title="No repair proposals" description="Proposals are kept separate from approved effective repairs." />}</div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Research Coverage Backlog</h2><p className="text-xs muted">Eligible research candidates only; this does not execute catalyst or Reddit research.</p></div><form><select name="backlog" defaultValue={params.backlog} className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm"><option value="">All backlog types</option>{["catalyst_researched_no_social","high_priority_no_catalyst","repeat_mover_no_social","quality_clean_ready"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select><button className="ml-2 rounded bg-blue-600 px-3 py-2 text-sm">Filter</button></form></div>
        {backlog.data.length ? <DataTable headers={["Ticker", "Date", "Category", "Backlog", "Priority", "Catalyst", "Social", "Quality", "Actions"]}>{backlog.data.map((row: any) => <tr key={`${row.appearance_id}-${row.backlog_type}`}><TableCell>{row.symbol}</TableCell><TableCell>{row.report_date}</TableCell><TableCell>{row.category_name}</TableCell><TableCell>{row.backlog_type.replaceAll("_", " ")}</TableCell><TableCell>{row.research_priority_score}</TableCell><TableCell><CoverageBadge status={row.catalyst_status} /></TableCell><TableCell><CoverageBadge status={row.social_coverage_status} /></TableCell><TableCell><QualityBadge status={row.quality_status} /></TableCell><TableCell><div className="flex flex-wrap gap-2"><Link className="text-xs text-blue-400" href={`/market-movers/${row.appearance_id}`}>Open mover</Link><Link className="text-xs text-blue-400" href={`/settings/social-research?ticker=${row.symbol}&appearance=${row.appearance_id}`}>Preview social</Link><Link className="text-xs text-blue-400" href={`/settings/catalyst-research?ticker=${row.symbol}&appearance=${row.appearance_id}`}>Preview catalyst</Link></div></TableCell></tr>)}</DataTable> : <EmptyState title="No matching research backlog" description="No persisted candidate matches the selected backlog type." />}
      </section>

      <section className="panel p-5 text-sm">
        <h2 className="font-semibold">Denominator Safety</h2>
        <p className="mt-2 muted">Catalyst found is {data.identified_catalyst_appearances ?? 0} / {catalystDenominator} catalyst-researched mover appearances—not divided by all {data.total_mover_appearances ?? 0} imported appearances. Social absence percentages remain withheld until complete configured-provider windows exist.</p>
        <p className="mt-2 muted">Future cohorts activate only inside mutually qualifying researched coverage. Unresearched social windows are never classified as “no social activity.”</p>
        <div className="mt-4 flex flex-wrap gap-4"><Link className="text-blue-400" href="/analytics/catalysts">Catalyst analytics</Link><Link className="text-blue-400" href="/analytics/social">Social analytics</Link><Link className="text-blue-400" href="/settings/social-research">Research planner preview</Link></div>
      </section>
    </>
  );
}
