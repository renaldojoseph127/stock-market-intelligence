import { NextResponse } from "next/server";
import {
  cancelPersistedPreviewJob,
  getPersistedPreviewJob,
} from "@/lib/import/jobs/supabase-preview-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "Invalid preview job ID." }, { status: 400 });
    }
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server import credentials are not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(await getPersistedPreviewJob(db, id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load preview job.",
      },
      { status: 404 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "Invalid preview job ID." }, { status: 400 });
    }
    const db = createAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server import credentials are not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(await cancelPersistedPreviewJob(db, id));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not cancel preview job.",
      },
      { status: 400 },
    );
  }
}
