import Link from "next/link";
import { MetadataRefreshButton } from "@/components/metadata-refresh-button";
import { Badge } from "@/components/ui";
import { getTickerQuality } from "@/lib/data-quality/queries";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = { pending: "Pending", enriching: "Enriching", complete: "Cached", enriched: "Cached", partial: "Partial", stale: "Stale", failed: "Failed", not_found: "Not found" };

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ symbol: string }> }) {
  const { symbol } = await params, db = await createClient();let ticker: any = null;
  if (db) { const result = await db.from("tickers").select("id,symbol,enrichment_status,enrichment_source,metadata_updated_at,next_metadata_refresh_at,enrichment_error").eq("symbol", decodeURIComponent(symbol).toUpperCase()).maybeSingle();ticker = result.data; }
  const quality = ticker ? await getTickerQuality(ticker.id) : null, summary = quality?.data.summary, status = ticker?.enrichment_status;
  return <>{ticker && <><div className="panel mb-3 flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex flex-wrap items-center gap-3 text-sm"><span>Metadata <Badge tone={status === "complete" || status === "enriched" ? "positive" : status === "failed" ? "negative" : "warning"}>{labels[status] ?? status}</Badge></span><span className="muted">Provider: {ticker.enrichment_source ?? "—"}</span><span className="muted">Last refreshed: {ticker.metadata_updated_at ?? "—"}</span><span className="muted">Next refresh: {ticker.next_metadata_refresh_at ?? "—"}</span>{ticker.enrichment_error && <span className="text-amber-300">{ticker.enrichment_error}</span>}</div><MetadataRefreshButton tickerId={ticker.id} /></div><div className="mb-5 flex justify-end"><Link href={`/data-quality?ticker=${encodeURIComponent(ticker.symbol)}`}><Badge tone={(summary?.high_severity_findings ?? 0) > 0 ? "warning" : (summary?.open_findings ?? 0) > 0 ? "neutral" : "positive"}>{(summary?.open_findings ?? 0) > 0 ? `Data Quality: ${summary.open_findings} finding(s)` : "Data Quality: Clean"}</Badge></Link></div></>}{children}</>;
}
