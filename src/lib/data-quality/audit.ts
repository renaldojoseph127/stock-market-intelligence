import { HistoricalDataQualityEngine, QUALITY_RULE_VERSION } from "./engine";
import { DataQualityResolutionEngine } from "./resolution-engine";
import type { QualityAppearanceInput, SequenceObservation } from "./types";

const numberOrNull = (value: unknown) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function startHistoricalDataQualityAudit(db: any, appearanceIds?: string[]) {
  const { data, error } = await db.rpc("start_market_data_quality_audit", { p_rule_version: QUALITY_RULE_VERSION, p_appearance_ids: appearanceIds?.length ? appearanceIds : null });
  if (error) throw new Error(error.message);return String(data);
}

export async function processHistoricalDataQualityAudit(db: any, runId: string, limit = 250) {
  const claimed = await db.rpc("claim_market_data_quality_audit_items", { p_run_id: runId, p_limit: Math.max(1, Math.min(limit, 1000)) });
  if (claimed.error) throw new Error(claimed.error.message);
  const items = claimed.data ?? [];
  if (!items.length) { const refreshed = await db.rpc("refresh_market_data_quality_audit_run", { p_run_id: runId });if (refreshed.error) throw new Error(refreshed.error.message);return { claimed: 0, run: refreshed.data }; }
  const ids = items.map((item: any) => item.appearance_id), evidence = await db.from("market_data_source_evidence").select("*").in("id", ids);
  if (evidence.error) return recordFailures(db, runId, ids, evidence.error.message);
  const tickerIds = [...new Set((evidence.data ?? []).map((row: any) => String(row.ticker_id)))], sequence = await db.from("market_mover_appearances").select("id,ticker_id,report_date,price,change_percent").in("ticker_id", tickerIds).order("report_date", { ascending: true }).limit(10000);
  if (sequence.error) return recordFailures(db, runId, ids, sequence.error.message);
  const byTicker = new Map<string, SequenceObservation[]>();
  for (const row of sequence.data ?? []) { const key = String(row.ticker_id), values = byTicker.get(key) ?? [];values.push({ id: String(row.id), reportDate: String(row.report_date), price: numberOrNull(row.price), changePercent: numberOrNull(row.change_percent) });byTicker.set(key, values); }
  const engine = new HistoricalDataQualityEngine(), resolution = new DataQualityResolutionEngine(), rows = new Map((evidence.data ?? []).map((row: any) => [String(row.id), row]));
  const results = items.map((item: any) => { const row: any = rows.get(String(item.appearance_id));if (!row) return { appearanceId: String(item.appearance_id), error: "Claimed appearance evidence was unavailable" };try { const input = toInput(row, nearest(byTicker.get(String(row.ticker_id)) ?? [], row)), analyzed = engine.analyzeAppearance(input);return { ...analyzed, findings: resolution.generateCandidates(input, analyzed.findings) }; } catch (error) { return { appearanceId: String(item.appearance_id), error: error instanceof Error ? error.message : String(error) }; } });
  const recorded = await db.rpc("record_market_data_quality_batch", { p_run_id: runId, p_results: results });if (recorded.error) throw new Error(recorded.error.message);
  return { claimed: items.length, findings: results.reduce((sum: number, item: any) => sum + (item.findings?.length ?? 0), 0), proposals: results.reduce((sum: number, item: any) => sum + (item.findings?.filter((finding: any) => finding.proposal).length ?? 0), 0), run: recorded.data };
}

async function recordFailures(db: any, runId: string, ids: string[], message: string) { const result = await db.rpc("record_market_data_quality_batch", { p_run_id: runId, p_results: ids.map(appearanceId => ({ appearanceId, error: message })) });if (result.error) throw new Error(result.error.message);return { claimed: ids.length, findings: 0, proposals: 0, run: result.data }; }
export function priorSequence(sequence: SequenceObservation[], row: { id: string; report_date: string }) {
  const target = Date.parse(String(row.report_date));
  return sequence
    .filter(value => value.id !== String(row.id) && Date.parse(value.reportDate) < target)
    .sort((a, b) => Date.parse(b.reportDate) - Date.parse(a.reportDate))
    .slice(0, 8);
}
function nearest(sequence: SequenceObservation[], row: any) { return priorSequence(sequence, row); }
function toInput(row: any, neighbors: SequenceObservation[]): QualityAppearanceInput { const rawValues = asObject(row.raw_values);return { id: String(row.id), tickerId: String(row.ticker_id), symbol: String(row.symbol), reportDate: String(row.report_date), categoryName: String(row.category_name), categoryType: String(row.category_type), categoryExchange: row.category_exchange, tickerExchange: row.exchange, securityType: row.security_type, marketCap: numberOrNull(row.market_cap), rank: numberOrNull(row.rank), price: numberOrNull(row.price), changeAmount: numberOrNull(row.change_amount), changePercent: numberOrNull(row.change_percent), trades: numberOrNull(row.trades), volume: numberOrNull(row.volume), dollarVolume: numberOrNull(row.dollar_volume), rawValues, source: { filename: row.source_filename, page: rawValues.sourcePageNumber ?? null, extractionMethod: row.extraction_method, confidence: row.extraction_confidence, ocrProvenance: row.ocr_page_provenance ?? null, importIssues: row.import_issues ?? [] }, neighbors }; }
