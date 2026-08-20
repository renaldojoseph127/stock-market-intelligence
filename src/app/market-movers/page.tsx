import Link from "next/link";
import { DatabaseNotice } from "@/components/database-notice";
import {
  Badge,
  DataTable,
  DateRangeFilter,
  EmptyState,
  Field,
  FilterBar,
  PageHeader,
  TableCell,
  TickerLink,
} from "@/components/ui";
import { getCategories, getMovers } from "@/lib/queries";
import { SaveResearchView } from "@/components/research-experience-actions";
import { getWorkspacePicker } from "@/lib/research/queries";
const fmt = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
export default async function MarketMovers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const [r, c, workspaces] = await Promise.all([getMovers(p), getCategories(), getWorkspacePicker()]);
  const href = (page: number) =>
      `?${new URLSearchParams({ ...p, page: String(page) } as Record<string, string>).toString()}`,
    catalystLabel = (value: string) =>
      ({
        catalyst_found: "Catalyst Found",
        not_researched: "No Catalyst Research Yet",
        no_identified_catalyst: "No Identified Catalyst",
        research_partial: "Research Partial",
      })[value] ?? "Not researched";
  const savedParams = new URLSearchParams();
  Object.entries(p).forEach(([key, value]) => { if (value) savedParams.set(key, value); });
  const savedRoute = `/market-movers${savedParams.size ? `?${savedParams.toString()}` : ""}`;
  return (
    <>
      <PageHeader
        title="Market Movers"
        description={`Search historical appearances. Displaying explicitly selected ${r.dataMode} values; raw remains the default.`}
        action={<SaveResearchView sourcePage="market_movers" route={savedRoute} filters={p} dataMode={r.dataMode === "effective" ? "effective" : "raw"} workspaces={workspaces.data} />}
      />
      <DatabaseNotice configured={r.configured} error={r.error || c.error || workspaces.error} />
      <form>
        <FilterBar>
          <DateRangeFilter from={p.from} to={p.to} />
          <Field
            label="Ticker"
            name="ticker"
            defaultValue={p.ticker}
            placeholder="Symbol"
          />
          <Field
            label="Exchange"
            name="exchange"
            defaultValue={p.exchange}
            options={[
              "NASDAQ",
              "NYSE",
              "NYSE American",
              "OTC",
              "Cboe",
              "Other",
            ]}
          />
          <Field label="Sector" name="sector" defaultValue={p.sector} />
          <Field label="Industry" name="industry" defaultValue={p.industry} />
          <Field
            label="Security type"
            name="securityType"
            defaultValue={p.securityType}
            options={[
              "common_stock",
              "preferred_stock",
              "ETF",
              "ETN",
              "warrant",
              "unit",
              "ADR",
              "closed_end_fund",
              "other",
            ]}
          />
          <Field label="Country" name="country" defaultValue={p.country} />
          <Field
            label="Max market cap"
            name="marketCapMax"
            type="number"
            defaultValue={p.marketCapMax}
          />
          <Field
            label="Category"
            name="category"
            defaultValue={p.category}
            options={c.data.map((x: any) => x.id)}
          />
          <Field
            label="Mover Type"
            name="type"
            defaultValue={p.type}
            options={["biggest_gainer", "biggest_decliner", "most_active"]}
          />
          <Field
            label="Quality"
            name="quality"
            defaultValue={p.quality}
            options={["clean", "flagged", "repaired", "unresolved"]}
          />
          <Field
            label="Catalyst"
            name="catalyst"
            defaultValue={p.catalyst}
            options={["found", "not_researched", "no_identified", "partial"]}
          />
          <Field
            label="Data mode"
            name="dataMode"
            defaultValue={r.dataMode}
            options={["raw", "effective"]}
          />
          <Field label="Social coverage" name="social" defaultValue={p.social} options={["not_researched", "provider_limited", "complete_for_provider_window", "failed"]} />
          <Field label="Repeat mover" name="repeat" defaultValue={p.repeat} options={["yes", "no"]} />
          <Field label="Saved research" name="saved" defaultValue={p.saved} options={["yes", "no"]} />
          <Field
            label="Sort"
            name="sort"
            defaultValue={p.sort}
            options={[
              "report_date",
              "change_percent",
              "volume",
              "dollar_volume",
            ]}
          />
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium">
            Apply filters
          </button>
        </FilterBar>
      </form>
      {r.data.length ? (
        <>
          <DataTable
            headers={[
              "Report Date",
              "Ticker",
              "Exchange",
              "Category",
              "Quality",
              "Catalyst",
              "Rank",
              "Price",
              "Change %",
              "Volume",
              "Trades",
              "Dollar Volume",
            ]}
          >
            {r.data.map((x: any) => (
              <tr key={x.id}>
                <TableCell>
                  <Link
                    className="text-blue-400"
                    href={`/market-movers/${x.id}`}
                  >
                    {x.report_date}
                  </Link>
                </TableCell>
                <TableCell>
                  <TickerLink symbol={x.tickers.symbol} />
                </TableCell>
                <TableCell>{x.tickers.exchange ?? "—"}</TableCell>
                <TableCell>{x.market_categories.name}</TableCell>
                <TableCell>
                  <Badge
                    tone={
                      x.quality_status === "review_recommended"
                        ? "warning"
                        : x.quality_status === "repaired"
                          ? "positive"
                          : "neutral"
                    }
                  >
                    {x.quality_status ?? "clean"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    tone={
                      x.catalyst_status === "catalyst_found"
                        ? "positive"
                        : x.catalyst_status === "research_partial"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {catalystLabel(x.catalyst_status)}
                  </Badge>
                </TableCell>
                <TableCell>{x.rank ?? "—"}</TableCell>
                <TableCell>{fmt(x.price)}</TableCell>
                <TableCell>
                  <Badge
                    tone={
                      (x.change_percent ?? 0) > 0
                        ? "positive"
                        : (x.change_percent ?? 0) < 0
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {fmt(x.change_percent)}%
                  </Badge>
                </TableCell>
                <TableCell>{fmt(x.volume)}</TableCell>
                <TableCell>{fmt(x.trades)}</TableCell>
                <TableCell>{fmt(x.dollar_volume)}</TableCell>
              </tr>
            ))}
          </DataTable>
          <div className="mt-4 flex justify-between text-sm">
            <span>
              {r.page > 1 ? (
                <Link className="text-blue-400" href={href(r.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
            </span>
            <span className="muted">
              Page {r.page} · {r.dataMode} mode
            </span>
            {r.data.length === r.pageSize ? (
              <Link className="text-blue-400" href={href(r.page + 1)}>
                Next
              </Link>
            ) : (
              <span />
            )}
          </div>
        </>
      ) : (
        <EmptyState
          title="No market-mover records"
          description="No records match these filters. No fabricated market data is included."
        />
      )}
    </>
  );
}
