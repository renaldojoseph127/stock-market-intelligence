import { NextResponse } from "next/server";
import { createPersistedPreviewJob } from "@/lib/import/jobs/supabase-preview-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server import credentials are not configured." },
        { status: 503 },
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose a PDF or ZIP archive." },
        { status: 400 },
      );
    }
    if (file.size > 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Upload exceeds the 1 GB safety limit." },
        { status: 413 },
      );
    }
    const progress = await createPersistedPreviewJob(
      db,
      file.name,
      Buffer.from(await file.arrayBuffer()),
    );
    return NextResponse.json(progress, {
      status: progress.status === "completed" ? 200 : 202,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Import upload failed.",
      },
      { status: 400 },
    );
  }
}
