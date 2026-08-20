import Link from "next/link";
import { notFound } from "next/navigation";
import { CrossSourceTimeline } from "@/components/cross-source-timeline";
import { DatabaseNotice } from "@/components/database-notice";
import {
  ResearchAnnotations,
} from "@/components/research-case-controls";
import {
  RemoveWorkspaceItemButton,
  WorkspaceItemForm,
} from "@/components/research-workspace-forms";
import { WorkspaceCaseControls } from "@/components/research-experience-actions";
import { Badge, DataTable, EmptyState, PageHeader, TableCell } from "@/components/ui";
import { getResearchAnnotations } from "@/lib/cross-source/queries";
import {
  getResearchWorkspace,
  getResearchWorkspaceTimeline,
  getWorkspaceTickerOptions,
} from "@/lib/research/queries";
import type { IntelligenceSourceDomain } from "@/lib/cross-source/types";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, p] = await Promise.all([params, searchParams]);
  const [result, tickers, annotations] = await Promise.all([
    getResearchWorkspace(id),
    getWorkspaceTickerOptions(),
    getResearchAnnotations({ subjectType: "research_workspace", workspaceId: id }),
  ]);
  const workspace = result.data.workspace;
  if (result.configured && !result.error && !workspace) notFound();
  if (!workspace)
    return (
      <>
        <PageHeader title="Research Workspace" description="Saved research collection." />
        <DatabaseNotice configured={result.configured} error={result.error} />
        <EmptyState title="Workspace unavailable" description="No matching research workspace exists." />
      </>
    );
  const timeline = await getResearchWorkspaceTimeline(result.data.items, p);
  const source = (p.timelineSource ?? "all") as IntelligenceSourceDomain | "all";
  return (
    <>
      <PageHeader
        title={workspace.name}
        description={workspace.description ?? "Saved historical research case file"}
        action={
          <Link href={`/ai-search?workspace=${id}`} className="rounded bg-blue-600 px-4 py-2 text-sm">
            Start research
          </Link>
        }
      />
      <DatabaseNotice
        configured={result.configured}
        error={result.error || tickers.error || timeline.error || annotations.error}
      />
      <WorkspaceCaseControls workspace={workspace} questions={result.data.questions} checklist={result.data.checklist} />
      <section>
        <h2 className="mb-3 mt-8 font-semibold">Pinned Evidence</h2>
        <WorkspaceItemForm workspaceId={id} tickers={tickers.data} />
        {result.data.items.length ? (
          <DataTable headers={["Type", "Name", "Ticker / Content", "Updated", "Actions"]}>
            {result.data.items.map((item: any) => (
              <tr key={item.id}>
                <TableCell>{item.item_type}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.tickers?.symbol ?? item.content?.value ?? "—"}</TableCell>
                <TableCell>{item.updated_at}</TableCell>
                <TableCell>
                  <RemoveWorkspaceItemButton workspaceId={id} itemId={item.id} />
                </TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No workspace items" description="Pin a ticker, mover, catalyst, note, comparison, or research prompt." />
        )}
      </section>
      <CrossSourceTimeline
        result={timeline.data}
        basePath={`/research-workspaces/${id}`}
        params={p}
        activeSource={source}
      />
      <ResearchAnnotations
        subject={{ subjectType: "research_workspace", workspaceId: id }}
        initial={annotations.data}
      />
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Saved Searches</h2>
        {result.data.searches.length ? (
          <DataTable headers={["Name", "Question", "Intent", "Updated", "Open"]}>
            {result.data.searches.map((search: any) => (
              <tr key={search.id}>
                <TableCell>{search.name}</TableCell>
                <TableCell className="whitespace-normal">{search.natural_language_query}</TableCell>
                <TableCell>{search.structured_query?.intent}</TableCell>
                <TableCell>{search.updated_at}</TableCell>
                <TableCell><Link className="text-blue-400" href={`/ai-search?saved=${search.id}`}>Use</Link></TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No saved views" description="Save a structured AI Search plan such as quality-clean movers or movers awaiting social research." />
        )}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Saved Research Views</h2>
        {result.data.views.length ? <DataTable headers={["Name","Source","Mode","Filters","Open"]}>{result.data.views.map((view:any)=><tr key={view.id}><TableCell>{view.name}</TableCell><TableCell>{view.source_page.replaceAll("_"," ")}</TableCell><TableCell><Badge>{view.data_mode.toUpperCase()}</Badge></TableCell><TableCell className="max-w-lg whitespace-normal font-mono text-xs">{Object.entries(view.filters??{}).map(([key,value])=>`${key}=${String(value)}`).join(" · ")||"No filters"}</TableCell><TableCell><Link className="text-blue-400" href={view.route}>Open</Link></TableCell></tr>)}</DataTable>:<EmptyState title="No saved research views" description="Save a URL-addressable filter set and associate it with this workspace." />}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Generated Research Briefs</h2>
        {result.data.briefs.length ? <DataTable headers={["Title","Type","Mode","Version","Generated","Provenance"]}>{result.data.briefs.map((brief:any)=><tr key={brief.id}><TableCell>{brief.title}</TableCell><TableCell>{brief.brief_type}</TableCell><TableCell><Badge>{brief.data_mode.toUpperCase()}</Badge></TableCell><TableCell>{brief.research_brief_version}</TableCell><TableCell>{brief.generated_at}</TableCell><TableCell className="max-w-md whitespace-normal text-xs">Snapshot reference only; source evidence remains normalized and is not duplicated.</TableCell></tr>)}</DataTable>:<EmptyState title="No research brief snapshots" description="Generated exports can be referenced here without copying entire source datasets." />}
      </section>
      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Execution History</h2>
        {result.data.history.length ? (
          <DataTable headers={["Prompt", "Status", "Records", "Time", "Created"]}>
            {result.data.history.map((history: any) => (
              <tr key={history.id}>
                <TableCell className="whitespace-normal">{history.prompt}</TableCell>
                <TableCell>{history.status}</TableCell>
                <TableCell>{history.returned_record_count}</TableCell>
                <TableCell>{history.execution_time_ms} ms</TableCell>
                <TableCell>{history.created_at}</TableCell>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No workspace research history" description="Executed cross-source questions associated with this workspace will appear here." />
        )}
      </section>
      <section className="panel mt-8 p-5 text-sm">
        <h2 className="font-semibold">Coverage Limitations</h2>
        <ul className="mt-3 space-y-1 muted"><li>• RAW market observations remain the default and are never rewritten.</li><li>• Catalyst evidence is temporal and does not establish causation.</li><li>• Social absence is not inferred from unresearched or provider-limited windows.</li><li>• Notes, questions, and checklist decisions are user-authored and separate from evidence.</li></ul>
      </section>
    </>
  );
}
