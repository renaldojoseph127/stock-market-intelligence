import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export async function GET() { const db:any = createAdminClient();if (!db) return NextResponse.json({ message:"Dedicated Supabase service credentials are not configured." }, { status:503 });const { data, error } = await db.from("market_data_repair_review_summary").select("*").maybeSingle();return NextResponse.json(error ? { message:error.message } : data, { status:error ? 503 : 200, headers:{"cache-control":"no-store"} }); }
