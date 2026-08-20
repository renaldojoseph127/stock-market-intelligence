import { NextResponse } from "next/server";
import { providerReadiness } from "@/lib/ticker-enrichment/providers";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    providers: providerReadiness(),
    notice: "Phase 2A.1 uses the cache-first selective metadata queue; legacy enrichment runs are disabled.",
  });
}

export async function POST() {
  return NextResponse.json(
    {
      message: "Legacy enrichment runs are disabled. Use /api/metadata/request or /api/metadata/selective so cache, priority, cooldown, and hard provider budget rules are enforced.",
    },
    { status: 410 },
  );
}
