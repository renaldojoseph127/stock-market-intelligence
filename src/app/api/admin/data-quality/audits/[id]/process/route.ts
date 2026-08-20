import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processHistoricalDataQualityAudit } from "@/lib/data-quality/audit";
export const runtime = "nodejs";export const maxDuration = 30;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const db = createAdminClient();if (!db) return NextResponse.json({ message: "Dedicated Supabase service credentials are not configured." }, { status: 503 });let body: any = {};try { body = await request.json(); } catch {}try { return NextResponse.json(await processHistoricalDataQualityAudit(db, (await params).id, Number(body.limit) || 250)); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 500 }); } }
