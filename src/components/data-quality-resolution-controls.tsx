"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DataQualityResolutionControls() {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function generate() {
    setBusy(true);setMessage("");
    try {
      const response = await fetch("/api/admin/data-quality/resolution/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 100 }) });
      const result = await response.json();if (!response.ok) throw new Error(result.message ?? "Candidate generation failed");
      setMessage(result.claimed ? `Re-evaluated ${result.claimed} appearances with prior-only evidence. Generated or refreshed ${result.proposals ?? 0} deterministic proposal(s).` : "No unresolved supported findings require candidate generation in this batch.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }
  return <section className="panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Bounded candidate generation</h2><p className="mt-1 text-sm muted">Re-evaluates at most 100 prioritized appearances using same-day and strictly prior evidence. No proposal is approved automatically.</p></div><button disabled={busy} onClick={generate} className="rounded bg-blue-600 px-4 py-2 text-sm disabled:opacity-50">{busy ? "Generating…" : "Generate next 100 candidates"}</button></div>{message && <p className="mt-3 text-sm text-amber-300">{message}</p>}</section>;
}
