"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white";

export function SaveResearchView({
  sourcePage,
  route,
  filters,
  dataMode = "raw",
  workspaces = [],
}: {
  sourcePage: string;
  route: string;
  filters: Record<string, string | undefined>;
  dataMode?: "raw" | "effective";
  workspaces?: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  if (!open)
    return <button className="rounded border border-[#334158] px-3 py-2 text-sm" onClick={() => setOpen(true)}>Save this research view</button>;
  return (
    <form
      className="panel flex flex-wrap items-end gap-3 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/saved-research-views", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            workspaceId: form.get("workspaceId") || null,
            sourcePage,
            route,
            filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value != null && value !== "")),
            dataMode,
          }),
        });
        const body = await response.json();
        setMessage(body.message);
      }}
    >
      <label className="grid gap-1 text-xs muted">View name<input required name="name" className={input} /></label>
      {workspaces.length > 0 && <label className="grid gap-1 text-xs muted">Workspace<select name="workspaceId" className={input}><option value="">Library only</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>}
      <button className="rounded bg-blue-600 px-3 py-2 text-sm">Save</button>
      <button type="button" className="text-xs muted" onClick={() => setOpen(false)}>Cancel</button>
      {message && <span className="text-xs muted">{message}</span>}
    </form>
  );
}

export function WorkspaceCaseControls({ workspace, questions, checklist }: { workspace: any; questions: any[]; checklist: any[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function action(payload: Record<string, unknown>) {
    const response = await fetch(`/api/research-workspaces/${workspace.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setMessage(body.message);
    if (response.ok) router.refresh();
  }
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <div className="panel p-5">
        <h2 className="font-semibold">Case Summary</h2>
        <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); action({ action: "update", name: form.get("name"), description: form.get("description"), status: form.get("status") }); }}>
          <input required name="name" defaultValue={workspace.name} className={input} />
          <textarea name="description" defaultValue={workspace.description ?? ""} className={`${input} min-h-20`} />
          <select name="status" defaultValue={workspace.status ?? "active"} className={input}>{["active", "follow_up", "complete", "archived"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
          <button className="w-fit rounded bg-blue-600 px-3 py-2 text-sm">Update case</button>
        </form>
      </div>
      <div className="panel p-5">
        <h2 className="font-semibold">Research Questions</h2>
        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); action({ action: "add_question", question: form.get("question") }); event.currentTarget.reset(); }}>
          <input required maxLength={1000} name="question" placeholder="What evidence remains unresolved?" className={`${input} min-w-0 flex-1`} />
          <button className="rounded bg-blue-600 px-3 py-2 text-sm">Save</button>
        </form>
        <div className="mt-4 space-y-2">
          {questions.length ? questions.map((question) => <div key={question.id} className="rounded border border-[#334158] p-3 text-sm"><p>{question.question}</p><div className="mt-2 flex gap-2">{["open", "answered", "deferred"].map((status) => <button key={status} onClick={() => action({ action: "update_question", questionId: question.id, status })} className={`text-xs ${question.status === status ? "text-blue-300" : "muted"}`}>{status}</button>)}</div></div>) : <p className="text-xs muted">No saved research questions.</p>}
        </div>
      </div>
      <div className="panel p-5 xl:col-span-2">
        <h2 className="font-semibold">Manual Research Checklist</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {checklist.map((item) => <label key={item.id} className="flex items-center gap-2 rounded border border-[#334158] p-3 text-sm"><input type="checkbox" checked={item.completed} onChange={(event) => action({ action: "toggle_checklist", itemId: item.id, completed: event.target.checked })} />{item.label}</label>)}
          {!checklist.length && <p className="text-xs muted">Checklist initializes for newly created workspaces. Existing cases remain valid without it.</p>}
        </div>
      </div>
      {message && <p className="text-xs muted xl:col-span-2">{message}</p>}
    </section>
  );
}

export function RemoveSavedView({ id }: { id: string }) {
  const router = useRouter();
  return <button className="text-xs text-red-300" onClick={async () => { await fetch(`/api/saved-research-views?id=${id}`, { method: "DELETE" }); router.refresh(); }}>Remove</button>;
}

export function SaveBriefSnapshot({
  workspaces,
  brief,
}: {
  workspaces: Array<{ id: string; name: string }>;
  brief: {
    briefType: "ticker" | "mover";
    tickerId: string;
    appearanceId?: string;
    title: string;
    version: string;
    dataMode: "raw" | "effective";
    provenance: Record<string, unknown>;
    coverage: Record<string, unknown>;
  };
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [message, setMessage] = useState("");
  if (!workspaces.length) return null;
  return <div className="flex flex-wrap items-center gap-2"><select aria-label="Brief snapshot workspace" className={input} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="rounded border border-[#334158] px-3 py-2 text-sm" onClick={async () => { const response = await fetch(`/api/research-workspaces/${workspaceId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_brief_snapshot", ...brief, generatedAt: new Date().toISOString() }) }); const body = await response.json(); setMessage(body.message); }}>Save brief snapshot</button>{message && <span className="text-xs muted">{message}</span>}</div>;
}
