import { NextResponse } from "next/server";
import { processCatalystQueue } from "@/lib/catalysts/pipeline";
import { safeExternalUrl } from "@/lib/catalysts/url";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
const date = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const eventTypes = new Set([
  "news",
  "earnings",
  "sec_filing",
  "offering",
  "reverse_split",
  "stock_split",
  "fda",
  "contract",
  "merger",
  "acquisition",
  "analyst",
  "other",
]);

export async function POST(request: Request) {
  const db: any = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "A JSON body is required." },
      { status: 400 },
    );
  }
  const action = String(body.action ?? "");
  try {
    if (action === "process")
      return NextResponse.json(
        await processCatalystQueue(db, {
          limit: Math.max(1, Math.min(Number(body.limit) || 1, 5)),
        }),
      );
    if (action === "retry_failed") {
      const { data, error } = await db.rpc("retry_failed_catalyst_research", {
        p_limit: Math.max(1, Math.min(Number(body.limit) || 25, 50)),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({
        retried: data,
        message: `${data} failed catalyst request(s) returned to the queue.`,
      });
    }
    if (action === "queue_selection") {
      const selection = String(body.selection ?? "");
      if (selection === "selected_mover") {
        const mover = await db
          .from("market_mover_appearances")
          .select("id,ticker_id,report_date")
          .eq("id", String(body.appearanceId ?? ""))
          .maybeSingle();
        if (mover.error || !mover.data)
          return NextResponse.json(
            { message: mover.error?.message ?? "Mover appearance not found." },
            { status: mover.error ? 400 : 404 },
          );
        const queued = await db.rpc("queue_catalyst_research", {
          p_ticker_id: mover.data.ticker_id,
          p_appearance_id: mover.data.id,
          p_reason: "market_mover",
          p_date_from: date(body.dateFrom),
          p_date_to: date(body.dateTo),
          p_required_sources: ["sec"],
        });
        if (queued.error) throw new Error(queued.error.message);
        return NextResponse.json(
          {
            queued: 1,
            queueIds: [queued.data],
            message: "Selected mover queued for bounded catalyst research.",
          },
          { status: 202 },
        );
      }
      let tickerIds: string[] | null = null;
      if (selection === "selected_tickers") {
        const symbols = [
          ...new Set(
            String(body.symbols ?? "")
              .split(/[\s,]+/)
              .map((value) => value.trim().toUpperCase())
              .filter(Boolean),
          ),
        ].slice(0, 50);
        if (!symbols.length)
          return NextResponse.json(
            { message: "Enter at least one ticker symbol." },
            { status: 400 },
          );
        const tickers = await db
          .from("tickers")
          .select("id,symbol")
          .in("symbol", symbols);
        if (tickers.error) throw new Error(tickers.error.message);
        tickerIds = (tickers.data ?? []).map((row: any) => row.id);
        if (!tickerIds?.length)
          return NextResponse.json(
            { message: "No entered ticker symbol exists in the database." },
            { status: 404 },
          );
      }
      const queued = await db.rpc("queue_catalyst_selection", {
        p_selection: selection,
        p_ticker_ids: tickerIds,
        p_watchlist_id: body.watchlistId || null,
        p_date_from: date(body.dateFrom),
        p_date_to: date(body.dateTo),
        p_limit: Math.max(1, Math.min(Number(body.limit) || 25, 50)),
      });
      if (queued.error) throw new Error(queued.error.message);
      return NextResponse.json(
        {
          ...queued.data,
          message: `${queued.data?.queued ?? 0} selected ticker request(s) queued. No full-universe research was started.`,
        },
        { status: 202 },
      );
    }
    if (action === "manual_event") {
      const sourceUrl = safeExternalUrl(body.sourceUrl);
      const type = String(body.eventType ?? "");
      if (!sourceUrl || !eventTypes.has(type))
        return NextResponse.json(
          {
            message:
              "A supported event type and HTTPS public source URL are required.",
          },
          { status: 400 },
        );
      const ticker = await db
        .from("tickers")
        .select("id,symbol")
        .eq(
          "symbol",
          String(body.symbol ?? "")
            .trim()
            .toUpperCase(),
        )
        .maybeSingle();
      if (ticker.error || !ticker.data)
        return NextResponse.json(
          { message: ticker.error?.message ?? "Ticker not found." },
          { status: ticker.error ? 400 : 404 },
        );
      const created = await db.rpc("create_manual_catalyst_event", {
        p_ticker_id: ticker.data.id,
        p_event_at: body.eventAt,
        p_event_type: type,
        p_event_subtype: String(body.eventSubtype ?? "").trim() || null,
        p_headline: String(body.headline ?? ""),
        p_source_url: sourceUrl,
        p_source_name: String(body.sourceName ?? ""),
        p_notes: String(body.notes ?? ""),
        p_actor: String(body.actor ?? ""),
        p_reason: String(body.reason ?? ""),
      });
      if (created.error) throw new Error(created.error.message);
      await db.rpc("refresh_catalyst_search_document", {
        p_event_id: created.data,
      });
      return NextResponse.json(
        {
          eventId: created.data,
          message: "Manual public-source event recorded with audit provenance.",
        },
        { status: 201 },
      );
    }
    if (action === "correct_event") {
      const corrected = await db.rpc("correct_catalyst_event", {
        p_event_id: body.eventId,
        p_normalized_headline: body.normalizedHeadline || null,
        p_normalized_description: body.normalizedDescription || null,
        p_event_subtype: body.eventSubtype || null,
        p_actor: body.actor,
        p_reason: body.reason,
      });
      if (corrected.error) throw new Error(corrected.error.message);
      await db.rpc("refresh_catalyst_search_document", {
        p_event_id: body.eventId,
      });
      return NextResponse.json({
        result: corrected.data,
        message:
          "Normalized interpretation corrected; original source facts remain unchanged.",
      });
    }
    if (action === "review_cluster") {
      const reviewed = await db.rpc("review_event_cluster_candidate", {
        p_candidate_id: body.candidateId,
        p_decision: body.decision,
        p_actor: body.actor,
        p_reason: body.reason,
      });
      if (reviewed.error) throw new Error(reviewed.error.message);
      return NextResponse.json({
        result: reviewed.data,
        message: "Duplicate candidate review recorded.",
      });
    }
    return NextResponse.json(
      { message: "Unsupported catalyst management action." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
