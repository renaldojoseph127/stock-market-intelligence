export const TICKER_SOCIAL_POST_SELECT = "social_posts(id,posted_at,title,body,post_url,social_sources(name),social_communities(name),social_accounts(username)),social_mention_mover_proximity!post_tickers_post_id_fkey(*)";

export async function queryTickerSocial(db: any, symbol: string) {
  const ticker = await db.from("tickers").select("id").eq("symbol", symbol.toUpperCase()).maybeSingle();
  if (!ticker.data) return { data: { stats: null, posts: [] }, error: ticker.error };
  const [stats, posts] = await Promise.all([
    db.from("social_ticker_statistics").select("*").eq("ticker_id", ticker.data.id).maybeSingle(),
    db.from("post_tickers")
      .select(TICKER_SOCIAL_POST_SELECT)
      .eq("ticker_id", ticker.data.id)
      .eq("social_mention_mover_proximity.ticker_id", ticker.data.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return { data: { stats: stats.data, posts: posts.data ?? [] }, error: stats.error ?? posts.error };
}
