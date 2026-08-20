"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SocialResearchButton({
  tickerId,
  appearanceId,
  dateFrom,
  dateTo,
  enabled,
  disabledReason,
}: {
  tickerId: string;
  appearanceId?: string;
  dateFrom?: string;
  dateTo?: string;
  enabled: boolean;
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function run() {
    setBusy(true);
    setMessage("Queueing bounded Reddit research…");
    try {
      const queued = await fetch("/api/social/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tickerId,
          appearanceId,
          dateFrom,
          dateTo,
          reason: appearanceId ? "market_mover" : "ticker_page",
        }),
      });
      const job = await queued.json();
      if (!queued.ok) throw new Error(job.message ?? "Research could not be queued");
      setMessage("Processing one bounded approved research job…");
      const processed = await fetch("/api/admin/social-research/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queueId: job.queueId, limit: 1 }),
      });
      const result = await processed.json();
      if (!processed.ok) throw new Error(result.message ?? "Research worker failed");
      const outcome = result.results?.[0];
      setMessage(
        outcome?.status === "partial"
          ? `Research stored ${outcome.posts ?? 0} post(s) and ${outcome.comments ?? 0} comment(s). Coverage is explicitly partial/provider-limited.`
          : outcome?.error ?? "Research request completed; inspect coverage status.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={busy || !enabled}
        title={enabled ? "Run approved bounded Reddit research" : disabledReason}
        onClick={run}
        className="rounded bg-blue-600 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Researching…" : "Research Reddit"}
      </button>
      {!enabled && disabledReason && <span className="max-w-xl text-xs text-amber-300">{disabledReason}</span>}
      {message && <span className="max-w-xl text-xs muted">{message}</span>}
    </div>
  );
}
