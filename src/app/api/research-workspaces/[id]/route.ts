import { NextResponse } from "next/server";
import { ResultValidator } from "@/lib/research/result-validator";
import type { QueryPlan } from "@/lib/research/types";
import { createAdminClient } from "@/lib/supabase/admin";

const itemTypes = new Set([
  "pinned_ticker",
  "saved_comparison",
  "saved_prompt",
  "saved_filter",
  "saved_event",
  "saved_filing",
  "saved_catalyst_comparison",
  "saved_timeline",
  "ticker",
  "mover",
  "catalyst",
  "social_post",
  "account",
  "research_prompt",
  "comparison",
  "note",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  const { id } = await params;
  const body = await request.json();
  const action = String(body.action ?? "");
  if (action === "save_search") {
    const name = String(body.name ?? "").trim();
    const query = String(body.query ?? "").trim();
    const plan = body.plan as QueryPlan;
    if (!name || !query)
      return NextResponse.json(
        { message: "Saved-search name and question are required." },
        { status: 400 },
      );
    try {
      new ResultValidator().validatePlan(plan);
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }
    const { error } = await (db as any)
      .from("saved_searches")
      .insert({
        workspace_id: id,
        name,
        natural_language_query: query,
        structured_query: plan,
      });
    return NextResponse.json(
      { message: error ? error.message : "Search saved." },
      { status: error ? 400 : 201 },
    );
  }
  if (action === "add_item") {
    const type = String(body.itemType ?? "");
    const name = String(body.name ?? "").trim();
    if (!itemTypes.has(type) || !name)
      return NextResponse.json(
        { message: "Choose a valid workspace item." },
        { status: 400 },
      );
    let tickerId = body.tickerId ? String(body.tickerId) : null;
    const appearanceId = body.appearanceId ? String(body.appearanceId) : null;
    const eventId = body.eventId ? String(body.eventId) : null;
    const socialPostId = body.socialPostId ? String(body.socialPostId) : null;
    const accountId = body.accountId ? String(body.accountId) : null;
    if (type === "mover") {
      const target = await (db as any)
        .from("market_mover_appearances")
        .select("ticker_id")
        .eq("id", appearanceId)
        .maybeSingle();
      if (target.error || !target.data)
        return NextResponse.json(
          { message: target.error?.message ?? "Mover appearance not found." },
          { status: target.error ? 400 : 404 },
        );
      tickerId = target.data.ticker_id;
    }
    if (type === "catalyst") {
      const target = await (db as any)
        .from("ticker_events")
        .select("ticker_id")
        .eq("id", eventId)
        .maybeSingle();
      if (target.error || !target.data)
        return NextResponse.json(
          { message: target.error?.message ?? "Catalyst event not found." },
          { status: target.error ? 400 : 404 },
        );
      tickerId = target.data.ticker_id;
    }
    if (type === "social_post") {
      const target = await (db as any)
        .from("post_tickers")
        .select("ticker_id")
        .eq("post_id", socialPostId)
        .limit(1)
        .maybeSingle();
      if (target.error)
        return NextResponse.json({ message: target.error.message }, { status: 400 });
      tickerId = target.data?.ticker_id ?? tickerId;
    }
    const { error } = await (db as any)
      .from("research_workspace_items")
      .insert({
        workspace_id: id,
        item_type: type,
        name,
        ticker_id: ["pinned_ticker", "ticker", "mover", "catalyst", "social_post"].includes(type)
          ? tickerId
          : null,
        appearance_id: type === "mover" ? appearanceId : null,
        event_id: type === "catalyst" ? eventId : null,
        social_post_id: type === "social_post" ? socialPostId : null,
        account_id: type === "account" ? accountId : null,
        content:
          body.content && typeof body.content === "object" ? body.content : {},
      });
    return NextResponse.json(
      {
        message: error
          ? error.code === "23505"
            ? "This evidence is already in the workspace."
            : error.message
          : "Workspace item saved.",
      },
      { status: error ? 400 : 201 },
    );
  }
  if (action === "remove_item") {
    const { error } = await (db as any)
      .from("research_workspace_items")
      .delete()
      .eq("workspace_id", id)
      .eq("id", body.itemId);
    return NextResponse.json(
      { message: error ? error.message : "Workspace item removed." },
      { status: error ? 400 : 200 },
    );
  }
  if (action === "update") {
    const name = String(body.name ?? "").trim();
    const status = String(body.status ?? "active");
    if (!name)
      return NextResponse.json(
        { message: "Workspace name is required." },
        { status: 400 },
      );
    if (!["active", "follow_up", "complete", "archived"].includes(status))
      return NextResponse.json(
        { message: "Choose a valid workspace status." },
        { status: 400 },
      );
    const { error } = await (db as any)
      .from("research_workspaces")
      .update({
        name,
        description: String(body.description ?? "").trim() || null,
        status,
      })
      .eq("id", id);
    return NextResponse.json(
      { message: error ? error.message : "Workspace updated." },
      { status: error ? 400 : 200 },
    );
  }
  if (action === "add_question") {
    const question = String(body.question ?? "").trim();
    if (!question)
      return NextResponse.json({ message: "Research question is required." }, { status: 400 });
    const { error } = await (db as any)
      .from("research_questions")
      .insert({ workspace_id: id, question });
    return NextResponse.json(
      { message: error ? error.message : "Research question saved separately from evidence." },
      { status: error ? 400 : 201 },
    );
  }
  if (action === "update_question") {
    const status = String(body.status ?? "open");
    if (!["open", "answered", "deferred"].includes(status))
      return NextResponse.json({ message: "Choose a valid question status." }, { status: 400 });
    const { error } = await (db as any)
      .from("research_questions")
      .update({ status })
      .eq("workspace_id", id)
      .eq("id", body.questionId);
    return NextResponse.json(
      { message: error ? error.message : "Research question updated." },
      { status: error ? 400 : 200 },
    );
  }
  if (action === "toggle_checklist") {
    const completed = Boolean(body.completed);
    const { error } = await (db as any)
      .from("research_checklist_items")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("workspace_id", id)
      .eq("id", body.itemId);
    return NextResponse.json(
      { message: error ? error.message : "Manual checklist updated." },
      { status: error ? 400 : 200 },
    );
  }
  if (action === "save_brief_snapshot") {
    const briefType = String(body.briefType ?? "");
    const dataMode = body.dataMode === "effective" ? "effective" : "raw";
    if (!["ticker", "mover"].includes(briefType) || !body.tickerId || !body.version || !body.title || (briefType === "mover" && !body.appearanceId))
      return NextResponse.json({ message: "Complete brief snapshot metadata is required." }, { status: 400 });
    const provenance = body.provenance && typeof body.provenance === "object" ? body.provenance : {};
    const coverage = body.coverage && typeof body.coverage === "object" ? body.coverage : {};
    const { error } = await (db as any).from("research_brief_snapshots").insert({
      workspace_id: id,
      brief_type: briefType,
      ticker_id: String(body.tickerId),
      appearance_id: briefType === "mover" ? String(body.appearanceId ?? "") : null,
      data_mode: dataMode,
      research_brief_version: String(body.version),
      title: String(body.title).trim(),
      provenance,
      coverage,
      generated_at: body.generatedAt || new Date().toISOString(),
    });
    return NextResponse.json(
      { message: error ? error.message : "Research brief snapshot reference saved." },
      { status: error ? 400 : 201 },
    );
  }
  return NextResponse.json(
    { message: "Unknown workspace action." },
    { status: 400 },
  );
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  const { id } = await params;
  const { error } = await (db as any)
    .from("research_workspaces")
    .delete()
    .eq("id", id);
  return NextResponse.json(
    { message: error ? error.message : "Workspace deleted." },
    { status: error ? 400 : 200 },
  );
}
