import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const db:any=createAdminClient();if(!db)return NextResponse.json({message:"Dedicated Supabase service credentials are not configured."},{status:503});const{id}=await params,{data,error}=await db.from("catalyst_research_queue").select("id,ticker_id,appearance_id,priority,reason,status,date_from,date_to,attempts,available_after,started_at,completed_at,last_error,created_at,updated_at").eq("id",id).maybeSingle();return NextResponse.json(error?{message:error.message}:data,{status:error?500:data?200:404,headers:{"cache-control":"no-store"}})}
