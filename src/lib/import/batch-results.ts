import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DetailPagination } from "./detail-pagination";

type Db = SupabaseClient<Database>;

export type DetailPage<T> = DetailPagination & {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

function finishPage<T extends { id: string }>(
  rows: T[] | null,
  pagination: DetailPagination,
): DetailPage<T> {
  const loaded = rows ?? [];
  const hasMore = loaded.length > pagination.pageSize;
  const items = loaded.slice(0, pagination.pageSize);
  return {
    ...pagination,
    items,
    hasMore,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  };
}

function applyWindow<T extends { range: (from: number, to: number) => T; limit: (size: number) => T }>(
  query: T,
  pagination: DetailPagination,
) {
  if (pagination.cursor) return query.limit(pagination.pageSize + 1);
  const from = (pagination.page - 1) * pagination.pageSize;
  return query.range(from, from + pagination.pageSize);
}

export async function getBatchReportPage(
  db: Db,
  batchId: string,
  pagination: DetailPagination,
) {
  let query = db
    .from("source_reports")
    .select(
      "id,source_filename,report_date,extraction_method,extraction_confidence,page_count,record_count,warning_count,import_status,error_message",
    )
    .eq("import_batch_id", batchId)
    .order("id");
  if (pagination.cursor) query = query.gt("id", pagination.cursor);
  const result = await applyWindow(query, pagination);
  if (result.error) throw result.error;
  return finishPage(result.data, pagination);
}

async function requireBatchReport(db: Db, batchId: string, reportId: string) {
  const report = await db
    .from("source_reports")
    .select("id")
    .eq("id", reportId)
    .eq("import_batch_id", batchId)
    .maybeSingle();
  if (report.error) throw report.error;
  if (!report.data) throw new Error("Report not found in this import batch.");
}

export async function getBatchReportRowPage(
  db: Db,
  batchId: string,
  reportId: string,
  pagination: DetailPagination,
) {
  await requireBatchReport(db, batchId, reportId);
  let query = db
    .from("market_mover_appearances")
    .select(
      "id,rank,price,change_amount,change_percent,trades,volume,dollar_volume,tickers(symbol),market_categories(name)",
    )
    .eq("report_id", reportId)
    .order("id");
  if (pagination.cursor) query = query.gt("id", pagination.cursor);
  const result = await applyWindow(query, pagination);
  if (result.error) throw result.error;
  return finishPage(result.data, pagination);
}

export async function getBatchReportIssuePage(
  db: Db,
  batchId: string,
  reportId: string,
  pagination: DetailPagination,
) {
  await requireBatchReport(db, batchId, reportId);
  let query = db
    .from("report_extraction_issues")
    .select("id,page_number,issue_type,field_name,raw_value,message,severity")
    .eq("report_id", reportId)
    .order("id");
  if (pagination.cursor) query = query.gt("id", pagination.cursor);
  const result = await applyWindow(query, pagination);
  if (result.error) throw result.error;
  return finishPage(result.data, pagination);
}

