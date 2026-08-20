import Link from "next/link";
import { CreateResearchWorkspaceForm } from "@/components/research-workspace-forms";
import { WorkspaceCards } from "@/components/research-components";
import { DatabaseNotice } from "@/components/database-notice";
import { PageHeader, StatCard } from "@/components/ui";
import { getResearchWorkspaces } from "@/lib/research/queries";

export default async function Page() {
  const result = await getResearchWorkspaces();
  const groups = [
    ["Active Workspaces", "active"],
    ["Follow-Up Needed", "follow_up"],
    ["Completed", "complete"],
    ["Archived", "archived"],
  ] as const;
  return (
    <>
      <PageHeader title="Research Workspaces" description="Historical case management for pinned evidence, questions, notes, tags, comparisons, saved views, checklists, and brief snapshots." action={<Link href="/saved-research-views" className="rounded border border-[#334158] px-3 py-2 text-sm">Saved Research Views</Link>} />
      <DatabaseNotice configured={result.configured} error={result.error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="All Cases" value={result.data.length} />
        {groups.map(([label, status]) => <StatCard key={status} label={label} value={result.data.filter((workspace: any) => (workspace.status ?? "active") === status).length} />)}
      </div>
      <CreateResearchWorkspaceForm />
      <section className="mb-8"><h2 className="mb-3 font-semibold">Recently Updated</h2><WorkspaceCards rows={result.data.slice(0, 6)} /></section>
      {groups.map(([label, status]) => <section className="mb-8" key={status}><h2 className="mb-3 font-semibold">{label}</h2><WorkspaceCards rows={result.data.filter((workspace: any) => (workspace.status ?? "active") === status)} /></section>)}
    </>
  );
}

