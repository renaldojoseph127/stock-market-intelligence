"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, DataTable, EmptyState, TableCell, TickerLink } from "./ui";

type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
};

type ReportSummary = {
  id: string;
  source_filename: string | null;
  report_date: string | null;
  extraction_method: string | null;
  extraction_confidence: number | null;
  page_count: number | null;
  record_count: number;
  warning_count: number;
  import_status: string;
  error_message: string | null;
};

type Appearance = {
  id: string;
  rank: number | null;
  price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  trades: number | null;
  volume: number | null;
  dollar_volume: number | null;
  tickers: { symbol: string } | null;
  market_categories: { name: string } | null;
};

type ExtractionIssue = {
  id: string;
  page_number: number | null;
  issue_type: string;
  field_name: string | null;
  raw_value: string | null;
  message: string;
  severity: string;
};

async function loadPage<T>(url: string): Promise<Page<T>> {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Detail request failed.",
    );
  }
  return json as Page<T>;
}

function PageControls({
  page,
  hasMore,
  busy,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <button
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded border border-[#334158] px-3 py-2 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="muted">Page {page}</span>
      <button
        disabled={busy || !hasMore}
        onClick={() => onPage(page + 1)}
        className="rounded border border-[#334158] px-3 py-2 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

export function BatchReportResults({
  batchId,
  totalReports,
}: {
  batchId: string;
  totalReports: number;
}) {
  const [result, setResult] = useState<Page<ReportSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    loadPage<ReportSummary>(
      `/api/imports/batches/${batchId}/reports?page=${page}&pageSize=20&cursor=`,
    )
      .then((value) => current && setResult(value))
      .catch(
        (loadError) =>
          current &&
          setError(
            loadError instanceof Error ? loadError.message : "Could not load reports.",
          ),
      )
      .finally(() => current && setBusy(false));
    return () => {
      current = false;
    };
  }, [batchId, page]);

  if (busy && !result) {
    return <div className="panel p-6 text-sm muted">Loading 20 report summaries…</div>;
  }
  if (error && !result) {
    return <EmptyState title="Could not load reports" description={error} />;
  }
  if (!result?.items.length) {
    return <EmptyState title="No reports" description="No new reports were committed in this batch." />;
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Report results</h2>
        <span className="text-xs muted">
          {totalReports} reports · 20 reports per page
        </span>
      </div>
      {error && <p className="mb-3 rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <DataTable
        headers={[
          "Filename",
          "Report Date",
          "Extraction",
          "Records",
          "Warnings",
          "Status",
          "Details",
        ]}
      >
        {result.items.map((report) => (
          <ReportSummaryRow key={report.id} batchId={batchId} report={report} />
        ))}
      </DataTable>
      <PageControls
        page={page}
        hasMore={result.hasMore}
        busy={busy}
        onPage={(nextPage) => {
          setBusy(true);
          setError("");
          setPage(nextPage);
        }}
      />
    </section>
  );
}

function ReportSummaryRow({
  batchId,
  report,
}: {
  batchId: string;
  report: ReportSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr>
        <TableCell>
          <Link className="text-blue-400" href={`/imports/reports/${report.id}`}>
            {report.source_filename ?? "Unnamed report"}
          </Link>
        </TableCell>
        <TableCell>{report.report_date ?? "Missing"}</TableCell>
        <TableCell>{report.extraction_method ?? "—"}</TableCell>
        <TableCell>{report.record_count}</TableCell>
        <TableCell>{report.warning_count}</TableCell>
        <TableCell>
          <Badge
            tone={
              report.import_status === "completed"
                ? "positive"
                : report.import_status === "failed"
                  ? "negative"
                  : "warning"
            }
          >
            {report.import_status}
          </Badge>
        </TableCell>
        <TableCell>
          <button className="text-blue-400" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Hide" : "Load details"}
          </button>
        </TableCell>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-black/20 px-4 py-5">
            <ReportDetailTables
              batchId={batchId}
              reportId={report.id}
              recordCount={report.record_count}
              warningCount={report.warning_count}
              autoLoad
            />
          </td>
        </tr>
      )}
    </>
  );
}

export function ReportDetailTables({
  batchId,
  reportId,
  recordCount,
  warningCount,
  autoLoad = false,
}: {
  batchId: string;
  reportId: string;
  recordCount: number;
  warningCount: number;
  autoLoad?: boolean;
}) {
  const [started, setStarted] = useState(autoLoad);
  const [rowPage, setRowPage] = useState(1);
  const [issuePage, setIssuePage] = useState(1);
  const [rows, setRows] = useState<Page<Appearance> | null>(null);
  const [issues, setIssues] = useState<Page<ExtractionIssue> | null>(null);
  const [rowBusy, setRowBusy] = useState(autoLoad);
  const [issueBusy, setIssueBusy] = useState(autoLoad);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!started) return;
    let current = true;
    loadPage<Appearance>(
      `/api/imports/batches/${batchId}/reports/${reportId}/rows?page=${rowPage}&pageSize=100&cursor=`,
    )
      .then((value) => current && setRows(value))
      .catch((loadError) => current && setError(loadError instanceof Error ? loadError.message : "Could not load rows."))
      .finally(() => current && setRowBusy(false));
    return () => {
      current = false;
    };
  }, [batchId, reportId, rowPage, started]);

  useEffect(() => {
    if (!started) return;
    let current = true;
    loadPage<ExtractionIssue>(
      `/api/imports/batches/${batchId}/reports/${reportId}/issues?page=${issuePage}&pageSize=100&cursor=`,
    )
      .then((value) => current && setIssues(value))
      .catch((loadError) => current && setError(loadError instanceof Error ? loadError.message : "Could not load issues."))
      .finally(() => current && setIssueBusy(false));
    return () => {
      current = false;
    };
  }, [batchId, issuePage, reportId, started]);

  if (!started) {
    return (
      <button
        className="rounded bg-blue-600 px-4 py-2 text-sm"
        onClick={() => {
          setRowBusy(true);
          setIssueBusy(true);
          setStarted(true);
        }}
      >
        Load report details
      </button>
    );
  }

  return (
    <div className="space-y-7">
      {error && <p className="rounded bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <section>
        <div className="mb-2 flex justify-between text-sm">
          <h3 className="font-semibold">Ticker records</h3>
          <span className="muted">{recordCount} total · 100 rows per page</span>
        </div>
        {rowBusy && !rows ? (
          <p className="text-sm muted">Loading ticker records…</p>
        ) : rows?.items.length ? (
          <>
            <DataTable headers={["Ticker", "Category", "Rank", "Price", "Change %", "Trades", "Volume", "Dollar Volume"]}>
              {rows.items.map((row) => (
                <tr key={row.id}>
                  <TableCell>{row.tickers?.symbol ? <TickerLink symbol={row.tickers.symbol} /> : "—"}</TableCell>
                  <TableCell>{row.market_categories?.name ?? "—"}</TableCell>
                  <TableCell>{row.rank ?? "—"}</TableCell>
                  <TableCell>{row.price ?? "—"}</TableCell>
                  <TableCell>{row.change_percent ?? "—"}</TableCell>
                  <TableCell>{row.trades ?? "—"}</TableCell>
                  <TableCell>{row.volume ?? "—"}</TableCell>
                  <TableCell>{row.dollar_volume ?? "—"}</TableCell>
                </tr>
              ))}
            </DataTable>
            <PageControls
              page={rowPage}
              hasMore={rows.hasMore}
              busy={rowBusy}
              onPage={(nextPage) => {
                setRowBusy(true);
                setRowPage(nextPage);
              }}
            />
          </>
        ) : (
          <p className="text-sm muted">No committed ticker records.</p>
        )}
      </section>
      <section>
        <div className="mb-2 flex justify-between text-sm">
          <h3 className="font-semibold">Extraction warnings and errors</h3>
          <span className="muted">{warningCount} warnings recorded · 100 rows per page</span>
        </div>
        {issueBusy && !issues ? (
          <p className="text-sm muted">Loading extraction issues…</p>
        ) : issues?.items.length ? (
          <>
            <DataTable headers={["Severity", "Page", "Type", "Field", "Raw Value", "Message"]}>
              {issues.items.map((issue) => (
                <tr key={issue.id}>
                  <TableCell><Badge tone={issue.severity === "error" ? "negative" : "warning"}>{issue.severity}</Badge></TableCell>
                  <TableCell>{issue.page_number ?? "—"}</TableCell>
                  <TableCell>{issue.issue_type}</TableCell>
                  <TableCell>{issue.field_name ?? "—"}</TableCell>
                  <TableCell>{issue.raw_value ?? "—"}</TableCell>
                  <TableCell className="max-w-lg whitespace-normal">{issue.message}</TableCell>
                </tr>
              ))}
            </DataTable>
            <PageControls
              page={issuePage}
              hasMore={issues.hasMore}
              busy={issueBusy}
              onPage={(nextPage) => {
                setIssueBusy(true);
                setIssuePage(nextPage);
              }}
            />
          </>
        ) : (
          <p className="text-sm muted">No extraction issues.</p>
        )}
      </section>
    </div>
  );
}
