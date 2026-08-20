import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const subjectTypes = new Set([
  "ticker",
  "mover",
  "catalyst",
  "research_workspace",
]);

function target(body: any) {
  const subjectType = String(body.subjectType ?? "");
  if (!subjectTypes.has(subjectType)) throw new Error("Invalid annotation target.");
  const value = {
    subject_type: subjectType,
    ticker_id: subjectType === "ticker" ? body.tickerId : null,
    appearance_id: subjectType === "mover" ? body.appearanceId : null,
    event_id: subjectType === "catalyst" ? body.eventId : null,
    workspace_id:
      subjectType === "research_workspace" ? body.workspaceId : null,
    created_by: "researcher",
  };
  if (!value.ticker_id && !value.appearance_id && !value.event_id && !value.workspace_id)
    throw new Error("Annotation target ID is required.");
  return value;
}

export async function POST(request: Request) {
  const db: any = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  try {
    const body = await request.json();
    const values = target(body);
    if (body.action === "note") {
      const note = String(body.note ?? "").trim();
      if (!note || note.length > 10000)
        throw new Error("A note between 1 and 10,000 characters is required.");
      const result = await db.from("research_notes").insert({ ...values, note });
      if (result.error) throw result.error;
      return NextResponse.json({ message: "Research note saved." }, { status: 201 });
    }
    if (body.action === "tag") {
      const tag = String(body.tag ?? "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag))
        throw new Error("Tags must use lowercase letters, numbers, underscores, or hyphens.");
      const result = await db.from("research_tags").upsert({ ...values, tag });
      if (result.error) throw result.error;
      return NextResponse.json({ message: "Research tag saved." }, { status: 201 });
    }
    throw new Error("Unsupported annotation action.");
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
