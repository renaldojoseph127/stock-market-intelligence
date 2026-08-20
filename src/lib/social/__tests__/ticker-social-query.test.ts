import { describe, expect, it } from "vitest";
import { queryTickerSocial, TICKER_SOCIAL_POST_SELECT } from "../ticker-social-query";

function fixtureDb(options: { symbol?: string | null; posts?: unknown[]; stats?: unknown } = {}) {
  const calls: Array<{ table: string; select?: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    from(table: string) {
      const call = { table, select: undefined as string | undefined, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const chain: any = {
        select(value: string) { call.select = value; return chain; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return chain; },
        order() { return chain; },
        maybeSingle: async () => table === "tickers"
          ? { data: options.symbol === null ? null : { id: "ticker-1" }, error: null }
          : { data: options.stats ?? null, error: null },
        limit: async () => ({ data: options.posts ?? [], error: null }),
      };
      return chain;
    },
  };
}

describe("ticker social relationship selection", () => {
  it("loads an NVDA ticker without social data and explicitly selects the post FK", async () => {
    const db = fixtureDb({ posts: [], stats: null });
    const result = await queryTickerSocial(db, "nvda");
    expect(result).toEqual({ data: { stats: null, posts: [] }, error: null });
    const posts = db.calls.find(x => x.table === "post_tickers")!;
    expect(posts.select).toBe(TICKER_SOCIAL_POST_SELECT);
    expect(posts.select).toContain("!post_tickers_post_id_fkey");
    expect(posts.filters).toContainEqual(["ticker_id", "ticker-1"]);
    expect(posts.filters).toContainEqual(["social_mention_mover_proximity.ticker_id", "ticker-1"]);
  });

  it("preserves social rows for a ticker with social data", async () => {
    const row = { social_posts: { id: "post-1", title: "NVDA discussion" }, social_mention_mover_proximity: [{ ticker_id: "ticker-1" }] };
    const stats = { ticker_id: "ticker-1", total_mentions: 1 };
    const result = await queryTickerSocial(fixtureDb({ posts: [row], stats }), "NVDA");
    expect(result.data).toEqual({ stats, posts: [row] });
    expect(result.error).toBeNull();
  });

  it("returns the empty foundation for a ticker without a ticker record", async () => {
    const result = await queryTickerSocial(fixtureDb({ symbol: null }), "NONE");
    expect(result.data).toEqual({ stats: null, posts: [] });
  });
});
