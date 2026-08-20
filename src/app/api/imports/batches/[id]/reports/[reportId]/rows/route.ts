import { NextResponse } from "next/server";
import { getBatchReportRowPage } from "@/lib/import/batch-results";
import { parseDetailPagination, validUuid } from "@/lib/import/detail-pagination";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> },
) {
  try {
    const { id, reportId } = await params;
    if (!validUuid(id) || !validUuid(reportId)) {
      return NextResponse.json({ error: "Invalid batch or report ID." }, { status: 400 });
    }
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server database credentials are not configured." },
        { status: 503 },
      );
    }
    const pagination = parseDetailPagination(
      new URL(request.url).searchParams,
      100,
      100,
    );
    return NextResponse.json(
      await getBatchReportRowPage(db, id, reportId, pagination),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load report rows." },
      { status: 400 },
    );
  }
}

