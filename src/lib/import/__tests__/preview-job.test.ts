import { describe, expect, it } from "vitest";
import { previewJobNextAction } from "../jobs/job-phase";
import { runPreviewJobBatch } from "../jobs/process-batch";
import type {
  PreviewBatchRepository,
  PreviewJobFile,
  PreviewReportProcessor,
} from "../jobs/types";
import type { ParsedReport } from "../types";

function reportFor(file: PreviewJobFile): ParsedReport {
  return {
    filename: file.filename,
    fileHash: file.fileHash,
    reportDate: "2025-08-10",
    extractionMethod: "ocr",
    extractionConfidence: 0.92,
    pageCount: 1,
    categories: ["NASDAQ Biggest Gainers"],
    rows: [
      {
        category: "NASDAQ Biggest Gainers",
        ticker: "ABCD",
        rank: 1,
        price: 4.25,
        changeAmount: 1.35,
        changePercent: 46.55,
        trades: 18_350,
        volume: 12_045_000,
        dollarVolume: 49_700_000,
        pageNumber: 1,
        rawValues: { line: "1 ABCD $4.25 1.35 +46.55%" },
      },
    ],
    issues: [],
  };
}

class DurableMemoryRepository implements PreviewBatchRepository {
  files = Array.from({ length: 224 }, (_, ordinal) => ({
    id: String(ordinal),
    jobId: "job",
    ordinal,
    filename: `${ordinal + 1} Screenshot 14.pdf`,
    fileHash: ordinal.toString(16).padStart(64, "0"),
    metadataDate: null,
    storagePath: `job/${ordinal}.pdf`,
    status: "queued" as "queued" | "processing" | "completed" | "failed",
  }));
  persistedReports = new Map<string, ParsedReport>();
  progressWrites = 0;
  currentFilename: string | null = null;
  maximumClaim = 0;

  async claim(_jobId: string, limit: number) {
    const claimed = this.files
      .filter((file) => file.status === "queued")
      .slice(0, limit);
    claimed.forEach((file) => {
      file.status = "processing";
    });
    this.maximumClaim = Math.max(this.maximumClaim, claimed.length);
    return claimed;
  }

  async setCurrent(_jobId: string, filename: string) {
    this.currentFilename = filename;
  }

  async load() {
    return Buffer.from("staged PDF");
  }

  async complete(file: PreviewJobFile, report: ParsedReport) {
    this.persistedReports.set(file.id, report);
    this.files[Number(file.id)].status = "completed";
  }

  async fail(file: PreviewJobFile, error: unknown) {
    this.files[Number(file.id)].status = "failed";
    this.persistedReports.set(file.id, {
      ...reportFor(file),
      rows: [],
      issues: [
        {
          issueType: "page_failure",
          message: String(error),
          severity: "error",
        },
      ],
    });
  }

  async refresh() {
    this.progressWrites += 1;
  }
}

describe("durable preview-job batching", () => {
  it("routes a persisted 224/224 processing job directly to finalization", () => {
    expect(
      previewJobNextAction({
        status: "processing",
        filesProcessed: 224,
        totalFiles: 224,
      }),
    ).toBe("finalize");
    expect(
      previewJobNextAction({
        status: "processing",
        filesProcessed: 223,
        totalFiles: 224,
      }),
    ).toBe("ocr");
  });
  it("processes 224 reports through bounded short calls with per-report persistence", async () => {
    const repository = new DurableMemoryRepository();
    let requestCount = 0;

    while (repository.persistedReports.size < 224) {
      requestCount += 1;
      // Each instance represents a separate HTTP process request. No processor
      // or request needs to remain alive for the whole archive.
      const processor: PreviewReportProcessor = {
        process: async (file) => reportFor(file),
      };
      const result = await runPreviewJobBatch(
        repository,
        processor,
        "job",
        7,
      );
      expect(result.claimed).toBeLessThanOrEqual(7);
    }

    expect(requestCount).toBe(32);
    expect(repository.maximumClaim).toBe(7);
    expect(repository.persistedReports.size).toBe(224);
    expect(repository.progressWrites).toBeGreaterThanOrEqual(224);
    expect(repository.files.every((file) => file.status === "completed")).toBe(
      true,
    );
  });

  it("persists one failed report and continues the rest of its batch", async () => {
    const repository = new DurableMemoryRepository();
    const processor: PreviewReportProcessor = {
      process: async (file) => {
        if (file.ordinal === 2) throw new Error("Unreadable PDF");
        return reportFor(file);
      },
    };

    await runPreviewJobBatch(repository, processor, "job", 5);
    expect(repository.files.slice(0, 5).map((file) => file.status)).toEqual([
      "completed",
      "completed",
      "failed",
      "completed",
      "completed",
    ]);
    expect(repository.persistedReports.get("2")?.issues).toContainEqual(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("caps externally configured batch sizes at ten", async () => {
    const repository = new DurableMemoryRepository();
    await runPreviewJobBatch(
      repository,
      { process: async (file) => reportFor(file) },
      "job",
      10_000,
    );
    expect(repository.persistedReports.size).toBe(10);
    expect(repository.maximumClaim).toBe(10);
  });
});
