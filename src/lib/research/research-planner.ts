import type { ResearchDraft, ResearchFilters, ResearchIntent } from "./types";
const months: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};
const excludedSymbols = new Set([
  "AI",
  "SEC",
  "NASDAQ",
  "NYSE",
  "OTC",
  "REDDIT",
  "WALLSTREETBETS",
  "WSB",
  "STOCKTWITS",
  "CSV",
  "JSON",
  "PDF",
  "HIGH",
  "SHOW",
  "FIND",
  "WHICH",
  "ONLY",
  "SORT",
]);
const destructive =
  /\b(drop|delete|truncate|alter|insert|update|create|grant|revoke)\b[\s\S]{0,80}\b(table|schema|database|from|into|role)\b|\bselect\s+\*?[^;]{0,80}\bfrom\b|\b(with\s+\w+\s+as\s*\(\s*select|union\s+select|copy\s+\w+|pragma\s+\w+)\b|ignore\s+(all\s+)?(previous|system)\s+instructions|execute\s+(this\s+)?sql/i;
const advice =
  /\b(what should i buy|what should i sell|buy recommendation|sell recommendation|strong buy|strong sell|price target|guaranteed winner|place (a )?trade|execute (a )?trade|build (me )?a portfolio)\b/i;
const ambiguous =
  /^(show|find|list|which|what are)?\s*(the\s*)?(winners|best stocks|top stocks|best performers)\??$/i;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function dateRange(q: string) {
  for (const [name, index] of Object.entries(months)) {
    const m = q.match(new RegExp(`\\b${name}\\s+(20\\d{2})\\b`, "i"));
    if (m) {
      const year = Number(m[1]),
        start = new Date(Date.UTC(year, index, 1)),
        end = new Date(Date.UTC(year, index + 1, 0));
      return { from: iso(start), to: iso(end) };
    }
  }
  const dates = [...q.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((x) => x[1]);
  return dates.length
    ? { from: dates[0], ...(dates[1] ? { to: dates[1] } : { to: dates[0] }) }
    : {};
}
function tickers(q: string) {
  const cashtags = [...q.matchAll(/\$([A-Za-z][A-Za-z0-9.-]{0,9})\b/g)].map(
      (x) => x[1].toUpperCase(),
    ),
    upper = [...q.matchAll(/\b[A-Z][A-Z0-9.-]{1,9}\b/g)]
      .map((x) => x[0])
      .filter((x) => !excludedSymbols.has(x));
  return [...new Set([...cashtags, ...upper])];
}
function sources(q: string) {
  const found: string[] = [];
  if (/wall\s*street\s*bets|\bwsb\b/i.test(q)) found.push("wallstreetbets");
  if (/stocktwits/i.test(q)) found.push("stocktwits");
  if (/reddit/i.test(q) && !found.includes("wallstreetbets"))
    found.push("reddit");
  return found;
}
function threshold(q: string, label: string) {
  const m = q.match(
    new RegExp(
      `${label}\\s*(?:score)?\\s*(?:above|over|at least|greater than|>=|>|=|:)\\s*(\\d+(?:\\.\\d+)?)`,
      "i",
    ),
  );
  return m ? Number(m[1]) : undefined;
}
function marketCap(q: string) {
  const m = q.match(
    /(?:market\s*cap\s*)?(under|below|less than|over|above|greater than|at least)\s*\$?([\d,.]+)\s*(k|m|b|t|thousand|million|billion|trillion)?(?:\s*(?:market\s*cap))?/i,
  );
  if (
    !m ||
    (!/market\s*cap/i.test(q) &&
      !/[kmbt]|million|billion|trillion/i.test(m[3] ?? ""))
  )
    return {};
  const unit = (m[3] ?? "").toLowerCase(),
    scale =
      unit === "k" || unit === "thousand"
        ? 1e3
        : unit === "m" || unit === "million"
          ? 1e6
          : unit === "b" || unit === "billion"
            ? 1e9
            : unit === "t" || unit === "trillion"
              ? 1e12
              : 1,
    value = Number(m[2].replace(/,/g, "")) * scale;
  return /under|below|less/.test(m[1].toLowerCase())
    ? { market_cap_max: value }
    : { market_cap_min: value };
}
function semanticText(q: string, tickerList: string[], industry?: string) {
  if (tickerList.length) return tickerList.join(" ");
  if (industry) return industry;
  const ignored = new Set([
    "show",
    "find",
    "list",
    "which",
    "what",
    "are",
    "the",
    "stocks",
    "stock",
    "tickers",
    "ticker",
    "movers",
    "mover",
    "mentions",
    "mention",
    "discussed",
    "discussion",
    "on",
    "in",
    "from",
    "reddit",
    "stocktwits",
    "wallstreetbets",
    "wsb",
    "only",
    "just",
    "sort",
    "by",
    "historical",
    "attention",
    "please",
  ]);
  return (
    q
      .toLowerCase()
      .replace(/[^a-z0-9$.-]+/g, " ")
      .split(/\s+/)
      .filter((x) => x && !ignored.has(x))
      .slice(0, 8)
      .join(" ") || q.slice(0, 120)
  );
}
function intentFor(
  q: string,
  tickerList: string[],
  sourceList: string[],
): ResearchIntent {
  if(/what (?:was|were) reddit saying.*(?:before|prior).*(?:move|moved|mover)/i.test(q))return"social_before_move";
  if(/(?:cross[- ]source|ticker intelligence) timeline|what happened around .*mover/i.test(q))return"ticker_intelligence_timeline";
  if(/catalysts? after (?:the )?(?:move|mover)/i.test(q))return"catalysts_after_move";
  if(/catalysts? before (?:the )?(?:move|mover)/i.test(q))return"catalysts_before_move";
  if(/movers? without (?:an? )?identified catalyst/i.test(q))return"movers_without_identified_catalyst";
  if(/quality[- ]flagged movers?|movers? with (?:unresolved )?(?:quality|data-quality) flags?/i.test(q))return"quality_flagged_movers";
  if(/compare ticker catalysts?|ticker catalyst comparison/i.test(q))return"compare_ticker_catalysts";
  if(/cross[- ]source ticker summary|ticker intelligence summary/i.test(q))return"cross_source_ticker_summary";
  if(/social|reddit|discussion|attention/i.test(q)&&/(without (?:an? )?(?:identified )?catalyst|no identified catalyst)/i.test(q))return"social_without_identified_catalyst";
  if(/compare|comparison|which community/i.test(q)&&/(communities|subreddits|wallstreetbets.*reddit|reddit.*wallstreetbets)/i.test(q))return"community_comparison";
  if(/repeat|repeatedly|same (?:account|user).*(?:ticker|stock)|account.*ticker.*history/i.test(q)&&/(account|user)/i.test(q))return"repeat_account_ticker";
  if(/attention/i.test(q)&&/(before|prior).*(?:move|mover|gainer|decliner)/i.test(q))return"attention_before_move";
  if(/sentiment/i.test(q)&&/(before|prior).*(?:move|mover|gainer|decliner)/i.test(q))return"sentiment_before_move";
  if(/accounts?|users?/i.test(q)&&!/(largest move)/i.test(q)&&/(before|prior).*(?:move|mover|gainer|decliner)/i.test(q))return"accounts_before_move";
  if(/social|reddit|discussion/i.test(q)&&/before.*(?:catalyst|filing|event|earnings|offering|fda)/i.test(q))return"social_before_catalyst";
  if(/social|reddit|discussion/i.test(q)&&/after.*(?:catalyst|filing|event|earnings|offering|fda)/i.test(q))return"social_after_catalyst";
  if(/wall\s*street\s*bets|\bwsb\b/i.test(q)&&/(before|prior).*(?:move|mover|gainer|decliner)/i.test(q))return"wallstreetbets_before_move";
  if(/reddit/i.test(q)&&/(posts?|mentions?|attention|sentiment|discussion)/i.test(q)&&/(before|prior).*(?:move|mover|gainer|decliner)/i.test(q))return"reddit_before_move";
  if (
    /(?:no identified|without (?:an? )?(?:identified )?catalyst)/i.test(q) &&
    /(catalyst|mover)/i.test(q)
  )
    return "catalyst_no_identified";
  if (
    /compare/i.test(q) &&
    tickerList.length > 1 &&
    /(catalyst|filing|sec|offering|fda|earnings)/i.test(q)
  )
    return "catalyst_comparison";
  if (
    /repeat|repeatedly|most often|frequency/i.test(q) &&
    /(catalyst|filing|offering|fda|earnings)/i.test(q)
  )
    return "catalyst_repeat_tickers";
  if (
    /(?:prove|caused?|why did .* (?:rise|fall|move))/i.test(q) &&
    /(catalyst|filing|offering|fda|earnings|guidance)/i.test(q)
  )
    return "catalyst_before_movers";
  if (
    /catalyst|sec filings?|\b8-k\b|offerings?|fda|earnings|guidance/i.test(q) &&
    /(before|prior|within|around|mover|gainer|decliner)/i.test(q)
  )
    return "catalyst_before_movers";
  if (
    /promotion/i.test(q) &&
    /before/i.test(q) &&
    /after/i.test(q) &&
    /earnings/i.test(q)
  )
    return "promotion_around_events";
  if (
    /timeline|over time|trend/i.test(q) &&
    /(sentiment|attention|price|market.?mover|pattern)/i.test(q)
  )
    return "timeline";
  if (/compare/i.test(q) && /sentiment/i.test(q) && sourceList.length > 1)
    return "source_sentiment_comparison";
  if (/compare/i.test(q) && tickerList.length > 1) return "ticker_comparison";
  if (
    /pattern/i.test(q) &&
    /(frequent|frequency|most often|occurred most)/i.test(q)
  )
    return "pattern_frequency";
  if (
    /account/i.test(q) &&
    /mention/i.test(q) &&
    /before/i.test(q) &&
    /largest move/i.test(q)
  )
    return "account_before_largest_move";
  if (
    /sentiment/i.test(q) &&
    /(later|before)/i.test(q) &&
    /(biggest gainer|gainers)/i.test(q)
  )
    return "sentiment_before_gainers";
  if (
    /discussed|mention/i.test(q) &&
    /before/i.test(q) &&
    /(abnormal volume|unusual volume|volume expansion)/i.test(q)
  )
    return "social_before_volume";
  if (
    /before/i.test(q) &&
    /(biggest gainer|market.?mover|becoming)/i.test(q) &&
    (sourceList.length || /social|mention|discuss/i.test(q))
  )
    return "social_before_movers";
  if (
    /attention|sentiment|promotion|hype/i.test(q) &&
    /(high|positive|negative|above|below|during|screen|tickers|stocks)/i.test(q)
  )
    return "feature_screen";
  if (
    /biotech|semiconductor|software|technology|healthcare|financial|energy|security type|market\s*cap|\b(etf|etn|warrant|units?|adr|preferred|common stock)\b|\b(country|sector|industry)\b/i.test(
      q,
    ) &&
    /stocks?|tickers?|movers?|companies|securities|appearances?|discussed|mentions?/i.test(
      q,
    )
  )
    return "metadata_screen";
  return "semantic_search";
}
export class ResearchPlanner {
  analyze(input: string): ResearchDraft {
    const question = input.trim().slice(0, 2000),
      tickerList = tickers(question),
      sourceList = sources(question),
      filters: ResearchFilters = { ...dateRange(question) };
    if (!question)
      return {
        question,
        entities: {},
        filters,
        assumptions: [],
        followUp: false,
        clarification: "Enter a historical research question.",
      };
    if (destructive.test(question))
      return {
        question,
        entities: {},
        filters,
        assumptions: [],
        followUp: false,
        safetyRejection:
          "Research questions cannot contain arbitrary SQL, schema instructions, or prompt-injection commands.",
      };
    if (advice.test(question))
      return {
        question,
        entities: {},
        filters,
        assumptions: [],
        followUp: false,
        safetyRejection:
          "This research interface cannot provide investment recommendations, price targets, portfolio instructions, or trade execution.",
      };
    if (ambiguous.test(question))
      return {
        question,
        entities: {},
        filters,
        assumptions: [],
        followUp: false,
        clarification:
          "What should “winners” mean: historical return, an imported market-mover category, or an attention measure?",
      };
    const followUp =
      /^(only|just|sort|now|filter|and|exclude|include)\b/i.test(question) ||
      (question.split(/\s+/).length <= 5 &&
        !/^(compare|show|find|which|what)\b/i.test(question) &&
        /mentions?|reddit|stocktwits|attention|sentiment/i.test(question));
    if (tickerList.length) filters.tickers = tickerList;
    if (sourceList.length) filters.sources = sourceList;
    if (/nasdaq/i.test(question)) filters.exchange = "NASDAQ";
    else if (/nyse/i.test(question)) filters.exchange = "NYSE";
    else if (/\botc\b/i.test(question)) filters.exchange = "OTC";
    if (/biggest gainers?|gainers?/i.test(question))
      filters.category_type = "biggest_gainer";
    else if (/biggest decliners?|decliners?/i.test(question))
      filters.category_type = "biggest_decliner";
    else if (/most active/i.test(question))
      filters.category_type = "most_active";
    if (/\beffective(?: market)? data\b|approved (?:repair|overlay)/i.test(question))
      filters.data_mode = "effective";
    else if (/\braw(?: market)? data\b/i.test(question)) filters.data_mode = "raw";
    if (/sec filings?/i.test(question)) filters.event_type = "sec_filing";
    if (/offerings?|financing/i.test(question))
      filters.catalyst_type = "offering";
    else if (/\bfda\b|regulatory/i.test(question))
      filters.catalyst_type = "fda";
    else if (/earnings|financial results/i.test(question))
      filters.catalyst_type = "financial_results";
    const form = question.match(
      /\b(8-K(?:\/A)?|10-K(?:\/A)?|10-Q(?:\/A)?|S-1(?:\/A)?|S-3(?:\/A)?|424B3|424B5|DEF 14A|SC 13D|SC 13G|13F|6-K|20-F|F-1(?:\/A)?|F-3(?:\/A)?)\b/i,
    );
    if (form) filters.sec_form = form[1].toUpperCase();
    if (/(?:0\s*[–-]\s*24|within\s+24)\s*hours?/i.test(question))
      filters.temporal_bucket = "within_24h_before";
    else if (/1\s*[–-]\s*3\s*days?/i.test(question))
      filters.temporal_bucket = "1_to_3_days_before";
    else if (/4\s*[–-]\s*7\s*days?/i.test(question))
      filters.temporal_bucket = "4_to_7_days_before";
    const priorDays = question.match(
      /(?:prior|previous|before)\s+(\d{1,3})\s+days?/i,
    );
    if (priorDays) filters.max_days_before = Math.min(90, Number(priorDays[1]));
    const attention = threshold(question, "attention");
    if (attention != null) filters.attention_min = attention;
    else if (/high attention/i.test(question)) filters.attention_min = 70;
    const sentiment = threshold(question, "sentiment");
    if (sentiment != null) filters.sentiment_min = sentiment;
    else if (/positive|bullish/i.test(question))
      filters.sentiment_min = 0.000001;
    else if (/negative|bearish/i.test(question)) filters.sentiment_min = -1;
    const promotion = threshold(question, "promotion");
    if (promotion != null) filters.promotion_min = promotion;
    const volume = threshold(
      question,
      "(?:relative|abnormal|unusual)?\\s*volume",
    );
    if (volume != null) filters.volume_min = volume;
    else if (/abnormal volume|unusual volume|volume expansion/i.test(question))
      filters.volume_min = 2;
    if (/biotech/i.test(question)) filters.industry = "biotech";
    else if (/semiconductors?|chipmakers?/i.test(question))
      filters.industry = "semiconductor";
    else if (/software companies|software stocks?/i.test(question))
      filters.industry = "software";
    else if (
      /\bAI stocks?\b|artificial intelligence|machine learning/i.test(question)
    )
      filters.industry = "ai";
    if (/technology sector/i.test(question)) filters.sector = "technology";
    else if (/healthcare sector/i.test(question)) filters.sector = "healthcare";
    else if (/financials? sector/i.test(question)) filters.sector = "financial";
    else if (/energy sector/i.test(question)) filters.sector = "energy";
    if (/\betfs?\b|exchange.?traded funds?/i.test(question))
      filters.security_type = "ETF";
    else if (/\betns?\b|exchange.?traded notes?/i.test(question))
      filters.security_type = "ETN";
    else if (/\bwarrants?\b/i.test(question)) filters.security_type = "warrant";
    else if (/\bunits?\b/i.test(question)) filters.security_type = "unit";
    else if (/\badrs?\b|depositary/i.test(question))
      filters.security_type = "ADR";
    else if (/\bpreferred/i.test(question))
      filters.security_type = "preferred_stock";
    else if (/\bcommon stocks?\b/i.test(question))
      filters.security_type = "common_stock";
    Object.assign(filters, marketCap(question));
    const country = question.match(
      /(?:companies|stocks|securities)\s+(?:based\s+)?in\s+(canada|china|japan|germany|france|united kingdom|united states|usa|us)\b/i,
    );
    if (country)
      filters.country = /^(usa|us|united states)$/i.test(country[1])
        ? "United States"
        : country[1];
    const account = question.match(/(?:account|user)\s+@?([a-z0-9_.-]+)/i);
    if (account) filters.account = account[1];
    if (/sort.*attention|historical attention/i.test(question))
      filters.order_by = "attention_score";
    else if (/sort.*sentiment/i.test(question))
      filters.order_by = "sentiment_score";
    else if (/sort.*promotion/i.test(question))
      filters.order_by = "promotion_intensity";
    const detectedIntent = intentFor(question, tickerList, sourceList),
      contextOnly =
        followUp &&
        /^(only|just|sort|filter|exclude|include)\b/i.test(question),
      intent = contextOnly ? undefined : detectedIntent,
      assumptions: string[] = [];
    if (filters.attention_min === 70 && !/attention[^\d]+70/i.test(question))
      assumptions.push(
        "“High attention” is interpreted as an attention score of at least 70.",
      );
    if (filters.sentiment_min === 0.000001)
      assumptions.push(
        "“Positive” or “bullish” sentiment is interpreted as a stored sentiment score greater than zero.",
      );
    if (filters.volume_min === 2 && !/volume[^\d]+2/i.test(question))
      assumptions.push(
        "“Abnormal volume” is interpreted as relative volume of at least 2× the prior 20-session average.",
      );
    if (filters.industry === "ai")
      assumptions.push(
        "“AI stocks” are matched only against stored company, sector, and industry metadata containing AI-related terms.",
      );
    if (detectedIntent === "promotion_around_events")
      assumptions.push(
        "Before/after earnings uses a seven-calendar-day window around imported earnings events.",
      );
    if (/^catalyst_/.test(detectedIntent))
      assumptions.push(
        "Catalyst results are limited to explicitly researched source/date coverage and describe temporal association, not causation or predictive power.",
      );
    if(["reddit_before_move","wallstreetbets_before_move","social_before_catalyst","social_after_catalyst","accounts_before_move","sentiment_before_move","attention_before_move","community_comparison","repeat_account_ticker","social_without_identified_catalyst"].includes(String(detectedIntent)))assumptions.push("Social results are limited to explicitly researched provider/date/community coverage; first or early means first known in stored evidence, and timing does not establish causation or predictive power.");
    if(["ticker_intelligence_timeline","catalysts_before_move","catalysts_after_move","movers_without_identified_catalyst","quality_flagged_movers","compare_ticker_catalysts","cross_source_ticker_summary","social_before_move"].includes(String(detectedIntent)))assumptions.push("Cross-source results preserve separate source provenance, default to RAW market values, and use only explicit researched denominators; sequence does not establish causation or prediction.");
    if (
      /prove|caused?|why did .* (?:rise|fall|move)/i.test(question) &&
      /^catalyst_/.test(detectedIntent)
    )
      assumptions.push(
        "Causal wording was reframed as a request for public evidence and temporal relationships because timing alone cannot prove causation.",
      );
    if (
      !contextOnly &&
      (detectedIntent === "semantic_search" ||
        detectedIntent === "metadata_screen")
    )
      filters.search_text = semanticText(
        question,
        tickerList,
        filters.industry,
      );
    return {
      question,
      intent,
      entities: { tickers: tickerList, sources: sourceList, domains: [] },
      filters,
      assumptions,
      followUp,
      visualization:
        detectedIntent === "timeline" || detectedIntent === "ticker_intelligence_timeline"
          ? "timeline"
          : detectedIntent === "ticker_comparison" || detectedIntent === "compare_ticker_catalysts"
            ? "comparison"
            : null,
    };
  }
}
