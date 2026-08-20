import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Phase 2A.2 production-shaped quality queries", () => {
  it("summarizes and overlays 25,219 persisted appearances without unbounded result payloads", async () => {
    const db = new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;");
      const files = (await readdir(path.join(process.cwd(), "supabase/migrations"))).filter(file => file.endsWith(".sql")).sort();
      for (const file of files) await db.exec((await readFile(path.join(process.cwd(), "supabase/migrations", file), "utf8")).replace("create extension if not exists pgcrypto;", ""));
      await db.exec(`
        insert into public.source_reports(id,report_date,source_filename,import_status)values('81000000-0000-0000-0000-000000000001','2026-01-01','scale.pdf','completed');
        insert into public.tickers(symbol)select'Q'||lpad(value::text,6,'0')from generate_series(1,25219)value;
        insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date,price,change_percent,trades,volume,dollar_volume)
        select t.id,'81000000-0000-0000-0000-000000000001',c.id,'2026-01-01',10,1,100,1000,10000
        from public.tickers t cross join lateral(select id from public.market_categories order by display_order limit 1)c where t.symbol like'Q%';
      `);
      const started = performance.now();
      const dashboard = (await db.query<any>("select*from public.market_data_quality_dashboard")).rows[0];
      const page = await db.query<any>("select id,raw_price,price,quality_status from public.market_mover_appearances_effective order by id limit 50");
      const elapsed = performance.now() - started;
      expect(dashboard).toMatchObject({ total_appearances: 25219, clean: 25219, flagged: 0 });
      expect(page.rows).toHaveLength(50);
      expect(page.rows.every(row => row.raw_price === row.price && row.quality_status === "clean")).toBe(true);
      expect(elapsed).toBeLessThan(10_000);
    } finally { await db.close(); }
  }, 30_000);
});
