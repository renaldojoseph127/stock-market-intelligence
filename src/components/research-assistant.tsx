"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResearchAnswerPanel } from "@/components/research-components";
import type { QueryPlan, ResearchAnswer } from "@/lib/research/types";

const templates = [
  "Show NVDA historical mover timeline",
  "Find largest NASDAQ gainers with catalysts",
  "Show movers without identified catalyst",
  "Show quality-flagged historical movers",
  "Compare NVDA and AAPL history",
  "Show repeat movers with >10 appearances",
  "Show movers awaiting social research",
];

const input = "rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white";

export function ResearchAssistant({ initial }: { initial: any }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initial.defaultPrompt ?? "");
  const [workspaceId, setWorkspaceId] = useState(initial.defaultWorkspaceId ?? "");
  const [sessionId, setSessionId] = useState<string | undefined>(initial.activeSessionId);
  const [conversation, setConversation] = useState<any[]>(initial.messages ?? []);
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveName, setSaveName] = useState("");

  const submit = async (question = prompt) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setMessage("");
    setConversation((rows) => [...rows, { role: "user", content: question }]);
    const response = await fetch("/api/ai-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: question, workspaceId: workspaceId || null, sessionId }),
    });
    const body = await response.json();
    if (response.ok) {
      setAnswer(body);
      setSessionId(body.sessionId);
      setConversation((rows) => [...rows, { role: "assistant", content: body.summary, structured_query: body.plan, evidence: body.evidence }]);
      setPrompt("");
      router.refresh();
    } else setMessage(body.message ?? "Research execution failed.");
    setBusy(false);
  };

  const save = async () => {
    if (!answer?.historyId || !workspaceId || !saveName.trim()) return;
    const response = await fetch(`/api/research-workspaces/${workspaceId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save_search", name: saveName, query: answer.plan.question, plan: answer.plan as QueryPlan }),
    });
    const body = await response.json();
    setMessage(body.message);
    if (response.ok) setSaveName("");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <div className="panel p-5">
          <label className="text-sm font-medium" htmlFor="research-prompt">Ask a historical research question</label>
          <textarea id="research-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="Show movers without an identified catalyst inside researched coverage" className={`${input} mt-2 w-full px-3 py-3`} />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs muted">Workspace<select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className={input}><option value="">No workspace</option>{initial.workspaces.map((workspace: any) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
            <button disabled={busy || !prompt.trim()} onClick={() => submit()} className="rounded bg-blue-600 px-5 py-2 text-sm disabled:opacity-50">{busy ? "Researching…" : "Run research"}</button>
            {sessionId && <span className="text-xs muted">Session context active</span>}
          </div>
          <p className="mt-3 text-xs muted">Read-only historical research. Questions cannot execute arbitrary SQL, modify source records, predict prices, or produce investment recommendations.</p>
        </div>
        {message && <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{message}</div>}
        {answer && <>
          <ResearchAnswerPanel answer={answer} />
          {answer.status === "completed" && answer.historyId && <div className="panel flex flex-wrap items-end gap-3 p-4">
            <span className="text-sm font-medium">Export with methodology:</span>
            {["csv", "json", "pdf"].map((format) => <a key={format} className="rounded bg-[#182235] px-3 py-2 text-xs uppercase text-blue-300" href={`/api/ai-search/export?historyId=${answer.historyId}&format=${format}`}>{format}</a>)}
            {workspaceId && <><input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Saved search name" className={input} /><button onClick={save} className="rounded bg-blue-600 px-3 py-2 text-xs">Save search</button></>}
          </div>}
        </>}
      </div>
      <aside className="space-y-5">
        <div className="panel p-4">
          <h3 className="font-medium">Conversation History</h3>
          {conversation.length ? <div className="mt-3 max-h-[440px] space-y-3 overflow-y-auto">{conversation.map((entry, index) => <div className={`rounded p-3 text-sm ${entry.role === "user" ? "bg-blue-500/10" : "bg-white/[.03]"}`} key={entry.id ?? index}><div className="mb-1 text-[10px] uppercase tracking-wide muted">{entry.role}</div>{entry.content}</div>)}</div> : <p className="mt-2 text-xs muted">Follow-up questions preserve prior structured filters in this session.</p>}
        </div>
        <div className="panel p-4">
          <h3 className="font-medium">Research Templates</h3>
          <div className="mt-3 space-y-2">{templates.map((template) => <button key={template} onClick={() => setPrompt(template)} className="block w-full rounded bg-white/[.03] p-2 text-left text-xs text-blue-300">{template}</button>)}</div>
        </div>
        <div className="panel p-4">
          <div className="flex items-center justify-between"><h3 className="font-medium">Saved Research</h3><Link href="/research-workspaces" className="text-xs text-blue-400">Manage</Link></div>
          <p className="mt-2 text-xs muted">{initial.savedSearches.length} saved searches across {initial.workspaces.length} workspaces.</p>
          <Link href="/research-history" className="mt-3 block text-xs text-blue-400">View execution history</Link>
        </div>
      </aside>
    </div>
  );
}

