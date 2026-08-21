import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processHistoricalDataQualityAudit, startHistoricalDataQualityAudit } from "@/lib/data-quality/audit";
export const runtime = "nodejs";export const maxDuration = 30;

export async function POST(request:Request) {
  const db:any = createAdminClient();if (!db) return NextResponse.json({ message:"Dedicated Supabase service credentials are not configured." }, { status:503 });
  let body:any = {};try { body = await request.json(); } catch {}
  const limit = Math.min(100, Math.max(1, Number(body.limit) || 100));
  const queue = await db.rpc("get_market_data_resolution_queue", { p_status:"unresolved", p_limit:limit });
  if (queue.error) return NextResponse.json({ message:queue.error.message }, { status:500 });
  const appearanceIds = [...new Set<string>((queue.data ?? []).filter((row:any) => !row.proposal_id || !row.look_ahead_safe || ["cross_field_inconsistency","ticker_sequence_outlier"].includes(row.finding_type)).map((row:any) => String(row.appearance_id)))].slice(0,limit);
  if (!appearanceIds.length) return NextResponse.json({ claimed:0,proposals:0 });
  try { const runId = await startHistoricalDataQualityAudit(db, appearanceIds), result = await processHistoricalDataQualityAudit(db, runId, appearanceIds.length);return NextResponse.json({ ...result, auditRunId:runId }); }
  catch(error) { return NextResponse.json({ message:error instanceof Error ? error.message : String(error) }, { status:500 }); }
}
