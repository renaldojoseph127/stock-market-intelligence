import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import { CoverageBadge, QualityBadge } from "@/components/research-experience";
import { Badge, DataTable, EmptyState, PageHeader, TableCell, TickerLink } from "@/components/ui";
import { getComparison } from "@/lib/research-experience/queries";

const values = (input?: string) =>
  [...new Set((input ?? "").split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 5);
const n = (value: unknown) => value == null ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ tickers?: string; movers?: string }>;
}) {
  const params = await searchParams;
  const tickerSymbols = values(params.tickers).map((symbol) => symbol.toUpperCase());
  const moverIds = values(params.movers);
  const result = await getComparison({ tickerSymbols, moverIds });
  const invalidTickerCount = tickerSymbols.length - result.data.tickers.length;
  const invalidMoverCount = moverIds.length - result.data.movers.length;
  return (
    <>
      <PageHeader title="Historical Comparison Workspace" description="Compare 2–5 tickers or mover appearances using persisted historical behavior, researched coverage denominators, and descriptive outcomes." />
      <DatabaseNotice configured={result.configured} error={result.error} />
      <form className="panel mb-6 grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="grid gap-1 text-xs muted">Ticker symbols (2–5, comma-separated)<input name="tickers" defaultValue={params.tickers} placeholder="NVDA,AAPL" className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white" /></label>
        <label className="grid gap-1 text-xs muted">Mover IDs (2–5, comma-separated)<input name="movers" defaultValue={params.movers} placeholder="UUID,UUID" className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white" /></label>
        <button className="rounded bg-blue-600 px-4 py-2 text-sm">Compare</button>
      </form>
      {(invalidTickerCount > 0 || invalidMoverCount > 0) && <p className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{invalidTickerCount} ticker symbol(s) and {invalidMoverCount} mover ID(s) were invalid or unavailable and were not compared.</p>}

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Ticker vs. Ticker</h2>
        {result.data.tickers.length ? (
          <DataTable headers={["Ticker", "Appearances", "Gainers", "Decliners", "Most Active", "Largest Gain", "Largest Decline", "Median |Move|", "Catalyst Researched", "Identified", "Quality Flags", "Social Researched"]}>
            {result.data.tickers.map((row: any) => (
              <tr key={row.ticker_id}>
                <TableCell><TickerLink symbol={row.symbol} /><div className="text-xs muted">{row.company_name ?? "Metadata unavailable"}</div></TableCell>
                <TableCell>{n(row.total_appearances)}</TableCell>
                <TableCell>{n(row.gainer_appearances)}</TableCell>
                <TableCell>{n(row.decliner_appearances)}</TableCell>
                <TableCell>{n(row.most_active_appearances)}</TableCell>
                <TableCell>{n(row.largest_positive_move)}%</TableCell>
                <TableCell>{n(row.largest_negative_move)}%</TableCell>
                <TableCell>{n(row.median_absolute_change)}%<div className="text-xs muted">n={n(row.valid_change_denominator)}</div></TableCell>
                <TableCell>{n(row.catalyst_researched_count)}<div className="text-xs muted">researched denominator</div></TableCell>
                <TableCell>{n(row.identified_catalyst_count)}</TableCell>
                <TableCell>{n(row.unresolved_quality_findings)}</TableCell>
                <TableCell>{n(row.social_researched_count)}<div className="text-xs muted">complete: {n(row.social_complete_count)}</div></TableCell>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Choose 2–5 tickers" description="Enter real ticker symbols from the database. Missing metadata remains explicit." />}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Mover vs. Mover</h2>
        {result.data.movers.length ? (
          <DataTable headers={["Market Observation", "Quality", "Catalyst Context", "Social Coverage", "Research Priority", "Historical Outcome"]}>
            {result.data.movers.map((row: any) => (
              <tr key={row.appearance_id}>
                <TableCell className="whitespace-normal"><Link className="font-semibold text-blue-400" href={`/market-movers/${row.appearance_id}`}>{row.symbol} · {row.report_date}</Link><div className="text-xs muted">{row.category_name} · price {n(row.price)} · change {n(row.change_percent)}% · volume {n(row.volume)}</div></TableCell>
                <TableCell><QualityBadge status={row.quality_status} /></TableCell>
                <TableCell><CoverageBadge status={row.catalyst_status} /></TableCell>
                <TableCell><CoverageBadge status={row.social_coverage_status} /></TableCell>
                <TableCell>{n(row.research_priority_score)}<div className="text-[10px] muted">{row.research_priority_version}</div></TableCell>
                <TableCell className="whitespace-normal text-xs"><div>1 session: {n(row.outcome?.return_1d)}</div><div>3 sessions: {n(row.outcome?.return_3d)}</div><div>7 sessions: {n(row.outcome?.return_7d)}</div><div>30 sessions: {n(row.outcome?.return_30d)}</div><div className="muted">After that past appearance</div></TableCell>
              </tr>
            ))}
          </DataTable>
        ) : <EmptyState title="Choose 2–5 mover appearances" description="Use mover IDs from real historical appearance pages. No placeholder comparison records are created." />}
      </section>

      {result.data.similarities.length > 0 && <section className="mb-8"><h2 className="mb-3 font-semibold">Pairwise Similarity</h2><DataTable headers={["Source mover", "Reference mover", "Similarity", "Why"]}>{result.data.similarities.map((row: any) => <tr key={`${row.source_appearance_id}-${row.reference_appearance_id}`}><TableCell><Link className="text-blue-400" href={`/market-movers/${row.source_appearance_id}`}>{row.source_appearance_id.slice(0, 8)}</Link></TableCell><TableCell><Link className="text-blue-400" href={`/market-movers/${row.reference_appearance_id}`}>{row.reference_symbol} · {row.reference_date}</Link></TableCell><TableCell><Badge>{n(row.similarity_score)}%</Badge><div className="text-[10px] muted">{row.similarity_algorithm_version}</div></TableCell><TableCell className="max-w-lg whitespace-normal text-xs muted">{(row.match_reasons ?? []).join(" · ")}</TableCell></tr>)}</DataTable></section>}

      <section className="panel p-5 text-sm"><h2 className="font-semibold">Comparison limitations</h2><p className="mt-2 muted">Similarity uses observation/context attributes only. Outcomes are joined after matching and are descriptive. Missing numeric fields remain unavailable. Coverage counts retain their explicit researched denominators.</p></section>
    </>
  );
}

