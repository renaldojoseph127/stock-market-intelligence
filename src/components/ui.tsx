import Link from "next/link";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm muted">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="panel p-5">
      <div className="text-xs font-medium uppercase tracking-wider muted">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-1 text-xs muted">{detail}</div>}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "positive" | "negative" | "neutral" | "warning";
}) {
  const c = {
    positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    negative: "border-red-500/30 bg-red-500/10 text-red-300",
    neutral: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  }[tone];
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${c}`}
    >
      {children}
    </span>
  );
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="panel px-6 py-14 text-center">
      <h3 className="font-medium">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm muted">{description}</p>
    </div>
  );
}
export function TickerLink({ symbol }: { symbol: string }) {
  return (
    <Link
      href={`/tickers/${encodeURIComponent(symbol)}`}
      className="font-semibold text-blue-400 hover:text-blue-300"
    >
      {symbol}
    </Link>
  );
}
export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-[#243044] bg-white/[.02] text-xs uppercase tracking-wide muted">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#243044]">{children}</tbody>
      </table>
    </div>
  );
}
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
      {children}
    </div>
  );
}
export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  options,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  options?: string[];
}) {
  const optionLabel = (value: string) =>
    ({
      found: "Found",
      not_researched: "Not researched",
      no_identified: "No identified catalyst",
      partial: "Research partial",
    })[value] ?? value.replaceAll("_", " ");
  return (
    <label className="grid gap-1 text-xs muted">
      <span>{label}</span>
      {options ? (
        <select
          name={name}
          defaultValue={defaultValue}
          className="rounded-md border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        >
          <option value="">All</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {optionLabel(o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="rounded-md border border-[#334158] bg-[#0c111b] px-3 py-2 text-sm text-white"
        />
      )}
    </label>
  );
}
export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  return (
    <>
      <Field label="From" name="from" type="date" defaultValue={from} />
      <Field label="To" name="to" type="date" defaultValue={to} />
    </>
  );
}
export const TableCell = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <td className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</td>
);
