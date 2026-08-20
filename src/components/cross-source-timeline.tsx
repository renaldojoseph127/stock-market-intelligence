import Link from "next/link";
import { SocialCoverageState } from "@/components/social-coverage-state";
import { Badge, EmptyState } from "@/components/ui";
import type {
  CrossSourceTimelineResult,
  IntelligenceSourceDomain,
  IntelligenceTimelineItem,
} from "@/lib/cross-source/types";

const tabs: Array<[string, IntelligenceSourceDomain | "all"]> = [
  ["All", "all"],
  ["Market Movers", "market"],
  ["Catalysts", "catalyst"],
  ["Social", "social"],
  ["Sentiment", "sentiment"],
  ["Attention", "attention"],
];

const metadata = (item: IntelligenceTimelineItem) =>
  (item.metadata && typeof item.metadata === "object" &&
  !Array.isArray(item.metadata)
    ? item.metadata
    : {}) as Record<string, any>;

function MarketEvidence({ item }: { item: IntelligenceTimelineItem }) {
  const value = metadata(item);
  const raw = (value.raw ?? {}) as Record<string, unknown>;
  const effective = (value.effective ?? {}) as Record<string, unknown>;
  const repaired = Number(value.repaired_field_count ?? 0) > 0;
  const field = (label: string, key: string) => {
    const selected = value.data_mode === "effective" ? effective[key] : raw[key];
    const changed =
      value.data_mode === "effective" &&
      raw[key] != null &&
      effective[key] != null &&
      String(raw[key]) !== String(effective[key]);
    return (
      <span>
        {label}: {selected == null ? "—" : String(selected)}
        {changed && (
          <span className="ml-1 text-amber-300">
            (repaired from raw {String(raw[key])})
          </span>
        )}
      </span>
    );
  };
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs muted">
      {field("Price", "price")}
      {field("Change", "change_percent")}
      {field("Volume", "volume")}
      {repaired && <Badge tone="warning">Approved overlay available</Badge>}
    </div>
  );
}

const queryLink = (
  basePath: string,
  params: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
) => {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch }))
    if (value) next.set(key, value);
  const query = next.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
};

export function DataModeToggle({
  basePath,
  params,
  dataMode,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  dataMode: "raw" | "effective";
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="muted">Market data mode:</span>
      {(["raw", "effective"] as const).map((mode) => (
        <Link
          key={mode}
          href={queryLink(basePath, params, { dataMode: mode, timelinePage: "1" })}
          className={`rounded border px-2 py-1 uppercase ${dataMode === mode ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-[#334158] muted"}`}
        >
          {mode}
        </Link>
      ))}
    </div>
  );
}

export function CrossSourceTimeline({
  result,
  basePath,
  params,
  activeSource = "all",
}: {
  result: CrossSourceTimelineResult;
  basePath: string;
  params: Record<string, string | undefined>;
  activeSource?: IntelligenceSourceDomain | "all";
}) {
  const isSocial = ["social", "sentiment", "attention"].includes(activeSource);
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Cross-Source Timeline</h2>
          <p className="mt-1 text-xs muted">
            Separately sourced observations in chronological order. Sequence does
            not establish causation, prediction, or knowledge of a later move.
          </p>
        </div>
        <DataModeToggle
          basePath={basePath}
          params={params}
          dataMode={result.dataMode}
        />
      </div>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Timeline sources">
        {tabs.map(([label, source]) => (
          <Link
            key={source}
            href={queryLink(basePath, params, {
              timelineSource: source === "all" ? undefined : source,
              timelinePage: "1",
            })}
            className={`rounded border px-3 py-1.5 text-xs ${activeSource === source ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-[#334158] muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!result.items.length ? (
        isSocial ? (
          <SocialCoverageState />
        ) : (
          <EmptyState
            title={
              activeSource === "catalyst"
                ? "No catalyst evidence in this period"
                : "No cross-source observations"
            }
            description={
              activeSource === "catalyst"
                ? "No qualifying public catalyst event is stored for the selected scope. Check the recorded catalyst coverage before interpreting this absence."
                : "No separately sourced observations match this bounded timeline scope."
            }
          />
        )
      ) : (
        <ol className="space-y-3">
          {result.items.map((item) => {
            const value = metadata(item);
            const route = typeof value.route === "string" ? value.route : null;
            return (
              <li className="panel p-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.source_domain === "market" ? "warning" : "neutral"}>
                        {item.source_domain}
                      </Badge>
                      {item.quality_status && (
                        <Badge
                          tone={
                            item.quality_status === "unresolved" ||
                            item.quality_status === "flagged"
                              ? "warning"
                              : item.quality_status === "repaired"
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {item.quality_status}
                        </Badge>
                      )}
                      {item.coverage_status && (
                        <SocialCoverageState
                          coverageStatus={item.coverage_status}
                          compact
                        />
                      )}
                    </div>
                    <h3 className="mt-2 font-medium">
                      {route ? (
                        <Link className="text-blue-400" href={route}>
                          {item.headline}
                        </Link>
                      ) : (
                        item.headline
                      )}
                    </h3>
                    {item.summary && (
                      <p className="mt-1 max-w-4xl text-sm muted">
                        {item.summary}
                      </p>
                    )}
                    {item.source_domain === "market" && (
                      <MarketEvidence item={item} />
                    )}
                    {item.quality_status === "unresolved" && (
                      <p className="mt-2 text-xs text-amber-300">
                        Historical observation has unresolved data-quality findings.
                      </p>
                    )}
                    {item.relationship && (
                      <p className="mt-2 text-xs muted">{item.relationship}</p>
                    )}
                  </div>
                  <div className="text-right text-xs muted">
                    <div>{item.occurred_at}</div>
                    <div>{item.source_name}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-4 flex justify-between text-sm">
        <span>
          {result.page > 1 && (
            <Link
              className="text-blue-400"
              href={queryLink(basePath, params, {
                timelinePage: String(result.page - 1),
              })}
            >
              Previous
            </Link>
          )}
        </span>
        <span className="muted">
          Page {result.page} · {result.total} timeline observation(s)
        </span>
        <span>
          {result.page * result.pageSize < result.total && (
            <Link
              className="text-blue-400"
              href={queryLink(basePath, params, {
                timelinePage: String(result.page + 1),
              })}
            >
              Next
            </Link>
          )}
        </span>
      </div>
    </section>
  );
}
