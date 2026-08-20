import { NextResponse } from "next/server";
import { redditConfiguration } from "@/lib/social/config";
import { resolveSocialResearchPreview } from "@/lib/social/planner-preview";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const reasons = new Set([
  "ticker_page",
  "market_mover",
  "ai_search",
  "watchlist",
  "manual",
  "catalyst_comparison",
  "pattern_match",
  "research_workspace",
]);

export async function POST(request: Request) {
  const db: any = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  try {
    const body = await request.json();
    const reason = String(
      body.reason ?? (body.appearanceId ? "market_mover" : "ticker_page"),
    );
    if (!reasons.has(reason))
      return NextResponse.json(
        { message: "A supported bounded research reason is required." },
        { status: 400 },
      );
    const preview = await resolveSocialResearchPreview(db, {
      ...body,
      ticker: body.ticker ?? body.tickerId,
    });
    const configuration = redditConfiguration();
    if (!configuration.ready) {
      const source = await db
        .from("social_sources")
        .select("id")
        .eq("adapter_key", "reddit")
        .maybeSingle();
      if (source.error) throw source.error;
      let existing = db
        .from("social_research_queue")
        .select("id")
        .eq("ticker_id", preview.tickerId)
        .eq("source_id", source.data.id)
        .eq("date_from", preview.window.from)
        .eq("date_to", preview.window.to)
        .eq("status", "approval_blocked");
      existing = preview.appearanceId
        ? existing.eq("appearance_id", preview.appearanceId)
        : existing.is("appearance_id", null);
      const found = await existing.limit(1).maybeSingle();
      if (found.error) throw found.error;
      let queueId = found.data?.id;
      if (!queueId) {
        const inserted = await db
          .from("social_research_queue")
          .insert({
            ticker_id: preview.tickerId,
            appearance_id: preview.appearanceId,
            source_id: source.data.id,
            community: body.community
              ? String(body.community).toLowerCase()
              : "wallstreetbets",
            date_from: preview.window.from,
            date_to: preview.window.to,
            priority: 0,
            reason,
            status: "approval_blocked",
            coverage_status: "not_researched",
            cursor_state: { preview, blocked_before_provider_call: true },
            last_error: configuration.message,
          })
          .select("id")
          .single();
        if (inserted.error) throw inserted.error;
        queueId = inserted.data.id;
      }
      return NextResponse.json(
        {
          queueId,
          status: "approval_blocked",
          queued: false,
          providerCalls: 0,
          preview,
          message: configuration.message,
        },
        { status: 423 },
      );
    }
    const result = await db.rpc("queue_social_research", {
      p_ticker_id: preview.tickerId,
      p_appearance_id: preview.appearanceId,
      p_reason: reason,
      p_community: body.community
        ? String(body.community).toLowerCase()
        : "wallstreetbets",
      p_date_from: preview.window.from,
      p_date_to: preview.window.to,
    });
    if (result.error) throw result.error;
    return NextResponse.json(
      {
        queueId: result.data,
        status: "queued",
        queued: true,
        providerCalls: 0,
        preview,
        message:
          "Bounded Reddit research queued. Existing records remain available while the worker runs.",
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
