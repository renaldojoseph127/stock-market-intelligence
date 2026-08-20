import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("Phase 2C.2 production-shaped bounded-query performance", () => {
  it("pages candidates and similarities without returning the 25,219-row universe", async () => {
    const db = new PGlite();
    try {
      await db.exec("create role anon;create role authenticated;create role service_role;");
      for (const file of (await readdir(path.join(process.cwd(), "supabase/migrations"))).filter((name) => name.endsWith(".sql")).sort())
        await db.exec((await readFile(path.join(process.cwd(), "supabase/migrations", file), "utf8")).replace("create extension if not exists pgcrypto;", ""));
      await db.exec(`
        insert into public.tickers(symbol,exchange,enrichment_status)
          select'T'||g,'NASDAQ','pending'from generate_series(1,4247)g;
        insert into public.source_reports(report_date,source_filename,import_status)
          select date'2025-08-01'+(g-1),g||'.pdf','completed'from generate_series(1,224)g;
        with ticker_rows as(select id,row_number()over(order by symbol)rn from public.tickers),
        report_rows as(select id,report_date,row_number()over(order by report_date)rn from public.source_reports),
        cats as(select array_agg(id order by display_order)ids,count(*)n from public.market_categories),
        series as(select g,((g-1)%4247)+1 tr,((g-1)%224)+1 rr from generate_series(1,25219)g)
        insert into public.market_mover_appearances(ticker_id,report_id,category_id,report_date,rank,price,change_percent,volume,raw_values)
        select t.id,r.id,c.ids[((s.g-1)%c.n)+1],r.report_date,((s.g-1)%20)+1,
          .5+((s.g-1)%500)/10.0,-120+((s.g-1)%241),1000+((s.g-1)*7919)%50000000,'{"production_shaped":true}'
        from series s join ticker_rows t on t.rn=s.tr join report_rows r on r.rn=s.rr cross join cats c;
        select public.rebuild_ticker_statistics();
      `);
      const target = (await db.query<{ id: string }>("select id from public.market_mover_appearances order by report_date desc limit 1")).rows[0].id;
      const start = performance.now();
      const candidates = await db.query<any>("select appearance_id,research_priority_score,research_priority_reasons from public.research_priority_candidates order by research_priority_score desc,report_date desc limit 50");
      const candidateMs = performance.now() - start;
      const similarityStart = performance.now();
      const similarities = await db.query<any>("select * from public.find_similar_historical_movers($1,10)", [target]);
      const similarityMs = performance.now() - similarityStart;
      expect(candidates.rows).toHaveLength(50);
      expect(similarities.rows.length).toBeLessThanOrEqual(10);
      expect(candidateMs).toBeLessThan(10_000);
      expect(similarityMs).toBeLessThan(10_000);
      expect((await db.query<any>("select count(*)::int count from public.market_mover_appearances")).rows[0].count).toBe(25_219);
    } finally {
      await db.close();
    }
  }, 30_000);
});

