import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assembleMoverResearchBrief,
  researchBriefCSV,
  researchBriefHTML,
  researchBriefJSON,
  researchBriefPDF,
} from "@/lib/research-experience/reports";
import type { ResearchDataMode } from "@/lib/research-experience/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = createAdminClient();
  if (!db)
    return NextResponse.json(
      { message: "Dedicated Supabase service credentials are not configured." },
      { status: 503 },
    );
  const { id } = await params;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "html").toLowerCase();
  const dataMode: ResearchDataMode = url.searchParams.get("dataMode") === "effective" ? "effective" : "raw";
  if (!["html", "json", "csv", "pdf"].includes(format))
    return NextResponse.json({ message: "Choose html, json, csv, or pdf." }, { status: 400 });
  try {
    const brief = await assembleMoverResearchBrief(db, id, dataMode);
    if (!brief) return NextResponse.json({ message: "Mover appearance not found." }, { status: 404 });
    const name = `${brief.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${format}`;
    if (format === "json")
      return new Response(researchBriefJSON(brief), {
        headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
      });
    if (format === "csv")
      return new Response(researchBriefCSV(brief), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
      });
    if (format === "pdf") {
      const bytes = Uint8Array.from(await researchBriefPDF(brief));
      return new Response(bytes.buffer, {
        headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"` },
      });
    }
    return new Response(researchBriefHTML(brief), { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

