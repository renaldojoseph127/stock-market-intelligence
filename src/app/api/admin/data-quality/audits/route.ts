import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startHistoricalDataQualityAudit } from "@/lib/data-quality/audit";
export const runtime = "nodejs";
export async function POST(request: Request) { const db = createAdminClient();if (!db) return NextResponse.json({ message: "Dedicated Supabase service credentials are not configured." }, { status: 503 });let body: any = {};try { body = await request.json(); } catch {}try { const auditRunId = await startHistoricalDataQualityAudit(db, Array.isArray(body.appearanceIds) ? body.appearanceIds.map(String) : undefined);return NextResponse.json({ auditRunId, status: "pending", batchSize: 250 }, { status: 202 }); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
