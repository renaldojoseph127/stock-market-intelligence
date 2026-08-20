import "server-only";

import { createHash } from "node:crypto";
import { extractArchive } from "../archive/extract-archive";
import { extractPdf } from "../pdf/extract-pdf";
import { TesseractOcrProvider } from "../pdf/ocr";
import { parseReport } from "../pdf/parse-report";
import type { ParsedReport } from "../types";
import { createAdminClient } from "@/lib/supabase/admin";
import { previewJobNextAction } from "./job-phase";
import { runPreviewJobBatch } from "./process-batch";
import type {
  PreviewBatchRepository,
  PreviewJobFile,
  PreviewJobProgress,
  PreviewReportPage,
  PreviewJobStatus,
  PreviewReportProcessor,
} from "./types";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type JobRow = {
  id: string;
  archive_name: string;
  status: PreviewJobStatus;
  total_files: number;
  files_processed: number;
  usable_reports: number;
  extracted_rows: number;
  warning_count: number;
  error_count: number;
  current_filename: string | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  expires_at: string;
  failure_message: string | null;
  preview_id: string | null;
  import_batch_id: string | null;
  finalization_status: "pending" | "running" | "paused" | "completed";
  reports_finalized: number;
  rows_finalized: number;
  finalization_cursor: number;
  finalization_started_at: string | null;
  finalization_updated_at: string | null;
  finalization_completed_at: string | null;
  commit_status: "pending" | "running" | "paused" | "completed";
  commit_stage: "pending" | "reports" | "issues" | "appearances" | "derived" | "completed";
  reports_committed: number;
  rows_committed: number;
  issues_committed: number;
  commit_started_at: string | null;
  commit_updated_at: string | null;
  commit_completed_at: string | null;
};

type JobFileRow = {
  id: string;
  job_id: string;
  ordinal: number;
  filename: string;
  file_hash: string;
  metadata_date: string | null;
  storage_path: string | null;
};

const IMPORT_BUCKET = "scanz-import-preview-jobs";
const STORAGE_UPLOAD_CONCURRENCY = 8;
const DEFAULT_FINALIZATION_BATCH_SIZE = 10;
const DEFAULT_REPORT_COMMIT_BATCH_SIZE = 10;
const DEFAULT_ROW_COMMIT_BATCH_SIZE = 500;
const DEFAULT_ISSUE_COMMIT_BATCH_SIZE = 500;
const DEFAULT_PREVIEW_REPORT_PAGE_SIZE = 5;
const ACTIVE_JOB_STATUSES: PreviewJobStatus[] = [
  "uploading",
  "queued",
  "processing",
  "finalizing",
  "completed",
  "committing",
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function ensureImportBucket(db: AdminClient) {
  const existing = await db.storage.getBucket(IMPORT_BUCKET);
  if (!existing.error) return;
  const created = await db.storage.createBucket(IMPORT_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });
  if (
    created.error &&
    !/already exists|duplicate/i.test(created.error.message)
  ) {
    throw new Error(created.error.message);
  }
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const value = values[cursor];
        cursor += 1;
        await callback(value);
      }
    },
  );
  await Promise.all(workers);
}

async function findAlreadyImportedHashes(db: AdminClient, hashes: string[]) {
  const imported = new Set<string>();
  const unique = [...new Set(hashes)];
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const result = await db
      .from("source_reports")
      .select("file_hash")
      .in("file_hash", chunk);
    assertNoError(result.error, "Could not check existing report fingerprints.");
    for (const row of result.data ?? []) {
      if (typeof row.file_hash === "string") imported.add(row.file_hash);
    }
  }
  return imported;
}

function toJobFile(row: JobFileRow): PreviewJobFile {
  return {
    id: row.id,
    jobId: row.job_id,
    ordinal: row.ordinal,
    filename: row.filename,
    fileHash: row.file_hash,
    metadataDate: row.metadata_date,
    storagePath: row.storage_path,
  };
}

function failedReport(file: PreviewJobFile, error: unknown): ParsedReport {
  return {
    filename: file.filename,
    fileHash: file.fileHash,
    reportDate: null,
    sourceDate: file.metadataDate,
    extractionMethod: "unknown",
    extractionConfidence: null,
    pageCount: 0,
    categories: [],
    rows: [],
    issues: [
      {
        issueType: "page_failure",
        message: errorMessage(error).slice(0, 2_000),
        severity: "error",
      },
    ],
  };
}

function reportCounts(report: ParsedReport) {
  return {
    rows: report.rows.length,
    warnings: report.issues.filter((issue) => issue.severity === "warning")
      .length,
    errors: report.issues.filter((issue) => issue.severity === "error").length,
  };
}

async function storageCleanup(db: AdminClient, paths: string[]) {
  const existing = [...new Set(paths.filter(Boolean))];
  for (let index = 0; index < existing.length; index += 100) {
    await db.storage.from(IMPORT_BUCKET).remove(existing.slice(index, index + 100));
  }
}

export async function createPersistedPreviewJob(
  db: AdminClient,
  archiveName: string,
  archive: Buffer,
) {
  const archiveHash = createHash("sha256").update(archive).digest("hex");
  const existing = await db
    .from("import_preview_jobs")
    .select("*")
    .eq("archive_hash", archiveHash)
    .in("status", ACTIVE_JOB_STATUSES)
    .limit(1)
    .maybeSingle();
  assertNoError(existing.error, "Could not check preview-job idempotency.");
  if (existing.data) {
    const row = existing.data as unknown as JobRow;
    if (new Date(row.expires_at).getTime() > Date.now()) {
      return getPersistedPreviewJob(db, row.id);
    }
    await cancelPersistedPreviewJob(db, row.id);
  }

  // This validates archive paths, entry types, counts, expanded sizes, and PDF
  // sizes before any OCR work or durable job is created.
  const files = await extractArchive(archiveName, archive);
  if (!files.length) throw new Error("No supported PDF files were found.");
  await ensureImportBucket(db);

  const fileHashes = files.map((file) =>
    createHash("sha256").update(file.buffer).digest("hex"),
  );
  const importedHashes = await findAlreadyImportedHashes(db, fileHashes);
  const inserted = await db
    .from("import_preview_jobs")
    .insert({
      archive_name: archiveName,
      archive_hash: archiveHash,
      total_files: files.length,
      status: "uploading",
    })
    .select("id")
    .single();
  if (inserted.error?.code === "23505") {
    const raced = await db
      .from("import_preview_jobs")
      .select("id")
      .eq("archive_hash", archiveHash)
      .in("status", ACTIVE_JOB_STATUSES)
      .limit(1)
      .single();
    assertNoError(raced.error, "Could not recover the existing preview job.");
    if (!raced.data) throw new Error("Existing preview job could not be loaded.");
    return getPersistedPreviewJob(db, String(raced.data.id));
  }
  assertNoError(inserted.error, "Could not create preview job.");
  if (!inserted.data) throw new Error("Preview job creation returned no ID.");
  const jobId = String(inserted.data.id);
  const seen = new Set<string>();
  const manifest = files.map((file, ordinal) => {
    const fileHash = fileHashes[ordinal];
    const duplicate = importedHashes.has(fileHash) || seen.has(fileHash);
    seen.add(fileHash);
    return {
      job_id: jobId,
      ordinal,
      filename: file.filename,
      file_hash: fileHash,
      metadata_date: file.metadataDate,
      storage_path: duplicate
        ? null
        : `${jobId}/${ordinal.toString().padStart(4, "0")}-${fileHash}.pdf`,
      status: duplicate ? "duplicate" : "uploading",
    };
  });
  const workItems = manifest.filter((item) => item.status === "uploading");
  const uploadedPaths: string[] = [];

  try {
    const manifestInsert = await db
      .from("import_preview_job_files")
      .insert(manifest);
    assertNoError(manifestInsert.error, "Could not persist the PDF manifest.");

    await mapWithConcurrency(
      workItems,
      STORAGE_UPLOAD_CONCURRENCY,
      async (item) => {
        const upload = await db.storage
          .from(IMPORT_BUCKET)
          .upload(item.storage_path!, files[item.ordinal].buffer, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (upload.error) throw new Error(upload.error.message);
        uploadedPaths.push(item.storage_path!);
      },
    );

    const queued = await db
      .from("import_preview_job_files")
      .update({ status: "queued" })
      .eq("job_id", jobId)
      .eq("status", "uploading");
    assertNoError(queued.error, "Could not queue uploaded PDFs.");
    const jobQueued = await db
      .from("import_preview_jobs")
      .update({ status: "queued" })
      .eq("id", jobId);
    assertNoError(jobQueued.error, "Could not queue preview job.");
    const refreshed = await db.rpc("refresh_import_preview_job", {
      p_job_id: jobId,
    });
    assertNoError(refreshed.error, "Could not initialize job progress.");
    const finalized = await db.rpc("finalize_import_preview_job", {
      p_job_id: jobId,
    });
    assertNoError(finalized.error, "Could not finalize duplicate-only preview.");
    return getPersistedPreviewJob(db, jobId);
  } catch (error) {
    await db
      .from("import_preview_jobs")
      .update({
        status: "failed",
        failure_message: errorMessage(error).slice(0, 2_000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await storageCleanup(db, uploadedPaths);
    throw error;
  }
}

class SupabasePreviewBatchRepository implements PreviewBatchRepository {
  constructor(private db: AdminClient) {}

  async claim(jobId: string, limit: number) {
    const result = await this.db.rpc("claim_import_preview_job_files", {
      p_job_id: jobId,
      p_limit: limit,
    });
    assertNoError(result.error, "Could not claim preview work.");
    return ((result.data ?? []) as unknown as JobFileRow[]).map(toJobFile);
  }

  async setCurrent(jobId: string, filename: string) {
    const result = await this.db
      .from("import_preview_jobs")
      .update({ current_filename: filename })
      .eq("id", jobId)
      .in("status", ["queued", "processing"]);
    assertNoError(result.error, "Could not update preview progress.");
  }

  async load(file: PreviewJobFile) {
    if (!file.storagePath) throw new Error("The staged PDF path is missing.");
    const result = await this.db.storage
      .from(IMPORT_BUCKET)
      .download(file.storagePath);
    if (result.error) throw new Error(result.error.message);
    return Buffer.from(await result.data.arrayBuffer());
  }

  async complete(file: PreviewJobFile, report: ParsedReport) {
    const counts = reportCounts(report);
    const result = await this.db
      .from("import_preview_job_files")
      .update({
        status: "completed",
        report_payload: report,
        row_count: counts.rows,
        warning_count: counts.warnings,
        error_count: counts.errors,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", file.id)
      .eq("status", "processing");
    assertNoError(result.error, "Could not persist extracted report data.");
    if (file.storagePath) await storageCleanup(this.db, [file.storagePath]);
  }

  async fail(file: PreviewJobFile, error: unknown) {
    // A per-report failure is persisted as a failed report payload. The job can
    // still complete and confirm other usable reports without hiding the error.
    await this.complete(file, failedReport(file, error));
  }

  async refresh(jobId: string) {
    const refreshed = await this.db.rpc("refresh_import_preview_job", {
      p_job_id: jobId,
    });
    assertNoError(refreshed.error, "Could not refresh preview progress.");
    const finalized = await this.db.rpc("finalize_import_preview_job", {
      p_job_id: jobId,
    });
    assertNoError(finalized.error, "Could not finalize preview output.");
  }
}

class ScanzPreviewReportProcessor implements PreviewReportProcessor {
  private ocr = new TesseractOcrProvider();

  async process(file: PreviewJobFile, pdf: Buffer) {
    return parseReport(
      file.filename,
      file.fileHash,
      await extractPdf(pdf, this.ocr),
      file.metadataDate,
    );
  }

  async close() {
    await this.ocr.close();
  }
}

export async function processPersistedPreviewJobBatch(
  db: AdminClient,
  jobId: string,
  batchSize: number,
) {
  const job = await db
    .from("import_preview_jobs")
    .select("id,status,expires_at,files_processed,total_files")
    .eq("id", jobId)
    .maybeSingle();
  assertNoError(job.error, "Could not load preview job.");
  if (!job.data) throw new Error("Preview job not found.");
  const action = previewJobNextAction({
    status: String(job.data.status) as PreviewJobStatus,
    filesProcessed: Number(job.data.files_processed),
    totalFiles: Number(job.data.total_files),
  });
  const recoverable = action === "finalize" || action === "commit";
  if (
    new Date(String(job.data.expires_at)).getTime() <= Date.now() &&
    !recoverable
  ) {
    throw new Error("Preview job has expired.");
  }
  if (action === "finalize") {
    try {
      const finalized = await db.rpc("finalize_import_preview_job_batch", {
        p_job_id: jobId,
        p_limit: DEFAULT_FINALIZATION_BATCH_SIZE,
      });
      assertNoError(finalized.error, "Could not finalize preview batch.");
    } catch (error) {
      await db
        .from("import_preview_jobs")
        .update({
          finalization_status: "paused",
          failure_message:
            `Finalization paused; retrying from saved checkpoint. ${errorMessage(error)}`.slice(
              0,
              2_000,
            ),
        })
        .eq("id", jobId)
        .eq("status", "finalizing");
      throw error;
    }
    return getPersistedPreviewJob(db, jobId);
  }
  if (action === "commit") {
    return processPersistedImportCommitBatch(db, jobId);
  }
  if (action !== "ocr") {
    return getPersistedPreviewJob(db, jobId);
  }

  await runPreviewJobBatch(
    new SupabasePreviewBatchRepository(db),
    new ScanzPreviewReportProcessor(),
    jobId,
    batchSize,
  );
  return getPersistedPreviewJob(db, jobId);
}

function publicReport(report: ParsedReport) {
  return {
    filename: report.filename,
    reportDate: report.reportDate,
    method: report.extractionMethod,
    confidence: report.extractionConfidence,
    categories: report.categories,
    rows: report.rows,
    issues: report.issues,
    extractionDiagnostics: report.extractionDiagnostics,
  };
}

export async function getPersistedPreviewJobReports(
  db: AdminClient,
  jobId: string,
  page = 1,
  pageSize = DEFAULT_PREVIEW_REPORT_PAGE_SIZE,
): Promise<PreviewReportPage> {
  const boundedSize = Math.max(1, Math.min(20, Math.floor(pageSize)));
  const boundedPage = Math.max(1, Math.floor(page));
  const from = (boundedPage - 1) * boundedSize;
  const to = from + boundedSize - 1;
  const result = await db
    .from("import_preview_job_files")
    .select("report_payload", { count: "exact" })
    .eq("job_id", jobId)
    .eq("status", "completed")
    .not("report_payload", "is", null)
    .order("ordinal")
    .range(from, to);
  assertNoError(result.error, "Could not load finalized preview reports.");
  const total = result.count ?? 0;
  const reports = (result.data ?? [])
    .map((row) => row.report_payload as unknown as ParsedReport | null)
    .filter((report): report is ParsedReport => Boolean(report))
    .map(publicReport);
  return {
    reports,
    reportPage: boundedPage,
    reportPageSize: boundedSize,
    reportPageCount: Math.max(1, Math.ceil(total / boundedSize)),
  };
}

export async function getPersistedPreviewJob(
  db: AdminClient,
  jobId: string,
): Promise<PreviewJobProgress> {
  const result = await db
    .from("import_preview_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  assertNoError(result.error, "Could not load preview job status.");
  if (!result.data) throw new Error("Preview job not found.");
  let row = result.data as unknown as JobRow;
  if (
    ACTIVE_JOB_STATUSES.includes(row.status) &&
    new Date(row.expires_at).getTime() <= Date.now() &&
    row.status !== "completed" &&
    !["finalize", "commit"].includes(
      previewJobNextAction({
        status: row.status,
        filesProcessed: row.files_processed,
        totalFiles: row.total_files,
      }),
    )
  ) {
    const files = await db
      .from("import_preview_job_files")
      .select("storage_path")
      .eq("job_id", jobId);
    assertNoError(files.error, "Could not load expired staged PDFs.");
    const expiredFiles = await db
      .from("import_preview_job_files")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .in("status", ["uploading", "queued", "processing"]);
    assertNoError(expiredFiles.error, "Could not expire staged PDFs.");
    const expired = await db
      .from("import_preview_jobs")
      .update({
        status: "failed",
        failure_message: "Preview job expired before completion.",
        current_filename: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    assertNoError(expired.error, "Could not expire preview job.");
    await storageCleanup(
      db,
      (files.data ?? [])
        .map((file) => file.storage_path)
        .filter((path): path is string => typeof path === "string"),
    );
    row = expired.data as unknown as JobRow;
  }
  const progress: PreviewJobProgress = {
    jobId: row.id,
    name: row.archive_name,
    status: row.status,
    totalFiles: row.total_files,
    filesProcessed: row.files_processed,
    usableReports: row.usable_reports,
    extractedRows: row.extracted_rows,
    warnings: row.warning_count,
    errors: row.error_count,
    currentFilename: row.current_filename,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    failureMessage: row.failure_message,
    importBatchId: row.import_batch_id,
    finalizationStatus: row.finalization_status,
    reportsFinalized: row.reports_finalized,
    rowsFinalized: Number(row.rows_finalized),
    finalizationCursor: row.finalization_cursor,
    finalizationStartedAt: row.finalization_started_at,
    finalizationUpdatedAt: row.finalization_updated_at,
    finalizationCompletedAt: row.finalization_completed_at,
    commitStatus: row.commit_status,
    commitStage: row.commit_stage,
    reportsCommitted: row.reports_committed,
    rowsCommitted: Number(row.rows_committed),
    issuesCommitted: row.issues_committed,
    commitStartedAt: row.commit_started_at,
    commitUpdatedAt: row.commit_updated_at,
    commitCompletedAt: row.commit_completed_at,
  };

  if (row.preview_id && row.status === "completed") {
    const previewResult = await db
      .from("import_previews")
      .select("payload,summary")
      .eq("id", row.preview_id)
      .maybeSingle();
    assertNoError(previewResult.error, "Could not load completed preview.");
    if (previewResult.data?.payload && previewResult.data.summary) {
      const payload = previewResult.data.payload as Record<string, unknown>;
      const summary = previewResult.data.summary as Record<string, unknown>;
      const legacyReports = Array.isArray(payload.reports)
        ? (payload.reports as ParsedReport[])
        : null;
      const reportPage = legacyReports
        ? {
            reports: legacyReports.slice(0, DEFAULT_PREVIEW_REPORT_PAGE_SIZE).map(publicReport),
            reportPage: 1,
            reportPageSize: DEFAULT_PREVIEW_REPORT_PAGE_SIZE,
            reportPageCount: Math.max(
              1,
              Math.ceil(legacyReports.length / DEFAULT_PREVIEW_REPORT_PAGE_SIZE),
            ),
          }
        : await getPersistedPreviewJobReports(db, jobId);
      progress.preview = {
        previewId: row.preview_id,
        filesDetected: Number(summary.filesDetected ?? row.total_files),
        reportsDetected: Number(summary.reportsDetected ?? row.usable_reports),
        earliestDate:
          typeof summary.earliestDate === "string" ? summary.earliestDate : null,
        latestDate:
          typeof summary.latestDate === "string" ? summary.latestDate : null,
        categories: Array.isArray(summary.categories)
          ? summary.categories.map(String)
          : [],
        expectedRows: Number(summary.expectedRows ?? row.extracted_rows),
        potentialDuplicates: Number(summary.potentialDuplicates ?? 0),
        warnings: Number(summary.warnings ?? row.warning_count),
        errors: Number(summary.errors ?? row.error_count),
        duplicates: Array.isArray(payload.duplicates)
          ? payload.duplicates.map(String)
          : [],
        ...reportPage,
      };
    }
  }
  return progress;
}

export async function cancelPersistedPreviewJob(
  db: AdminClient,
  jobId: string,
) {
  const files = await db
    .from("import_preview_job_files")
    .select("storage_path")
    .eq("job_id", jobId);
  assertNoError(files.error, "Could not load staged PDF paths.");
  const cancelledFiles = await db
    .from("import_preview_job_files")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .in("status", ["uploading", "queued", "processing"]);
  assertNoError(cancelledFiles.error, "Could not cancel queued reports.");
  const cancelledJob = await db
    .from("import_preview_jobs")
    .update({
      status: "cancelled",
      current_filename: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["uploading", "queued", "processing"]);
  assertNoError(cancelledJob.error, "Could not cancel preview job.");
  await storageCleanup(
    db,
    (files.data ?? [])
      .map((file) => file.storage_path)
      .filter((path): path is string => typeof path === "string"),
  );
  return getPersistedPreviewJob(db, jobId);
}

export async function markPreviewJobConfirmed(db: AdminClient, jobId: string) {
  return processPersistedImportCommitBatch(db, jobId);
}

export async function processPersistedImportCommitBatch(
  db: AdminClient,
  jobId: string,
) {
  try {
    const committed = await db.rpc("commit_import_preview_job_batch", {
      p_job_id: jobId,
      p_report_limit: DEFAULT_REPORT_COMMIT_BATCH_SIZE,
      p_row_limit: DEFAULT_ROW_COMMIT_BATCH_SIZE,
      p_issue_limit: DEFAULT_ISSUE_COMMIT_BATCH_SIZE,
    });
    assertNoError(committed.error, "Import confirmation batch failed.");
  } catch (error) {
    await db
      .from("import_preview_jobs")
      .update({
        commit_status: "paused",
        failure_message:
          `Import commit paused; retrying from saved checkpoint. ${errorMessage(error)}`.slice(
            0,
            2_000,
          ),
      })
      .eq("id", jobId)
      .eq("status", "committing");
    throw error;
  }
  return getPersistedPreviewJob(db, jobId);
}

/**
 * Finalization-only recovery. This intentionally has no archive, Storage,
 * PDF, parser, or OCR code path and can only consume completed child payloads.
 */
export async function resumePersistedPreviewFinalization(
  db: AdminClient,
  jobId: string,
) {
  try {
    const finalized = await db.rpc("finalize_import_preview_job_batch", {
      p_job_id: jobId,
      p_limit: DEFAULT_FINALIZATION_BATCH_SIZE,
    });
    assertNoError(finalized.error, "Could not resume preview finalization.");
  } catch (error) {
    await db
      .from("import_preview_jobs")
      .update({
        finalization_status: "paused",
        failure_message:
          `Finalization paused; retrying from saved checkpoint. ${errorMessage(error)}`.slice(
            0,
            2_000,
          ),
      })
      .eq("id", jobId)
      .eq("status", "finalizing");
    throw error;
  }
  return getPersistedPreviewJob(db, jobId);
}
