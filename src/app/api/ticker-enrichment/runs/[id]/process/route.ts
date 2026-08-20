import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { message: "Legacy run processing is disabled. Process the Phase 2A.1 metadata queue in bounded batches instead." },
    { status: 410 },
  );
}
