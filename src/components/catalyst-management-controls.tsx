"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/catalysts/manage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message ?? "Catalyst management action failed.");
  return result;
}

export function CatalystManagementControls({
  watchlists,
}: {
  watchlists: any[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await post(body);
      setMessage(
        result.message ?? `Processed ${result.processed ?? 0} request(s).`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <button
          disabled={busy}
          onClick={() => run({ action: "process", limit: 5 })}
          className="rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-50"
        >
          Process next batch (max 5)
        </button>
        <button
          disabled={busy}
          onClick={() => run({ action: "retry_failed", limit: 25 })}
          className="rounded border border-[#334158] px-4 py-2 text-sm disabled:opacity-50"
        >
          Retry failed (max 25)
        </button>
      </div>
      <form
        className="panel grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          run({
            action: "queue_selection",
            selection: f.get("selection"),
            symbols: f.get("symbols"),
            appearanceId: f.get("appearanceId"),
            watchlistId: f.get("watchlistId"),
            dateFrom: f.get("dateFrom"),
            dateTo: f.get("dateTo"),
            limit: f.get("limit"),
          });
        }}
      >
        <p className="sm:col-span-2 xl:col-span-4 text-sm font-semibold text-white">
          Research selected ticker, mover, watchlist, or bounded historical
          group
        </p>
        <label className="grid gap-1 text-xs muted">
          Selective scope
          <select
            name="selection"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          >
            <option value="selected_tickers">Selected ticker(s)</option>
            <option value="selected_mover">Selected mover</option>
            <option value="top_frequent">Top 25 frequent movers</option>
            <option value="top_gainers">Top Biggest Gainer tickers</option>
            <option value="watchlist">Watchlist tickers</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs muted">
          Ticker symbols
          <input
            name="symbols"
            placeholder="NVDA, AAPL"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-xs muted">
          Mover appearance UUID
          <input
            name="appearanceId"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-xs muted">
          Watchlist
          <select
            name="watchlistId"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          >
            <option value="">Select</option>
            {watchlists.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs muted">
          Date from
          <input
            type="date"
            name="dateFrom"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-xs muted">
          Date to
          <input
            type="date"
            name="dateTo"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-xs muted">
          Maximum tickers
          <input
            type="number"
            min="1"
            max="50"
            name="limit"
            defaultValue="25"
            className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          disabled={busy}
          className="self-end rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-50"
        >
          Queue selection
        </button>
        <p className="sm:col-span-2 xl:col-span-4 text-xs muted">
          All research is persisted, date-bounded, cache-first, and
          rate-limited. There is intentionally no “research all 4,247 tickers”
          action.
        </p>
      </form>
      {message && (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

export function ManualCatalystEventForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <form
      className="panel grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        try {
          const result = await post({
            action: "manual_event",
            symbol: f.get("symbol"),
            eventAt: new Date(String(f.get("eventAt"))).toISOString(),
            eventType: f.get("eventType"),
            eventSubtype: f.get("eventSubtype"),
            headline: f.get("headline"),
            sourceUrl: f.get("sourceUrl"),
            sourceName: f.get("sourceName"),
            notes: f.get("notes"),
            actor: f.get("actor"),
            reason: f.get("reason"),
          });
          setMessage(result.message);
          event.currentTarget.reset();
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }}
    >
      <label className="grid gap-1 text-xs muted">
        Ticker
        <input
          required
          name="symbol"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted">
        Event date/time
        <input
          required
          type="datetime-local"
          name="eventAt"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted">
        Event type
        <select
          name="eventType"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        >
          {[
            "news",
            "earnings",
            "sec_filing",
            "offering",
            "reverse_split",
            "stock_split",
            "fda",
            "contract",
            "merger",
            "acquisition",
            "analyst",
            "other",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs muted">
        Subtype
        <input
          name="eventSubtype"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted sm:col-span-2">
        Headline
        <input
          required
          name="headline"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted">
        HTTPS source URL
        <input
          required
          type="url"
          name="sourceUrl"
          pattern="https://.*"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted">
        Source name
        <input
          required
          name="sourceName"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted sm:col-span-2">
        Notes / evidence
        <input
          name="notes"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted">
        Admin actor
        <input
          required
          name="actor"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-xs muted">
        Entry reason
        <input
          required
          name="reason"
          className="rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      </label>
      <button className="rounded bg-blue-600 px-4 py-2 text-sm">
        Record sourced event
      </button>
      {message && <span className="self-center text-xs muted">{message}</span>}
    </form>
  );
}

export function ClusterReviewActions({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const decide = async (decision: string) => {
    try {
      const result = await post({
        action: "review_cluster",
        candidateId,
        decision,
        actor,
        reason,
      });
      setMessage(result.message);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="grid min-w-64 gap-2">
      <input
        value={actor}
        onChange={(event) => setActor(event.target.value)}
        placeholder="Admin actor"
        className="rounded border border-[#334158] bg-[#0c111b] px-2 py-1 text-xs text-white"
      />
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Review reason"
        className="rounded border border-[#334158] bg-[#0c111b] px-2 py-1 text-xs text-white"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => decide("confirm_same_event")}
          className="text-xs text-emerald-300"
        >
          Confirm same event
        </button>
        <button
          onClick={() => decide("separate")}
          className="text-xs text-red-300"
        >
          Separate
        </button>
        <button
          onClick={() => decide("leave_unresolved")}
          className="text-xs text-amber-300"
        >
          Leave unresolved
        </button>
      </div>
      {message && <span className="text-xs muted">{message}</span>}
    </div>
  );
}
