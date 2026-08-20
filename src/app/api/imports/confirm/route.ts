import { NextResponse } from "next/server";
import { markPreviewJobConfirmed } from "@/lib/import/jobs/supabase-preview-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server import credentials are not configured." },
        { status: 503 },
      );
    }
    const body = await request.json();
    if (typeof body.jobId === "string") {
      const progress = await markPreviewJobConfirmed(db, body.jobId);
      return NextResponse.json({
        ...progress,
        batchId: progress.importBatchId,
      });
    }

    // Backward compatibility for previews created before the async-job repair.
    if (typeof body.previewId !== "string") {
      return NextResponse.json(
        { error: "A completed preview job is required." },
        { status: 400 },
      );
    }
    const legacyPreview = await db
      .from("import_previews")
      .select("summary")
      .eq("id", body.previewId)
      .maybeSingle();
    if (legacyPreview.error) throw legacyPreview.error;
    const summary = legacyPreview.data?.summary as
      | { errors?: number; expectedRows?: number }
      | null
      | undefined;
    if (!summary || Number(summary.errors) > 0 || Number(summary.expectedRows) <= 0) {
      return NextResponse.json(
        {
          error:
            "The preview contains extraction errors or no usable rows and cannot be confirmed.",
        },
        { status: 409 },
      );
    }
    const { data, error } = await db.rpc("commit_import_preview", {
      preview_uuid: body.previewId,
    });
    if (error) throw error;
    return NextResponse.json({ batchId: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Import confirmation failed.",
      },
      { status: 400 },
    );
  }
}
