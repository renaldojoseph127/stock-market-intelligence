import Link from "next/link";
import { DataQualityResolutionControls } from "@/components/data-quality-resolution-controls";
import { DataQualityResolutionTable } from "@/components/data-quality-resolution-table";
import { DatabaseNotice } from "@/components/database-notice";
import { DateRangeFilter, Field, FilterBar, PageHeader, StatCard } from "@/components/ui";
import { getDataQualityResolution } from "@/lib/data-quality/queries";

const n = (value:unknown) => new Intl.NumberFormat("en-US").format(Number(value ?? 0));
export const dynamic = "force-dynamic";

export default async function DataQualityResolutionPage({ searchParams }: { searchParams:Promise<Record<string,string|undefined>> }) {
  const p = await searchParams, result = await getDataQualityResolution(p), { summary:s, rows, breakdowns, pageSize, nextCursor } = result.data;
  const next = nextCursor ? `?${new URLSearchParams({ ...p, cursor:nextCursor } as Record<string,string>).toString()}` : null;
  const dimensions = Map.groupBy(breakdowns, (row:any) => row.dimension);
  return <><PageHeader title="Data Quality Resolution & Confidence Engine" description="Deterministic, auditable repair assistance. RAW observations remain immutable and default; EFFECTIVE overlays require explicit approval." action={<div className="flex gap-2"><Link href="/data-quality/review" className="rounded bg-blue-600 px-4 py-2 text-sm">Batch Review</Link><Link href="/data-quality/repairs" className="rounded border border-[#334158] px-4 py-2 text-sm">Approved Overlays</Link></div>} />
    <DatabaseNotice configured={result.configured} error={result.error} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Unresolved Findings",s?.unresolved_findings],["Repairable High Confidence",s?.repairable_high_confidence],["Medium Review Queue",s?.medium_confidence_queue],["Low / Manual Queue",s?.low_confidence_manual_queue],["Approved Overlays",s?.approved_overlays],["Affected Appearances",s?.affected_appearances],["Clean RAW Coverage",s ? `${s.clean_raw_coverage_percent}%` : "—"],["EFFECTIVE Overlay Coverage",s ? `${s.effective_overlay_coverage_percent}%` : "—"]].map(([label,v]) => <StatCard key={String(label)} label={String(label)} value={typeof v === "number" ? n(v) : v as string ?? "—"} />)}</section>
    <section className="my-6"><DataQualityResolutionControls /></section>
    <form><FilterBar><Field label="Exact ticker" name="ticker" defaultValue={p.ticker} placeholder="NVDA" /><DateRangeFilter from={p.from} to={p.to} /><Field label="Field" name="field" defaultValue={p.field} options={["price","change_percent","trades","volume","dollar_volume"]} /><Field label="Finding type" name="findingType" defaultValue={p.findingType} options={["possible_missing_decimal","possible_column_shift","ocr_alignment_error","cross_field_inconsistency","ticker_sequence_outlier"]} /><Field label="Repair method" name="method" defaultValue={p.method} options={["decimal_restoration","column_realignment","cross_field_validation","cross_day_continuity","source_line_reparse"]} /><Field label="Confidence band" name="confidenceBand" defaultValue={p.confidenceBand} options={["HIGH","MEDIUM","LOW"]} /><Field label="Status" name="status" defaultValue={p.status ?? "unresolved"} options={["unresolved","pending","approved","rejected","open","proposed"]} /><Field label="Priority" name="priority" defaultValue={p.priority} options={["critical","high","medium","low"]} /><Field label="Page size" name="pageSize" defaultValue={String(pageSize)} options={["25","50","100"]} /><button className="rounded bg-blue-600 px-4 py-2 text-sm">Apply filters</button></FilterBar></form>
    <DataQualityResolutionTable rows={rows} />
    <div className="mt-4 flex justify-between text-sm"><Link href="/data-quality/resolution" className="text-blue-400">First prioritized page</Link><span className="muted">Bounded to {pageSize} rows · keyset pagination</span>{next ? <Link href={next} className="text-blue-400">Next prioritized page</Link> : <span />}</div>
    <section className="mt-8"><h2 className="font-semibold">Resolution coverage breakdowns</h2><p className="mt-1 text-sm muted">Auditable counts across fields, finding types, methods, confidence bands, and lifecycle status.</p><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...dimensions.entries()].map(([dimension,values]:any) => <div key={dimension} className="panel p-4"><h3 className="font-medium capitalize">{String(dimension).replaceAll("_"," ")}</h3><div className="mt-3 space-y-2 text-sm">{values.map((row:any) => <div key={row.group_key} className="flex justify-between gap-3"><span className="muted">{row.group_key}</span><span>{n(row.item_count)} · {n(row.affected_appearances)} appearances</span></div>)}</div></div>)}</div></section>
  </>;
}
