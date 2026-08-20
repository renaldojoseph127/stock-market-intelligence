import Link from "next/link";
import {
  Badge,
  DataTable,
  DateRangeFilter,
  EmptyState,
  Field,
  FilterBar,
  TableCell,
  TickerLink,
} from "./ui";

const number = (value: unknown, digits = 2) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });

export function QualityBadge({ status }: { status?: string | null }) {
  const normalized = status === "review_recommended" ? "unresolved" : status ?? "clean";
  const tone = normalized === "clean" ? "positive" : normalized === "repaired" ? "neutral" : "warning";
  return <Badge tone={tone}>{normalized.replaceAll("_", " ")}</Badge>;
}

export function CoverageBadge({ status }: { status?: string | null }) {
  const normalized = status ?? "not_researched";
  const tone = ["complete_for_provider_window", "complete_for_configured_sources"].includes(normalized)
    ? "positive"
    : ["failed"].includes(normalized)
      ? "negative"
      : "warning";
  const label =
    normalized === "not_researched"
      ? "Not Researched"
      : normalized === "approval_pending" || normalized === "approval_blocked"
        ? "Approval Pending"
        : normalized.replaceAll("_", " ");
  return <Badge tone={tone}>{label}</Badge>;
}

export function SourceBadge({ source }: { source: "scanz" | "sec" | "alpha_vantage" | "repair" | "reddit_pending" | "user_note" }) {
  const labels = {
    scanz: "Scanz",
    sec: "SEC EDGAR",
    alpha_vantage: "Alpha Vantage metadata",
    repair: "Effective repair overlay",
    reddit_pending: "Reddit pending",
    user_note: "User note",
  };
  return <Badge>{labels[source]}</Badge>;
}

export function ResearchCandidateFilters({
  params,
  categories,
  actionLabel = "Apply filters",
}: {
  params: Record<string, string | undefined>;
  categories: any[];
  actionLabel?: string;
}) {
  return (
    <form>
      <FilterBar>
        <DateRangeFilter from={params.from} to={params.to} />
        <Field label="Ticker" name="ticker" defaultValue={params.ticker} placeholder="Symbol" />
        <Field label="Exchange" name="exchange" defaultValue={params.exchange} options={["NASDAQ", "NYSE", "OTC", "PENNY"]} />
        <Field label="Category" name="category" defaultValue={params.category} options={categories.map((row) => row.id)} />
        <Field label="Minimum |change| %" name="magnitude" type="number" defaultValue={params.magnitude} />
        <Field label="Catalyst" name="catalyst" defaultValue={params.catalyst} options={["catalyst_found", "no_identified_catalyst", "research_partial", "not_researched"]} />
        <Field label="Quality" name="quality" defaultValue={params.quality} options={["clean", "flagged", "repaired", "unresolved"]} />
        <Field label="Social coverage" name="social" defaultValue={params.social} options={["not_researched", "provider_limited", "complete_for_provider_window", "failed"]} />
        <Field label="Repeat mover" name="repeat" defaultValue={params.repeat} options={["yes", "no"]} />
        <Field label="Saved research" name="saved" defaultValue={params.saved} options={["yes", "no"]} />
        <Field label="Page size" name="pageSize" defaultValue={params.pageSize ?? "50"} options={["20", "50", "100"]} />
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium">{actionLabel}</button>
        <Link className="rounded-md border border-[#334158] px-4 py-2 text-sm" href="?">Reset</Link>
      </FilterBar>
    </form>
  );
}

export function ResearchCandidatesTable({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState title="No matching historical appearances" description="No persisted historical observation satisfies every selected research filter." />;
  return (
    <DataTable headers={["Ticker", "Date", "Category", "Change", "Repeat", "Catalyst", "Quality", "Social", "Priority", "Why"]}>
      {rows.map((row) => (
        <tr key={row.appearance_id}>
          <TableCell><TickerLink symbol={row.symbol} /></TableCell>
          <TableCell><Link className="text-blue-400" href={`/market-movers/${row.appearance_id}`}>{row.report_date}</Link></TableCell>
          <TableCell>{row.category_name}</TableCell>
          <TableCell>{number(row.change_percent)}%</TableCell>
          <TableCell>{number(row.repeat_count, 0)}</TableCell>
          <TableCell><CoverageBadge status={row.catalyst_status} /></TableCell>
          <TableCell><QualityBadge status={row.quality_status} /></TableCell>
          <TableCell><CoverageBadge status={row.social_coverage_status} /></TableCell>
          <TableCell><span className="font-semibold tabular-nums">{number(row.research_priority_score)}</span><div className="text-[10px] muted">{row.research_priority_version}</div></TableCell>
          <TableCell className="max-w-sm whitespace-normal">
            <ul className="space-y-1 text-xs muted">
              {(row.research_priority_reasons ?? []).map((reason: string) => <li key={reason}>• {reason}</li>)}
            </ul>
          </TableCell>
        </tr>
      ))}
    </DataTable>
  );
}

export function SimilarHistoricalSetups({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <EmptyState title="No comparable historical setups" description="No qualifying matches were available from valid observation/context attributes." />;
  return (
    <DataTable headers={["Similarity", "Ticker", "Date", "Category", "Change", "Why matched", "Historical outcomes"]}>
      {rows.map((row) => (
        <tr key={row.reference_appearance_id}>
          <TableCell><span className="font-semibold">{number(row.similarity_score)}%</span><div className="text-[10px] muted">{row.similarity_algorithm_version}</div></TableCell>
          <TableCell><TickerLink symbol={row.reference_symbol} /></TableCell>
          <TableCell><Link className="text-blue-400" href={`/market-movers/${row.reference_appearance_id}`}>{row.reference_date}</Link></TableCell>
          <TableCell>{row.reference_category}</TableCell>
          <TableCell>{number(row.reference_change_percent)}%</TableCell>
          <TableCell className="max-w-xs whitespace-normal"><ul className="text-xs muted">{(row.match_reasons ?? []).map((reason: string) => <li key={reason}>• {reason}</li>)}</ul></TableCell>
          <TableCell className="whitespace-normal text-xs">
            <div>1 session: {number(row.return_1d)}</div>
            <div>3 sessions: {number(row.return_3d)}</div>
            <div>7 sessions: {number(row.return_7d)}</div>
            <div>30 sessions: {number(row.return_30d)}</div>
            <div className="mt-1 muted">After that past appearance; not a forecast.</div>
          </TableCell>
        </tr>
      ))}
    </DataTable>
  );
}

export function ResearchBriefActions({
  kind,
  id,
  dataMode = "raw",
}: {
  kind: "ticker" | "mover";
  id: string;
  dataMode?: "raw" | "effective";
}) {
  const base = `/api/research-briefs/${kind}/${encodeURIComponent(id)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs muted">Research brief ({dataMode.toUpperCase()})</span>
      {(["html", "pdf", "json", "csv"] as const).map((format) => (
        <a key={format} className="rounded border border-[#334158] px-3 py-2 text-xs uppercase text-blue-300" href={`${base}?format=${format}&dataMode=${dataMode}`} target={format === "html" ? "_blank" : undefined} rel="noreferrer">
          {format}
        </a>
      ))}
    </div>
  );
}

export function Pagination({
  path,
  params,
  page,
  pageSize,
  total,
}: {
  path: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const href = (next: number) =>
    `${path}?${new URLSearchParams({ ...params, page: String(next), pageSize: String(pageSize) } as Record<string, string>).toString()}`;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? <Link className="text-blue-400" href={href(page - 1)}>Previous</Link> : <span />}
      <span className="muted">Page {page} · {number(total, 0)} matching historical appearances</span>
      {page * pageSize < total ? <Link className="text-blue-400" href={href(page + 1)}>Next</Link> : <span />}
    </div>
  );
}

