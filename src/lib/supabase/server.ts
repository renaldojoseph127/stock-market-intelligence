import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createServerClient<Database>(url,key,{cookies:{getAll(){return cookieStore.getAll()},setAll(items){try{items.forEach(({name,value,options})=>cookieStore.set(name,value,options))}catch{}}}});
}

