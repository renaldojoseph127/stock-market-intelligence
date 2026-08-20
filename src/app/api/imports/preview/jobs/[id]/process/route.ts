import { NextResponse } from "next/server";
import { processPersistedPreviewJobBatch } from "@/lib/import/jobs/supabase-preview-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

function batchSize() {
  const configured = Number(process.env.IMPORT_PREVIEW_BATCH_SIZE ?? 2);
  return Number.isFinite(configured)
    ? Math.max(1, Math.min(10, Math.floor(configured)))
    : 2;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server import credentials are not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      await processPersistedPreviewJobBatch(db, id, batchSize()),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Preview batch processing failed.",
      },
      { status: 400 },
    );
  }
}
