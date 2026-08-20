import { NextResponse } from "next/server";
import { resolveSocialResearchPreview } from "@/lib/social/planner-preview";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const db: any = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  try {
    const body = await request.json();
    const preview = await resolveSocialResearchPreview(db, body);
    return NextResponse.json(preview, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
