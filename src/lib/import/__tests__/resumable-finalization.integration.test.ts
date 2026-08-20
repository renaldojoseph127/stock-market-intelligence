import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const RECOVERY_JOB_ID = "1442107e-8cf9-4dd1-bb23-ff50744ac04d";
const migrations = [
  "202608090001_checkpoint_1_foundation.sql",
  "202608100001_checkpoint_2_import_pipeline.sql",
  "202608100002_checkpoint_3_historical_analytics.sql",
  "202608100003_checkpoint_4_social_research.sql",
  "202608100004_checkpoint_5_account_intelligence.sql",
  "202608100005_checkpoint_6_sentiment_attention_scoring.sql",
  "202608100006_checkpoint_7_historical_price_volume.sql",
  "202608100007_checkpoint_8_pattern_similarity.sql",
  "202608100008_checkpoint_9_watchlists_alerts.sql",
  "202608100009_checkpoint_10_ai_research.sql",
  "202608120001_checkpoint_2_async_preview_jobs.sql",
  "202608120002_checkpoint_2_adaptive_ocr.sql",
  "202608120003_checkpoint_2_resumable_finalization.sql",
  "202608120004_checkpoint_2_decimal_count_recovery.sql",
  "202608120005_checkpoint_2_batch_detail_indexes.sql",
];

async function migrate(db: PGlite) {
  await db.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  for (const file of migrations) {
    const sql = (
      await readFile(
        path.join(process.cwd(), "supabase/migrations", file),
        "utf8",
      )
    ).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
  }
}

async function seedCompletedProductionJob(db: PGlite) {
  await db.exec(`
    insert into public.import_preview_jobs(
      id,archive_name,archive_hash,total_files,files_processed,usable_reports,
      extracted_rows,warning_count,error_count,status,expires_at
    ) values(
      '${RECOVERY_JOB_ID}','Archive.zip',repeat('a',64),224,224,223,
      26218,3955,87,'processing',now()-interval '1 day'
    );

    insert into public.import_preview_job_files(
      job_id,ordinal,filename,file_hash,status,report_payload,row_count,
      warning_count,error_count,error_message,completed_at
    )
    select '${RECOVERY_JOB_ID}',n,'Screenshot '||(n+1)||'.pdf',
      lpad(to_hex(n+1),64,'0'),'completed',
      jsonb_build_object(
        'filename','Screenshot '||(n+1)||'.pdf',
        'fileHash',lpad(to_hex(n+1),64,'0'),
        'reportDate',case when n=223 then null else to_char(date '2025-01-01'+n,'YYYY-MM-DD') end,
        'sourceDate',null,
        'extractionMethod','ocr','extractionConfidence',0.91,'pageCount',1,
        'categories',case when n=223 then '[]'::jsonb else jsonb_build_array('NASDAQ Most Active') end,
        'rows',case when n=223 then '[]'::jsonb else (
          select jsonb_agg(jsonb_build_object(
            'category','NASDAQ Most Active','ticker','T'||r,'rank',r,
            'price',1.25,'changeAmount',0.1,'changePercent',5.5,
            'trades',case when n=3 and r=100 then 7.133 else 100 end,
            'volume',case when n=3 and r=100 then 393.891 else 1000 end,
            'dollarVolume',1250,
            'pageNumber',1,'rawValues',jsonb_build_object(
              'line',r||' T'||r||' $1.25 +5.5%',
              'trades',case when n=3 and r=100 then '7.133' else '100' end,
              'volume',case when n=3 and r=100 then '393.891' else '1000' end,
              'ocrPageProvenance',jsonb_build_object('selectedPass','B')
            )
          ) order by r)
          from generate_series(1,case when n=0 then 244 else 117 end) r
        ) end,
        'issues',(
          select coalesce(jsonb_agg(jsonb_build_object(
            'issueType',problem.issue_type,'pageNumber',1,
            'message',problem.message,'severity',problem.severity
          ) order by problem.sort_order,problem.issue_number),'[]'::jsonb)
          from (
            select 0 sort_order,issue_number,'ocr_warning' issue_type,
              'Persisted OCR warning '||issue_number message,'warning' severity
            from generate_series(1,case when n=0 then 181 when n<223 then 17 else 0 end) issue_number
            union all
            select 1 sort_order,issue_number,
              case when n=223 then 'page_failure' else 'validation_failure' end issue_type,
              case when n=223 then 'No usable rows' else 'Persisted extraction error '||issue_number end message,
              'error' severity
            from generate_series(1,case when n=0 then 86 when n=223 then 1 else 0 end) issue_number
          ) problem
        ),
        'extractionDiagnostics',jsonb_build_object(
          'pages',jsonb_build_array(jsonb_build_object(
            'selectedPass','B','elapsedSeconds',7.133,'scaleFactor',13.5231,
            'confidence',0.9006,'alignedRatio',0.9913
          )),
          'validationFailures',case when n=223 then jsonb_build_array('No usable rows') else '[]'::jsonb end
        )
      ),
      case when n=223 then 0 when n=0 then 244 else 117 end,
      case when n=0 then 181 when n<223 then 17 else 0 end,
      case when n=0 then 86 when n=223 then 1 else 0 end,
      case when n=223 then 'No usable rows' else null end,now()
    from generate_series(0,223) n;
  `);
}

describe("Checkpoint 2 resumable production finalization", () => {
  it(
    "recovers the exact completed job without OCR and resumes finalization/commit checkpoints",
    async () => {
      const db = new PGlite();
      try {
        await migrate(db);
        await seedCompletedProductionJob(db);

        // The first request recognizes the recoverable 224/224 state even
        // though the parent lease expired. It consumes only persisted JSONB.
        await db.query(
          `select public.finalize_import_preview_job_batch('${RECOVERY_JOB_ID}',10)`,
        );
        let checkpoint = await db.query<{
          status: string;
          reports_finalized: number;
          rows_finalized: number;
          finalization_cursor: number;
          preview_id: string | null;
        }>(`
          select status,reports_finalized,rows_finalized,finalization_cursor,preview_id
          from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);
        expect(checkpoint.rows[0]).toMatchObject({
          status: "finalizing",
          reports_finalized: 10,
          finalization_cursor: 9,
        });

        const normalizedDecimalCounts = await db.query<{
          trades: number;
          volume: number;
        }>(`
          select trades,volume from public.import_preview_staged_rows
          where job_id='${RECOVERY_JOB_ID}' and report_ordinal=3 and row_ordinal=99
        `);
        expect(normalizedDecimalCounts.rows[0]).toEqual({
          trades: 7_133,
          volume: 393_891,
        });
        const preservedDecimalDiagnostics = await db.query<{
          elapsed_seconds: number;
          aligned_ratio: number;
        }>(`
          select (extraction_diagnostics#>>'{pages,0,elapsedSeconds}')::double precision elapsed_seconds,
            (extraction_diagnostics#>>'{pages,0,alignedRatio}')::double precision aligned_ratio
          from public.import_preview_staged_reports
          where job_id='${RECOVERY_JOB_ID}' and ordinal=3
        `);
        expect(preservedDecimalDiagnostics.rows[0]).toEqual({
          elapsed_seconds: 7.133,
          aligned_ratio: 0.9913,
        });
        expect(checkpoint.rows[0].rows_finalized).toBe(1_297);
        expect(checkpoint.rows[0].preview_id).not.toBeNull();

        for (let request = 0; request < 4; request += 1) {
          await db.query(
            `select public.finalize_import_preview_job_batch('${RECOVERY_JOB_ID}',10)`,
          );
        }
        const beforeTimeout = await db.query<{
          cursor: number;
          reports: number;
        }>(`
          select finalization_cursor cursor,reports_finalized reports
          from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);

        // Simulated statement timeout: the current transaction rolls back, but
        // the first five independently committed requests remain durable.
        await db.exec("begin");
        await db.query(
          `select public.finalize_import_preview_job_batch('${RECOVERY_JOB_ID}',10)`,
        );
        await db.exec("rollback");
        const afterTimeout = await db.query<{
          cursor: number;
          reports: number;
        }>(`
          select finalization_cursor cursor,reports_finalized reports
          from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);
        expect(afterTimeout.rows[0]).toEqual(beforeTimeout.rows[0]);

        // A new request loop represents refresh/server restart: there is no
        // in-memory cursor or source PDF involved.
        for (let request = 0; request < 30; request += 1) {
          const state = await db.query<{ status: string }>(`
            select status from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
          `);
          if (state.rows[0].status === "completed") break;
          await db.query(
            `select public.finalize_import_preview_job_batch('${RECOVERY_JOB_ID}',10)`,
          );
        }

        checkpoint = await db.query(`
          select status,reports_finalized,rows_finalized,finalization_cursor,preview_id
          from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);
        expect(checkpoint.rows[0]).toMatchObject({
          status: "completed",
          reports_finalized: 224,
          rows_finalized: 26_218,
          finalization_cursor: 223,
        });

        const normalized = await db.query<{
          contains_reports: boolean;
          payload_bytes: number;
          reports: number;
          rows: number;
          issues: number;
          failed_payloads: number;
        }>(`
          select not (p.payload ? 'reports') contains_reports,
            pg_column_size(p.payload)::int payload_bytes,
            (select count(*) from public.import_preview_staged_reports where job_id=j.id)::int reports,
            (select count(*) from public.import_preview_staged_rows where job_id=j.id)::int rows,
            (select count(*) from public.import_preview_staged_issues where job_id=j.id)::int issues,
            (select count(*) from public.import_preview_staged_reports where job_id=j.id and not usable)::int failed_payloads
          from public.import_preview_jobs j join public.import_previews p on p.id=j.preview_id
          where j.id='${RECOVERY_JOB_ID}'
        `);
        expect(normalized.rows[0]).toMatchObject({
          contains_reports: true,
          reports: 224,
          rows: 26_218,
          issues: 4_042,
          failed_payloads: 1,
        });
        expect(normalized.rows[0].payload_bytes).toBeLessThan(10_000);

        // Duplicate finalization is a no-op with the same preview and counts.
        const previewBeforeRetry = checkpoint.rows[0].preview_id;
        await db.query(
          `select public.finalize_import_preview_job_batch('${RECOVERY_JOB_ID}',10)`,
        );
        const finalizationRetry = await db.query<{
          preview_id: string;
          reports: number;
          rows: number;
        }>(`
          select preview_id,reports_finalized reports,rows_finalized rows
          from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);
        expect(finalizationRetry.rows[0]).toEqual({
          preview_id: previewBeforeRetry,
          reports: 224,
          rows: 26_218,
        });

        const firstCommit = await db.query<{ batch_id: string }>(
          `select public.commit_import_preview_job('${RECOVERY_JOB_ID}') batch_id`,
        );
        const duplicateCommit = await db.query<{ batch_id: string }>(
          `select public.commit_import_preview_job('${RECOVERY_JOB_ID}') batch_id`,
        );
        expect(duplicateCommit.rows[0].batch_id).toBe(
          firstCommit.rows[0].batch_id,
        );

        for (let request = 0; request < 30; request += 1) {
          const stage = await db.query<{ commit_stage: string }>(`
            select commit_stage from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
          `);
          if (stage.rows[0].commit_stage === "appearances") break;
          await db.query(
            `select public.commit_import_preview_job_batch('${RECOVERY_JOB_ID}',10,500,500)`,
          );
        }
        const commitBeforeTimeout = await db.query<{ rows: number }>(`
          select rows_committed rows from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);
        await db.exec("begin");
        await db.query(
          `select public.commit_import_preview_job_batch('${RECOVERY_JOB_ID}',10,500,500)`,
        );
        await db.exec("rollback");
        const commitAfterTimeout = await db.query<{ rows: number }>(`
          select rows_committed rows from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
        `);
        expect(commitAfterTimeout.rows[0]).toEqual(commitBeforeTimeout.rows[0]);

        for (let request = 0; request < 100; request += 1) {
          const state = await db.query<{ status: string }>(`
            select status from public.import_preview_jobs where id='${RECOVERY_JOB_ID}'
          `);
          if (state.rows[0].status === "confirmed") break;
          await db.query(
            `select public.commit_import_preview_job_batch('${RECOVERY_JOB_ID}',10,500,500)`,
          );
        }
        const committed = await db.query<{
          status: string;
          batch_id: string;
          reports: number;
          rows: number;
          source_reports: number;
          appearances: number;
          extraction_issues: number;
          failed_reports: number;
        }>(`
          select j.status,j.import_batch_id batch_id,j.reports_committed reports,
            j.rows_committed rows,
            (select count(*) from public.source_reports where import_batch_id=j.import_batch_id)::int source_reports,
            (select count(*) from public.market_mover_appearances a join public.source_reports r on r.id=a.report_id where r.import_batch_id=j.import_batch_id)::int appearances,
            (select count(*) from public.report_extraction_issues i join public.source_reports r on r.id=i.report_id where r.import_batch_id=j.import_batch_id)::int extraction_issues,
            (select count(*) from public.source_reports where import_batch_id=j.import_batch_id and import_status='failed')::int failed_reports
          from public.import_preview_jobs j where j.id='${RECOVERY_JOB_ID}'
        `);
        expect(committed.rows[0]).toEqual({
          status: "confirmed",
          batch_id: firstCommit.rows[0].batch_id,
          reports: 224,
          rows: 26_218,
          source_reports: 224,
          appearances: 26_218,
          extraction_issues: 4_042,
          failed_reports: 1,
        });

        // Retry after completion returns the same batch and creates nothing.
        await db.query(
          `select public.commit_import_preview_job_batch('${RECOVERY_JOB_ID}',10,500,500)`,
        );
        const counts = await db.query<{ batches: number; reports: number; rows: number }>(`
          select count(distinct b.id)::int batches,count(distinct r.id)::int reports,
            count(distinct a.id)::int rows
          from public.import_batches b
          left join public.source_reports r on r.import_batch_id=b.id
          left join public.market_mover_appearances a on a.report_id=r.id
          where b.id='${firstCommit.rows[0].batch_id}'
        `);
        expect(counts.rows[0]).toEqual({
          batches: 1,
          reports: 224,
          rows: 26_218,
        });
      } finally {
        await db.close();
      }
    },
    300_000,
  );
});
