import { NextResponse } from "next/server";
import { getBatchReportPage } from "@/lib/import/batch-results";
import { parseDetailPagination, validUuid } from "@/lib/import/detail-pagination";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!validUuid(id)) {
      return NextResponse.json({ error: "Invalid batch ID." }, { status: 400 });
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
      20,
      100,
    );
    return NextResponse.json(await getBatchReportPage(db, id, pagination), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load reports." },
      { status: 400 },
    );
  }
}

