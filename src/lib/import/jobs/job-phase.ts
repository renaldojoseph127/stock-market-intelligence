import type { PreviewJobStatus } from "./types";

export type PreviewJobNextAction = "ocr" | "finalize" | "commit" | "idle";

export function previewJobNextAction(job: {
  status: PreviewJobStatus;
  filesProcessed: number;
  totalFiles: number;
}): PreviewJobNextAction {
  if (job.status === "finalizing") return "finalize";
  if (job.status === "committing") return "commit";
  if (
    ["queued", "processing"].includes(job.status) &&
    job.filesProcessed >= job.totalFiles
  ) {
    return "finalize";
  }
  if (["queued", "processing"].includes(job.status)) return "ocr";
  return "idle";
}
