import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import {
  Pagination,
  ResearchCandidateFilters,
  ResearchCandidatesTable,
} from "@/components/research-experience";
import { SaveResearchView } from "@/components/research-experience-actions";
import { PageHeader } from "@/components/ui";
import { getCategories } from "@/lib/queries";
import { getWorkspacePicker } from "@/lib/research/queries";
import { getResearchCandidates } from "@/lib/research-experience/queries";

export default async function ResearchToday({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [result, categories, workspaces] = await Promise.all([
    getResearchCandidates(params),
    getCategories(),
    getWorkspacePicker(),
  ]);
  return (
    <>
      <PageHeader
        title="Research Today"
        description="Ranked historical research candidates from persisted Scanz, catalyst, quality, social-coverage, and saved-interest context. This is not an investment-attractiveness score."
        action={<div className="flex gap-2"><SaveResearchView sourcePage="research_today" route="/research" filters={params} dataMode="raw" workspaces={workspaces.data} /><Link href="/saved-research-views" className="rounded border border-[#334158] px-3 py-2 text-sm">Saved views</Link></div>}
      />
      <DatabaseNotice configured={result.configured} error={result.error || categories.error || workspaces.error} />
      <ResearchCandidateFilters params={params} categories={categories.data} />
      <ResearchCandidatesTable rows={result.data} />
      <Pagination path="/research" params={params} page={result.page} pageSize={result.pageSize} total={result.total} />
      <section className="panel mt-8 p-5 text-sm">
        <h2 className="font-semibold">Priority methodology</h2>
        <p className="mt-2 muted">Version historical-research-priority-v1 scores observation magnitude (25), repeat appearances (20), catalyst research gap (15), social coverage gap (10), usable quality state (10), saved research interest (10), and recent import age (10). Reasons and component points are shown per row.</p>
        <p className="mt-2 muted">Future returns, future price knowledge, later discussion, manual hindsight labels, and trading outcomes are excluded.</p>
      </section>
    </>
  );
}

