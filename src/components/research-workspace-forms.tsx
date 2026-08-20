"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white";

export function CreateResearchWorkspaceForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <form
      className="panel mb-6 flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/research-workspaces", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            description: form.get("description"),
          }),
        });
        const body = await response.json();
        setMessage(body.message);
        if (response.ok) {
          event.currentTarget.reset();
          router.refresh();
        }
      }}
    >
      <label className="grid min-w-52 flex-1 gap-1 text-xs muted">
        Name
        <input required name="name" className={inputClass} />
      </label>
      <label className="grid min-w-64 flex-[2] gap-1 text-xs muted">
        Description
        <input name="description" className={inputClass} />
      </label>
      <button className="rounded bg-blue-600 px-4 py-2 text-sm">
        Create workspace
      </button>
      {message && <span className="text-xs muted">{message}</span>}
    </form>
  );
}

export function WorkspaceItemForm({
  workspaceId,
  tickers,
}: {
  workspaceId: string;
  tickers: any[];
}) {
  const router = useRouter();
  const [type, setType] = useState("pinned_ticker");
  const [message, setMessage] = useState("");
  const options = [
    ["pinned_ticker", "Pinned ticker"],
    ["saved_comparison", "Saved comparison"],
    ["saved_prompt", "Saved prompt"],
    ["saved_filter", "Saved filter"],
    ["saved_event", "Saved event"],
    ["saved_filing", "Saved filing"],
    ["saved_catalyst_comparison", "Catalyst comparison"],
    ["saved_timeline", "Catalyst timeline"],
  ];
  return (
    <form
      className="panel mb-4 flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch(
          `/api/research-workspaces/${workspaceId}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "add_item",
              itemType: type,
              name: form.get("name"),
              tickerId: form.get("tickerId") || null,
              content: { value: form.get("content") },
            }),
          },
        );
        const body = await response.json();
        setMessage(body.message);
        if (response.ok) {
          event.currentTarget.reset();
          router.refresh();
        }
      }}
    >
      <label className="grid gap-1 text-xs muted">
        Item type
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={inputClass}
        >
          {options.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs muted">
        Name
        <input required name="name" className={inputClass} />
      </label>
      {type === "pinned_ticker" ? (
        <label className="grid gap-1 text-xs muted">
          Ticker
          <select required name="tickerId" className={inputClass}>
            <option value="">Select</option>
            {tickers.map((ticker) => (
              <option key={ticker.id} value={ticker.id}>
                {ticker.symbol} · {ticker.company_name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="grid min-w-64 flex-1 gap-1 text-xs muted">
          Record ID, route, or structured note
          <input required name="content" className={inputClass} />
        </label>
      )}
      <button className="rounded bg-blue-600 px-4 py-2 text-sm">
        Save item
      </button>
      {message && <span className="text-xs muted">{message}</span>}
    </form>
  );
}

export function RemoveWorkspaceItemButton({
  workspaceId,
  itemId,
}: {
  workspaceId: string;
  itemId: string;
}) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-red-300"
      onClick={async () => {
        await fetch(`/api/research-workspaces/${workspaceId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "remove_item", itemId }),
        });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
