# Stock Market Intelligence Database

A standalone Next.js, TypeScript, Tailwind, and Supabase/PostgreSQL application for historical stock-market-mover research. It has its own source tree, database schema, credentials, and deployment lifecycle and shares no infrastructure with another project.

## Status and architecture

- **Checkpoint 1 — Foundation: COMPLETE**
- **Checkpoint 2 — 12-Month Scanz Import Pipeline: COMPLETE**
- **Checkpoint 3 — Historical Market-Mover Analytics: COMPLETE**
- **Checkpoint 4 — Historical Social Research Ingestion: COMPLETE**
- **Checkpoint 5 — Promoter & Account Intelligence: COMPLETE**
- **Checkpoint 6 — Sentiment, Attention & Promotion Scoring: COMPLETE**
- **Checkpoint 7 — Historical Price / Volume Integration: COMPLETE**
- **Checkpoint 8 — Pattern Detection & Historical Similarity: COMPLETE**
- **Checkpoint 9 — Watchlists & Alerts: COMPLETE**
- **Checkpoint 10 — AI Search & Natural-Language Research: COMPLETE**
- **Phase 2A — Company & Security Enrichment: COMPLETE / FOUNDATION**
- **Phase 2A.1 — Intelligent On-Demand Enrichment: COMPLETE**
- **Phase 2A.2 — Historical Data Quality Audit & Auditable Repair: COMPLETE**
- **Phase 2A.2.1 — Repair Review, Triage & Safe Batch Approval: IMPLEMENTED (hosted migration pending)**
- **Phase 2B — Historical News, SEC Filings & Catalyst Intelligence: IMPLEMENTED (hosted migration pending)**
- **Phase 2C — Historical Social Intelligence & Reddit Research: IMPLEMENTED (provider disabled pending approval)**
- **Phase 2C.1 — Cross-Source Intelligence & Social-Ready Research Layer: IMPLEMENTED (hosted migration pending)**
- **Phase 2C.2 — Research Experience & Commercial Readiness: IMPLEMENTED (hosted migration pending)**

Project #3 is complete through Checkpoint 10. Its natural-language research interface creates an inspectable, bounded query plan and answers only from authoritative project records. It does not generate arbitrary SQL, predictions, portfolio instructions, trading signals, or recommendations.

## Phase 2C.2 — Research Experience & Commercial Readiness

Phase 2C.2 turns the existing data and coverage architecture into a historical research workflow without enabling Reddit, adding paid providers, or changing raw Scanz observations.

- The Dashboard is a research command center with real totals, URL-addressable Research Today filters, recent imports, catalyst and quality coverage, saved case activity, provider readiness, and first-run onboarding. No demo records are created.
- `historical-research-priority-v1` ranks historical investigation candidates only. Its 100 possible points are: observed move magnitude 25, repeat appearances 20, catalyst gap 15, social coverage gap 10, clean/approved-repair quality state 10, saved user interest 10, and import recency 10. Every result exposes component reasons. Future returns, later discussion, manual hindsight labels, and predictive inputs are excluded.
- `/tickers/[symbol]` has a Ticker Intelligence Brief, bounded move highlights, an invalid-field-aware repeat-mover profile, coverage states, RAW/EFFECTIVE controls, research notes, and HTML/PDF/JSON/CSV brief export.
- `/market-movers/[id]` is the primary Mover Research Brief: observation summary, priority reasons, data quality, catalyst and social coverage, cross-source timeline, deterministic similar setups, descriptive historical outcomes, workspace controls, and export.
- `historical-mover-similarity-v1` uses only exchange, category, observed change magnitude, price band, volume band, repeat status, catalyst state, and quality state. Unresolved numeric fields are removed from the available-weight denominator. Historical outcomes are joined only after similarity ranking, so they cannot affect a match.
- `/compare` compares two to five tickers or mover appearances. Ticker comparisons retain catalyst and social researched denominators. Mover comparisons show aligned market, quality, catalyst, social, similarity, and descriptive historical-outcome sections.
- Research Workspaces support user-controlled `active`, `follow_up`, `complete`, and `archived` statuses; pinned evidence; separate research questions; manual checklists; notes and tags; combined timelines; saved searches/views; comparison items; and metadata-only brief snapshots. Snapshots do not duplicate raw source datasets.
- `/saved-research-views` stores explicit, auditable filter objects and internal routes for Market Movers, Cross-Source Analytics, AI Search, Research Today, and ticker history. RAW is the default data mode.
- AI Search displays resolved intent, filters, evidence sources, data mode, coverage and quality context, result counts, grouped results, and research templates without exposing chain-of-thought.
- Cross-Source Analytics adds bounded exchange, category, month, quality, repeat-status, and social-coverage breakdowns, plus catalyst-type/timing, field-level quality, repair-method/confidence, and research-backlog views. Catalyst and social percentages continue to use explicit researched denominators.
- `/settings/status` exposes non-secret database, import, metadata, SEC, provider, queue, migration-readiness, and last-run status. `approval_pending` is not treated as unhealthy.

Research briefs always include generation time, report version, data mode, quality/catalyst/social coverage states, source report/mover/event identifiers, and limitations. Effective exports include approved overlay provenance where applicable. Causal language is avoided unless a primary source explicitly establishes it; the application uses “occurred before,” “same day,” “occurred after,” and “identified nearby catalyst.”

The Phase 2C.2 migrations are `202608190001_phase_2c2_research_experience.sql`, `202608200001_phase_2c2_cross_source_breakdowns.sql`, and `202608200002_phase_2c2_cross_source_backlog.sql`. They add `saved_research_views`, `research_questions`, `research_checklist_items`, and `research_brief_snapshots`; add workspace status and bounded derived research views/functions; aggregate all six Cross-Source breakdown dimensions from one materialized mover base; and provide a bounded coverage-backlog RPC that pre-aggregates research interest once. Deploy with:

```bash
npx supabase db push
npm test
npm run typecheck
npm run lint
npm run build
```

Known limitations: Reddit/Devvit remains disabled until explicit provider approval; historical social coverage is therefore usually unresearched, not zero. Price outcomes appear only where valid imported price history exists. PDF reports intentionally bound long tables. The product has no billing, trading execution, recommendation, or predictive-price functionality.

Pages and database queries use React Server Components. Upload extraction runs in Node API handlers, not React components. Preview finalization and confirmed imports run through service-role-only PostgreSQL functions in independently committed, resumable batches. Deterministic staging keys prevent duplicates while preserving progress across request timeouts or process restarts.

## Environment

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-dedicated-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDDIT_PROVIDER_MODE=disabled
DEVVIT_REDDIT_ACCESS_APPROVED=false
DEVVIT_REDDIT_BRIDGE_URL=https://your-app-your-location-external.devvit.net/external/research
DEVVIT_REDDIT_MANAGED_TOKEN=devvit_at_your-managed-token
SEC_USER_AGENT=stock-market-intelligence/1.0 contact@example.com
FINNHUB_API_KEY=optional-server-only-market-data-key
ALPHA_VANTAGE_API_KEY=optional-server-only-company-overview-key
METADATA_DAILY_BUDGET=20
METADATA_SYNC_TIMEOUT_MS=3500
METADATA_STALE_DAYS=180
METADATA_MAX_RETRIES=3
METADATA_NOT_FOUND_COOLDOWN_DAYS=30
METADATA_QUEUE_BATCH_SIZE=5
METADATA_PROVIDER_PRIORITY=alpha_vantage,sec_company_tickers,finnhub
SEC_REQUESTS_PER_SECOND=5
SEC_CACHE_TTL_HOURS=24
SEC_MAX_RETRIES=3
CATALYST_QUEUE_BATCH_SIZE=1
CATALYST_QUEUE_MAX_ATTEMPTS=3
CATALYST_DEFAULT_DAYS_BEFORE=7
CATALYST_DEFAULT_DAYS_AFTER=2
CATALYST_MAX_FILING_DOWNLOAD_BYTES=5242880
CATALYST_MAX_EXTRACTED_TEXT_CHARACTERS=100000
CATALYST_MAX_STORED_EVIDENCE_CHARACTERS=4000
```

The service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix. Use a dedicated Supabase project.

## Local setup

```bash
npm install
npx supabase start
npx supabase db reset
npm run dev
```

For a dedicated hosted project:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Migrations run in timestamp order:

- `202608090001_checkpoint_1_foundation.sql`: foundational schema, category/source seeds, RLS, and ticker statistics.
- `202608100001_checkpoint_2_import_pipeline.sql`: batches, extraction issues, private previews, report extraction/fingerprint columns, performance indexes, recurrence/data-quality views, research-queue rebuild, and atomic import confirmation.
- `202608100002_checkpoint_3_historical_analytics.sql`: versioned methodologies, reason tags, materialized analytics, coverage, transition/pre/post-move functions, immutable raw observations, and analytics refresh.
- `202608100003_checkpoint_4_social_research.sql`: source/community/account normalization, raw acquisition records, import runs/errors, many-to-many ticker mentions, unresolved candidates, source coverage, descriptive statistics, and market-mover proximity.
- `202608100004_checkpoint_5_account_intelligence.sql`: promoter research status, traceable account/mover observations, account/ticker aggregates, candidate configuration, descriptive account views, and an idempotent server-only rebuild.
- `202608100005_checkpoint_6_sentiment_attention_scoring.sql`: versioned sentiment, attention, promotion-intensity, and hype-risk analytics.
- `202608100006_checkpoint_7_historical_price_volume.sql`: provider-neutral price storage, daily metrics, and historical outcomes.
- `202608100007_checkpoint_8_pattern_similarity.sql`: transparent pattern definitions, observations, outcomes, and historical similarity.
- `202608100008_checkpoint_9_watchlists_alerts.sql`: multi-entity watchlists, tags, notes, alert rules/events/runs, deduplication, notifications, backtests, candidate views, and service-only evaluators.
- `202608100009_checkpoint_10_ai_research.sql`: workspaces, saved research, session memory, history, derived full-text documents, fixed read-only query execution, evidence, and search indexes.
- `202608120001_checkpoint_2_async_preview_jobs.sql`: private durable preview jobs, per-report work items, progress counters, bounded work claiming, staged-preview finalization, and idempotent job confirmation.
- `202608120002_checkpoint_2_adaptive_ocr.sql`: persisted adaptive-OCR diagnostics and confirmation guards for structurally incomplete previews.
- `202608120003_checkpoint_2_resumable_finalization.sql`: normalized private preview staging, persisted finalization/commit cursors, bounded idempotent preview assembly and confirmation, paginated report detail, recovery-safe expiration, and the lease extension for the existing production recovery job.
- `202608120004_checkpoint_2_decimal_count_recovery.sql`: safe whole-count normalization for persisted Scanz `trades` and `volume` values whose OCR text uses dot thousands separators, without modifying or reprocessing completed child payloads.
- `202608120005_checkpoint_2_batch_detail_indexes.sql`: composite indexes for report summaries, report appearances, and extraction-issue keyset pagination on the batch-results UI.
- `202608130001_phase_2a_ticker_enrichment.sql`: normalized ticker metadata, durable bounded enrichment runs, per-field provenance, conflict review, coverage, reusable metadata filters, and enriched research-catalog support.
- `202608130002_phase_2a1_on_demand_enrichment.sql`: cache-first metadata decisions, required-field-aware deduplicated queueing, popularity signals, atomic daily provider budget, provider health, cooldown/staleness state, selective triggers, and real metadata-intelligence reporting.
- `202608150001_phase_2a2_historical_data_quality.sql`: immutable-source quality findings, correction proposals, reversible effective values, repair history, report/ticker summaries, quality scores, and bounded resumable audit runs.
- `202608160001_phase_2a21_repair_review.sql`: versioned repair-review tiers, paginated proposal/repair views, optimistic conflict checks, bounded selected decisions, atomic coordinated-row review, decision history, and review indexes.
- `202608170001_phase_2b_catalyst_intelligence.sql`: extended public events, catalyst/source definitions, SEC filings, classification evidence, clustering, cache-first research queue, source coverage, temporal mover links, relevance scoring support, researched-only analytics, and query indexes.
- `202608170002_phase_2b_continuation.sql`: coverage-aware catalyst combinations, repeat behavior, SEC form/source/coverage analytics, CIK mapping cache, provider failure/run observability, filing evidence bounds, manual/correction/cluster audit trails, selective research management, event alerts, catalyst AI/workspace/search support, and paginated analytics drill-down foundations.
- `202608170003_phase_2c_social_intelligence.sql`: selective official Reddit research, durable queue/cache/budget/provenance, normalized social persistence, compliance tombstones, coverage-aware temporal derivation, and social analytics/search integration.
- `202608180001_phase_2c_devvit_access_adaptation.sql`: adds the honest `provider_limited` coverage state and updates coverage analytics for the read-only Devvit bridge transport.

## Phase 2A.1 intelligent on-demand enrichment

Phase 2A.1 replaces automatic full-universe enrichment with a cache-first request path. A server-side `MetadataDecisionEngine` determines required fields for the research context, resolves the cache state, calculates priority, and creates one deduplicated active queue item per ticker. Individual pages never call a metadata provider directly. A complete fresh cache returns immediately with zero provider calls; a complete stale cache remains usable and is queued for refresh; partial data triggers enrichment only when the requesting workflow needs one of its missing fields. No default action enriches all tickers.

Priorities are transparent. Base weights are AI Search 100, ticker page 95, watchlist or alert 90, pattern match 85, manual refresh 80, dashboard 75, recent mover or direct search 70, popular ticker 60, retry 50, and stale refresh 20. Modifiers are +10 for watchlist membership, +8 for a recent mover, +8 for an active alert, +5 for recent pattern activity, up to +15 from `floor(popularity_score / 10)`, and up to +10 from `floor(ai_search_count / 5)`. The result is capped at 150. Popularity itself is the sum of searches, twice page views, three times AI searches, five times watchlist additions, five times alert events, and twice pattern matches.

High-priority ticker pages, direct searches, and metadata-dependent AI Search queries may process one queue item while waiting up to `METADATA_SYNC_TIMEOUT_MS`. Everything else remains persisted for short worker requests. Queue claims are ordered by priority and eligibility, use row locks, recover expired processing leases, and are clamped to ten tickers. Active requests for the same ticker merge reasons and required fields instead of creating duplicates. The management page offers only bounded selective groups: top 25/50/100 popular, watchlists, recent movers, missing-name/exchange groups, failed retries, and one explicit ticker.

The hard shared application budget defaults to 20 external HTTP attempts per UTC day and is reserved atomically in PostgreSQL immediately before every network attempt, including retries. Provider in-memory cache hits do not consume it. Exhausted work is deferred until the next day. Provider order comes from `METADATA_PROVIDER_PRIORITY`; unconfigured providers are skipped, rate-limited providers enter health cooldown, and a later configured provider may be tried. Alpha Vantage Company Overview uses `ALPHA_VANTAGE_API_KEY`; SEC reference and optional Finnhub support remain available from Phase 2A. All credentials are read only in server modules and are never returned by `/settings/providers`.

Provider failures use bounded exponential backoff and a configurable attempt limit. Unsupported/not-found securities receive a 30-day default failure cache. Staleness defaults to 180 days, never blocks use of otherwise sufficient data, and schedules a background refresh. Manual refresh bypasses only stale age: it still obeys daily quota, rate limits, and ticker cooldowns, and never clears existing values while work is pending. Successful merges continue to use Phase 2A provenance and conflict rules, then refresh only the affected ticker research documents.

AI Search enriches at most five candidate tickers and only for metadata-screen intents; unresolved coverage is stated in the result. Exact ticker searches and detail pages use bounded synchronous requests. Watchlist, alert, pattern, and new recent-mover records create deduplicated asynchronous priority signals. Dashboard and `/settings/ticker-enrichment` report real database counts, while `/settings/providers` shows readiness, priority, usage, remaining shared budget, health, rate limits, last success, and errors without exposing secrets.

## Phase 2A company and security enrichment

Ticker enrichment is provider-neutral. `TickerMetadataProvider` defines single and batch lookup, normalization, exchange classification, validation, and rate-limit behavior. The Phase 2A foundation providers remain:

1. `sec_company_tickers`: authoritative SEC company/ticker/exchange reference data. It requires `SEC_USER_AGENT` containing an application name and contact address, uses the SEC bulk ticker/exchange file, and supplies supported issuer names, normalized ten-digit CIKs, and exchange references. It does not supply sector, industry, capitalization, float, shares outstanding, website, or reliable security type.
2. `finnhub`: optional market-data supplement requiring `FINNHUB_API_KEY`. Where the configured subscription returns fields, it can add company profile, industry/sector, country, canonical company website, currency, security type, market capitalization, and shares outstanding. Vendor plan, redistribution, rate, and historical-coverage limits apply. It is not treated as authoritative for SEC identifiers.

The SEC access path uses one cached bulk reference request rather than one request per ticker. Finnhub profile calls use at most five concurrent requests. Both providers use at most three attempts for HTTP 429, transient network errors, timeouts, and 5xx responses with bounded exponential backoff. No arbitrary websites are scraped.

Phase 2A.1 adds Alpha Vantage Company Overview and makes the active on-demand rotation configurable; its default order is Alpha Vantage, SEC reference, then Finnhub. Only configured providers participate, and every actual external HTTP attempt is subject to the shared Phase 2A.1 budget.

Every run snapshots its ticker IDs and symbols into `ticker_enrichment_run_items`, then claims at most 50 items per short server request. Progress, item attempts, provider errors, and the completed cursor are persisted. An interrupted run resumes uncompleted items; retry-failed creates a new run containing failed tickers only. Re-running a ticker is idempotent and never creates ticker records.

Field precedence is conservative: a valid provider value fills a blank database field; an identical value is retained; null/blank never erases; and a different value never overwrites a populated field. Conflicts enter `ticker_metadata_conflicts`, and every accepted or observed field enters `ticker_metadata_sources`. Existing values therefore have precedence until a conflict is explicitly reviewed. SEC is first in the provider chain; Finnhub supplements missing fields.

Exchanges normalize to `NASDAQ`, `NYSE`, `NYSE American`, `OTC`, `Cboe`, or `Other`. Security types normalize to `common_stock`, `preferred_stock`, `ETF`, `ETN`, `warrant`, `unit`, `ADR`, `closed_end_fund`, or `other`. Market cap, float, and shares are stored as absolute numeric values. Websites must be canonical HTTPS company URLs; common finance/search aggregators are rejected. CIK values are ten digits with leading zeroes and are never fabricated for unsupported securities.

Database and provider validation flag malformed URLs, negative numeric data, blank company names, unknown exchange/type values, and float greater than shares outstanding. The last condition is retained as a review issue because provider share-class semantics can differ. Missing fields remain null and coverage reporting never imputes them.

Use `/settings/ticker-enrichment` to inspect the persisted on-demand queue, process a bounded batch, retry failures, enqueue a selective high-value group, refresh one selected existing ticker, and review conflicts. Provider readiness and health are shown at `/settings/providers`. `/tickers`, `/market-movers`, and `/research/patterns` expose reusable sector, industry, exchange, market-cap, security-type, and country filters where relevant. Ticker research documents are refreshed after every successful batch, and AI Search uses a fixed read-only metadata-screen RPC rather than generating SQL.

## Checkpoint 4 social research

The application represents Reddit (including r/wallstreetbets, r/stocks, r/investing, r/personalfinance, and r/CryptoCurrency), Stocktwits, Yahoo Finance Community, InvestorsHub, Seeking Alpha Community, and Motley Fool Community. WallStreetBets is a specialized query over normalized Reddit records, not a second ingestion pipeline.

Each provider implements the shared `SocialSourceAdapter` contract for configuration checks, historical backfills, incremental synchronization, normalization, cursors, and rate-limit handling. Provider failures are isolated. Central retry support uses bounded exponential backoff for HTTP 429 and transient server failures. No CAPTCHA, login, anti-bot, or access-control bypass exists.

Access status is intentionally conservative:

- Reddit uses the current read-only Devvit bridge described in the Phase 2C section. Traditional OAuth remains optional legacy compatibility only; this repository does not claim a completed live backfill.
- Stocktwits has no supported historical public API configured.
- Yahoo Finance Community and InvestorsHub have no permitted collection interface configured.
- Seeking Alpha Community and Motley Fool Community require authorized access or a licensed feed.

Historical and incremental requests store source/community, requested time bounds, cursors, counts, status, and errors. Raw acquisitions are retained separately from normalized posts. Stable provider IDs are deduplicated by source; records without IDs use a source-scoped SHA-256 content hash. Re-running a batch therefore does not create duplicate posts or post/ticker links, and one malformed record is recorded without terminating the remaining batch.

Ticker extraction supports cashtags, exchange-prefixed symbols, and plain symbols validated against the existing ticker universe. Explicit unknown candidates enter `unresolved_ticker_mentions`; they never create ticker records automatically. Common uppercase English and market terms are excluded from blind matching.

`social_mention_mover_proximity` derives the nearest prior and subsequent Scanz appearance at query time. Social and account statistics are descriptive counts only. Correlation language does not imply causation.

Routes use server-side filtering and 50-row pagination: `/social`, `/social/search`, `/social/unresolved`, `/social/reddit`, `/social/wallstreetbets`, `/social/stocktwits`, `/social/forums`, `/social/posts/[id]`, `/social/accounts/[id]`, and `/settings/social-sources`. `/imports` and `/tickers/[symbol]` include social-research sections. Empty databases render honest empty states.

## Checkpoint 5 account intelligence

In this application, “promoter” means an account selected for securities-discussion research. It does not mean a compensated promoter, manipulator, fraudster, or person who caused a market move. Account identity remains scoped to source plus username; identical usernames on different platforms are never merged automatically.

`rebuild_account_intelligence()` deterministically rebuilds `account_mover_observations`, `account_ticker_statistics`, and the currently supportable `promoter_statistics` fields from normalized posts, post/ticker links, accounts, and Scanz appearances. It deletes and recreates derived rows inside one database function, so repeat execution does not double-count. Browser roles cannot execute it; use the service-role-only RPC or `POST /api/admin/rebuild-account-intelligence`.

For every post/ticker pair, the rebuild selects the nearest mover date on or after the social post’s UTC calendar date. Every Scanz category recorded for that nearest date remains a separate traceable observation. A mention on an earlier UTC date is `before_mover`; a mention on the mover’s UTC calendar date is `mover_day`. If no same/future mover exists, the nearest prior mover date is retained as `after_mover`. Scanz has no exact intraday mover timestamp, so same-day records never claim intraday sequence.

An early mention is a `before_mover` observation. Researchers can filter same-day, 1-, 3-, 7-, 14-, and 30-day windows without declaring one window universally meaningful. Gainer, decliner, and most-active associations come only from `market_categories.category_type`, never account language.

Recurring account/ticker relationships contain at least two separate normalized post/ticker links. Counts include total posts, separate UTC posting days, pre-move mentions, distinct related mover appearances, and category associations. Every aggregate links back to the supporting post and mover observation.

The Historical Pre-Move Association Rate is explicitly `unique tickers with a before-mover observation / unique tickers mentioned`. It is not accuracy, a win rate, investment performance, or a predictive probability. Rankings use only visible factual columns.

Automatic research candidates use configurable defaults: at least five ticker mentions, an account/ticker relationship with at least three mentions, or at least two pre-move observations. Researchers can persist `candidate`, `tracked`, or `dismissed` status and notes in PostgreSQL. Dismissed accounts are not automatically reflagged.

Checkpoint 5 itself does not infer post-mention performance. When legitimate price histories are present, Checkpoint 7 now populates the previously reserved account return fields from traceable seven-session social-market outcomes. Missing price coverage remains null. No manipulation, credibility, prediction, or investment-quality metric is inferred.

Account routes: `/promoters`, `/promoters/[id]`, `/research/pre-move-accounts`, `/research/account-ticker-relationships`, and `/market-movers/[id]`. Dashboard and ticker details expose the same derived evidence with server-side filtering and pagination.

## Supported imports

The `/imports` interface accepts a PDF or ZIP archive containing PDFs. ZIP processing rejects path traversal and absolute paths, skips hidden/system and unsupported files, and enforces file-count, per-file, and expanded-size limits. PDFs are independently fingerprinted with SHA-256.

Import flow:

1. Validate the PDF/ZIP safety limits, fingerprint the archive and each PDF, create a private durable job, and return its opaque ID without running OCR in the upload request. Identical active archives reuse their existing job; identical reports are labeled **Already Imported**.
2. Persist non-duplicate PDFs as private Supabase Storage work items. The service role creates the private `scanz-import-preview-jobs` bucket when first needed; browser roles never receive storage paths.
3. Short server requests atomically claim a bounded batch (two reports by default, configurable from 1–10 with `IMPORT_PREVIEW_BATCH_SIZE`) and extract embedded text page-by-page.
4. Render low-text pages at 360 DPI and detect/crop the white letter-page margins. Pass A OCRs the cropped screenshot in overlapping regions. If date/category/row structure, numeric alignment, or confidence is inadequate, Pass B clips each region directly from the original PDF and renders it at 3000 px wide, preserving the embedded screenshot's native pixels instead of enlarging the already-downsampled 360-DPI image. Only inadequate Pass B results reach the optional 3800 px table-region recovery pass, which deterministically evaluates sparse/block segmentation and grayscale/Otsu preprocessing.
5. Normalize and validate the report date, category, ticker, rank, price, changes, trades, volume, and dollar volume. Unreliable values remain `NULL`; raw values and extraction provenance are retained.
6. Persist counters after every report. The browser polls status and displays processed files, usable reports, extracted rows, warnings, errors, and the current filename. Its opaque active job ID is retained locally so navigation or refresh can restore and resume the job.
7. Finalize completed work items from their persisted `report_payload` values into normalized, private staging in batches of ten reports. The small `import_previews` row contains metadata only; preview report detail is loaded in bounded pages. A finalization timeout resumes from the persisted ordinal without downloading PDFs or rerunning OCR.
8. Confirmation references the completed job and commits the same normalized staging in bounded report, issue, and appearance batches. It never downloads the archive, reparses PDFs, reruns OCR, or reconstructs the archive in memory. Confirmation retries resume the same import batch and deterministic staging records prevent duplicate reports or appearances.

Completed batch pages read aggregate totals directly from `import_batches`. Report summaries load after the page renders in pages of 20 using an explicit column projection that excludes `source_reports.extracted_rows`. Ticker appearances and extraction issues remain collapsed until requested and load in pages of at most 100. The detail APIs accept `page`, `pageSize`, and an optional stable UUID `cursor`; no batch-results response contains the full archive.

The printed date takes precedence over filename date; a disagreement produces a warning. The importer never defaults to today's date. A failed page does not automatically fail other pages or reports, and one failed report does not stop the remaining job. OCR below the confidence threshold remains visible as diagnostic output but cannot create a date, category, or market-mover row. Accepted OCR rows retain render DPI, crop geometry, segment boundaries, page number, method, confidence, and their raw source line in existing provenance fields. Preview jobs expire after 24 hours and can be cancelled from the UI.

Pass adequacy requires a valid printed date, at least eight supported headings, at least 24 usable rows, at least 65% four-column numeric alignment, a non-disproportionate parser-error count, and OCR confidence of at least 65%. Confidence alone can never accept a report. Per-report diagnostics retain the render and crop dimensions, target width and scaling factor for every attempted pass, native-PDF rerender status, segmentation/preprocessing path, fallback reason, category/row/alignment counts, parser errors, and validation failures. A preview with no usable rows cannot be confirmed. When usable reports coexist with failed reports or extraction errors, the UI identifies the partial import, preserves the failed-report diagnostics, and imports only validated rows. Set the server-only `IMPORT_OCR_DEBUG_DIR` to save rendered pages, detected crops, normalized pass images, and OCR segment/table-region PNGs for supervised troubleshooting; keep that directory outside the public web root because it contains source report data.

### Existing completed-job recovery

Migration `202608120003` recognizes a parent job that is still `processing` after all child payloads completed as a finalization-only recovery state. For job `1442107e-8cf9-4dd1-bb23-ff50744ac04d`, it retains the 224 child payloads and extends the lease without changing their contents. After applying the migration and deploying this application version, resume one bounded batch at a time with:

```bash
curl -sS -X POST \
  "https://YOUR_APP_HOST/api/admin/import-preview-jobs/1442107e-8cf9-4dd1-bb23-ff50744ac04d/resume"
```

Repeat until the response reports `"status":"completed"`; each response exposes `reportsFinalized` and `rowsFinalized`. Opening `/imports` with the saved job ID also performs the same bounded polling. Do not re-upload the archive. The hosted migration is not applied by source checkout or deployment; run `npx supabase db push` from the linked project first.

## Status and retry rules

Reports are `completed` when they contain usable records without material failures, `partial` when usable records coexist with extraction errors, and `failed` when no usable records exist. Batches are `completed`, `completed_with_errors`, or `failed` based on their report outcomes.

To retry a failed report, correct the OCR/parser environment or source and upload changed bytes. Identical bytes remain protected by the SHA-256 unique index. If the exact same bytes must be retried, an administrator must first review its logged issues and deliberately remove the failed source report.

## Derived statistics and research queue

`rebuild_ticker_statistics()` derives all ticker statistics from `market_mover_appearances` using `market_categories.category_type`; browser roles cannot execute it. `ticker_category_frequency` exposes recurrence by ticker/category.

New tickers enter the research queue once. Priority is deterministic:

- 500 tier: repeated biggest gainers
- 400 tier: first biggest-gainer appearance
- 300 tier: repeat market movers
- 200 tier: biggest decliners
- 100 tier: most active

Counts provide deterministic ordering within each tier. No social research is performed.

## Historical analytics

Checkpoint 3 derives intelligence exclusively from `market_mover_appearances`. A database trigger prevents updates or deletes to raw observations. `refresh_historical_analytics()` rebuilds only derived materialized views and reason tags after an import. Indexed views provide server-side filtering, sorting, pagination, and streamed filtered CSV exports.

Available report days are distinct dates actually present in imported reports. Calendar-day windows are anchored to the latest available report date. The displayed percentage is observed report days divided by the calendar span; it is explicitly not trading-day or archive completeness.

Classification is centralized: one unique day is `new_mover`; a latest gap up to 10 days is `recent_repeat`; 11–90 days is `returning_mover`; five unique report days takes precedence as `frequent_mover`.

Score version `v1` is persisted in `analytics_methodologies`:

- Recurrence: capped contributions from total appearances (18), unique days (24), repeat gainers (16), categories (10), last-seven-available-day activity (12), gap bonus (12), and active months (8).
- Mover intensity: average absolute change (30), ±50% extreme count (24), top-five ranks (16), average volume (15), and average dollar volume (15).
- Research priority: 35% recurrence, 30% intensity, plus capped repeat-gainer, reversal, most-active-to-gainer, and unique-day contributions.

Scores are deterministic 0–100 historical research descriptors. They do not measure investment quality, imply manipulation, or predict future returns. Transition analytics preserve same-day multi-category records and support maximum windows of 1, 3, 5, 10, or 30 days. Pre/post-move functions use Scanz appearances only.

Analytics routes: `/analytics`, `/analytics/repeat-movers`, `/analytics/gainers`, `/analytics/decliners`, `/analytics/most-active`, `/analytics/categories`, and `/analytics/extreme-moves`.

## Database

Foundation tables: `tickers`, `source_reports`, `market_categories`, `market_mover_appearances`, `ticker_statistics`, social-research foundation tables, `ticker_events`, `watchlists`, `watchlist_tickers`, and `research_queue`.

Checkpoint 2 tables: `import_batches`, `report_extraction_issues`, and private `import_previews`. Checkpoint 3 adds methodology/settings and normalized reason tables plus recurrence, transition, category, cycle, extreme-move, priority, and coverage views. Checkpoint 4 adds normalized social-ingestion tables. Checkpoint 5 adds account intelligence. Checkpoint 6 adds versioned scoring and explainable score components. Checkpoint 7 adds normalized prices and historical market outcomes. Checkpoint 8 adds pattern categories/definitions/conditions, versioned feature vectors, pattern observations/outcomes/statistics, and transparent similarity matches. Checkpoint 9 adds watchlist, alert, notification, and backtest tables. Checkpoint 10 adds `research_workspaces`, `saved_searches`, `research_workspace_items`, `research_sessions`, `research_messages`, `research_history`, and the derived `research_search_documents` catalog.

## Sentiment, attention, and promotion scoring

Checkpoint 6 analyzes every normalized post/ticker mention independently with deterministic `rules-v1` language rules. Each observation retains its label, bounded -1 to +1 score, confidence, method, version, and human-readable reason. Daily, weekly, and monthly sentiment aggregates remain derived and rebuildable.

Unusual attention uses mention velocity (35%), distinct-account growth (25%), source breadth (20%), community breadth (15%), and engagement growth (5%), compared with the preceding seven calendar days. A zero baseline never produces infinity. Missing engagement is excluded and the available weights are renormalized.

Promotion intensity uses repeat-post density (30%), frequency (25%), community concentration (20%), source concentration (15%), and engagement (10%). Hype-risk combines unusual attention (35%), promotion intensity (30%), absolute sentiment (20%), and account concentration (15%). Component records preserve raw and normalized values, weights, contributions, availability, and explanations. All scores are deterministic 0–100 descriptors and can be rebuilt server-side with `rebuild_cp6_analytics`; browser roles cannot execute it.

These analytics describe observed historical discussion. They do not predict price, recommend an investment, or establish manipulation, fraud, coordination, compensation, or wrongdoing. Coverage is limited to imported records; missing sources, accounts, communities, engagement fields, and dates are reported rather than imputed.

## Historical price and volume integration

Checkpoint 7 stores normalized OHLCV records in `price_history` behind a provider-neutral `PriceDataProvider` interface. The installed CSV provider accepts date, open, high, low, close, adjusted close, volume, trades, and VWAP fields. Additional providers can implement the same download, incremental-update, normalization, and validation contract without changing the database model. A bad row is retained in `price_import_errors` and does not terminate valid rows in the same run. Duplicate ticker/date/source records are safely updated.

Analytics consistently use raw close because adjusted data is optional and may not be available from every source. Daily metrics calculate backward-looking 1, 3, 5, 7, 14, and 30-session returns. Social and event outcomes calculate forward returns using the next available imported sessions. When multiple sources cover the same ticker/date, a deterministic canonical record ordered by source and record ID is used for analytics while every source record remains searchable. Weekends, market holidays, halts, IPO gaps, delistings, and absent sessions are not synthesized. A missing reference or forward session produces `NULL`.

Volume analytics retain prior-session percentage change, acceleration, and relative volume against the previous 5, 20, and 60 available sessions. Volatility is the sample standard deviation of daily raw-close returns over 5, 20, and 60 available-session windows; volatility expansion is 5-session volatility divided by 20-session volatility. “Abnormal volume” and “volume expansion” are descriptive comparisons only.

`rebuild_cp7_analytics()` deterministically rebuilds daily price metrics, event outcomes, social outcomes, account statistics, and monthly ticker/social outcomes. Account average and median return fields use the observed seven-session outcome. Rebuild functions are restricted to the service role. These historical associations do not imply causality, forecast future results, or constitute ratings, recommendations, or trading signals.

## Historical patterns and similarity

Checkpoint 8 derives daily `features-v1` vectors from the existing sentiment, attention, promotion, account, Scanz, price, volume, and volatility analytics. Raw inputs are never altered. Feature rows retain available sentiment level/change, attention and velocity, promotion and hype descriptors, relative volume, rolling volatility, social breadth, account activity, trailing mover count, and daily price change. Missing source metrics stay null.

The seeded pattern library contains ten transparent `patterns-v1` definitions in Social, Market, and Combined categories. Every definition is composed from visible `pattern_conditions`; the rule detector requires every condition to be satisfied and retains the threshold, operator, configuration, source value, and result in `matched_conditions`. Stored confidence is match completeness (1 for a fully satisfied deterministic definition), never predictive confidence. The current definitions cover attention spikes, sentiment shifts, community expansion, account bursts, volume expansion, volatility expansion, repeated unique mover dates, social-plus-volume observations, early-mention-plus-attention observations, and multi-factor historical situations.

Pattern outcomes use the same raw-close and subsequent-available-session methodology as Checkpoint 7. Statistics include frequency, historical returns, volume/volatility changes, and positive or negative observed 30-session outcomes. “Positive” and “negative” describe historical arithmetic only; they are not wins, ratings, or probabilities.

Similarity version `similarity-v1` compares ten available features: sentiment (15%), attention (20%), promotion intensity (10%), hype risk (5%), relative volume (15%), volatility (10%), mention count (10%), accounts (5%), sources (5%), and communities (5%). Each feature receives a bounded distance similarity. Missing pairs are excluded and remaining weights are renormalized. The UI exposes the source/reference values, feature similarity, and weights. Identical available profiles score 100; similarity is not predictive confidence.

`rebuild_cp8_patterns()` rebuilds features, observations, outcomes, statistics, and the top twenty stored historical comparisons for each ticker’s latest feature row. Ticker/date similarity is also calculated on demand in PostgreSQL with a maximum of 100 results. Rebuild functions are service-role-only, deterministic, and idempotent. Historical similarity does not imply future results.

Only canonical market categories and social-source taxonomy are seeded. No fake market or research records are included.

## Watchlists, alerts, and notifications

Watchlists can track existing tickers, source-scoped social accounts, and transparent research-pattern definitions in one collection. Researchers can assign reusable tags, add notes, view current derived intelligence, and create a rule scoped to the watchlist or to a specific entity. Existing `watchlist_tickers` records are migrated into the generalized entity model; no market, social, account, price, or pattern observations are fabricated.

Alert rules use structured JSON configuration with a visible operator, threshold where applicable, reporting period label, severity, and frequency. Supported conditions are unusual attention score, percentage attention increase, sentiment above/below/change, promotion intensity, hype risk, pattern detection, historical similarity, market-mover detection, volume expansion, volatility expansion, mention-count increase, new-account activity, and new-source activity. Candidate events are read from existing derived feature vectors, pattern observations, similarity matches, market-mover appearances, and normalized social activity. Source records remain unchanged.

`evaluate_alert_rules()` supports batch, incremental, retry, and manual run labels, retains run counts/errors, and produces an alert only when the configured condition and entity/watchlist scope match. Every alert retains the observed value, previous value where available, operator, threshold, timestamp, source record identifiers, source table, and condition-specific evidence. A unique rule/entity/time-bucket hash suppresses duplicate alert events across retries. Frequency is `once_per_event`, `once_per_day`, or `once_per_week`.

The evaluator and historical backtest function are restricted to the service role. The manual server endpoint is `POST /api/admin/evaluate-alerts`; production scheduling can call the same endpoint or RPC from dedicated job infrastructure. Backtests scan only historical candidate data inside the requested date range and store the matching evidence. They do not calculate predictive accuracy or future effectiveness.

In-app notification history is created for each new alert event and supports new, reviewed, dismissed, and archived workflow states. Email preference and delivery-history schema is present, but email sending is intentionally only a future foundation: no provider is configured and no email is claimed as sent. Alert/notification routes use server-side filters and 50-row pagination where history can grow.

Coverage remains explicit. Empty or partially imported databases render empty states and null metrics; absent social, price, pattern, or feature coverage is never imputed. The `period` field is retained as transparent rule metadata while current candidates use the canonical daily/observation time grain supplied by Checkpoints 1–8.

Checkpoint 9 routes are `/watchlists`, `/watchlists/[id]`, `/watchlists/dashboard`, `/alerts`, `/alerts/new`, `/alerts/[id]`, and `/notifications`. The main dashboard includes active-alert counts, watchlist attention observations, and new historical pattern matches.

## AI Search and natural-language research

Checkpoint 10 uses six independently testable layers: `ResearchPlanner`, `QueryPlanner`, `SQLBuilder`, `ResultValidator`, `EvidenceAssembler`, and `ResponseGenerator`. The planner recognizes bounded historical-research intents, extracts tickers, sources, dates, categories, metadata themes, thresholds, sorting, and limits, and represents them in `research-plan-v1`. Follow-up questions inherit the prior plan from a persisted research session. Ambiguous phrases such as “show winners” produce a clarification instead of a query.

The component named `SQLBuilder` deliberately does not interpolate or emit SQL. It maps a validated plan to the single fixed `execute_research_query` RPC with parameter values. PostgreSQL accepts only eleven whitelisted intents, each implemented as a static read-only branch. Destructive instructions, arbitrary SQL, prompt-injection commands, financial advice, price targets, portfolio requests, and trade execution are rejected before database execution. Research-history and workspace metadata may be written, but market, social, price, account, pattern, watchlist, and alert source records remain read-only.

Supported structured paths cover semantic project search, social mentions before movers, accounts before the largest imported move, attention/sentiment/promotion feature screens, source sentiment comparisons, pattern frequency, side-by-side ticker comparison, historical timelines, discussion before relative-volume expansion, sentiment before biggest-gainer appearances, and promotion observations around earnings events. Unrecognized research text falls back to semantic search rather than invented SQL.

`research_search_documents` is a derived, rebuildable catalog over tickers/company metadata, social posts, source-scoped accounts, communities, market-mover appearances, pattern definitions, alert events, and watchlists. It uses a PostgreSQL GIN full-text index with exact, prefix, and partial matching. `rebuild_research_search_documents()` and `POST /api/admin/rebuild-research-catalog` refresh the catalog after imports; only the service role can rebuild or execute structured research.

Every successful answer includes the structured intent, entities, filters, date range, joins, grouping, ordering, calculations, assumptions, tables consulted, methodology versions, observation dates, limitations, and record-level drill-down citations. Zero-result responses state that no records matched current coverage. Clarification and rejected responses explicitly state that no database query ran; they never fabricate supporting evidence.

Research workspaces store saved searches, pinned tickers, comparisons, prompts, and filters. Session messages retain conversational context, while `research_history` records the prompt, structured plan, workspace, execution time, record count, evidence metadata, status, and timestamp. Results are capped at 200 records, history is paginated, aggregations remain server-side, and semantic documents use indexed lookups suitable for large datasets.

CSV, JSON, and PDF exports re-run the validated saved plan and include generation time, methodology, filters, evidence metadata, limitations, and actual result rows. CSV cells are protected against spreadsheet-formula execution. Timeline visualizations plot only returned sentiment, attention, price, mover-event, and pattern-occurrence values.

Routes are `/ai-search`, `/research-workspaces`, `/research-workspaces/[id]`, and `/research-history`, with supporting search, workspace, export, and catalog-rebuild APIs. No external language-model credential is required: the current implementation is a deterministic, explainable natural-language planner. Its vocabulary is intentionally bounded, and data coverage is limited to records already imported into this standalone project.

## Phase 2A.2 historical data quality audit and auditable repair

Phase 2A.2 never updates or deletes `market_mover_appearances`. The immutable imported row and its `raw_values` OCR/parser provenance remain source truth. `market_data_quality_findings` stores versioned deterministic concerns; `market_data_correction_proposals` stores reviewable candidate values; `market_data_repair_log` stores every approval, supersession, and reversion; and `market_data_effective_values` stores only the currently approved overlay. Its guard trigger requires a matching approved proposal and audit-log record.

`market_mover_appearances_effective` exposes both `raw_*` columns and effective columns. Market Movers defaults explicitly to `dataMode=raw`; `dataMode=effective` must be selected to use approved overlays. Existing historical analytics, statistics, patterns, alerts, and AI research remain on raw mode during this phase. The effective view also exposes quality score, finding count, repair count, and repair status so future research and CSV/JSON exports can disclose original/effective values without replacing source data.

Detection rules use rule version `2a2-v1`. Missing/extra decimal rules require a robust local median from at least three nearby ticker observations, a sixfold price discontinuity for decimal loss (or a price below 15% of the median for an extra decimal), a candidate within 45%/35% of the median, and—when available—agreement within 35% of the price implied by dollar volume divided by share volume. Penny/OTC and biggest-gainer decimal proposals require cross-field confirmation. Price sequence outliers require a fourfold discontinuity and modified MAD z-score of at least 8. Price-times-volume consistency allows a broad 0.5–2.0 ratio because last price, rounding, and source calculations can differ.

Percentage thresholds are category-aware: mega-cap Most Active rows are reviewed at absolute 25%, other Most Active rows at 75%, standard gainers at 1000%, and penny/OTC contexts at 1500%; negative values below -100% are impossible-domain findings. Dividing by 100 is only proposed when the source token lacks a decimal and the candidate is plausible for that context. A raw OCR row beginning with a percent-marked token followed by trades, volume, and dollar volume is treated as a deterministic column-alignment signature. The missing price remains `NULL`; it is never invented.

Quality score is a descriptive 0–100 score: `100 - Σ(severity_weight × confidence)`, bounded at zero. Weights are critical 35, high 20, medium 10, low 4, and info 1. Only unresolved `open` and `proposed` findings contribute; reviewed, repaired, rejected, ignored, superseded, and auto-resolved findings remain auditable but do not keep an observation actively flagged. It is not a probability or statement that a correction is true.

All initial proposals require human review. Confidence at or above 0.99 is merely eligible for deterministic auto-approval; this version performs no automatic approvals. Ambiguous decimal placement is capped below 0.99. Optional external reference checks are manual-only and must reuse the Phase 2A.1 provider budget; the historical audit itself makes zero provider calls.

Full audits are persistent jobs. `start_market_data_quality_audit()` creates one work item per appearance, and `claim_market_data_quality_audit_items()` claims 1–1000 rows with `FOR UPDATE SKIP LOCKED`; the UI and API use 250. Ten-minute stale leases return to pending. Findings are unique by appearance, field, rule ID, and rule version, so resumes and repeated rule-version scans do not duplicate them. Start with `POST /api/admin/data-quality/audits`, then process bounded batches with `POST /api/admin/data-quality/audits/{auditRunId}/process` and body `{"limit":250}`.

Approve/reject/edit/ignore/re-run/revert actions are server-side and service-role-backed. Approval takes an advisory transaction lock per appearance/field, creates the log before changing the effective overlay, and queues targeted effective-mode recomputation for ticker statistics, historical analytics, pattern features, and research documents. Reversion removes only the overlay, restores raw behavior, and appends another log entry. Existing raw-derived analytics are not silently rebuilt or mixed with effective values.

The review routes are `/data-quality` and `/data-quality/[findingId]`. The detail packet includes the immutable row, report/category/ticker metadata, raw OCR line, page, extraction method/confidence, render DPI, crop/segment provenance where preserved, import issues, robust sequence context, proposals, and repair history. Image crops are shown only if persisted; current imports intentionally retain OCR and geometry rather than durable crop files.

Known limitations: deterministic rules prioritize precision over recall; local sequence context can be sparse; last-price dollar-volume arithmetic is supporting evidence only; category and security metadata can be incomplete; no full-archive external quote validation is performed; review endpoints use the project’s current server-admin pattern because application authentication has not yet been introduced.

## Phase 2A.2.1 repair review, triage, and safe batch approval

`/data-quality/review` is a server-paginated proposal workspace: 50 proposals by default and never more than 100 per page. It exposes the original-to-proposed transformation, detector evidence confidence, supporting-finding count, source/OCR evidence, neighboring prices, dynamic conflicts, versioned review tier, and proposal state without downloading the 1,514-proposal population into the browser. Filters remain server-side and exact ticker search is indexed through the review view’s underlying ticker relationship.

`RepairReviewClassifier` uses version `repair-review-v1`. Tier A is reserved for a source-token-backed, mathematically deterministic punctuation normalization at confidence 0.99 or greater. Tier B requires a source token, a non-null inferred decimal repair, confidence of at least 0.90, a recognized `2a2-v1` finding, and no conflict. Tier C is a coordinated column realignment or OCR alignment repair and is reviewed atomically as one row. Tier D includes insufficient evidence, null ordinary replacements, low confidence, stale/superseded proposals, original-value mismatches, conflicting active proposals, or existing effective values. Tiers are review priority only; they never approve data.

Only explicitly selected Tier A/B proposals are eligible for ordinary batch approval. Selection is visible, current-page only, reversible before submission, and capped at 25. Approval requires an explicit confirmation preview and review note. Rejection requires a structured reason and may include notes. Every item carries its `updated_at` optimistic version; PostgreSQL locks and revalidates status, currentness, finding state, rule/classifier versions, raw original value, conflicts, appearance existence, and effective-value state. Responses distinguish approved, rejected, skipped, stale, conflict, not eligible, and failed outcomes. There is no approve-all, confidence-threshold auto-approval, or automatic submission.

Tier C review sends every active column-realignment field for one appearance through one PostgreSQL transaction. Missing prices may remain `NULL` only when the raw percent-marked source line proves that the price token was absent. If any field is stale or invalid, no field is approved. Approved fields reuse the Phase 2A.2 effective overlay, append repair-log evidence including classifier/rule versions, and queue only affected recomputations. Rejections use the same repair log rather than a parallel audit system.

`/data-quality/repairs` lists active overlays with raw/effective values, method, reviewer, and recomputation state. Reversion requires confirmation and a reason, removes only the overlay, preserves approval/rejection/reversion history, and queues targeted recomputation. Project-wide raw mode remains the default for Market Movers, statistics, patterns, alerts, and AI Search.

## Phase 2B historical catalyst intelligence

Phase 2B extends the existing `ticker_events` table instead of replacing it. Observed public events remain separate from deterministic classification evidence, duplicate/related-event clusters, date-window coverage, and temporal relationships to immutable `market_mover_appearances`. The application says an event “preceded,” “occurred near,” or “followed” a mover; it does not claim causation, predict returns, or generate trading recommendations.

SEC EDGAR is the implemented free primary-source adapter. `SecEdgarProvider` reads the official company submissions JSON endpoint using the ticker’s cached ten-digit CIK or an authoritative cached SEC ticker/CIK mapping, the configured `SEC_USER_AGENT`, bounded retries/backoff with `Retry-After`, persisted response caching, conditional ETag/Last-Modified revalidation, and a conservative default of five requests per second clamped to at most nine. Ambiguous or missing mappings are stored without guessing and do not create duplicate ticker records. Provider states are `healthy`, `degraded`, `rate_limited`, `unavailable`, `unconfigured`; an absent genuine application/contact user agent disables live SEC requests. SEC documents are deduplicated by accession number. The provider stores filing form, filing/report dates, accepted timestamp where supplied, primary document, items, official URLs, amendment state, and raw metadata. It does not scrape arbitrary investor-relations sites or require a paid news provider. Official references: [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) and [SEC fair-access guidance](https://www.sec.gov/about/developer-resources).

`catalyst-v1` always records the observed SEC filing fact. More-specific classifications are separate, versioned candidates with `classifier_id`, classifier version, reason, and evidence confidence. For example, 8-K Item 2.02 supports `financial_results`, Item 1.01 supports a material-agreement candidate, Item 3.02 supports an equity-financing candidate, and Item 5.02 supports a management-change candidate. S-1, S-3, F-1, F-3, 424B3, and 424B5 are registration/offering-related evidence only; the application explicitly does not infer completed issuance, dilution, or market impact from form type. Unresolved evidence retains the source event for later reclassification. Manual sourced events and normalized corrections require an actor/reason and preserve separate audit history; source facts and SEC filing facts remain immutable.

On-demand research uses `catalyst_research_queue`. Priorities are AI Search 100, manual 95, market-mover detail 90, ticker page 85, watchlist 80, pattern match 75, research workspace 70, retry 60, and historical backfill 20. Active ticker/appearance/window/source requests deduplicate transactionally. Claims use `FOR UPDATE SKIP LOCKED`, at most five items per worker call, with a default of one. Ticker and mover pages queue work before invoking the bounded processor. `/settings/catalyst-research` exposes bounded selected tickers, a selected mover, top-25 frequent movers, top gainer tickers, and watchlists plus retry/process controls. It shows real queue, provider, cache, request, failure, and SEC coverage state without credentials. No page view automatically researches all 4,247 tickers, and no full-universe backfill control exists.

The default mover research window is seven calendar days before through two days after. Explicit windows may extend to 367 calendar days. Exact SEC accepted timestamps are classified in America/New_York as pre-market, regular session, or after-hours. Date-only records retain unknown intraday sequence. Temporal buckets are same session, pre-market same day, after-hours previous day, within 24 hours before, 1–3, 4–7, or 8–30 days before, after move, and unknown.

`catalyst-relevance-v1` is a deterministic 0–100 relevance score, not a probability of causation. It adds up to 25 points for temporal proximity, 20 for primary-source authority, 15 for classification specificity, 20 for exact ticker linkage, 10 for filing specificity, 5 when the event predates the move, and 5 for corroboration. The stored component breakdown makes every score inspectable.

Coverage is source- and window-specific. “No identified public catalyst” means no qualifying event was found in the currently searched sources/window; it never means that no catalyst existed. Each coverage row exposes sources checked, date range, last check, SEC/news/company-IR flags, event count, status, and limitations. Optional company-IR, RSS, and news adapters implement the `NewsEventProvider` contract but no commercial provider is required or falsely reported as searched.

Filing bodies are not downloaded in bulk. Selective inspection may store accession/form/date/document/section provenance and at most 4,000 characters of short evidence. Configurable hard defaults cap downloads at 5 MiB and extraction at 100,000 characters. Ordinary event rows never contain huge filing bodies.

Routes are `/events/[id]`, `/analytics/catalysts`, `/analytics/catalysts/drill-down`, `/settings/catalyst-research`, `/tickers/[symbol]`, and `/market-movers/[id]`. The Market Movers table exposes Catalyst Found, No Catalyst Research Yet, No Identified Catalyst, and Research Partial indicators plus a server-side catalyst filter. Historical catalyst analytics separate the researched denominator from all mover appearances and provide combinations, repeat behavior, SEC forms, source operations, SEC coverage, year/month, type, timing, exchange, mover-category, and before-move distributions with drill-down to evidence. Raw Scanz values remain the default inputs for descriptive change/volume analytics, and unresolved high/critical market-data findings are disclosed without removing catalyst links.

AI Research routes catalyst questions only through the fixed `execute_catalyst_research_query` function; it never generates arbitrary SQL. Results cite stored events/movers, disclose source/date coverage and limitations, and reframe causal requests as evidence and timing research. Existing workspaces accept saved events, filings, catalyst comparisons, and timelines. Existing exports serialize the returned evidence and coverage fields, and existing alerts may consume newly persisted filing/catalyst events without adding external polling.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Roadmap

1. Checkpoint 1 — Foundation — COMPLETE
2. Checkpoint 2 — 12-Month Scanz Import Pipeline — COMPLETE
3. Checkpoint 3 — Historical Market-Mover Analytics — COMPLETE
4. Checkpoint 4 — Historical Social Research Ingestion — COMPLETE
5. Checkpoint 5 — Promoter & Account Intelligence — COMPLETE
6. Checkpoint 6 — Sentiment & Attention Scoring — COMPLETE
7. Checkpoint 7 — Historical Price/Volume Integration — COMPLETE
8. Checkpoint 8 — Pattern Detection — COMPLETE
9. Checkpoint 9 — Watchlists & Alerts — COMPLETE
10. Checkpoint 10 — AI Search — COMPLETE
11. Phase 2A — Company & Security Enrichment — COMPLETE / FOUNDATION
12. Phase 2A.1 — Intelligent On-Demand Enrichment — COMPLETE
13. Phase 2A.2 — Historical Data Quality Audit & Auditable Repair — COMPLETE
14. Phase 2A.2.1 — Repair Review, Triage & Safe Batch Approval — IMPLEMENTED; hosted migration pending
15. Phase 2B — Historical News, SEC Filings & Catalyst Intelligence — IMPLEMENTED; hosted migration pending
16. Phase 2C — Historical Social Intelligence & Reddit Research — IMPLEMENTED; current Devvit access adaptation complete, hosted migrations/Reddit approval/manual smoke test pending
17. Phase 2C.1 — Cross-Source Intelligence & Social-Ready Research Layer — IMPLEMENTED; hosted migration and production smoke test pending

## Phase 2C historical social intelligence

Phase 2C extends the existing normalized `social_sources`, `social_communities`, `social_accounts`, `social_posts`, `post_tickers`, `sentiment_observations`, attention, account-intelligence, mover, catalyst, search, workspace, and alert foundations. It does not introduce a second sentiment model, alter Scanz observations, or collect Stocktwits, news, SEC, price, or other provider data.

Reddit is the only implemented social provider. Its current production access path is a separate, minimal Devvit 0.14.1 server app at `devvit/market-research-ro`, because `@devvit/reddit` and `@devvit/web/server` rely on Devvit's runtime-provided context and authentication and cannot legitimately be imported into an ordinary standalone Next.js server. The project-side `RedditSocialProvider` calls the Devvit app through one managed-token external endpoint. Reddit documents External Endpoints as limited access, so live access remains fail-closed until the endpoint and this financial-research/external-data use are approved. `REDDIT_PROVIDER_MODE=disabled` is the default; production Devvit mode requires the server-only bridge URL/token and `DEVVIT_REDDIT_ACCESS_APPROVED=true`. Traditional client ID/secret variables are not required for Devvit. The prior OAuth transport remains only as an explicitly selected `legacy_oauth` compatibility path for an already-authorized Data API installation. Stocktwits and other forum adapters remain visible non-collecting placeholders.

Research is selective and durable. `queue_social_research` records a bounded ticker/community/date request; `claim_social_research_queue` uses `FOR UPDATE SKIP LOCKED` and claims at most five; `/api/admin/social-research/process` performs a short worker batch. Ticker and mover pages queue a specific request before invoking one worker item. AI Search may queue at most five explicitly named tickers and answers immediately from already persisted evidence. There is no automatic 4,247-ticker backfill, page-view collection, or control that silently schedules the entire universe.

The initial supported community registry is `r/wallstreetbets`, `r/stocks`, `r/investing`, `r/personalfinance`, and `r/CryptoCurrency`. The bounded default query set is only `r/wallstreetbets`, `r/stocks`, and `r/investing`; operators may select another valid subreddit without a schema migration. The planner uses the symbol, cashtag, and stored company name. A conservative resolver accepts explicit cashtags and exchange-prefixed symbols, uses the known ticker universe, requires financial context for ambiguous ordinary words, supports stored company-name matches, and preserves the exact mention, excerpt, method, confidence, and resolver version. It never creates a ticker from social text.

Provider responses use a persisted request cache and hard daily application budget. Cache hits do not reserve an external call. The worker records runs, failures, retries, current source health, raw bridge/provider provenance, normalized records, deletion states, query text, community, requested dates, result counts, pagination state, provider limitations, and research time. Missing, rate-limited, partial, provider-limited, unavailable, and not-researched states remain distinct. Devvit search is always recorded as `provider_limited`: an empty result or exhausted listing cursor never becomes an archive-wide absence claim.

The configurable retention value is a compliance-review cadence, not an assertion of indefinite storage rights. `social_compliance_due` identifies active records whose provider-state review is due. Source content is stored only to support bounded historical evidence, while ticker links, topic tags, versioned sentiment/attention, and temporal relationships remain separate derived records. When Reddit reports deleted/removed content, displayed text, URLs, cached raw content, and deleted-author identity are cleared and the post remains as a tombstone. `revoke_social_provider` disables new work, cancels outstanding queue items, records the reason, and can remove provider content/identity if the applicable authorization requires it. Existing pages continue from tombstones and derived coverage instead of failing when credentials are unavailable.

`rebuild_phase2c_social_derivatives` creates temporal social/mover and social/catalyst relationships plus bounded attention windows without mutating source rows. It calls the existing Checkpoint 6 sentiment/attention derivation and existing account-intelligence rebuild. “First” and “early” always mean first known in recorded coverage. Social/catalyst sequence does not establish prediction, causation, promotion, knowledge of an event, or investment merit.

Operational and research routes are `/settings/social-research`, `/analytics/social`, `/analytics/social/pre-move`, and `/analytics/social-catalysts`. Existing ticker, mover, social post, account, promoter, AI Search, workspace, and alert foundations consume the same persisted data. The migrations are `202608170003_phase_2c_social_intelligence.sql` and `202608180001_phase_2c_devvit_access_adaptation.sql`.

### Current Reddit/Devvit API audit (2026-08-18)

Reddit announced post search in Devvit 0.14.1 on 2026-08-17. The published 0.14.1 `@devvit/reddit` declarations now include both `reddit.searchPosts()` and `subreddit.searchPosts()`. `SearchPostsOptions` supports a required `query`; optional `subredditName`; sort values `relevance`, `hot`, `top`, `new`, and `comments`; coarse timeframes `hour`, `day`, `week`, `month`, `year`, and `all`; plus listing `after`, `before`, `limit`, and `pageSize`. The implementation uses Reddit-wide `all` when no subreddit is supplied and restricts the listing when a subreddit is supplied. This project intentionally requires one configured community and uses `subreddit.searchPosts()`; Reddit-wide collection is not enabled.

The SDK does not provide exact start/end timestamp filters, a documented hard search-result ceiling, a historical-depth guarantee, or a completeness guarantee. The bridge therefore requests the `all` coarse timeframe, returns at most 100 records, derives the next bounded listing position from the last returned Thing ID when another page may exist, and lets Project #3 enforce its exact stored date window. At most `SOCIAL_RESEARCH_MAX_QUERY_PAGES` pages are consumed. Every search remains `provider_limited`, even when the bounded listing cursor is exhausted.

Devvit does not expose general comment-text search. It does support `reddit.getComments({postId, commentId?, depth?, pageSize?, limit?, sort?})` for comments associated with a known `t3_` submission. The bridge retrieves only those associated comments, caps the returned flattened set at 100, and labels potentially truncated trees as provider-limited. It never scrapes Reddit HTML.

The Devvit app enables only `permissions.reddit: true`; it declares no `asUser` operations and implements no post, comment, vote, moderation, message, media, HTTP-fetch, payment, scheduler, or persistence functionality. The one `/external/research` endpoint accepts only the five configured communities and only read operations. External callers authenticate with a long-lived managed token in the `Authorization` header. Devvit documents external endpoints as a limited-access feature, with a 10 MB request-body limit and 5 requests/second at time of writing. Devvit Web also documents a 30-second request limit, 4 MB payload limit, and 10 MB response limit; this bridge additionally enforces 64 KB request and 100-record response bounds.

Official sources consulted for the access audit:

- [Reddit API overview](https://developers.reddit.com/docs/capabilities/server/reddit-api)
- [Devvit 0.14.1 post-search release announcement](https://www.reddit.com/r/Devvit/comments/1vr6fuj/release_0141_additional_source_roots_and_post/)
- [Current `devvit.json` schema](https://developers.reddit.com/schema/config-file.v1.json)
- [External Endpoints and managed tokens](https://developers.reddit.com/docs/capabilities/server/external-endpoints)
- [Devvit limits FAQ](https://developers.reddit.com/docs/guides/faq)
- [Devvit Rules](https://developers.reddit.com/docs/devvit_rules)
- [Launch and review guide](https://developers.reddit.com/docs/guides/launch/launch-guide)
- Official npm release declarations: `@devvit/web@0.14.1` and `@devvit/reddit@0.14.1`

### Approval, retention, and activation

Do not activate production collection merely because the code and managed token exist. Reddit's current rules require app review, data minimization, no surveillance or de-anonymization, removal of deleted post/comment content from external systems, removal of deleted-account identifiers/author information, and recommend deleting stored user data within 30 days. The rules also call out financial/cryptocurrency functionality and external data uses for careful review. Obtain Reddit's written approval for this exact bounded historical-research purpose, external Supabase storage, retention period, deletion/revalidation process, and the limited-access managed endpoint. The bridge stores no data; Project #3 preserves current tombstoning/revocation controls and a 48-hour compliance-review cadence, but that implementation is not represented as Reddit approval.

After approval, deploy without a production request:

1. Apply all Supabase migrations through `202608180001_phase_2c_devvit_access_adaptation.sql` to the dedicated project.
2. Install Node.js 24, then run `npm install`, `npm run typecheck`, and `npm run build` inside `devvit/market-research-ro`.
3. Run `npx devvit login`, associate/create the Developer Platform app, request External Endpoints limited access, playtest in a controlled developer community, and run `npm run publish` for Reddit review.
4. Install the approved version in the authorized location and create a global managed token in Developer Settings.
5. In the standalone service secret manager set `REDDIT_PROVIDER_MODE=devvit_bridge`, `DEVVIT_REDDIT_BRIDGE_URL`, `DEVVIT_REDDIT_MANAGED_TOKEN`, and—only after approval—`DEVVIT_REDDIT_ACCESS_APPROVED=true`. Never expose the token to the browser or place it in a URL. The older `DEVVIT_REDDIT_BRIDGE_TOKEN` name remains a server-only compatibility alias.
6. Deploy the Next.js app and verify `/settings/social-research` reports the provider configuration without triggering a request.

The first production smoke test remains a separate manual action: open the NVDA mover dated 2026-08-06, queue one manual request for `r/wallstreetbets` from 2026-07-07 through 2026-08-08, confirm the planner records `NVDA`, `$NVDA`, and `NVIDIA` queries, process only that queue item, then inspect `social_provider_runs`, `social_provider_cache`, `ticker_social_coverage`, raw/normalized provenance, deduplication, and the ticker/mover social panels. Confirm `coverage_status=provider_limited` and disclosed limitations whether the result is populated or empty. Do not start a universe backfill.

## Phase 2C.1 cross-source intelligence and social-ready research

Phase 2C.1 adds a derived research layer across the existing immutable Scanz observations, public catalyst evidence, approved quality overlays, and the already-normalized social schema. Authoritative source tables are not merged or rewritten. `get_cross_source_timeline` returns a bounded `IntelligenceTimelineItem` stream with source domain, source record ID, provenance, relationship, confidence, coverage, and quality state. Market, catalyst, stored social, sentiment, attention, and account activity occupy separate domains. The reusable timeline appears on ticker, mover, event, and research-workspace detail pages; it defaults to 50 rows, never accepts more than 100, and uses deterministic timestamp/source/ID ordering.

Market values default to `RAW`. Selecting `EFFECTIVE` reads only approved overlay values from `market_mover_appearances_effective`, displays the raw value beside any changed field, and does not alter the source observation. Cross-source rows retain `clean`, `flagged`, `repaired`, or `unresolved` quality state. Catalyst timing remains valid even when a numeric market field is suspicious, while quantitative displays disclose the quality warning. Catalyst coverage is rendered as a human-readable provider card; full technical provenance stays collapsed by default.

Social coverage is explicit and reusable: `not_configured`, `awaiting_provider_approval`, `not_researched`, `queued`, `partial`, `provider_limited`, `complete_for_provider_window`, and `failed`. Empty social panels therefore describe provider/research state rather than claiming “no activity.” `/social-intelligence`, `/settings/providers`, and `/settings/social-research` expose only real aggregate counts and safe configuration booleans—never a managed token, prefix, length, or secret metadata.

`SocialResearchProvider` and the provider registry formalize search, comments, historical-window support, normalization, limitations, and safe health checks. Reddit is the sole implemented provider. Stocktwits, Yahoo Finance Community, InvestorsHub, Seeking Alpha Community, Motley Fool Community, and Other Forum are metadata-only `not_implemented` entries. `POST /api/social/research/preview` resolves a ticker, mover date window, community, query variants, request estimate, expected coverage, and limitations without making any external provider call. A disabled or unapproved provider disables queue execution and records an inspectable `approval_blocked` plan. The worker also exits before claiming database work or calling a bridge whenever configuration or approval is missing.

Research workspaces now act as case files for tickers, mover appearances, catalysts, future social posts/accounts, prompts, comparisons, notes, and saved timeline state. Notes and user tags live in separate metadata tables and never modify evidence rows. Ticker, mover, and event pages provide Add to Research controls. Workspace detail derives a combined timeline only from its bounded pinned ticker set. Existing saved-search infrastructure remains the saved-view mechanism.

AI Search recognizes cross-source timeline, catalysts-before/after-move, no-identified-catalyst, quality-flagged-mover, catalyst-comparison, ticker-summary, and social-ready intents. Fixed PostgreSQL RPC branches return at most 100 evidence rows with internal citations, quality fields, data mode, methodologies, and coverage limitations. An unavailable Reddit layer is reported as not researched/approval pending, not as an exhaustive empty result. Existing CSV, JSON, and PDF exports serialize these returned cross-source, quality, catalyst-coverage, and social-coverage fields. `TickerResearchBrief` provides deterministic Ticker Overview, Historical Mover Summary, Catalyst Timeline, Social Coverage, Data Quality, and Research Limitations sections without an external AI dependency.

`/analytics/cross-source` reads `cross_source_analytics_summary`. Catalyst and social metrics keep separate researched denominators. Unresearched social windows are never counted as “no social evidence,” and social percentages are withheld until qualifying complete provider windows exist. Summary views serve ticker, mover, and event pages without giant JSON aggregates. Composite indexes cover ticker/date timelines, appearance relationships, quality findings, social coverage/queue status, and workspace evidence pins.

### Phase 2C.1 deployment and approval activation

1. Keep `REDDIT_PROVIDER_MODE=disabled` and `DEVVIT_REDDIT_ACCESS_APPROVED=false`.
2. Apply all migrations through `202608180002_phase_2c1_cross_source_intelligence.sql` to this project’s dedicated Supabase database, then deploy the Next.js application.
3. Verify `/tickers/NVDA`, one real `/market-movers/[id]`, `/analytics/cross-source`, `/social-intelligence`, and `/settings/social-research`. Expect real market/catalyst evidence, approval-pending social coverage, unchanged social table counts, and zero bridge requests.
4. When Reddit approves the exact use, install the approved Devvit app, create its managed token, configure `DEVVIT_REDDIT_BRIDGE_URL` and server-only `DEVVIT_REDDIT_MANAGED_TOKEN`, set `REDDIT_PROVIDER_MODE=devvit_bridge`, and only then set `DEVVIT_REDDIT_ACCESS_APPROVED=true`.
5. Deploy and run one bounded preview first. Confirm its query/window estimate, queue one approved request, and inspect request, coverage, cache, provenance, deletion, and budget records before any broader manual work. Do not bulk-enrich or backfill the universe.

The current limitation is intentional: no live Reddit collection or production social evidence is added while approval is pending. Provider historical search remains non-exhaustive even after activation, so Reddit results are expected to remain `provider_limited`. Phase 2D and all later-provider ingestion remain out of scope.
