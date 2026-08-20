import { Badge } from "@/components/ui";

const list = (value: unknown) => {
  if (Array.isArray(value))
    return value
      .flatMap((item) =>
        typeof item === "string"
          ? [item]
          : item && typeof item === "object"
            ? [
                String(
                  (item as Record<string, unknown>).source ??
                    (item as Record<string, unknown>).name ??
                    JSON.stringify(item),
                ),
              ]
            : [],
      )
      .filter(Boolean);
  if (value && typeof value === "object")
    return Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${key}: ${String(item)}`,
    );
  return typeof value === "string" && value ? [value] : [];
};

export function ProviderCoverageCard({ coverage }: { coverage: any }) {
  const sources = list(coverage?.sources_checked);
  const limitations = list(coverage?.limitations);
  const status = String(coverage?.coverage_status ?? "not_researched");
  const tone = status.includes("complete")
    ? "positive"
    : status === "failed"
      ? "negative"
      : "warning";
  return (
    <article className="panel p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide muted">Provider</div>
          <strong>{sources.join(", ") || "No provider researched"}</strong>
        </div>
        <Badge tone={tone}>{status.replaceAll("_", " ")}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs muted">Health</dt>
          <dd>{coverage?.health ?? (status === "failed" ? "failed" : "recorded")}</dd>
        </div>
        <div>
          <dt className="text-xs muted">Date window researched</dt>
          <dd>
            {coverage?.date_from && coverage?.date_to
              ? `${coverage.date_from} – ${coverage.date_to}`
              : "Not researched"}
          </dd>
        </div>
        <div>
          <dt className="text-xs muted">Requests made</dt>
          <dd>{coverage?.requests_made ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-xs muted">Events found</dt>
          <dd>{coverage?.events_found ?? 0}</dd>
        </div>
        <div>
          <dt className="text-xs muted">Coverage state</dt>
          <dd>{status.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-xs muted">Last checked</dt>
          <dd>{coverage?.last_researched_at ?? "Never"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs muted">Limitations</dt>
          <dd>
            {limitations.length
              ? limitations.join(" ")
              : "No source/window coverage is recorded; absence cannot be inferred."}
          </dd>
        </div>
      </dl>
      {(coverage?.sources_checked || coverage?.limitations) && (
        <details className="mt-4 border-t border-[#334158] pt-3 text-xs muted">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(
              {
                sources_checked: coverage.sources_checked,
                limitations: coverage.limitations,
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </article>
  );
}
