import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import { RemoveSavedView } from "@/components/research-experience-actions";
import { Badge, DataTable, EmptyState, PageHeader, TableCell } from "@/components/ui";
import { getSavedResearchViews } from "@/lib/research-experience/queries";

export default async function SavedResearchViewsPage() {
  const result = await getSavedResearchViews();
  return (
    <>
      <PageHeader title="Saved Research Views" description="Auditable, URL-addressable historical research filters saved from Market Movers, Cross-Source Analytics, AI Search, Research Today, and ticker history." />
      <DatabaseNotice configured={result.configured} error={result.error} />
      {result.data.length ? (
        <DataTable headers={["Name", "Source", "Mode", "Workspace", "Filters", "Updated", "Actions"]}>
          {result.data.map((view: any) => (
            <tr key={view.id}>
              <TableCell><Link className="text-blue-400" href={view.route}>{view.name}</Link></TableCell>
              <TableCell>{view.source_page.replaceAll("_", " ")}</TableCell>
              <TableCell><Badge>{view.data_mode.toUpperCase()}</Badge></TableCell>
              <TableCell>{view.research_workspaces?.name ?? "Library"}</TableCell>
              <TableCell className="max-w-md whitespace-normal font-mono text-xs">{Object.entries(view.filters ?? {}).map(([key, value]) => `${key}=${String(value)}`).join(" · ") || "No filters"}</TableCell>
              <TableCell>{view.updated_at}</TableCell>
              <TableCell><div className="flex gap-3"><Link className="text-xs text-blue-400" href={view.route}>Open</Link><RemoveSavedView id={view.id} /></div></TableCell>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState title="No saved research views" description="Save an explicit filter set from Research Today or another supported research page. No hidden query state is stored." />
      )}
    </>
  );
}

