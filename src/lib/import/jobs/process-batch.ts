import type {
  PreviewBatchRepository,
  PreviewReportProcessor,
} from "./types";

export const DEFAULT_PREVIEW_BATCH_SIZE = 2;
export const MAX_PREVIEW_BATCH_SIZE = 10;

export async function runPreviewJobBatch(
  repository: PreviewBatchRepository,
  processor: PreviewReportProcessor,
  jobId: string,
  batchSize = DEFAULT_PREVIEW_BATCH_SIZE,
) {
  const boundedSize = Math.max(
    1,
    Math.min(MAX_PREVIEW_BATCH_SIZE, Math.floor(batchSize)),
  );
  const files = await repository.claim(jobId, boundedSize);

  try {
    for (const file of files) {
      await repository.setCurrent(jobId, file.filename);
      try {
        const pdf = await repository.load(file);
        const report = await processor.process(file, pdf);
        await repository.complete(file, report);
      } catch (error) {
        await repository.fail(file, error);
      }
      // Persist counters after every report, not merely after the batch, so a
      // terminated request loses at most the currently leased report.
      await repository.refresh(jobId);
    }
  } finally {
    await processor.close?.();
  }

  await repository.refresh(jobId);
  return { claimed: files.length, batchSize: boundedSize };
}
