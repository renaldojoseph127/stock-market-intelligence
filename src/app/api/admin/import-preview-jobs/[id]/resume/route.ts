import { NextResponse } from "next/server";
import { resumePersistedPreviewFinalization } from "@/lib/import/jobs/supabase-preview-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

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
      await resumePersistedPreviewFinalization(db, id),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Preview finalization recovery failed.",
      },
      { status: 400 },
    );
  }
}
