"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white";

export function AddToResearch({
  workspaces,
  item,
}: {
  workspaces: Array<{ id: string; name: string }>;
  item: {
    itemType: "ticker" | "mover" | "catalyst";
    name: string;
    tickerId?: string;
    appearanceId?: string;
    eventId?: string;
  };
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!workspaces.length)
    return (
      <Link className="rounded border border-[#334158] px-3 py-2 text-sm" href="/research-workspaces">
        Create research workspace
      </Link>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Research workspace"
        className={inputClass}
        value={workspaceId}
        onChange={(event) => setWorkspaceId(event.target.value)}
      >
        {workspaces.map((workspace) => (
          <option value={workspace.id} key={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <button
        disabled={busy || !workspaceId}
        className="rounded bg-blue-600 px-3 py-2 text-sm disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch(`/api/research-workspaces/${workspaceId}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "add_item", ...item }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? "Unable to save item.");
            setMessage(result.message);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        Add to Research
      </button>
      {message && <span className="text-xs muted">{message}</span>}
    </div>
  );
}

export function ResearchAnnotations({
  subject,
  initial,
}: {
  subject: {
    subjectType: "ticker" | "mover" | "catalyst" | "research_workspace";
    tickerId?: string;
    appearanceId?: string;
    eventId?: string;
    workspaceId?: string;
  };
  initial: { notes: any[]; tags: any[] };
}) {
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(payload: Record<string, unknown>) {
    const response = await fetch("/api/research/annotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...subject, ...payload }),
    });
    const result = await response.json();
    setMessage(result.message);
    if (response.ok) router.refresh();
  }
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-semibold">Internal Research Notes & Tags</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <form
          className="panel p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit({ action: "note", note: form.get("note") });
            event.currentTarget.reset();
          }}
        >
          <label className="grid gap-1 text-xs muted">
            Note
            <textarea required name="note" maxLength={10000} className={`${inputClass} min-h-24`} />
          </label>
          <button className="mt-3 rounded bg-blue-600 px-3 py-2 text-sm">
            Save note
          </button>
          <div className="mt-4 space-y-2">
            {initial.notes.map((note) => (
              <div className="rounded border border-[#334158] p-3 text-sm" key={note.id}>
                <p className="whitespace-pre-wrap">{note.note}</p>
                <div className="mt-2 text-xs muted">{note.updated_at}</div>
              </div>
            ))}
          </div>
        </form>
        <form
          className="panel p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit({ action: "tag", tag: form.get("tag") });
            event.currentTarget.reset();
          }}
        >
          <label className="grid gap-1 text-xs muted">
            Research tag
            <input
              required
              name="tag"
              pattern="[a-z0-9][a-z0-9_-]{0,39}"
              placeholder="follow_up"
              className={inputClass}
            />
          </label>
          <button className="mt-3 rounded bg-blue-600 px-3 py-2 text-sm">
            Add tag
          </button>
          <div className="mt-4 flex flex-wrap gap-2">
            {initial.tags.map((tag) => (
              <span className="rounded-full border border-[#334158] px-3 py-1 text-xs" key={tag.id}>
                {tag.tag}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs muted">
            Suggested user-defined tags: review, interesting, follow_up,
            possible_catalyst, social_check_needed, quality_issue.
          </p>
        </form>
      </div>
      {message && <p className="mt-2 text-xs muted">{message}</p>}
    </section>
  );
}
