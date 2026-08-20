"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PreviewJobProgress } from "@/lib/import/jobs/types";

const STORED_JOB_KEY = "stock-intelligence.active-import-preview-job";
const ACTIVE_STATUSES = new Set([
  "uploading",
  "queued",
  "processing",
  "finalizing",
]);

async function responseJson(response: Response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : "Import request failed.",
    );
  }
  return json as PreviewJobProgress;
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function processBatchWithStatusPolling(
  jobId: string,
  signal: AbortSignal,
  onProgress: (progress: PreviewJobProgress) => void,
) {
  const processing = fetch(`/api/imports/preview/jobs/${jobId}/process`, {
    method: "POST",
    signal,
  }).then(responseJson);

  while (true) {
    const outcome = await Promise.race([
      processing.then((progress) => ({ complete: true as const, progress })),
      wait(1_000, signal).then(() => ({ complete: false as const })),
    ]);
    if (outcome.complete) return outcome.progress;
    try {
      const status = await fetch(`/api/imports/preview/jobs/${jobId}`, {
        cache: "no-store",
        signal,
      });
      onProgress(await responseJson(status));
    } catch (statusError) {
      if (
        statusError instanceof DOMException &&
        statusError.name === "AbortError"
      ) {
        throw statusError;
      }
      // The batch request is still authoritative and may be running normally;
      // a transient status-poll failure must not start a competing batch.
    }
  }
}

export function ImportUploader() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<PreviewJobProgress | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(STORED_JOB_KEY);
    if (!stored) return;
    fetch(`/api/imports/preview/jobs/${stored}`, { cache: "no-store" })
      .then(responseJson)
      .then((restored) => {
        setJob(restored);
        setOpen(true);
      })
      .catch((loadError) => {
        window.localStorage.removeItem(STORED_JOB_KEY);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not restore the preview job.",
        );
      });
  }, []);

  useEffect(() => {
    if (!job?.jobId || !ACTIVE_STATUSES.has(job.status)) return;
    const controller = new AbortController();
    let stopped = false;

    async function processUntilTerminal() {
      let current = job!;
      while (!stopped && ACTIVE_STATUSES.has(current.status)) {
        try {
          current = await processBatchWithStatusPolling(
            current.jobId,
            controller.signal,
            (progress) => {
              if (!stopped) setJob(progress);
            },
          );
          if (stopped) return;
          setJob(current);
          setError("");
          await wait(500, controller.signal);
        } catch (processError) {
          if (
            stopped ||
            (processError instanceof DOMException &&
              processError.name === "AbortError")
          ) {
            return;
          }
          setError(
            `${processError instanceof Error ? processError.message : "Preview processing was interrupted."} Progress is saved; retrying.`,
          );
          await wait(2_000, controller.signal).catch(() => undefined);
          if (stopped) return;
          try {
            const status = await fetch(
              `/api/imports/preview/jobs/${current.jobId}`,
              { cache: "no-store", signal: controller.signal },
            );
            current = await responseJson(status);
            setJob(current);
          } catch (statusError) {
            if (
              statusError instanceof DOMException &&
              statusError.name === "AbortError"
            ) {
              return;
            }
          }
        }
      }
    }

    void processUntilTerminal();
    return () => {
      stopped = true;
      controller.abort();
    };
    // One worker loop per durable job. Progress changes are handled inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.jobId]);

  async function upload(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: form,
      });
      const next = await responseJson(response);
      window.localStorage.setItem(STORED_JOB_KEY, next.jobId);
      setJob(next);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!job?.preview) return;
    setBusy(true);
    setError("");
    try {
      let current = job;
      do {
        const response = await fetch("/api/imports/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: current.jobId }),
        });
        current = await responseJson(response);
        setJob(current);
        if (current.status === "committing") {
          await wait(200, new AbortController().signal);
        }
      } while (current.status === "committing");
      if (current.status !== "confirmed" || !current.importBatchId) {
        throw new Error("Import commit paused before completion; retry to resume.");
      }
      window.localStorage.removeItem(STORED_JOB_KEY);
      setOpen(false);
      setJob(null);
      router.push(`/imports/batches/${current.importBatchId}`);
      router.refresh();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Import confirmation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/imports/preview/jobs/${job.jobId}`,
        { method: "DELETE" },
      );
      setJob(await responseJson(response));
      window.localStorage.removeItem(STORED_JOB_KEY);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Cancellation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function clearFinishedJob() {
    window.localStorage.removeItem(STORED_JOB_KEY);
    setJob(null);
    setError("");
  }

  async function loadReportPage(page: number) {
    if (!job?.preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/imports/preview/jobs/${job.jobId}/reports?page=${page}&pageSize=${job.preview.reportPageSize}`,
        { cache: "no-store" },
      );
      const reportPage = await responseJson(response) as unknown as Pick<
        NonNullable<PreviewJobProgress["preview"]>,
        "reports" | "reportPage" | "reportPageSize" | "reportPageCount"
      >;
      setJob({
        ...job,
        preview: { ...job.preview, ...reportPage },
      });
    } catch (pageError) {
      setError(
        pageError instanceof Error
          ? pageError.message
          : "Could not load preview reports.",
      );
    } finally {
      setBusy(false);
    }
  }

  const preview = job?.preview;
  const processing = Boolean(
    job && (ACTIVE_STATUSES.has(job.status) || job.status === "committing"),
  );
  const progress = job?.totalFiles
    ? Math.min(100, Math.round((job.filesProcessed / job.totalFiles) * 100))
    : 0;

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium"
      >
        New Import
      </button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="panel mx-auto my-8 max-w-5xl p-6">
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">New Scanz Import</h2>
                {job && <p className="mt-1 text-xs muted">Job {job.jobId}</p>}
              </div>
              <button onClick={() => setOpen(false)} className="muted">
                Close
              </button>
            </div>

            {!job ? (
              <form className="mt-5 grid gap-4" action={upload}>
                <input
                  required
                  name="file"
                  type="file"
                  accept=".pdf,.zip,application/pdf,application/zip"
                  className="rounded border border-[#334158] p-4"
                />
                <p className="text-sm muted">
                  PDF or ZIP archive. The upload is validated and fingerprinted,
                  then OCR runs in durable batches without keeping this upload
                  request open.
                </p>
                <button
                  disabled={busy}
                  className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50"
                >
                  {busy ? "Uploading and validating…" : "Build preview"}
                </button>
              </form>
            ) : processing ? (
              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    {job.status === "finalizing" ? (
                      <span>Finalizing preview…</span>
                    ) : job.status === "committing" ? (
                      <span>Importing finalized preview…</span>
                    ) : (
                      <span>
                        Processing {job.filesProcessed} / {job.totalFiles} reports
                      </span>
                    )}
                    <span>
                      {job.status === "finalizing"
                        ? `${job.reportsFinalized} / ${job.totalFiles}`
                        : job.status === "committing"
                          ? job.commitStage
                          : `${progress}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#243044]">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 truncate text-xs muted">
                    {job.currentFilename
                      ? `Current file: ${job.currentFilename}`
                      : job.status === "finalizing"
                        ? `Reports finalized: ${job.reportsFinalized} / ${job.totalFiles} · Rows finalized: ${job.rowsFinalized} / ${job.extractedRows}`
                        : job.status === "committing"
                          ? `Reports committed: ${job.reportsCommitted} / ${job.totalFiles} · Rows committed: ${job.rowsCommitted} / ${job.extractedRows}`
                      : job.status === "uploading"
                        ? "Persisting validated PDF work items…"
                        : job.filesProcessed >= job.totalFiles
                          ? "Preparing bounded preview finalization…"
                        : "Waiting for the next processing batch…"}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric n={job.usableReports} l="Usable reports" />
                  <Metric n={job.extractedRows} l="Rows extracted" />
                  <Metric n={job.warnings} l="Warnings" />
                  <Metric n={job.errors} l="Errors" />
                </div>
                <p className="text-xs muted">
                  Progress is persisted. You may close this dialog or navigate
                  away; returning to Imports resumes the bounded job.
                </p>
                {job.failureMessage && (
                  <p className="rounded bg-amber-500/10 p-3 text-sm text-amber-200">
                    {job.failureMessage}
                  </p>
                )}
                {["uploading", "queued", "processing"].includes(job.status) &&
                  job.filesProcessed < job.totalFiles && (
                    <button
                      disabled={busy}
                      onClick={cancel}
                      className="rounded border border-red-700 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
                    >
                      {busy ? "Cancelling…" : "Cancel preview job"}
                    </button>
                  )}
              </div>
            ) : preview ? (
              <div className="mt-5">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric n={preview.filesDetected} l="Files detected" />
                  <Metric n={preview.expectedRows} l="Expected rows" />
                  <Metric n={preview.potentialDuplicates} l="Duplicates" />
                  <Metric
                    n={`${preview.warnings} / ${preview.errors}`}
                    l="Warnings / errors"
                  />
                </div>
                <p className="mt-4 text-sm muted">
                  Date range: {preview.earliestDate ?? "unknown"} to{" "}
                  {preview.latestDate ?? "unknown"} · Categories:{" "}
                  {preview.categories.join(", ") || "none"}
                </p>
                {preview.duplicates.length > 0 && (
                  <p className="mt-3 rounded bg-amber-500/10 p-3 text-sm text-amber-200">
                    Already Imported: {preview.duplicates.join(", ")}
                  </p>
                )}
                <div className="mt-4 max-h-[45vh] overflow-auto">
                  {preview.reports.map((report) => (
                    <details
                      key={report.filename}
                      className="border-b border-[#243044] py-3"
                    >
                      <summary className="cursor-pointer font-medium">
                        {report.filename} — {report.rows.length} rows,{" "}
                        {report.issues.length} issues
                      </summary>
                      <div className="mt-2 text-sm muted">
                        {report.reportDate ?? "Date missing"} · {report.method} ·
                        confidence{" "}
                        {report.confidence == null
                          ? "—"
                          : `${Math.round(report.confidence * 100)}%`}
                      </div>
                      <pre className="mt-2 max-h-56 overflow-auto rounded bg-black/30 p-3 text-xs">
                        {JSON.stringify(report.rows.slice(0, 25), null, 2)}
                      </pre>
                      {report.extractionDiagnostics && (
                        <details className="mt-2 rounded border border-[#334158] p-3">
                          <summary className="cursor-pointer text-xs font-medium text-slate-200">
                            OCR extraction diagnostics
                          </summary>
                          <pre className="mt-2 max-h-64 overflow-auto text-xs">
                            {JSON.stringify(
                              report.extractionDiagnostics,
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      )}
                      {report.issues.map((issue, index) => (
                        <p
                          key={index}
                          className={
                            issue.severity === "error"
                              ? "text-red-300"
                              : "text-amber-200"
                          }
                        >
                          {issue.severity}: {issue.message}
                        </p>
                      ))}
                    </details>
                  ))}
                </div>
                {preview.reportPageCount > 1 && (
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <button
                      disabled={busy || preview.reportPage <= 1}
                      onClick={() => loadReportPage(preview.reportPage - 1)}
                      className="rounded border border-[#334158] px-3 py-2 disabled:opacity-40"
                    >
                      Previous reports
                    </button>
                    <span className="muted">
                      Page {preview.reportPage} / {preview.reportPageCount}
                    </span>
                    <button
                      disabled={
                        busy || preview.reportPage >= preview.reportPageCount
                      }
                      onClick={() => loadReportPage(preview.reportPage + 1)}
                      className="rounded border border-[#334158] px-3 py-2 disabled:opacity-40"
                    >
                      Next reports
                    </button>
                  </div>
                )}
                <button
                  disabled={
                    busy ||
                    preview.reports.length === 0 ||
                    preview.expectedRows === 0
                  }
                  onClick={confirm}
                  className="mt-5 rounded bg-emerald-600 px-4 py-2 disabled:opacity-50"
                >
                  {busy ? "Importing staged preview…" : "Confirm Import"}
                </button>
                {preview.expectedRows === 0 && (
                  <p className="mt-3 rounded bg-red-500/10 p-3 text-sm text-red-300">
                    Confirmation is disabled because this preview contains no
                    usable rows.
                  </p>
                )}
                {preview.errors > 0 && preview.expectedRows > 0 && (
                  <p className="mt-3 rounded bg-amber-500/10 p-3 text-sm text-amber-200">
                    This preview contains extraction errors. Valid reports and
                    rows can be imported; failed-report diagnostics remain
                    preserved in the batch.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded border border-[#334158] p-5">
                <h3 className="font-medium capitalize">
                  Preview job {job.status}
                </h3>
                <p className="mt-2 text-sm muted">
                  {job.failureMessage ??
                    "The job stopped before a completed preview was available."}
                </p>
                <button
                  onClick={clearFinishedJob}
                  className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm"
                >
                  Start another import
                </button>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="rounded border border-[#334158] p-3">
      <div className="text-xl font-semibold">{n}</div>
      <div className="text-xs muted">{l}</div>
    </div>
  );
}
