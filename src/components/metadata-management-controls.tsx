"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { metadataRequestMessage, type MetadataRequestResponse } from "@/lib/ticker-enrichment/request-contract";

export function MetadataManagementControls() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [symbol, setSymbol] = useState("");
  const [limit, setLimit] = useState("25");

  async function postQueue(url: string, body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Request failed");
      const queueCount = typeof data.queued === "number" ? data.queued : null;
      setMessage(queueCount !== null ? `${queueCount} ticker request(s) queued.` : `Processed ${Number(data.processed ?? 0)} queued ticker(s).`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function requestSelected() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/metadata/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, reason: "manual", force: false, sync: true }) });
      const data = await response.json() as MetadataRequestResponse & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Metadata request failed");
      setMessage(metadataRequestMessage(data));
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return <div className="panel p-5">
    <h2 className="font-semibold">Selective queue controls</h2>
    <p className="mt-1 text-sm muted">Queue only actively researched groups. Each worker request processes at most ten tickers and never enriches the full universe automatically.</p>
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <button disabled={busy} onClick={() => postQueue("/api/metadata/queue/process", { limit: 5 })} className="rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-50">Process next batch</button>
      <button disabled={busy} onClick={() => postQueue("/api/metadata/selective", { selector: "retry_failed", limit: 10 })} className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-50">Retry failed</button>
      <label className="grid gap-1 text-xs muted"><span>Top N</span><select value={limit} onChange={e => setLimit(e.target.value)} className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white">{[25, 50, 100].map(x => <option key={x}>{x}</option>)}</select></label>
      <button disabled={busy} onClick={() => postQueue("/api/metadata/selective", { selector: "top_popular", limit: Number(limit) })} className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-50">Enrich top popular</button>
      <button disabled={busy} onClick={() => postQueue("/api/metadata/selective", { selector: "watchlist", limit: Number(limit) })} className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-50">Queue watchlists</button>
      <button disabled={busy} onClick={() => postQueue("/api/metadata/selective", { selector: "recent_movers", limit: Number(limit) })} className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-50">Queue recent movers</button>
      <form onSubmit={e => { e.preventDefault(); if (symbol) void requestSelected(); }} className="flex items-end gap-2">
        <label className="grid gap-1 text-xs muted"><span>Selected ticker</span><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="w-28 rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white" placeholder="NVDA" /></label>
        <button disabled={busy || !symbol} className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-50">Request metadata</button>
      </form>
    </div>
    <p className="mt-2 text-xs muted">Selected requests use current cached metadata without a provider call. Use Refresh Metadata on a ticker page to force a budget-controlled provider refresh.</p>
    {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}
  </div>;
}
