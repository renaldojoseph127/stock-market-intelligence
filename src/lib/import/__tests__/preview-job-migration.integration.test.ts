import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

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

describe("Checkpoint 2 async preview-job migration", () => {
  it("claims bounded work, persists progress, and finalizes confirmable output", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "create role anon; create role authenticated; create role service_role;",
      );
      for (const file of migrations) {
        const sql = (
          await readFile(path.join(process.cwd(), "supabase/migrations", file), "utf8")
        ).replace("create extension if not exists pgcrypto;", "");
        await db.exec(sql);
      }
      await db.exec(`
        insert into public.import_preview_jobs(id,archive_name,archive_hash,total_files,status)
        values('10000000-0000-4000-8000-000000000001','Scanz.zip',repeat('a',64),224,'queued');
        insert into public.import_preview_job_files(job_id,ordinal,filename,file_hash,storage_path,status)
        select '10000000-0000-4000-8000-000000000001',n,'Screenshot '||(n+1)||'.pdf',
          lpad(to_hex(n),64,'0'),'job/'||n||'.pdf','queued'
        from generate_series(0,223) n;
      `);

      const claimed = await db.query<{ filename: string }>(
        "select filename from public.claim_import_preview_job_files('10000000-0000-4000-8000-000000000001',3)",
      );
      expect(claimed.rows).toHaveLength(3);
      await db.exec(`
        update public.import_preview_job_files set status='completed',row_count=2,warning_count=1,
          report_payload=jsonb_build_object(
            'filename',filename,'fileHash',file_hash,'reportDate','2025-08-10',
            'extractionMethod','ocr','extractionConfidence',0.92,'pageCount',1,
            'categories',jsonb_build_array('NASDAQ Biggest Gainers'),
            'rows',jsonb_build_array(jsonb_build_object('ticker','ABCD')),
            'issues','[]'::jsonb,
            'extractionDiagnostics',jsonb_build_object('selectedPass','B')
          ),completed_at=now()
        where job_id='10000000-0000-4000-8000-000000000001' and status='processing';
        update public.import_preview_job_files set status='duplicate',completed_at=now()
        where job_id='10000000-0000-4000-8000-000000000001' and status='queued';
        select public.refresh_import_preview_job('10000000-0000-4000-8000-000000000001');
      `);
      for (let batch = 0; batch < 23; batch += 1) {
        await db.query(
          "select public.finalize_import_preview_job_batch('10000000-0000-4000-8000-000000000001',10)",
        );
      }

      const progress = await db.query<{
        status: string;
        total_files: number;
        files_processed: number;
        usable_reports: number;
        extracted_rows: number;
        warning_count: number;
        error_count: number;
        preview_id: string | null;
      }>(
        "select status,total_files,files_processed,usable_reports,extracted_rows,warning_count,error_count,preview_id from public.import_preview_jobs",
      );
      expect(progress.rows[0]).toMatchObject({
        status: "completed",
        total_files: 224,
        files_processed: 224,
        usable_reports: 3,
        extracted_rows: 6,
        warning_count: 3,
        error_count: 0,
      });
      expect(progress.rows[0].preview_id).not.toBeNull();

      const preview = await db.query<{
        files: number;
        reports: number;
        rows: number;
        duplicates: number;
      }>(`
        select (summary->>'filesDetected')::int files,
          (summary->>'reportsDetected')::int reports,
          (summary->>'expectedRows')::int rows,
          (summary->>'potentialDuplicates')::int duplicates
        from public.import_previews
      `);
      expect(preview.rows[0]).toEqual({
        files: 224,
        reports: 3,
        rows: 6,
        duplicates: 221,
      });

      const firstCommit = await db.query<{ batch_id: string }>(
        "select public.commit_import_preview_job('10000000-0000-4000-8000-000000000001') batch_id",
      );
      const retryCommit = await db.query<{ batch_id: string }>(
        "select public.commit_import_preview_job('10000000-0000-4000-8000-000000000001') batch_id",
      );
      expect(retryCommit.rows[0].batch_id).toBe(firstCommit.rows[0].batch_id);
      for (let batch = 0; batch < 3; batch += 1) {
        await db.query(
          "select public.commit_import_preview_job_batch('10000000-0000-4000-8000-000000000001',10,500,500)",
        );
      }
      const committed = await db.query<{
        batches: number;
        reports: number;
        diagnostics: string | null;
      }>(
        "select (select count(*) from public.import_batches)::int batches,(select count(*) from public.source_reports)::int reports,(select extraction_diagnostics->>'selectedPass' from public.source_reports limit 1) diagnostics",
      );
      expect(committed.rows[0]).toEqual({
        batches: 1,
        reports: 3,
        diagnostics: "B",
      });

      await db.exec(`
        insert into public.import_previews(id,name,file_hashes,summary,payload)
        values(
          '30000000-0000-4000-8000-000000000003','bad.zip',array[repeat('b',64)],
          '{}'::jsonb,jsonb_build_object('reports','[]'::jsonb)
        );
        insert into public.import_preview_jobs(
          id,archive_name,archive_hash,total_files,files_processed,usable_reports,
          extracted_rows,error_count,status,preview_id,completed_at,finalization_status
        ) values(
          '20000000-0000-4000-8000-000000000002','bad.zip',repeat('b',64),1,1,0,
          0,1,'completed','30000000-0000-4000-8000-000000000003',now(),'completed'
        );
      `);
      await expect(
        db.query(
          "select public.commit_import_preview_job('20000000-0000-4000-8000-000000000002')",
        ),
      ).rejects.toThrow(/no usable rows/);
    } finally {
      await db.close();
    }
  }, 30_000);
});
