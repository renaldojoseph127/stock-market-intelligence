import type { QueryPlan, ResearchDraft, ResearchIntent } from "./types";
const metadata: Record<
  ResearchIntent,
  { joins: string[]; aggregations: string[]; grouping: string[]; order: string }
> = {
  semantic_search: {
    joins: [],
    aggregations: ["full-text relevance"],
    grouping: [],
    order: "relevance",
  },
  metadata_screen: {
    joins: [
      "enriched tickers → historical statistics and optional social mentions",
    ],
    aggregations: ["historical mover counts", "social mention count"],
    grouping: ["ticker"],
    order: "total appearances",
  },
  social_before_movers: {
    joins: ["posts → post tickers → tickers → mover appearances → categories"],
    aggregations: [],
    grouping: [],
    order: "report_date",
  },
  account_before_largest_move: {
    joins: ["accounts → posts → tickers → ranked mover appearances"],
    aggregations: ["greatest absolute imported move"],
    grouping: ["ticker"],
    order: "report_date",
  },
  feature_screen: {
    joins: ["daily research features → tickers"],
    aggregations: [],
    grouping: [],
    order: "attention_score",
  },
  source_sentiment_comparison: {
    joins: ["sentiment → sources/communities → tickers"],
    aggregations: ["count", "average", "median", "average confidence"],
    grouping: ["ticker", "source/community"],
    order: "ticker",
  },
  pattern_frequency: {
    joins: ["pattern observations → definitions → ticker metadata"],
    aggregations: ["occurrence count", "distinct tickers"],
    grouping: ["pattern"],
    order: "occurrences",
  },
  ticker_comparison: {
    joins: ["tickers → statistics/latest feature/latest price/posts/patterns"],
    aggregations: ["all-history counts", "latest available metrics"],
    grouping: ["ticker"],
    order: "requested ticker order",
  },
  timeline: {
    joins: ["daily features → canonical prices → same-day events"],
    aggregations: ["same-day event counts"],
    grouping: ["ticker", "date"],
    order: "date",
  },
  social_before_volume: {
    joins: ["posts → tickers → next qualifying price metric"],
    aggregations: [],
    grouping: [],
    order: "volume_date",
  },
  sentiment_before_gainers: {
    joins: ["sentiment → tickers → later gainer appearances"],
    aggregations: [],
    grouping: [],
    order: "mover date",
  },
  promotion_around_events: {
    joins: ["promotion events → earnings events → tickers"],
    aggregations: [
      "count",
      "average promotion",
      "average attention",
      "average hype risk",
    ],
    grouping: ["ticker", "earnings event", "before/after"],
    order: "event date",
  },
  catalyst_before_movers: {
    joins: [
      "events → event/mover relationships → mover appearances → research coverage",
    ],
    aggregations: ["fixed coverage-aware evidence rows"],
    grouping: [],
    order: "mover date",
  },
  catalyst_repeat_tickers: {
    joins: ["ticker events → event/mover relationships → tickers"],
    aggregations: [
      "historical event count",
      "associated mover count",
      "median lead time",
    ],
    grouping: ["ticker", "catalyst type"],
    order: "associated mover count",
  },
  catalyst_no_identified: {
    joins: ["researched mover coverage → mover appearances → tickers"],
    aggregations: ["researched no-identified state"],
    grouping: [],
    order: "mover date",
  },
  catalyst_comparison: {
    joins: ["requested tickers → events → mover relationships → coverage"],
    aggregations: ["event and mover-association counts"],
    grouping: ["ticker"],
    order: "ticker",
  },
  reddit_before_move:{joins:["Reddit posts → resolved tickers → mover appearances → social coverage"],aggregations:["coverage-aware evidence rows"],grouping:[],order:"mover date"},
  wallstreetbets_before_move:{joins:["WallStreetBets posts → resolved tickers → mover appearances → social coverage"],aggregations:["coverage-aware evidence rows"],grouping:[],order:"mover date"},
  social_before_catalyst:{joins:["social posts → resolved tickers → separately sourced catalyst events"],aggregations:["timestamp sequence"],grouping:[],order:"event date"},
  social_after_catalyst:{joins:["separately sourced catalyst events → resolved social posts"],aggregations:["timestamp sequence"],grouping:[],order:"event date"},
  accounts_before_move:{joins:["accounts → posts → resolved tickers → mover appearances"],aggregations:["first known in recorded coverage"],grouping:["account","ticker"],order:"mover date"},
  sentiment_before_move:{joins:["existing sentiment observations → posts → mover relationships"],aggregations:["stored deterministic sentiment"],grouping:["sentiment"],order:"mover date"},
  attention_before_move:{joins:["derived social attention windows → mover dates → coverage"],aggregations:["bounded baseline comparison"],grouping:["ticker","window"],order:"observation date"},
  community_comparison:{joins:["social relationships → communities → coverage"],aggregations:["mentions","posts","tickers"],grouping:["community"],order:"mentions"},
  repeat_account_ticker:{joins:["account/ticker statistics → pre-move relationships"],aggregations:["mentions","associated movers"],grouping:["account","ticker"],order:"pre-mover mentions"},
  social_without_identified_catalyst:{joins:["adequately researched social windows → separately researched catalyst coverage → movers"],aggregations:["coverage-qualified context state"],grouping:[],order:"mover date"},
  ticker_intelligence_timeline:{joins:["market observations + public catalysts + stored social/sentiment/attention evidence by ticker"],aggregations:["bounded chronological evidence"],grouping:[],order:"date"},
  catalysts_before_move:{joins:["event/mover relationships → events → mover quality"],aggregations:["before/same-day evidence rows"],grouping:[],order:"mover date"},
  catalysts_after_move:{joins:["event/mover relationships → events → mover quality"],aggregations:["after-move evidence rows"],grouping:[],order:"mover date"},
  movers_without_identified_catalyst:{joins:["coverage-qualified mover catalyst status → quality"],aggregations:["researched no-identified state"],grouping:[],order:"mover date"},
  quality_flagged_movers:{joins:["market observations → unresolved quality findings → optional repairs"],aggregations:["finding counts"],grouping:[],order:"mover date"},
  compare_ticker_catalysts:{joins:["ticker intelligence summaries → coverage-qualified catalyst counts"],aggregations:["events and researched mover associations"],grouping:["ticker"],order:"ticker"},
  cross_source_ticker_summary:{joins:["ticker → market/catalyst/social/quality coverage summaries"],aggregations:["coverage-aware source counts"],grouping:["ticker"],order:"ticker"},
  social_before_move:{joins:["stored social evidence → mover relationships → provider coverage"],aggregations:["first known within recorded coverage"],grouping:[],order:"mover date"},
};
export class QueryPlanner {
  createPlan(draft: ResearchDraft, previous?: QueryPlan | null): QueryPlan {
    const inherited = draft.followUp && previous ? previous : null,
      intent = draft.intent ?? inherited?.intent ?? "semantic_search",
      entities = {
        tickers: draft.entities.tickers?.length
          ? draft.entities.tickers
          : (inherited?.entities.tickers ?? []),
        accounts: draft.entities.accounts?.length
          ? draft.entities.accounts
          : (inherited?.entities.accounts ?? []),
        sources: draft.entities.sources?.length
          ? draft.entities.sources
          : (inherited?.entities.sources ?? []),
        domains: draft.entities.domains?.length
          ? draft.entities.domains
          : (inherited?.entities.domains ?? []),
      },
      filters = { ...(inherited?.filters ?? {}), ...draft.filters };
    if (
      draft.followUp &&
      !previous &&
      !draft.clarification &&
      !draft.safetyRejection
    )
      draft.clarification =
        "This appears to be a follow-up, but there is no earlier research plan in this session. What should the filter apply to?";
    const m = metadata[intent],
      orderField = filters.order_by ?? m.order;
    return {
      version: "research-plan-v1",
      intent,
      question: draft.question,
      entities,
      filters,
      aggregations: m.aggregations,
      joins: m.joins,
      grouping: m.grouping,
      ordering: [
        {
          field: orderField,
          direction:
            orderField === "date" ||
            orderField === "ticker" ||
            orderField === "requested ticker order"
              ? "asc"
              : "desc",
        },
      ],
      limit: 50,
      assumptions: [
        ...(inherited?.assumptions ?? []),
        ...draft.assumptions,
      ].filter((x, i, a) => a.indexOf(x) === i),
      visualization: draft.visualization ?? inherited?.visualization ?? null,
      ...(draft.clarification ? { clarification: draft.clarification } : {}),
      ...(draft.safetyRejection
        ? { safetyRejection: draft.safetyRejection }
        : {}),
    };
  }
}
