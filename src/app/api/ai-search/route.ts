import { NextResponse } from "next/server";
import { ResearchEngine } from "@/lib/research/engine";
import { SupabaseResearchExecutor } from "@/lib/research/executor";
import { QueryPlanner } from "@/lib/research/query-planner";
import { ResearchPlanner } from "@/lib/research/research-planner";
import { preflightAIResearchMetadata } from "@/lib/ticker-enrichment/on-demand";
import { createAdminClient } from "@/lib/supabase/admin";
import { redditConfiguration } from "@/lib/social/config";

export const runtime = "nodejs";
export const maxDuration = 30;

async function queueExplicitCatalystResearch(db: any, plan: any) {
  if (
    !String(plan?.intent ?? "").startsWith("catalyst_") ||
    !plan.filters?.tickers?.length
  )
    return { requested: 0, queueIds: [] as string[] };
  const tickers = await db
    .from("tickers")
    .select("id,symbol")
    .in("symbol", plan.filters.tickers)
    .limit(5);
  if (tickers.error) throw new Error(tickers.error.message);
  const queueIds: string[] = [];
  for (const ticker of tickers.data ?? []) {
    const queued = await db.rpc("queue_catalyst_research", {
      p_ticker_id: ticker.id,
      p_appearance_id: null,
      p_reason: "ai_search",
      p_date_from: plan.filters.from ?? null,
      p_date_to: plan.filters.to ?? null,
      p_required_sources: ["sec"],
    });
    if (queued.error) throw new Error(queued.error.message);
    queueIds.push(queued.data);
  }
  return { requested: queueIds.length, queueIds };
}

const socialIntents=new Set(["reddit_before_move","wallstreetbets_before_move","social_before_catalyst","social_after_catalyst","accounts_before_move","sentiment_before_move","attention_before_move","community_comparison","repeat_account_ticker","social_without_identified_catalyst","social_before_move"]);
async function queueExplicitSocialResearch(db:any,plan:any){if(!socialIntents.has(String(plan?.intent??""))||!plan.filters?.tickers?.length)return{requested:0,queueIds:[]as string[],blocked:false,reason:null as string|null};const provider=redditConfiguration();if(!provider.ready)return{requested:0,queueIds:[]as string[],blocked:true,reason:provider.message};const tickers=await db.from("tickers").select("id,symbol").in("symbol",plan.filters.tickers).limit(5);if(tickers.error)throw new Error(tickers.error.message);const queueIds:string[]=[];for(const ticker of tickers.data??[]){const queued=await db.rpc("queue_social_research",{p_ticker_id:ticker.id,p_appearance_id:null,p_reason:"ai_search",p_community:plan.intent==="wallstreetbets_before_move"?"wallstreetbets":null,p_date_from:plan.filters.from??null,p_date_to:plan.filters.to??null});if(queued.error)throw new Error(queued.error.message);queueIds.push(queued.data)}return{requested:queueIds.length,queueIds,blocked:false,reason:null as string|null}}

export async function POST(request: Request) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  const body = await request.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt)
    return NextResponse.json(
      { message: "Enter a historical research question." },
      { status: 400 },
    );
  let sessionId = body.sessionId ? String(body.sessionId) : null;
  let previousPlan = null;
  if (sessionId) {
    const session = await (db as any)
      .from("research_sessions")
      .select("id,context")
      .eq("id", sessionId)
      .maybeSingle();
    if (session.error)
      return NextResponse.json(
        { message: session.error.message },
        { status: 400 },
      );
    if (!session.data)
      return NextResponse.json(
        { message: "Research session not found." },
        { status: 404 },
      );
    previousPlan = ResearchEngine.previousPlan(session.data.context?.last_plan);
  } else {
    const session = await (db as any)
      .from("research_sessions")
      .insert({
        workspace_id: body.workspaceId || null,
        title: prompt.slice(0, 100),
      })
      .select("id")
      .single();
    if (session.error)
      return NextResponse.json(
        { message: session.error.message },
        { status: 400 },
      );
    sessionId = session.data.id;
  }
  await (db as any)
    .from("research_messages")
    .insert({ session_id: sessionId, role: "user", content: prompt });
  const engine = new ResearchEngine();
  try {
    const draft = new ResearchPlanner().analyze(prompt);
    const previewPlan = new QueryPlanner().createPlan(draft, previousPlan);
    const metadata =
      !previewPlan.clarification && !previewPlan.safetyRejection
        ? await preflightAIResearchMetadata(db, previewPlan)
        : { requested: 0, resolved: 0, pending: 0 };
    const catalystResearch =
      !previewPlan.clarification && !previewPlan.safetyRejection
        ? await queueExplicitCatalystResearch(db, previewPlan)
        : { requested: 0, queueIds: [] };
    const socialResearch=!previewPlan.clarification&&!previewPlan.safetyRejection?await queueExplicitSocialResearch(db,previewPlan):{requested:0,queueIds:[]as string[],blocked:false,reason:null as string|null};
    const answer = await engine.run(prompt, new SupabaseResearchExecutor(db), {
      previousPlan,
    });
    if (metadata.pending > 0)
      answer.limitations = [
        ...answer.limitations,
        `${metadata.pending} of ${metadata.requested} bounded metadata candidates remain unresolved or queued; metadata filters may therefore omit matching tickers.`,
      ];
    if (catalystResearch.requested > 0)
      answer.limitations = [
        ...answer.limitations,
        `${catalystResearch.requested} explicitly requested ticker(s) were queued for bounded SEC research. This response uses already persisted coverage and does not wait for or fabricate new results.`,
      ];
    if(socialResearch.requested>0)answer.limitations=[...answer.limitations,`${socialResearch.requested} explicitly requested ticker(s) were queued for bounded Reddit research. This answer uses persisted evidence only and does not wait for provider access or imply complete historical coverage.`];
    if(socialResearch.blocked){answer.limitations=[...answer.limitations,`Reddit provider disabled pending access approval. ${socialResearch.reason}`];if(socialIntents.has(answer.plan.intent)&&!answer.records.length)answer.summary="No qualifying Reddit evidence is currently available for this historical window. Coverage: Reddit provider disabled pending access approval."}
    const evidence = answer.evidence ?? {
      tablesConsulted: [],
      supportingRecords: [],
      observationDates: [],
      appliedFilters: answer.plan.filters,
      methodologyVersions: [],
      limitations: answer.limitations,
      assumptions: answer.assumptions,
      generatedAt: new Date().toISOString(),
    };
    evidence.limitations = answer.limitations;
    await (db as any)
      .from("research_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: answer.summary,
        structured_query: answer.plan,
        evidence,
      });
    const history = await (db as any)
      .from("research_history")
      .insert({
        workspace_id: body.workspaceId || null,
        session_id: sessionId,
        prompt,
        execution_time_ms: answer.executionTimeMs,
        structured_query: answer.plan,
        returned_record_count: answer.records.length,
        response_summary: answer.summary,
        evidence,
        status: answer.status,
      })
      .select("id")
      .single();
    if (history.error) throw new Error(history.error.message);
    const contextPlan =
      answer.status === "completed" ? answer.plan : previousPlan;
    await (db as any)
      .from("research_sessions")
      .update({
        workspace_id: body.workspaceId || null,
        context: { last_plan: contextPlan },
      })
      .eq("id", sessionId);
    return NextResponse.json({
      ...answer,
      metadataEnrichment: metadata,
      catalystResearch,
      socialResearch,
      sessionId,
      historyId: history.data.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await (db as any)
      .from("research_history")
      .insert({
        workspace_id: body.workspaceId || null,
        session_id: sessionId,
        prompt,
        execution_time_ms: 0,
        structured_query: {
          version: "research-plan-v1",
          error: "Execution failed before a valid result was returned.",
        },
        returned_record_count: 0,
        response_summary: "Research execution failed.",
        evidence: {
          tablesConsulted: [],
          supportingRecords: [],
          limitations: [message],
        },
        status: "failed",
      });
    return NextResponse.json({ message }, { status: 500 });
  }
}
