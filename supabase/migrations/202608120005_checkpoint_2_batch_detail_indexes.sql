-- Checkpoint 2 batch-results query support. Detail APIs use stable UUID
-- keyset pagination and never load source_reports.extracted_rows in a list.

create index if not exists source_reports_batch_id_page_idx
  on public.source_reports(import_batch_id,id);

create index if not exists market_mover_appearances_report_id_page_idx
  on public.market_mover_appearances(report_id,id);

create index if not exists report_extraction_issues_report_id_page_idx
  on public.report_extraction_issues(report_id,id);

