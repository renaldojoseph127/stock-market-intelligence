"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";

export function SocialResearchPreview() {
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/social/research/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Preview failed.");
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-semibold">Social Research Planner Preview</h2>
      <form
        className="panel grid gap-3 p-4 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          request({
            ticker: form.get("ticker"),
            appearanceId: form.get("appearanceId") || null,
            community: form.get("community") || "wallstreetbets",
            window: Number(form.get("window")) || 30,
          });
        }}
      >
        {[
          ["Ticker", "ticker", "NVDA"],
          ["Mover appearance (optional)", "appearanceId", "UUID"],
          ["Community", "community", "wallstreetbets"],
        ].map(([label, name, placeholder]) => (
          <label className="grid gap-1 text-xs muted" key={name}>
            {label}
            <input
              required={name === "ticker"}
              name={name}
              placeholder={placeholder}
              defaultValue={name === "community" ? "wallstreetbets" : undefined}
              className="rounded border border-[#334158] bg-[#0c111b] p-2 text-white"
            />
          </label>
        ))}
        <label className="grid gap-1 text-xs muted">
          Days before mover
          <input
            name="window"
            type="number"
            min="0"
            max="90"
            defaultValue="30"
            className="rounded border border-[#334158] bg-[#0c111b] p-2 text-white"
          />
          <button disabled={busy} className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Planning…" : "Preview only — zero provider calls"}
          </button>
        </label>
      </form>
      {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}
      {preview && (
        <article className="panel mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {preview.ticker} · {preview.companyName ?? "Company name unavailable"}
              </h3>
              <p className="mt-1 text-xs muted">
                {preview.window.from} – {preview.window.to}
              </p>
            </div>
            <Badge tone={preview.canQueue ? "positive" : "warning"}>
              {preview.providerState}
            </Badge>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs muted">Provider</div>
              <div className="text-sm">{preview.provider}</div>
            </div>
            <div>
              <div className="text-xs muted">Estimated initial requests</div>
              <div className="text-sm">{preview.estimatedInitialRequests} + bounded pagination</div>
            </div>
            <div>
              <div className="text-xs muted">Expected coverage</div>
              <div className="text-sm">{preview.expectedCoverageClassification}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs muted">Queries</div>
            <ul className="mt-2 space-y-1 text-sm">
              {preview.queries.map((query: any) => (
                <li key={`${query.community}:${query.query}`}>
                  r/{query.community}: <code>{query.query}</code>
                </li>
              ))}
            </ul>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs muted">
            {preview.limitations.map((limitation: string) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <button
            disabled={!preview.canQueue || busy}
            title={preview.queueDisabledReason ?? "Queue bounded research"}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={async () => {
              setBusy(true);
              const response = await fetch("/api/social/research", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  tickerId: preview.tickerId,
                  appearanceId: preview.appearanceId,
                  community: preview.queries[0]?.community,
                  dateFrom: preview.window.from,
                  dateTo: preview.window.to,
                  reason: "manual",
                }),
              });
              const result = await response.json();
              setMessage(result.message);
              setBusy(false);
            }}
          >
            Queue Research
          </button>
          {!preview.canQueue && (
            <p className="mt-2 text-xs text-amber-300">{preview.queueDisabledReason}</p>
          )}
          <p className="mt-3 text-xs muted">
            Preview external provider calls: {preview.externalProviderCalls}
          </p>
        </article>
      )}
    </section>
  );
}
