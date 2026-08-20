import type { ParsedReport } from "../types";

export type PreviewJobStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "finalizing"
  | "completed"
  | "committing"
  | "failed"
  | "cancelled"
  | "confirmed";

export type PreviewJobFile = {
  id: string;
  jobId: string;
  ordinal: number;
  filename: string;
  fileHash: string;
  metadataDate: string | null;
  storagePath: string | null;
};

export type PreviewJobProgress = {
  jobId: string;
  name: string;
  status: PreviewJobStatus;
  totalFiles: number;
  filesProcessed: number;
  usableReports: number;
  extractedRows: number;
  warnings: number;
  errors: number;
  currentFilename: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string;
  failureMessage: string | null;
  importBatchId: string | null;
  finalizationStatus: "pending" | "running" | "paused" | "completed";
  reportsFinalized: number;
  rowsFinalized: number;
  finalizationCursor: number;
  finalizationStartedAt: string | null;
  finalizationUpdatedAt: string | null;
  finalizationCompletedAt: string | null;
  commitStatus: "pending" | "running" | "paused" | "completed";
  commitStage:
    | "pending"
    | "reports"
    | "issues"
    | "appearances"
    | "derived"
    | "completed";
  reportsCommitted: number;
  rowsCommitted: number;
  issuesCommitted: number;
  commitStartedAt: string | null;
  commitUpdatedAt: string | null;
  commitCompletedAt: string | null;
  preview?: {
    previewId: string;
    filesDetected: number;
    reportsDetected: number;
    earliestDate: string | null;
    latestDate: string | null;
    categories: string[];
    expectedRows: number;
    potentialDuplicates: number;
    warnings: number;
    errors: number;
    duplicates: string[];
    reports: Array<{
      filename: string;
      reportDate: string | null;
      method: string;
      confidence: number | null;
      categories: string[];
      rows: Array<Record<string, unknown>>;
      issues: Array<{ severity: string; message: string }>;
      extractionDiagnostics?: ParsedReport["extractionDiagnostics"];
    }>;
    reportPage: number;
    reportPageSize: number;
    reportPageCount: number;
  };
};

export type PreviewReportPage = Pick<
  NonNullable<PreviewJobProgress["preview"]>,
  "reports" | "reportPage" | "reportPageSize" | "reportPageCount"
>;

export interface PreviewBatchRepository {
  claim(jobId: string, limit: number): Promise<PreviewJobFile[]>;
  setCurrent(jobId: string, filename: string): Promise<void>;
  load(file: PreviewJobFile): Promise<Buffer>;
  complete(file: PreviewJobFile, report: ParsedReport): Promise<void>;
  fail(file: PreviewJobFile, error: unknown): Promise<void>;
  refresh(jobId: string): Promise<void>;
}

export interface PreviewReportProcessor {
  process(file: PreviewJobFile, pdf: Buffer): Promise<ParsedReport>;
  close?(): Promise<void>;
}
