import Link from "next/link";
import { Badge, DataTable, EmptyState, TableCell } from "@/components/ui";

const value = (field:string, raw:unknown) => raw == null ? "UNKNOWN" : field === "change_percent" ? `${raw}%` : new Intl.NumberFormat("en-US", { maximumFractionDigits: field === "price" ? 6 : 2 }).format(Number(raw));
const tone = (band:string) => band === "HIGH" ? "positive" : band === "MEDIUM" ? "warning" : "negative";

export function DataQualityResolutionTable({ rows }: { rows:any[] }) {
  if (!rows.length) return <EmptyState title="No resolution candidates" description="No findings match the bounded server-side filters. Insufficient evidence never produces a fabricated repair." />;
  return <DataTable headers={["Priority","Ticker / Date","Field / Finding","RAW → Proposed","Confidence","Method / Status","Evidence & impact"]}>{rows.map(row => <tr key={row.finding_id}>
    <TableCell><Badge tone={row.priority_band === "critical" ? "negative" : row.priority_band === "high" ? "warning" : "neutral"}>{row.priority_band} · {row.resolution_priority_score}</Badge><div className="mt-1 max-w-40 whitespace-normal text-xs muted">{row.priority_reasons?.join(" · ")}</div></TableCell>
    <TableCell><Link href={`/tickers/${row.ticker_symbol}`} className="font-semibold text-blue-400">{row.ticker_symbol}</Link><div className="text-xs muted">{row.report_date}<br/>{row.source_filename}</div></TableCell>
    <TableCell>{row.field_name}<div className="text-xs muted">{row.finding_type}</div></TableCell>
    <TableCell>{value(row.field_name,row.original_value)} <span className="text-blue-300">→</span> {row.proposal_id ? value(row.field_name,row.proposed_value) : "NO SAFE CANDIDATE"}</TableCell>
    <TableCell><Badge tone={tone(row.confidence_band)}>{row.confidence_band}</Badge><div className="mt-1 text-xs muted">{Math.round(Number(row.proposal_confidence ?? row.finding_confidence) * 100)}% evidence confidence</div></TableCell>
    <TableCell>{row.proposal_method ?? "manual assistance"}<div className="text-xs muted">{row.resolution_status}{row.resolution_bulk_eligible ? " · bulk safe" : " · individual/group review"}</div></TableCell>
    <TableCell><details className="min-w-72 whitespace-normal"><summary className="cursor-pointer text-blue-400">Audit evidence and projected impact</summary><div className="mt-2 space-y-2 text-xs"><p>{row.proposal_reason ?? "Evidence is insufficient for a deterministic value proposal."}</p>{row.warnings?.length > 0 && <ul className="list-disc space-y-1 pl-4 text-amber-300">{row.warnings.map((warning:string) => <li key={warning}>{warning}</li>)}</ul>}<div>Source: {row.source_provenance?.sourceFilename ?? "unavailable"} · page {row.source_provenance?.sourcePageNumber ?? "unavailable"}</div><div>RAW remains default and unchanged. Approval creates an EFFECTIVE overlay only.</div><pre className="max-h-56 overflow-auto whitespace-pre-wrap">{JSON.stringify(row.impact_analysis, null, 2)}</pre><Link href={`/data-quality/${row.finding_id}`} className="text-blue-400">Open complete finding</Link></div></details></TableCell>
  </tr>)}</DataTable>;
}
