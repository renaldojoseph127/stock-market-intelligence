import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CatalystCoverage,
  CatalystTimeline,
} from "@/components/catalyst-timeline";
import { CatalystResearchButton } from "@/components/catalyst-research-button";
import { SocialResearchButton } from "@/components/social-research-button";
import { MoverSocialContext } from "@/components/social-context";
import { CrossSourceTimeline } from "@/components/cross-source-timeline";
import { AddToResearch, ResearchAnnotations } from "@/components/research-case-controls";
import { SocialCoverageState } from "@/components/social-coverage-state";
import { DatabaseNotice } from "@/components/database-notice";
import {
  CoverageBadge,
  QualityBadge,
  ResearchBriefActions,
  SimilarHistoricalSetups,
} from "@/components/research-experience";
import { SaveBriefSnapshot } from "@/components/research-experience-actions";
import {
  DataTable,
  Badge,
  EmptyState,
  Field,
  FilterBar,
  PageHeader,
  StatCard,
  TableCell,
  TickerLink,
} from "@/components/ui";
import {
  getMoverAppearance,
  getMoverAppearanceAccounts,
} from "@/lib/account-intelligence/queries";
import {
  getMoverCatalysts,
  getMoverQualityWarning,
} from "@/lib/catalysts/queries";
import { securityTypeCatalystLimitation } from "@/lib/catalysts/url";
import { getMoverSocialContext } from "@/lib/social/queries";
import { redditConfiguration } from "@/lib/social/config";
import {
  getCrossSourceTimeline,
  getMoverIntelligenceSummary,
  getResearchAnnotations,
} from "@/lib/cross-source/queries";
import type { IntelligenceSourceDomain } from "@/lib/cross-source/types";
import { getWorkspacePicker } from "@/lib/research/queries";
import { getMoverResearchContext } from "@/lib/research-experience/queries";
import { MOVER_BRIEF_VERSION } from "@/lib/research-experience/types";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, p] = await Promise.all([params, searchParams]),
    window = [0, 1, 3, 7, 14, 30].includes(Number(p.window))
      ? Number(p.window)
      : 30,
    [mover, accounts, catalysts, quality, summary, crossTimeline, workspaces, annotations, researchContext] = await Promise.all([
      getMoverAppearance(id),
      getMoverAppearanceAccounts(id, window),
      getMoverCatalysts(id),
      getMoverQualityWarning(id),
      getMoverIntelligenceSummary(id),
      getCrossSourceTimeline({appearanceId:id,dataMode:p.dataMode==="effective"?"effective":"raw",sourceDomains:p.timelineSource?[p.timelineSource as IntelligenceSourceDomain]:undefined,page:Number(p.timelinePage)||1,pageSize:50}),
      getWorkspacePicker(),
      getResearchAnnotations({subjectType:"mover",appearanceId:id}),
      getMoverResearchContext(id),
    ]),
    m = mover.data;
  const redditProvider = redditConfiguration();
  if (mover.configured && !mover.error && !m) notFound();
  if (!m)
    return (
      <>
        <PageHeader
          title="Mover Appearance"
          description="Historical account and catalyst drill-down."
        />
        <DatabaseNotice configured={mover.configured} error={mover.error} />
        <EmptyState
          title="Mover unavailable"
          description="No matching market-mover appearance exists."
        />
      </>
    );
  const socialContext=await getMoverSocialContext(m.id,m.ticker_id,m.report_date);
  return (
    <>
      <PageHeader
        title={`${m.tickers.symbol} — ${m.report_date}`}
        description={`${m.market_categories.name}. Main historical mover research brief; timing is descriptive and does not establish causation.`}
        action={<ResearchBriefActions kind="mover" id={m.id} dataMode={p.dataMode === "effective" ? "effective" : "raw"} />}
      />
      <DatabaseNotice
        configured={mover.configured}
        error={mover.error || accounts.error || catalysts.error || socialContext.error || summary.error || crossTimeline.error || workspaces.error || annotations.error || researchContext.error}
      />
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <AddToResearch workspaces={workspaces.data} item={{itemType:"mover",name:`${m.tickers.symbol} ${m.report_date} mover`,appearanceId:m.id,tickerId:m.ticker_id}} />
        <SaveBriefSnapshot workspaces={workspaces.data} brief={{briefType:"mover",tickerId:m.ticker_id,appearanceId:m.id,title:`${m.tickers.symbol} ${m.report_date} Mover Research Brief`,version:MOVER_BRIEF_VERSION,dataMode:p.dataMode==="effective"?"effective":"raw",provenance:{ticker_id:m.ticker_id,source_report_id:m.report_id,mover_id:m.id},coverage:{catalyst_status:summary.data?.catalyst_status??"not_researched",social_status:summary.data?.social_coverage_status??"not_researched",quality_status:summary.data?.quality_status??"clean"}}} />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-5">
        <StatCard label="Category" value={m.market_categories.name} />
        <StatCard label={`Price ${p.dataMode==="effective"?"EFFECTIVE":"RAW"}`} value={(p.dataMode==="effective"?summary.data?.effective_price:summary.data?.raw_price)??"—"} detail={p.dataMode==="effective"&&String(summary.data?.effective_price)!==String(summary.data?.raw_price)?`Repaired from raw ${summary.data?.raw_price}`:undefined} />
        <StatCard label={`Change % ${p.dataMode==="effective"?"EFFECTIVE":"RAW"}`} value={(p.dataMode==="effective"?summary.data?.effective_change_percent:summary.data?.raw_change_percent)??"—"} detail={p.dataMode==="effective"&&String(summary.data?.effective_change_percent)!==String(summary.data?.raw_change_percent)?`Repaired from raw ${summary.data?.raw_change_percent}`:undefined} />
        <StatCard label={`Volume ${p.dataMode==="effective"?"EFFECTIVE":"RAW"}`} value={(p.dataMode==="effective"?summary.data?.effective_volume:summary.data?.raw_volume)??"—"} detail={p.dataMode==="effective"&&String(summary.data?.effective_volume)!==String(summary.data?.raw_volume)?`Repaired from raw ${summary.data?.raw_volume}`:undefined} />
        <StatCard label={`Rank ${p.dataMode==="effective"?"EFFECTIVE":"RAW"}`} value={(p.dataMode==="effective"?summary.data?.effective_rank:summary.data?.raw_rank)??"—"} />
      </div>
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Quality state" value={summary.data?.quality_status??"clean"} detail={`${summary.data?.finding_count??0} finding(s) · ${summary.data?.repaired_field_count??0} repaired field(s)`} />
        <StatCard label="Catalysts before move" value={summary.data?.catalysts_before_move??0} />
        <StatCard label="Same-day events" value={summary.data?.catalysts_same_day??0} />
        <StatCard label="Events after move" value={summary.data?.catalysts_after_move??0} />
        <StatCard label="Nearby catalysts" value={summary.data?.catalyst_count??0} detail={summary.data?.catalyst_status??"not_researched"} />
        <div className="panel p-4"><div className="text-xs muted">Social coverage</div><div className="mt-2"><SocialCoverageState coverageStatus={summary.data?.social_coverage_status} compact /></div></div>
      </section>
      <section className="mb-8 grid gap-5 xl:grid-cols-[1fr_2fr]">
        <div className="panel p-5">
          <h2 className="font-semibold">Research Priority</h2>
          <div className="mt-3 text-3xl font-semibold tabular-nums">{researchContext.data.priority?.research_priority_score ?? "—"}</div>
          <div className="text-xs muted">{researchContext.data.priority?.research_priority_version ?? "historical-research-priority-v1"}</div>
          <ul className="mt-4 space-y-1 text-xs muted">
            {(researchContext.data.priority?.research_priority_reasons ?? []).map((reason: string) => <li key={reason}>• {reason}</li>)}
          </ul>
          <p className="mt-4 text-xs muted">Historical investigation priority only. Future outcomes and later discussion are excluded.</p>
        </div>
        <div className="panel p-5">
          <h2 className="font-semibold">Observation Summary</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-xs muted">Ticker / date</div><div>{m.tickers.symbol} · {m.report_date}</div></div>
            <div><div className="text-xs muted">Category</div><div>{m.market_categories.name}</div></div>
            <div><div className="text-xs muted">Quality</div><div className="mt-1"><QualityBadge status={summary.data?.quality_status} /></div></div>
            <div><div className="text-xs muted">Catalyst coverage</div><div className="mt-1"><CoverageBadge status={summary.data?.catalyst_status} /></div></div>
            <div><div className="text-xs muted">Social coverage</div><div className="mt-1"><CoverageBadge status={summary.data?.social_coverage_status === "not_researched" && !redditProvider.ready ? "approval_pending" : summary.data?.social_coverage_status} /></div></div>
            <div><div className="text-xs muted">Data mode</div><div>{p.dataMode === "effective" ? "EFFECTIVE (approved overlay)" : "RAW (default)"}</div></div>
          </div>
        </div>
      </section>
      <MoverSocialContext data={socialContext.data}/>
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Nearby Catalysts</h2>
            <Badge>Market data: raw</Badge>
          </div>
          <div className="flex flex-wrap gap-2"><SocialResearchButton tickerId={m.ticker_id} appearanceId={m.id} enabled={redditProvider.ready} disabledReason={redditProvider.message}/><CatalystResearchButton tickerId={m.ticker_id} appearanceId={m.id} /></div>
        </div>
        <CatalystCoverage coverage={catalysts.data.coverage} />
        {quality.data && (
          <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Market observation has {quality.data.count} unresolved high/critical
            data-quality finding(s). The catalyst relationship is retained;
            inspect Data Quality before relying on displayed market values.
          </p>
        )}
        {securityTypeCatalystLimitation(m.tickers.security_type) && (
          <p className="mt-3 text-xs muted">
            {securityTypeCatalystLimitation(m.tickers.security_type)}
          </p>
        )}
        <div className="mt-4">
          <CatalystTimeline
            events={catalysts.data.events}
            movers={[
              {
                id: m.id,
                report_date: m.report_date,
                category_name: m.market_categories.name,
                change_percent: m.change_percent,
                volume: m.volume,
              },
            ]}
          />
        </div>
      </section>
      <CrossSourceTimeline result={crossTimeline.data} basePath={`/market-movers/${m.id}`} params={p} activeSource={(p.timelineSource??"all") as IntelligenceSourceDomain|"all"} />
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Similar Historical Setups</h2>
        <p className="mb-3 text-xs muted">Deterministic attribute-only matching. Historical outcomes are joined after ranking and cannot influence similarity.</p>
        <SimilarHistoricalSetups rows={researchContext.data.similarities} />
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Historical Outcome</h2>
        {researchContext.data.outcome ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Reference Price" value={researchContext.data.outcome.reference_price ?? "—"} />
          <StatCard label="1 Session" value={researchContext.data.outcome.return_1d ?? "—"} detail="After this past appearance" />
          <StatCard label="3 Sessions" value={researchContext.data.outcome.return_3d ?? "—"} detail="After this past appearance" />
          <StatCard label="7 Sessions" value={researchContext.data.outcome.return_7d ?? "—"} detail="After this past appearance" />
          <StatCard label="30 Sessions" value={researchContext.data.outcome.return_30d ?? "—"} detail="After this past appearance" />
          <StatCard label="Price Coverage" value="Available" detail="Descriptive; not expected return" />
        </div> : <EmptyState title="Historical outcome unavailable" description="No valid price history covers the required post-appearance sessions. No value is imputed." />}
      </section>
      <form>
        <FilterBar>
          <Field
            label="Mention window"
            name="window"
            defaultValue={String(window)}
            options={["0", "1", "3", "7", "14", "30"]}
          />
          <button className="rounded bg-blue-600 px-4 py-2 text-sm">
            Apply
          </button>
        </FilterBar>
      </form>
      {accounts.data.length ? (
        <DataTable
          headers={[
            "Account",
            "Ticker",
            "Mention",
            "Days Before",
            "Timing",
            "Platform",
            "Community",
            "Original Post",
          ]}
        >
          {accounts.data.map((x: any) => (
            <tr key={x.id}>
              <TableCell>
                <Link
                  className="text-blue-400"
                  href={`/promoters/${x.account_id}`}
                >
                  {x.username}
                </Link>
              </TableCell>
              <TableCell>
                <TickerLink symbol={x.symbol} />
              </TableCell>
              <TableCell>{x.mention_at}</TableCell>
              <TableCell>{x.days_before_mover}</TableCell>
              <TableCell>
                {x.relationship_type === "mover_day"
                  ? "Same calendar day"
                  : "Before mover date"}
              </TableCell>
              <TableCell>{x.platform}</TableCell>
              <TableCell>{x.community ?? "—"}</TableCell>
              <TableCell>
                <Link
                  className="text-blue-400"
                  href={`/social/posts/${x.post_id}`}
                >
                  View evidence
                </Link>
              </TableCell>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No account mentions in this window"
          description="No qualifying stored account evidence is available. Check the social coverage state before interpreting this absence."
        />
      )}
      <p className="mt-3 text-xs muted">
        Window 0 means same calendar day. Scanz lacks an intraday mover
        timestamp, so same-day sequence is not inferred.
      </p>
      <ResearchAnnotations subject={{subjectType:"mover",appearanceId:m.id}} initial={annotations.data} />
      <section className="panel mt-8 p-5 text-sm">
        <h2 className="font-semibold">Research Limitations</h2>
        <ul className="mt-3 space-y-1 muted"><li>• This is historical research, not a recommendation or forecast.</li><li>• Nearby catalyst evidence is temporally related; causation is not inferred.</li><li>• Social absence is never claimed without complete recorded provider coverage.</li><li>• RAW remains the default and source observations are never rewritten.</li></ul>
      </section>
    </>
  );
}
