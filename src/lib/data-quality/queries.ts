import { createClient } from "@/lib/supabase/server";
export { qualityDataMode } from "./types";

export const QUALITY_PAGE_SIZE = 50;
export const REPAIR_REVIEW_PAGE_SIZE = 50;
type Search = Record<string, string | undefined>;
const pageNumber = (search: Search) => Math.max(1, Number(search.page) || 1);
const boundedPageSize = (search: Search) => Math.min(100, Math.max(1, Number(search.pageSize) || REPAIR_REVIEW_PAGE_SIZE));

export async function getQualityDashboard(search: Search = {}) {
  const db:any = await createClient(), fallback = { summary: null as any, findings: [] as any[], runs: [] as any[], categories: [] as any[], reports: [] as any[], page: pageNumber(search), pageSize: QUALITY_PAGE_SIZE, count: 0 };
  if (!db) return { data: fallback, configured: false, error: null };
  const page = pageNumber(search);
  let findings: any = db.from("market_data_quality_findings").select("*,tickers!inner(symbol),source_reports!inner(source_filename,report_date),market_categories!inner(name),market_data_correction_proposals(id,proposed_value,proposed_numeric_value,confidence_score,status,is_current)", { count: "exact" });
  if (search.ticker) findings = findings.ilike("tickers.symbol", `%${search.ticker.toUpperCase()}%`);
  if (search.from) findings = findings.gte("source_reports.report_date", search.from);
  if (search.to) findings = findings.lte("source_reports.report_date", search.to);
  if (search.report) findings = findings.eq("report_id", search.report);
  if (search.category) findings = findings.eq("category_id", search.category);
  if (search.field) findings = findings.eq("field_name", search.field);
  if (search.findingType) findings = findings.eq("finding_type", search.findingType);
  if (search.severity) findings = findings.eq("severity", search.severity);
  if (search.status) findings = findings.eq("status", search.status);
  if (search.minConfidence) findings = findings.gte("confidence_score", Number(search.minConfidence));
  if (search.maxConfidence) findings = findings.lte("confidence_score", Number(search.maxConfidence));
  const [summary, findingRows, runs, categories, reports] = await Promise.all([
    db.from("market_data_quality_dashboard").select("*").maybeSingle(),
    findings.order("confidence_score", { ascending: false }).order("detected_at", { ascending: false }).range((page - 1) * QUALITY_PAGE_SIZE, page * QUALITY_PAGE_SIZE - 1),
    db.from("market_data_quality_audit_runs").select("*").order("created_at", { ascending: false }).limit(20),
    db.from("market_categories").select("id,name").order("display_order"),
    db.from("source_reports").select("id,source_filename,report_date").order("report_date", { ascending: false }).limit(250),
  ]);
  const error = summary.error ?? findingRows.error ?? runs.error ?? categories.error ?? reports.error;
  return { data: { summary: summary.data, findings: findingRows.data ?? [], runs: runs.data ?? [], categories: categories.data ?? [], reports: reports.data ?? [], page, pageSize: QUALITY_PAGE_SIZE, count: findingRows.count ?? 0 }, configured: true, error: error?.message ?? null };
}

export async function getQualityFinding(id: string) {
  const db:any = await createClient();if (!db) return { data: null as any, configured: false, error: null };
  const finding:any = await db.from("market_data_quality_findings").select("*,tickers(symbol,exchange,security_type,market_cap),source_reports(source_filename,report_date,extraction_method,extraction_confidence,page_count,file_hash),market_categories(name,category_type,exchange),market_mover_appearances(*),market_data_correction_proposals(*),market_data_repair_log!market_data_repair_log_finding_id_fkey(*)").eq("id", id).maybeSingle();
  if (finding.error || !finding.data) return { data: finding.data, configured: true, error: finding.error?.message ?? null };
  const appearance: any = finding.data.market_mover_appearances, [evidence, effective, previous, next, repairHistory, recomputeHistory] = await Promise.all([
    db.from("market_data_source_evidence").select("*").eq("id", appearance.id).maybeSingle(),
    db.from("market_mover_appearances_effective").select("*").eq("id", appearance.id).maybeSingle(),
    db.from("market_mover_appearances").select("id,report_date,price,change_percent,volume,dollar_volume,market_categories(name)").eq("ticker_id", appearance.ticker_id).lt("report_date", appearance.report_date).order("report_date", { ascending: false }).limit(5),
    db.from("market_mover_appearances").select("id,report_date,price,change_percent,volume,dollar_volume,market_categories(name)").eq("ticker_id", appearance.ticker_id).gt("report_date", appearance.report_date).order("report_date", { ascending: true }).limit(5),
    db.from("market_data_repair_log").select("*").eq("appearance_id", appearance.id).order("performed_at", { ascending: true }).limit(100),
    db.from("market_data_recompute_queue").select("*").eq("appearance_id", appearance.id).order("created_at", { ascending: true }).limit(100),
  ]);
  const error = evidence.error ?? effective.error ?? previous.error ?? next.error ?? repairHistory.error ?? recomputeHistory.error;
  return { data: { ...finding.data, detection_evidence: finding.data.evidence, source_evidence: evidence.data, effective: effective.data, previous: previous.data ?? [], next: next.data ?? [], repair_history: repairHistory.data ?? [], recompute_history: recomputeHistory.data ?? [] }, configured: true, error: error?.message ?? null };
}

export async function getRepairReview(search: Search = {}) {
  const db:any = await createClient(), page = pageNumber(search), pageSize = boundedPageSize(search), fallback = { summary: null as any, proposals: [] as any[], grouped: {} as Record<string, any[]>, categories: [] as any[], page, pageSize, count: 0 };
  if (!db) return { data: fallback, configured: false, error: null };
  let query:any = db.from("market_data_repair_review").select("*", { count: "exact" });
  const status = search.status || "pending";if (status !== "all") query = query.eq("proposal_status", status);if (status === "pending") query = query.eq("is_current", true);
  if (search.ticker) query = query.eq("ticker_symbol", search.ticker.trim().toUpperCase());
  if (search.from) query = query.gte("report_date", search.from);if (search.to) query = query.lte("report_date", search.to);
  if (search.category) query = query.eq("category_id", search.category);if (search.field) query = query.eq("field_name", search.field);
  if (search.findingType) query = query.eq("finding_type", search.findingType);if (search.method) query = query.eq("proposal_method", search.method);
  if (search.tier) query = query.eq("review_tier", search.tier);if (search.severity) query = query.eq("severity", search.severity);
  if (search.minConfidence) query = query.gte("proposal_confidence", Number(search.minConfidence));if (search.maxConfidence) query = query.lte("proposal_confidence", Number(search.maxConfidence));
  if (search.conflict === "yes") query = query.eq("has_conflict", true);if (search.conflict === "no") query = query.eq("has_conflict", false);
  if (search.sourceEvidence === "yes") query = query.eq("source_evidence_available", true);if (search.sourceEvidence === "no") query = query.eq("source_evidence_available", false);
  switch (search.sort) {
    case "confidence_asc": query = query.order("proposal_confidence", { ascending: true });break;
    case "confidence_desc": query = query.order("proposal_confidence", { ascending: false });break;
    case "severity": query = query.order("severity_rank", { ascending: false }).order("proposal_confidence", { ascending: false });break;
    case "ticker": query = query.order("ticker_symbol").order("report_date", { ascending: false });break;
    case "date": query = query.order("report_date", { ascending: false });break;
    case "tier": query = query.order("tier_order").order("proposal_confidence", { ascending: false });break;
    case "newest": query = query.order("finding_detected_at", { ascending: false });break;
    case "oldest": query = query.order("finding_detected_at", { ascending: true });break;
    default: query = query.order("tier_order").order("proposal_confidence", { ascending: false }).order("severity_rank", { ascending: false });
  }
  const [summary, rows, categories] = await Promise.all([
    db.from("market_data_repair_review_summary").select("*").maybeSingle(),
    query.range((page - 1) * pageSize, page * pageSize - 1),
    db.from("market_categories").select("id,name").order("display_order"),
  ]);
  const proposals = rows.data ?? [], groupIds = [...new Set(proposals.filter((row:any) => row.review_tier === "C").map((row:any) => row.appearance_id))];
  let groupedRows:any[] = [], groupError:any = null;
  if (groupIds.length) { const result = await db.from("market_data_repair_review").select("*").in("appearance_id", groupIds).eq("proposal_status", "pending").eq("is_current", true).eq("base_review_tier", "C").order("field_name").limit(500);groupedRows = result.data ?? [];groupError = result.error; }
  const grouped = Object.fromEntries([...Map.groupBy(groupedRows, (row:any) => String(row.appearance_id)).entries()]);
  const error = summary.error ?? rows.error ?? categories.error ?? groupError;
  return { data: { summary: summary.data, proposals, grouped, categories: categories.data ?? [], page, pageSize, count: rows.count ?? 0 }, configured: true, error: error?.message ?? null };
}

export async function getApprovedRepairs(search: Search = {}) {
  const db:any = await createClient(), page = pageNumber(search), pageSize = boundedPageSize(search), fallback = { repairs: [] as any[], page, pageSize, count: 0 };
  if (!db) return { data: fallback, configured: false, error: null };
  let query:any = db.from("market_data_approved_repairs").select("*", { count: "exact" });
  if (search.ticker) query = query.eq("ticker_symbol", search.ticker.trim().toUpperCase());if (search.field) query = query.eq("field_name", search.field);
  if (search.status) query = query.eq("recomputation_status", search.status);
  const result = await query.order("approved_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  return { data: { repairs: result.data ?? [], page, pageSize, count: result.count ?? 0 }, configured: true, error: result.error?.message ?? null };
}

export async function getTickerQuality(tickerId: string) {
  const db:any = await createClient();if (!db) return { data: { summary: null as any, findings: [] as any[] }, configured: false, error: null };
  const [summary, findings] = await Promise.all([db.from("market_data_ticker_quality_summary").select("*").eq("ticker_id", tickerId).maybeSingle(), db.from("market_data_quality_findings").select("id,severity,status,finding_type,field_name,confidence_score").eq("ticker_id", tickerId).in("status", ["open", "proposed"]).order("confidence_score", { ascending: false }).limit(10)]);
  return { data: { summary: summary.data, findings: findings.data ?? [] }, configured: true, error: summary.error?.message ?? findings.error?.message ?? null };
}

export async function getReportQuality(reportId: string) {
  const db:any = await createClient();if (!db) return { data: null as any, configured: false, error: null };
  const result = await db.from("market_data_report_quality_summary").select("*").eq("report_id", reportId).maybeSingle();return { data: result.data, configured: true, error: result.error?.message ?? null };
}

export async function getQualitySummary() {
  const db:any = await createClient();if (!db) return { data: null as any, configured: false, error: null };
  const result = await db.from("market_data_quality_dashboard").select("*").maybeSingle();return { data: result.data, configured: true, error: result.error?.message ?? null };
}
