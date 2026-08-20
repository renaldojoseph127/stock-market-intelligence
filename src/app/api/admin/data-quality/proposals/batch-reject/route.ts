import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPAIR_REVIEW_BATCH_MAX } from "@/lib/data-quality/review-classifier";
export const runtime = "nodejs";

const reasons = new Set(["incorrect_decimal", "legitimate_extreme_move", "insufficient_evidence", "wrong_column_alignment", "external_reference_disagrees", "duplicate_or_superseded", "other"]);
export async function POST(request: Request) {
  const db:any = createAdminClient();if (!db) return NextResponse.json({ message: "Dedicated Supabase service credentials are not configured." }, { status: 503 });
  let body:any;try { body = await request.json(); } catch { return NextResponse.json({ message: "A JSON body is required." }, { status: 400 }); }
  const items = Array.isArray(body.items) ? body.items : [], reviewer = String(body.reviewedBy ?? "").trim(), rejectionReason = String(body.rejectionReason ?? "").trim(), note = String(body.reviewNote ?? "").trim();
  if (items.length < 1 || items.length > REPAIR_REVIEW_BATCH_MAX) return NextResponse.json({ message: `Select 1-${REPAIR_REVIEW_BATCH_MAX} proposals.` }, { status: 400 });
  if (new Set(items.map((item:any) => item?.proposalId)).size !== items.length) return NextResponse.json({ message: "Duplicate proposal IDs are not allowed." }, { status: 400 });
  if (!reviewer || !reasons.has(rejectionReason) || items.some((item:any) => !item?.proposalId || !item?.updatedAt)) return NextResponse.json({ message: "Reviewer, supported rejection reason, proposal IDs, and optimistic versions are required." }, { status: 400 });
  const { data, error } = await db.rpc("review_market_data_proposal_batch", { p_action: "reject", p_items: items, p_reviewed_by: reviewer, p_reason: note, p_rejection_reason: rejectionReason });
  return NextResponse.json(error ? { message: error.message } : data, { status: error ? 409 : 200 });
}
