import { notFound } from "next/navigation";
import { ReportDetailTables } from "@/components/import-batch-results";
import { DatabaseNotice } from "@/components/database-notice";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { getReportQuality } from "@/lib/data-quality/queries";
import { getReport } from "@/lib/queries";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [report, quality] = await Promise.all([getReport(id), getReportQuality(id)]);
  if (report.configured && !report.error && !report.data) notFound();
  const value = report.data;
  return (
    <>
      <PageHeader
        title={value?.source_filename ?? "Report Details"}
        description="Report summary with ticker rows and extraction issues loaded on demand."
      />
      <DatabaseNotice configured={report.configured} error={report.error ?? quality.error} />
      {value && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Report Date" value={value.report_date ?? "Missing"} />
            <StatCard label="Extraction" value={value.extraction_method ?? "—"} />
            <StatCard
              label="Confidence"
              value={value.extraction_confidence == null ? "—" : `${Math.round(value.extraction_confidence * 100)}%`}
            />
            <StatCard label="Pages" value={value.page_count ?? "—"} />
            <StatCard label="Ticker Records" value={value.record_count} />
            <StatCard label="Warnings" value={value.warning_count} />
            <StatCard label="Quality Flagged" value={quality.data?.flagged_rows ?? 0} />
            <StatCard label="Approved Repairs" value={quality.data?.approved_repairs ?? 0} />
          </div>
          {value.import_batch_id ? (
            <ReportDetailTables
              batchId={value.import_batch_id}
              reportId={id}
              recordCount={value.record_count}
              warningCount={value.warning_count}
            />
          ) : (
            <EmptyState
              title="No batch details"
              description="This legacy report is not attached to an import batch."
            />
          )}
        </>
      )}
    </>
  );
}
