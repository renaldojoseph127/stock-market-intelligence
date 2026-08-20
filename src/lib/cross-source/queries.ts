import { createClient } from "@/lib/supabase/server";
import type {
  CrossSourceTimelineQuery,
  CrossSourceTimelineResult,
  IntelligenceTimelineItem,
  MarketDataMode,
} from "./types";

type QueryEnvelope<T> = { data: T; configured: boolean; error: string | null };

async function safe<T>(
  fallback: T,
  run: (db: any) => Promise<{ data: T | null; error: any }>,
): Promise<QueryEnvelope<T>> {
  const db = await createClient();
  if (!db) return { data: fallback, configured: false, error: null };
  try {
    const result = await run(db);
    return {
      data: result.data ?? fallback,
      configured: true,
      error: result.error?.message ?? null,
    };
  } catch (error) {
    return {
      data: fallback,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const mode = (value?: string): MarketDataMode =>
  value === "effective" ? "effective" : "raw";

export async function getCrossSourceTimeline(
  input: CrossSourceTimelineQuery,
): Promise<QueryEnvelope<CrossSourceTimelineResult>> {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.max(1, Math.min(Number(input.pageSize) || 50, 100));
  const dataMode = mode(input.dataMode);
  const fallback = { items: [], page, pageSize, total: 0, dataMode };
  return safe(fallback, async (db) => {
    const result = await db.rpc("get_cross_source_timeline", {
      p_ticker_ids: input.tickerIds?.length ? input.tickerIds : null,
      p_appearance_id: input.appearanceId ?? null,
      p_event_id: input.eventId ?? null,
      p_data_mode: dataMode,
      p_source_domains: input.sourceDomains?.length
        ? input.sourceDomains
        : null,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    const rows = (result.data ?? []) as IntelligenceTimelineItem[];
    return {
      data: {
        items: rows,
        page,
        pageSize,
        total: Number(rows[0]?.total_count ?? 0),
        dataMode,
      },
      error: result.error,
    };
  });
}

export const getTickerIntelligenceSummary = (tickerId: string) =>
  safe<any>(null, (db) =>
    db
      .from("ticker_intelligence_summary")
      .select("*")
      .eq("ticker_id", tickerId)
      .maybeSingle(),
  );

export const getMoverIntelligenceSummary = (appearanceId: string) =>
  safe<any>(null, (db) =>
    db
      .from("mover_intelligence_summary")
      .select("*")
      .eq("appearance_id", appearanceId)
      .maybeSingle(),
  );

export const getEventIntelligenceSummary = (eventId: string) =>
  safe<any>(null, (db) =>
    db
      .from("event_intelligence_summary")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle(),
  );

export const getCrossSourceAnalytics = () =>
  safe<any>(null, (db) =>
    db.from("cross_source_analytics_summary").select("*").maybeSingle(),
  );

export async function getResearchAnnotations(subject: {
  subjectType: "ticker" | "mover" | "catalyst" | "research_workspace";
  tickerId?: string;
  appearanceId?: string;
  eventId?: string;
  workspaceId?: string;
}) {
  return safe<any>({ notes: [], tags: [] }, async (db) => {
    const column =
      subject.subjectType === "ticker"
        ? ["ticker_id", subject.tickerId]
        : subject.subjectType === "mover"
          ? ["appearance_id", subject.appearanceId]
          : subject.subjectType === "catalyst"
            ? ["event_id", subject.eventId]
            : ["workspace_id", subject.workspaceId];
    const [notes, tags] = await Promise.all([
      db
        .from("research_notes")
        .select("*")
        .eq("subject_type", subject.subjectType)
        .eq(column[0], column[1])
        .order("updated_at", { ascending: false })
        .limit(100),
      db
        .from("research_tags")
        .select("*")
        .eq("subject_type", subject.subjectType)
        .eq(column[0], column[1])
        .order("tag")
        .limit(100),
    ]);
    return {
      data: { notes: notes.data ?? [], tags: tags.data ?? [] },
      error: notes.error ?? tags.error,
    };
  });
}

export async function getSocialBeforeCatalyst(eventId: string) {
  return safe<any>({ evidence: [], coverage: [] }, async (db) => {
    const event = await db
      .from("ticker_events")
      .select("ticker_id,event_date")
      .eq("id", eventId)
      .maybeSingle();
    if (event.error || !event.data)
      return { data: { evidence: [], coverage: [] }, error: event.error };
    const [evidence, coverage] = await Promise.all([
      db
        .from("social_catalyst_relationship_detail")
        .select("*")
        .eq("event_id", eventId)
        .eq("relationship_type", "discussion_before_catalyst")
        .order("post_at", { ascending: true })
        .limit(50),
      db
        .from("ticker_social_coverage")
        .select("*,social_sources(name)")
        .eq("ticker_id", event.data.ticker_id)
        .lte("date_from", event.data.event_date)
        .gte("date_to", event.data.event_date)
        .order("last_researched_at", { ascending: false })
        .limit(20),
    ]);
    return {
      data: { evidence: evidence.data ?? [], coverage: coverage.data ?? [] },
      error: evidence.error ?? coverage.error,
    };
  });
}

export async function getSocialAfterCatalyst(eventId: string) {
  const result = await getSocialBeforeCatalyst(eventId);
  if (!result.configured || result.error) return result;
  return safe<any>(result.data, async (db) => {
    const evidence = await db
      .from("social_catalyst_relationship_detail")
      .select("*")
      .eq("event_id", eventId)
      .eq("relationship_type", "discussion_after_catalyst")
      .order("post_at", { ascending: true })
      .limit(50);
    return {
      data: { evidence: evidence.data ?? [], coverage: result.data.coverage },
      error: evidence.error,
    };
  });
}

export const getSocialBetweenCatalystAndMove = (
  eventId: string,
  appearanceId: string,
) =>
  safe<any>({ evidence: [], coverage: [] }, async (db) => {
    const relationship = await db
      .from("event_mover_relationships")
      .select("ticker_id,event_at,mover_date")
      .eq("event_id", eventId)
      .eq("appearance_id", appearanceId)
      .maybeSingle();
    if (relationship.error || !relationship.data)
      return {
        data: { evidence: [], coverage: [] },
        error: relationship.error,
      };
    const [evidence, coverage] = await Promise.all([
      db
        .from("social_posts")
        .select("id,posted_at,title,body,post_tickers!inner(ticker_id)")
        .eq("post_tickers.ticker_id", relationship.data.ticker_id)
        .gte("posted_at", relationship.data.event_at)
        .lte("posted_at", `${relationship.data.mover_date}T23:59:59Z`)
        .order("posted_at")
        .limit(50),
      db
        .from("ticker_social_coverage")
        .select("*,social_sources(name)")
        .eq("ticker_id", relationship.data.ticker_id)
        .lte("date_from", relationship.data.event_at)
        .gte("date_to", `${relationship.data.mover_date}T23:59:59Z`)
        .order("last_researched_at", { ascending: false })
        .limit(20),
    ]);
    return {
      data: { evidence: evidence.data ?? [], coverage: coverage.data ?? [] },
      error: evidence.error ?? coverage.error,
    };
  });

export const getSocialBeforeMover = (appearanceId: string) =>
  safe<any[]>([], (db) =>
    db
      .from("social_mover_relationship_detail")
      .select("*")
      .eq("mover_appearance_id", appearanceId)
      .eq("relationship_type", "mentioned_before_move")
      .order("mention_at")
      .limit(50),
  );

export const getEarliestKnownSocialMention = (appearanceId: string) =>
  safe<any>(null, (db) =>
    db
      .from("social_mover_relationship_detail")
      .select("*")
      .eq("mover_appearance_id", appearanceId)
      .eq("relationship_type", "mentioned_before_move")
      .order("mention_at")
      .limit(1)
      .maybeSingle(),
  );

export const getPreMoveAccounts = (appearanceId: string) =>
  safe<any[]>([], (db) =>
    db
      .from("social_mover_relationship_detail")
      .select("account_id,username,platform,mention_at,days_before_move,post_id")
      .eq("mover_appearance_id", appearanceId)
      .eq("relationship_type", "mentioned_before_move")
      .order("mention_at")
      .limit(50),
  );

export const getCommunityActivityBeforeMover = (appearanceId: string) =>
  safe<any[]>([], (db) =>
    db
      .from("social_mover_relationship_detail")
      .select("community,post_id,mention_at,days_before_move")
      .eq("mover_appearance_id", appearanceId)
      .eq("relationship_type", "mentioned_before_move")
      .order("mention_at")
      .limit(50),
  );
