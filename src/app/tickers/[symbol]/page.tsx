import Link from "next/link";
import { notFound } from "next/navigation";
import { num } from "@/components/analytics-components";
import {
  CatalystCoverage,
  CatalystTimeline,
} from "@/components/catalyst-timeline";
import { CatalystResearchButton } from "@/components/catalyst-research-button";
import { SocialResearchButton } from "@/components/social-research-button";
import { CrossSourceTimeline } from "@/components/cross-source-timeline";
import { AddToResearch, ResearchAnnotations } from "@/components/research-case-controls";
import { SocialCoverageState } from "@/components/social-coverage-state";
import { DatabaseNotice } from "@/components/database-notice";
import { TickerAccountIntelligence } from "@/components/ticker-account-intelligence";
import {
  CoverageBadge,
  QualityBadge,
  ResearchBriefActions,
} from "@/components/research-experience";
import { SaveBriefSnapshot } from "@/components/research-experience-actions";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  TableCell,
} from "@/components/ui";
import { getTickerAnalytics } from "@/lib/analytics/queries";
import { getTickerCatalysts } from "@/lib/catalysts/queries";
import { securityTypeCatalystLimitation } from "@/lib/catalysts/url";
import { getTicker, getTickerFrequency, getTickerHistory } from "@/lib/queries";
import { getTickerSocial, getTickerSocialResearch } from "@/lib/social/queries";
import { redditConfiguration } from "@/lib/social/config";
import {
  getCrossSourceTimeline,
  getResearchAnnotations,
  getTickerIntelligenceSummary,
} from "@/lib/cross-source/queries";
import type { IntelligenceSourceDomain } from "@/lib/cross-source/types";
import { getWorkspacePicker } from "@/lib/research/queries";
import {
  getTickerHighlights,
  getTickerResearchProfile,
} from "@/lib/research-experience/queries";
import { TICKER_BRIEF_VERSION } from "@/lib/research-experience/types";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ symbol }, p] = await Promise.all([params, searchParams]),
    ticker = await getTicker(decodeURIComponent(symbol));
  const redditProvider = redditConfiguration();
  if (ticker.configured && !ticker.error && !ticker.data) notFound();
  const t = ticker.data;
  if (!t)
    return (
      <>
        <PageHeader
          title={symbol.toUpperCase()}
          description="Ticker research profile"
        />
        <DatabaseNotice configured={ticker.configured} error={ticker.error} />
        <EmptyState
          title="Ticker unavailable"
          description="This symbol is not present in the connected database."
        />
      </>
    );
  const [history, frequency, intel, social, catalysts, socialResearch, summary, crossTimeline, workspaces, annotations, profile, highlights] = await Promise.all([
      getTickerHistory(t.id),
      getTickerFrequency(t.id),
      getTickerAnalytics(t.id),
      getTickerSocial(t.symbol),
      getTickerCatalysts(t.id),
      getTickerSocialResearch(t.id),
      getTickerIntelligenceSummary(t.id),
      getCrossSourceTimeline({tickerIds:[t.id],dataMode:p.dataMode==="effective"?"effective":"raw",sourceDomains:p.timelineSource?[p.timelineSource as IntelligenceSourceDomain]:undefined,page:Number(p.timelinePage)||1,pageSize:50}),
      getWorkspacePicker(),
      getResearchAnnotations({subjectType:"ticker",tickerId:t.id}),
      getTickerResearchProfile(t.id),
      getTickerHighlights(t.id),
    ]),
    a = intel.summary,
    s = t.ticker_statistics,
    historyTimeline = p.order === "asc" ? [...history.data].reverse() : history.data,
    brief = profile.data,
    amount = (v: unknown) =>
      v == null
        ? "—"
        : new Intl.NumberFormat("en-US", {
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(Number(v));
  return (
    <>
      <PageHeader
        title={t.symbol}
        description={`${t.company_name ?? "Ticker"} · executive historical intelligence brief with explicit coverage and RAW default.`}
        action={<ResearchBriefActions kind="ticker" id={t.symbol} dataMode={p.dataMode === "effective" ? "effective" : "raw"} />}
      />
      <DatabaseNotice
        configured={ticker.configured}
        error={
          ticker.error ||
          history.error ||
          frequency.error ||
          social.error ||
          catalysts.error || summary.error || crossTimeline.error || workspaces.error || annotations.error || profile.error || highlights.error
        }
      />
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <AddToResearch workspaces={workspaces.data} item={{itemType:"ticker",name:`${t.symbol} ticker case`,tickerId:t.id}} />
        <SaveBriefSnapshot workspaces={workspaces.data} brief={{briefType:"ticker",tickerId:t.id,title:`${t.symbol} Ticker Research Brief`,version:TICKER_BRIEF_VERSION,dataMode:p.dataMode==="effective"?"effective":"raw",provenance:{ticker_id:t.id,source_report_ids:highlights.data.recent.map((row:any)=>row.report_id),mover_ids:highlights.data.recent.map((row:any)=>row.id)},coverage:{catalyst_researched:brief?.catalyst_researched_count??0,social_researched:brief?.social_researched_count??0,quality_state:Number(brief?.unresolved_quality_findings)?"unresolved":"available"}}} />
      </div>
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Ticker Intelligence Brief</h2>
        <div className="panel p-5">
          <p className="text-sm leading-6">
            {t.symbol} appeared {brief?.total_appearances ?? 0} times across {brief?.distinct_report_dates ?? 0} imported report date(s). Catalyst research covers {brief?.catalyst_researched_count ?? 0} appearance(s), with {brief?.identified_catalyst_count ?? 0} identified nearby catalyst(s). Social research covers {brief?.social_researched_count ?? 0} recorded window(s); unresearched social history is not an absence claim.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>RAW default</Badge>
            <QualityBadge status={Number(brief?.unresolved_quality_findings) ? "unresolved" : Number(brief?.repaired_appearances) ? "repaired" : "clean"} />
            <CoverageBadge status={Number(brief?.catalyst_researched_count) ? Number(brief?.identified_catalyst_count) ? "complete_for_configured_sources" : "no_identified_catalyst" : "not_researched"} />
            <CoverageBadge status={Number(brief?.social_researched_count) ? Number(brief?.social_complete_count) ? "complete_for_provider_window" : "provider_limited" : redditProvider.ready ? "not_researched" : "approval_pending"} />
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Ticker Overview</h2>
        <div className="panel grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Company Name", t.company_name],
            ["Symbol", t.symbol],
            ["Exchange", t.primary_exchange ?? t.exchange],
            ["Security Type", t.security_type],
            ["Sector", t.sector],
            ["Industry", t.industry],
            ["Country", t.country],
            ["Market Cap", amount(t.market_cap)],
            ["Float", amount(t.float_shares)],
            ["Shares Outstanding", amount(t.shares_outstanding)],
            ["SEC CIK", t.cik],
            ["Metadata Source", t.enrichment_source],
            ["Last Metadata Update", t.metadata_updated_at],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="text-xs uppercase tracking-wide muted">
                {label}
              </div>
              <div className="mt-1 break-words text-sm">{value ?? "—"}</div>
            </div>
          ))}
          <div>
            <div className="text-xs uppercase tracking-wide muted">Website</div>
            <div className="mt-1 text-sm">
              {t.website ? (
                <a
                  className="text-blue-400"
                  href={t.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.website}
                </a>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Ticker Intelligence Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Market history" value={`${summary.data?.market_appearances??0} appearances`} detail={`${summary.data?.market_days??0} report days`} />
          <StatCard label="Catalyst coverage" value={`${summary.data?.catalyst_researched_appearances??0} researched`} detail={`${summary.data?.catalyst_identified_appearances??0} identified`} />
          <div className="panel p-4"><div className="text-xs muted">Social coverage</div><div className="mt-2"><SocialCoverageState coverageStatus={socialResearch.data.coverage[0]?.coverage_status} compact /></div></div>
          <StatCard label="Data quality" value={summary.data?.quality_status??"clean"} detail={`${summary.data?.quality_finding_count??0} findings / ${summary.data?.quality_repaired_fields??0} repairs`} />
          <StatCard label="Metadata" value={summary.data?.metadata_status??t.enrichment_status??"pending"} detail={summary.data?.metadata_provider??t.enrichment_source??"Not cached"} />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Repeat-Mover Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Appearances / Report Dates" value={`${brief?.total_appearances ?? 0} / ${brief?.distinct_report_dates ?? 0}`} />
          <StatCard label="Distinct Categories" value={brief?.distinct_categories ?? 0} detail={brief?.most_common_category ?? "No category history"} />
          <StatCard label="Average |Move|" value={brief?.average_absolute_change == null ? "—" : `${num(brief.average_absolute_change)}%`} detail={`${brief?.valid_change_denominator ?? 0} valid observation(s)`} />
          <StatCard label="Median |Move|" value={brief?.median_absolute_change == null ? "—" : `${num(brief.median_absolute_change)}%`} detail="Unresolved numeric fields excluded" />
          <StatCard label="Recurrence Gaps" value={`${brief?.shortest_recurrence_gap ?? "—"} / ${brief?.longest_recurrence_gap ?? "—"} days`} detail="Shortest / longest" />
          <StatCard label="Largest Positive" value={brief?.largest_positive_move == null ? "—" : `${num(brief.largest_positive_move)}%`} />
          <StatCard label="Largest Negative" value={brief?.largest_negative_move == null ? "—" : `${num(brief.largest_negative_move)}%`} />
          <StatCard label="Gainer Appearances" value={brief?.gainer_appearances ?? 0} />
          <StatCard label="Decliner Appearances" value={brief?.decliner_appearances ?? 0} />
          <StatCard label="Most Active" value={brief?.most_active_appearances ?? 0} />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Historical Move Highlights</h2>
        <div className="grid gap-5 xl:grid-cols-3">
          {([
            ["Largest Positive Moves", highlights.data.positive],
            ["Largest Negative Moves", highlights.data.negative],
            ["Highest Volume Appearances", highlights.data.volume],
          ] as const).map(([title, rows]) => (
            <div key={title}>
              <h3 className="mb-2 text-sm font-medium">{title}</h3>
              {rows.length ? <div className="panel divide-y divide-[#243044]">{rows.slice(0, 8).map((row: any) => <Link key={row.id} href={`/market-movers/${row.id}`} className="flex items-center justify-between gap-3 p-3 text-xs hover:bg-white/[.03]"><span><span className="text-blue-300">{row.report_date}</span><br/><span className="muted">{row.category_name}</span></span><span className="text-right">{row.raw_change_percent ?? "—"}%<br/><QualityBadge status={row.open_finding_count ? "flagged" : row.repaired_field_count ? "repaired" : "clean"} /></span></Link>)}</div> : <EmptyState title="No qualifying highlights" description="No valid bounded appearances are available for this section." />}
            </div>
          ))}
        </div>
      </section>
      <h2 className="mb-3 mt-8 font-semibold">Historical Intelligence</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Research Priority"
          value={num(a?.research_priority_score)}
        />
        <StatCard
          label="Recurrence Score"
          value={num(a?.recurrence_score)}
          detail={a?.recurrence_score_version}
        />
        <StatCard
          label="Mover Intensity"
          value={num(a?.mover_intensity_score)}
          detail={a?.mover_intensity_score_version}
        />
        <StatCard
          label="Classification"
          value={a?.mover_classification ?? "—"}
        />
        <StatCard
          label="Total Appearances"
          value={a?.total_appearances ?? s?.total_appearances ?? 0}
        />
        <StatCard
          label="Unique Report Days"
          value={a?.unique_report_days ?? 0}
        />
        <StatCard
          label="Average / Median Gap"
          value={a ? `${num(a.average_gap)} / ${num(a.median_gap)} days` : "—"}
        />
        <StatCard
          label="Largest Gain / Decline"
          value={
            a ? `${num(a.highest_gain)}% / ${num(a.largest_decline)}%` : "—"
          }
        />
      </div>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Research Reasons</h2>
        <div className="panel flex flex-wrap gap-2 p-4">
          {intel.reasons.length ? (
            intel.reasons.map((x: any) => (
              <Badge key={x.research_reason_types.code}>
                {x.research_reason_types.name}
              </Badge>
            ))
          ) : (
            <span className="muted">No derived reason tags.</span>
          )}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Historical Category Breakdown</h2>
        {frequency.data.length ? (
          <DataTable
            headers={["Category", "Appearances", "First Seen", "Last Seen"]}
          >
            {frequency.data.map((x: any) => (
              <tr key={x.category_id}>
                <TableCell>{x.category_name}</TableCell>
                <TableCell>{x.appearance_count}</TableCell>
                <TableCell>{x.first_seen}</TableCell>
                <TableCell>{x.last_seen}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No category frequency"
            description="No derived category recurrence exists."
          />
        )}
      </section>
      <section className="mt-8">
        <div className="mb-3 flex justify-between">
          <h2 className="font-semibold">Historical Timeline</h2>
          <div className="text-sm">
            <Link
              className={p.order !== "asc" ? "text-blue-400" : "muted"}
              href={`/tickers/${t.symbol}?order=desc`}
            >
              Newest first
            </Link>
            <span className="mx-2 muted">·</span>
            <Link
              className={p.order === "asc" ? "text-blue-400" : "muted"}
              href={`/tickers/${t.symbol}?order=asc`}
            >
              Oldest first
            </Link>
          </div>
        </div>
        {historyTimeline.length ? (
          <DataTable
            headers={[
              "Date",
              "Category",
              "Rank",
              "Price",
              "Change %",
              "Volume",
              "Accounts",
            ]}
          >
            {historyTimeline.map((x: any) => (
              <tr key={x.id}>
                <TableCell>
                  <Link
                    className="text-blue-400"
                    href={`/market-movers/${x.id}`}
                  >
                    {x.report_date}
                  </Link>
                </TableCell>
                <TableCell>{x.market_categories.name}</TableCell>
                <TableCell>{x.rank ?? "—"}</TableCell>
                <TableCell>{x.price ?? "—"}</TableCell>
                <TableCell>{x.change_percent ?? "—"}</TableCell>
                <TableCell>{x.volume ?? "—"}</TableCell>
                <TableCell>
                  <Link
                    className="text-blue-400"
                    href={`/market-movers/${x.id}`}
                  >
                    Pre-move research
                  </Link>
                </TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No timeline events"
            description="This ticker has no imported market-mover appearances."
          />
        )}
      </section>
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Catalysts / Public Events</h2>
          <CatalystResearchButton tickerId={t.id} />
        </div>
        <CatalystCoverage coverage={catalysts.data.coverage} />
        {securityTypeCatalystLimitation(t.security_type) && (
          <p className="mt-3 text-xs muted">
            {securityTypeCatalystLimitation(t.security_type)}
          </p>
        )}
        <div className="mt-4">
          <CatalystTimeline
            events={catalysts.data.events}
            movers={catalysts.data.appearances}
          />
        </div>
      </section>
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Social Activity & Coverage</h2><SocialResearchButton tickerId={t.id} enabled={redditProvider.ready} disabledReason={redditProvider.message}/></div>
        <div className="mb-4 grid gap-4 sm:grid-cols-5">
          <StatCard
            label="Mentions"
            value={social.data.stats?.total_mentions ?? 0}
          />
          <StatCard
            label="Accounts"
            value={social.data.stats?.unique_accounts ?? 0}
          />
          <StatCard
            label="Sources"
            value={social.data.stats?.unique_sources ?? 0}
          />
          <StatCard
            label="First Mention"
            value={social.data.stats?.first_mention ?? "—"}
          />
          <StatCard
            label="Last Mention"
            value={social.data.stats?.last_mention ?? "—"}
          />
        </div>
        {socialResearch.data.coverage.length ? <DataTable headers={["Source","Community","Window","Coverage","Posts","Comments","Accounts"]}>{socialResearch.data.coverage.map((x:any)=><tr key={x.id}><TableCell>{x.social_sources?.name}</TableCell><TableCell>{x.community??"Multiple"}</TableCell><TableCell>{x.date_from} – {x.date_to}</TableCell><TableCell><Badge>{x.coverage_status}</Badge></TableCell><TableCell>{x.posts_found}</TableCell><TableCell>{x.comments_found}</TableCell><TableCell>{x.accounts_found}</TableCell></tr>)}</DataTable>:<p className="mb-4 rounded border border-[#334158] p-3 text-sm muted">Not researched. No absence claim can be made for Reddit discussion.</p>}
        <h3 className="mb-3 mt-5 text-sm font-semibold">Resolved stored mentions</h3>
        {social.data.posts.length ? (
          <DataTable
            headers={[
              "Date / Time",
              "Source",
              "Community",
              "Username",
              "Excerpt",
            ]}
          >
            {social.data.posts.map((x: any) => {
              const post = x.social_posts;
              return (
                <tr key={post.id}>
                  <TableCell>{post.posted_at ?? "—"}</TableCell>
                  <TableCell>{post.social_sources?.name ?? "—"}</TableCell>
                  <TableCell>{post.social_communities?.name ?? "—"}</TableCell>
                  <TableCell>{post.social_accounts?.username ?? "—"}</TableCell>
                  <TableCell className="max-w-sm whitespace-normal">
                    <Link
                      className="text-blue-400"
                      href={`/social/posts/${post.id}`}
                    >
                      {(post.title ?? post.body ?? "Post").slice(0, 120)}
                    </Link>
                  </TableCell>
                </tr>
              );
            })}
          </DataTable>
        ) : <SocialCoverageState coverageStatus={socialResearch.data.coverage[0]?.coverage_status} />}
      </section>
      <CrossSourceTimeline result={crossTimeline.data} basePath={`/tickers/${t.symbol}`} params={p} activeSource={(p.timelineSource??"all") as IntelligenceSourceDomain|"all"} />
      <ResearchAnnotations subject={{subjectType:"ticker",tickerId:t.id}} initial={annotations.data} />
      <TickerAccountIntelligence tickerId={t.id} symbol={t.symbol} p={p} />
      <section className="panel mt-8 p-5 text-sm">
        <h2 className="font-semibold">Research Limitations</h2>
        <ul className="mt-3 space-y-1 muted">
          <li>• RAW observations remain the default; effective values appear only when explicitly selected.</li>
          <li>• Nearby catalysts are temporally related evidence and do not establish causation.</li>
          <li>• Social history is not exhaustive and is currently approval-pending when no recorded coverage exists.</li>
          <li>• Historical outcomes and similarity matches are descriptive, not predictions or recommendations.</li>
        </ul>
      </section>
    </>
  );
}
