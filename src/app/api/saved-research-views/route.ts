import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const sourcePages = new Set([
  "market_movers",
  "cross_source_analytics",
  "ai_search",
  "research_today",
  "ticker_history",
]);

export async function POST(request: Request) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json({ message: "Dedicated Supabase service credentials are not configured." }, { status: 503 });
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const sourcePage = String(body.sourcePage ?? "");
  const route = String(body.route ?? "");
  const filters = body.filters && typeof body.filters === "object" && !Array.isArray(body.filters) ? body.filters : {};
  const dataMode = body.dataMode === "effective" ? "effective" : "raw";
  if (!name || !sourcePages.has(sourcePage) || !route.startsWith("/"))
    return NextResponse.json({ message: "Name, source page, and an internal route are required." }, { status: 400 });
  const { data, error } = await (db as any)
    .from("saved_research_views")
    .insert({
      workspace_id: body.workspaceId || null,
      name,
      description: String(body.description ?? "").trim() || null,
      source_page: sourcePage,
      route,
      filters,
      data_mode: dataMode,
    })
    .select("id")
    .single();
  return NextResponse.json(error ? { message: error.message } : { id: data.id, message: "Research view saved." }, { status: error ? 400 : 201 });
}

export async function DELETE(request: Request) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json({ message: "Dedicated Supabase service credentials are not configured." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Saved view ID is required." }, { status: 400 });
  const { error } = await (db as any).from("saved_research_views").delete().eq("id", id);
  return NextResponse.json({ message: error ? error.message : "Research view removed." }, { status: error ? 400 : 200 });
}

