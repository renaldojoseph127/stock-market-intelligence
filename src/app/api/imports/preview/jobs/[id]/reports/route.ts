import { NextResponse } from "next/server";
import { getPersistedPreviewJobReports } from "@/lib/import/jobs/supabase-preview-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 5);
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server import credentials are not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      await getPersistedPreviewJobReports(db, id, page, pageSize),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load preview report page.",
      },
      { status: 400 },
    );
  }
}
