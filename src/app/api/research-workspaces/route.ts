import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const checklist = [
  ["review_mover_data", "Review mover data"],
  ["review_catalyst_evidence", "Review catalyst evidence"],
  ["review_quality_flags", "Review quality flags"],
  ["review_social_coverage", "Review social coverage"],
  ["compare_historical_setups", "Compare historical setups"],
  ["add_notes", "Add notes"],
  ["export_brief", "Export brief"],
];

export async function POST(request: Request) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json({ message: "Dedicated Supabase service credentials are not configured." }, { status: 503 });
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ message: "Workspace name is required." }, { status: 400 });
  const { data, error } = await (db as any)
    .from("research_workspaces")
    .insert({ name, description: String(body.description ?? "").trim() || null, status: "active" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  const seeded = await (db as any).from("research_checklist_items").insert(
    checklist.map(([item_key, label]) => ({ workspace_id: data.id, item_key, label })),
  );
  return NextResponse.json(
    seeded.error
      ? { id: data.id, message: `Workspace created; checklist unavailable: ${seeded.error.message}` }
      : { id: data.id, message: "Research workspace created with a manual checklist." },
    { status: 201 },
  );
}
