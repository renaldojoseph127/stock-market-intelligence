import { socialCoverageCopy } from "./coverage";
import { socialProviderRegistry } from "./provider-registry";
import { SocialResearchPlanner } from "./research-planner";

export interface SocialResearchPreviewInput {
  ticker: string;
  tickerId: string;
  companyName?: string | null;
  appearanceId?: string | null;
  community?: string | null;
  dateFrom: string;
  dateTo: string;
}

const iso = (value: string) => new Date(value).toISOString();

export function buildSocialResearchPreview(
  input: SocialResearchPreviewInput,
) {
  const reddit = socialProviderRegistry().find((entry) => entry.key === "reddit")!;
  const queries = new SocialResearchPlanner().plan({
    symbol: input.ticker,
    companyName: input.companyName,
    community: input.community ?? "wallstreetbets",
    dateFrom: iso(input.dateFrom),
    dateTo: iso(input.dateTo),
  });
  const canQueue = reddit.state === "available";
  const expectedCoverageClassification = canQueue
    ? "provider_limited"
    : reddit.state === "approval_required" || reddit.state === "disabled"
      ? "awaiting_provider_approval"
      : "not_configured";
  const coverage = socialCoverageCopy(
    expectedCoverageClassification === "provider_limited"
      ? "provider_limited"
      : expectedCoverageClassification === "awaiting_provider_approval"
        ? "awaiting_provider_approval"
        : "not_configured",
  );
  return {
    ticker: input.ticker.toUpperCase(),
    tickerId: input.tickerId,
    companyName: input.companyName ?? null,
    appearanceId: input.appearanceId ?? null,
    queries: queries.map(({ community, query, dateFrom, dateTo }) => ({
      community,
      query,
      dateFrom,
      dateTo,
    })),
    window: { from: iso(input.dateFrom), to: iso(input.dateTo) },
    source: "reddit",
    provider: "Reddit via read-only Devvit bridge",
    providerState: reddit.state,
    estimatedInitialRequests: queries.length,
    estimatedPagination: `up to ${queries.length} × configured page limit`,
    expectedCoverageClassification,
    limitations: [...reddit.limitations, coverage.explanation],
    canQueue,
    queueDisabledReason: canQueue ? null : coverage.explanation,
    externalProviderCalls: 0,
  };
}

const validDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);

export async function resolveSocialResearchPreview(db: any, body: any) {
  const requested = String(body.ticker ?? body.tickerId ?? "")
    .trim()
    .toUpperCase();
  if (!requested) throw new Error("A ticker symbol or ticker ID is required.");
  const ticker = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requested)
    ? await db
        .from("tickers")
        .select("id,symbol,company_name")
        .eq("id", requested)
        .maybeSingle()
    : await db
        .from("tickers")
        .select("id,symbol,company_name")
        .eq("symbol", requested)
        .maybeSingle();
  if (ticker.error) throw ticker.error;
  if (!ticker.data) throw new Error("Ticker not found.");

  const appearanceId = body.appearanceId
    ? String(body.appearanceId)
    : null;
  let referenceDate: string | null = null;
  if (appearanceId) {
    const appearance = await db
      .from("market_mover_appearances")
      .select("id,ticker_id,report_date")
      .eq("id", appearanceId)
      .eq("ticker_id", ticker.data.id)
      .maybeSingle();
    if (appearance.error) throw appearance.error;
    if (!appearance.data)
      throw new Error("Mover appearance does not belong to this ticker.");
    referenceDate = appearance.data.report_date;
  } else {
    const latest = await db
      .from("market_mover_appearances")
      .select("report_date")
      .eq("ticker_id", ticker.data.id)
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw latest.error;
    referenceDate = latest.data?.report_date ?? null;
  }
  const window =
    body.window && typeof body.window === "object" ? body.window : {};
  let dateFrom = validDate(body.dateFrom)
    ? body.dateFrom
    : validDate(window.from)
      ? window.from
      : null;
  let dateTo = validDate(body.dateTo)
    ? body.dateTo
    : validDate(window.to)
      ? window.to
      : null;
  if (!dateFrom || !dateTo) {
    if (!referenceDate)
      throw new Error(
        "A date window is required when the ticker has no mover appearance.",
      );
    const reference = new Date(`${referenceDate}T00:00:00Z`);
    const requestedDays = Number(
      typeof body.window === "number" || typeof body.window === "string"
        ? body.window
        : 30,
    );
    const days = Number.isFinite(requestedDays)
      ? Math.max(0, Math.min(Math.floor(requestedDays), 90))
      : 30;
    const start = new Date(reference);
    start.setUTCDate(start.getUTCDate() - days);
    const end = new Date(reference);
    end.setUTCDate(end.getUTCDate() + 2);
    dateFrom = start.toISOString();
    dateTo = end.toISOString();
  }
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    to < from ||
    to.getTime() - from.getTime() > 93 * 86_400_000
  )
    throw new Error("Social research window must be between 0 and 93 days.");
  return buildSocialResearchPreview({
    ticker: ticker.data.symbol,
    tickerId: ticker.data.id,
    companyName: ticker.data.company_name,
    appearanceId,
    community: body.community ? String(body.community) : "wallstreetbets",
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  });
}
