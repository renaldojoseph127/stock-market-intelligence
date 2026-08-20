import { notFound } from "next/navigation";
import { BatchReportResults } from "@/components/import-batch-results";
import { DatabaseNotice } from "@/components/database-notice";
import { PageHeader, StatCard } from "@/components/ui";
import { getBatch } from "@/lib/queries";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getBatch(id);
  if (batch.configured && !batch.error && !batch.data) notFound();
  const value = batch.data;
  return (
    <>
      <PageHeader
        title={value?.name ?? "Import Batch"}
        description="Batch summary with paginated, on-demand report and row details."
      />
      <DatabaseNotice configured={batch.configured} error={batch.error} />
      {value && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Files" value={value.total_files} />
            <StatCard label="Completed" value={value.successful_files} />
            <StatCard label="Partial" value={value.partial_files} />
            <StatCard label="Failed" value={value.failed_files} />
            <StatCard label="Ticker Records" value={value.total_records} />
            <StatCard label="Status" value={value.status} />
          </div>
          <BatchReportResults batchId={id} totalReports={value.processed_files} />
        </>
      )}
    </>
  );
}

