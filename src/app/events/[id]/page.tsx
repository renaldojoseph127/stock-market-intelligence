import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseNotice } from "@/components/database-notice";
import { CrossSourceTimeline } from "@/components/cross-source-timeline";
import { AddToResearch, ResearchAnnotations } from "@/components/research-case-controls";
import { SocialCoverageState } from "@/components/social-coverage-state";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  TableCell,
} from "@/components/ui";
import { getCatalystEvent } from "@/lib/catalysts/queries";
import { safeExternalUrl } from "@/lib/catalysts/url";
import {
  getCrossSourceTimeline,
  getEventIntelligenceSummary,
  getResearchAnnotations,
  getSocialBeforeCatalyst,
} from "@/lib/cross-source/queries";
import type { IntelligenceSourceDomain } from "@/lib/cross-source/types";
import { getWorkspacePicker } from "@/lib/research/queries";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, p] = await Promise.all([params, searchParams]);
  const result = await getCatalystEvent(id);
  const event = result.data;
  if (result.configured && !result.error && !event) notFound();
  if (!event)
    return (
      <>
        <PageHeader
          title="Catalyst Event"
          description="Public-event evidence detail."
        />
        <DatabaseNotice configured={result.configured} error={result.error} />
        <EmptyState
          title="Event unavailable"
          description="No matching catalyst event is available."
        />
      </>
    );
  const sourceUrl = safeExternalUrl(event.source_url);
  const documentUrl = safeExternalUrl(event.source_document_url);
  const dateOnly = !event.published_at;
  const [summary, timeline, workspaces, annotations, social] = await Promise.all([
    getEventIntelligenceSummary(id),
    getCrossSourceTimeline({eventId:id,dataMode:p.dataMode==="effective"?"effective":"raw",sourceDomains:p.timelineSource?[p.timelineSource as IntelligenceSourceDomain]:undefined,page:Number(p.timelinePage)||1,pageSize:50}),
    getWorkspacePicker(),
    getResearchAnnotations({subjectType:"catalyst",eventId:id}),
    getSocialBeforeCatalyst(id),
  ]);
  return (
    <>
      <PageHeader
        title={event.normalized_headline ?? event.headline ?? "Public event"}
        description={`${event.ticker_symbol} · observable evidence and temporal associations; causation is not inferred.`}
      />
      <DatabaseNotice configured={result.configured} error={result.error || summary.error || timeline.error || workspaces.error || annotations.error || social.error} />
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <AddToResearch workspaces={workspaces.data} item={{itemType:"catalyst",name:event.normalized_headline??event.headline??`${event.ticker_symbol} catalyst`,eventId:id,tickerId:event.ticker_id}} />
      </div>
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Mover relationships" value={summary.data?.mover_relationship_count??0} />
        <StatCard label="Before movers" value={summary.data?.related_before_movers??0} />
        <StatCard label="Same-day movers" value={summary.data?.related_same_day_movers??0} />
        <StatCard label="After movers" value={summary.data?.related_after_movers??0} />
        <div className="panel p-4"><div className="text-xs muted">Future social context</div><div className="mt-2"><SocialCoverageState coverageStatus={summary.data?.social_coverage_status} compact /></div></div>
      </section>
      <section className="panel grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Ticker", event.ticker_symbol],
          [
            dateOnly ? "Event date (date only)" : "Event timestamp",
            event.published_at ?? event.event_date,
          ],
          [
            "Observed fact",
            event.sec_form_type
              ? `${event.sec_form_type} SEC filing`
              : event.event_type,
          ],
          ["Normalized type", event.classified_type ?? event.event_type],
          ["Subtype", event.classified_subtype ?? event.event_subtype],
          [
            "Market session",
            dateOnly ? "unknown — no time supplied" : event.market_session,
          ],
          ["Primary source", event.registry_source_name ?? event.source_name],
          ["SEC accession", event.sec_accession_number],
          ["Ingestion", event.ingestion_method],
          ["Event status", event.event_status],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div className="text-xs uppercase muted">{label}</div>
            <div className="mt-1 break-words text-sm">{value ?? "—"}</div>
          </div>
        ))}
      </section>
      {dateOnly && (
        <p className="mt-3 text-xs text-amber-300">
          Only a filing/event date was available. No intraday publication time
          or same-day ordering has been invented.
        </p>
      )}

      <section className="mt-6 panel p-5">
        <h2 className="font-semibold">Description and source</h2>
        <p className="mt-2 text-sm">
          {event.normalized_description ??
            event.description ??
            "No normalized description is available."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {sourceUrl && (
            <a
              className="text-blue-400"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open primary source
            </a>
          )}
          {documentUrl && (
            <a
              className="text-blue-400"
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source document
            </a>
          )}
          {event.source_url && !sourceUrl && (
            <span className="text-amber-300">
              Unsafe or non-HTTPS source URL is not rendered.
            </span>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Classification evidence</h2>
        {event.classifications.length ? (
          <DataTable
            headers={[
              "Candidate",
              "Evidence confidence",
              "Reason",
              "Classifier",
              "Version",
            ]}
          >
            {event.classifications.map((row: any) => (
              <tr key={row.id}>
                <TableCell>
                  {row.candidate_type}
                  {row.candidate_subtype ? ` / ${row.candidate_subtype}` : ""}
                </TableCell>
                <TableCell>
                  {Math.round(Number(row.confidence) * 100)}%
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  {row.reason}
                </TableCell>
                <TableCell>{row.classifier_id}</TableCell>
                <TableCell>{row.classification_version}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="Unresolved classification"
            description="The source event is retained, but evidence does not support a more-specific deterministic classification."
          />
        )}
        <p className="mt-2 text-xs muted">
          Evidence confidence measures classification support. It is not the
          probability that this event caused a market move.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Social context and limitations</h2>
        {social.data.evidence.length ? (
          <DataTable headers={["Observed", "Community", "Account", "Relationship", "Evidence"]}>
            {social.data.evidence.map((row: any) => (
              <tr key={row.post_id}>
                <TableCell>{row.post_at}</TableCell>
                <TableCell>{row.community ?? "—"}</TableCell>
                <TableCell>{row.username ?? "Unavailable"}</TableCell>
                <TableCell>{row.relationship_type}</TableCell>
                <TableCell><Link className="text-blue-400" href={`/social/posts/${row.post_id}`}>Stored post</Link></TableCell>
              </tr>
            ))}
          </DataTable>
        ) : <SocialCoverageState coverageStatus={social.data.coverage[0]?.coverage_status} />}
      </section>

      <CrossSourceTimeline result={timeline.data} basePath={`/events/${id}`} params={p} activeSource={(p.timelineSource??"all") as IntelligenceSourceDomain|"all"} />

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Related market-mover appearances</h2>
        {event.relationships.length ? (
          <DataTable
            headers={[
              "Mover date",
              "Category",
              "Timing",
              "Relevance",
              "Reason",
            ]}
          >
            {event.relationships.map((row: any) => (
              <tr key={row.id}>
                <TableCell>
                  <Link
                    className="text-blue-400"
                    href={`/market-movers/${row.appearance_id}`}
                  >
                    {row.mover_date}
                  </Link>
                </TableCell>
                <TableCell>
                  {row.market_mover_appearances?.market_categories?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge>
                    {String(row.temporal_bucket).replaceAll("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>{row.catalyst_relevance}/100</TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  {row.reason}
                </TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No linked mover appearances"
            description="This event has not been temporally linked to an imported mover appearance."
          />
        )}
      </section>
      <ResearchAnnotations subject={{subjectType:"catalyst",eventId:id}} initial={annotations.data} />

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Filing document evidence</h2>
        {event.document_evidence.length ? (
          <DataTable
            headers={["Section", "Short evidence", "Retrieved", "Method"]}
          >
            {event.document_evidence.map((row: any) => (
              <tr key={row.id}>
                <TableCell>{row.document_section ?? "—"}</TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  {row.short_evidence}
                </TableCell>
                <TableCell>{row.retrieved_at}</TableCell>
                <TableCell>{row.extraction_method}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="Metadata-only filing evidence"
            description="No filing body was downloaded or copied into the event row. Document evidence is fetched and stored selectively under configured size limits."
          />
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Related or duplicate evidence</h2>
        {event.related_events.length ? (
          <DataTable
            headers={["Relationship", "Event", "Source", "Confidence"]}
          >
            {event.related_events.map((row: any) => (
              <tr key={`${row.cluster_id}:${row.event_id}`}>
                <TableCell>{row.relationship_type}</TableCell>
                <TableCell>
                  <Link
                    className="text-blue-400"
                    href={`/events/${row.event_id}`}
                  >
                    {row.ticker_events?.headline ?? row.event_id}
                  </Link>
                </TableCell>
                <TableCell>{row.ticker_events?.source_name ?? "—"}</TableCell>
                <TableCell>{row.confidence ?? "—"}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No clustered supporting sources"
            description="No confirmed duplicate, amendment, syndicated, or related-event link is recorded. Weak matches are never automatically merged."
          />
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Normalization and manual audit</h2>
        {event.normalization_history.length || event.manual_audit.length ? (
          <DataTable
            headers={["Time", "Action / classifier", "Actor", "Reason"]}
          >
            {[
              ...event.normalization_history.map((row: any) => ({
                id: row.id,
                at: row.created_at,
                action: `${row.classifier_id} ${row.classifier_version}`,
                actor: row.changed_by,
                reason: row.change_reason,
              })),
              ...event.manual_audit.map((row: any) => ({
                id: row.id,
                at: row.created_at,
                action: row.action,
                actor: row.actor,
                reason: row.reason,
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((row) => (
                <tr key={row.id}>
                  <TableCell>{row.at}</TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.actor}</TableCell>
                  <TableCell className="whitespace-normal">
                    {row.reason}
                  </TableCell>
                </tr>
              ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No interpretation changes"
            description="The original public-source event remains intact and no normalized correction has been recorded."
          />
        )}
      </section>
    </>
  );
}
