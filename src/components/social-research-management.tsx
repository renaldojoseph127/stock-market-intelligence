"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const field = "rounded border border-[#334158] bg-[#0c111b] p-2 text-white";

export function SocialResearchManagement({
  providerEnabled,
  blockedReason,
}: {
  providerEnabled: boolean;
  blockedReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function post(body: any) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/social-research/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Action failed");
      setMessage(
        result.message ??
          `Queued or processed ${result.queued ?? result.claimed ?? result.retried ?? 0} item(s).`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap gap-3 p-4">
        <button
          disabled={busy || !providerEnabled}
          title={providerEnabled ? "Process bounded jobs" : blockedReason}
          onClick={() => post({ action: "process", limit: 5 })}
          className="rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-40"
        >
          Process next batch (max 5)
        </button>
        <button
          disabled={busy || !providerEnabled}
          title={providerEnabled ? "Retry failed jobs" : blockedReason}
          onClick={() => post({ action: "retry", limit: 25 })}
          className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-40"
        >
          Retry failed (max 25)
        </button>
        {!providerEnabled && <p className="w-full text-xs text-amber-300">{blockedReason}</p>}
      </div>
      <form
        className="panel grid gap-3 p-4 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          post({
            action: "queue_selection",
            selection: form.get("selection"),
            symbols: form.get("symbols"),
            appearanceId: form.get("appearanceId") || null,
            watchlistId: form.get("watchlistId") || null,
            limit: Number(form.get("limit")) || 10,
            community: form.get("community") || null,
          });
        }}
      >
        <label className="grid gap-1 text-xs muted">
          Bounded selection
          <select name="selection" className={field}>
            <option value="selected_tickers">Ticker symbols</option>
            <option value="selected_mover">Selected mover</option>
            <option value="watchlist">Watchlist</option>
            <option value="recent_movers">Recent movers</option>
            <option value="top_frequent">Top frequent</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs muted">
          Ticker / appearance / watchlist
          <input name="symbols" placeholder="NVDA, AAPL" className={field} />
          <input name="appearanceId" placeholder="Appearance UUID" className={`${field} mt-1`} />
          <input name="watchlistId" placeholder="Watchlist UUID" className={`${field} mt-1`} />
        </label>
        <label className="grid gap-1 text-xs muted">
          Community (optional)
          <input name="community" placeholder="wallstreetbets" className={field} />
        </label>
        <label className="grid gap-1 text-xs muted">
          Maximum tickers
          <input name="limit" type="number" min="1" max="50" defaultValue="10" className={field} />
          <button disabled={busy || !providerEnabled} className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-40">
            Queue selection
          </button>
        </label>
        {message && <p className="text-xs muted sm:col-span-4">{message}</p>}
      </form>
    </div>
  );
}
