"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Brain,
  CandlestickChart,
  Database,
  Eye,
  FileSearch,
  Gauge,
  MessageSquare,
  Settings,
  ShieldCheck,
  Star,
  Tags,
  TrendingUp,
  Users,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", href: "/", icon: Gauge },
  {
    label: "Market Movers",
    href: "/market-movers",
    icon: TrendingUp,
    children: [
      ["All Movers", "/market-movers"],
      ["NASDAQ", "/market-movers?exchange=NASDAQ"],
      ["NYSE", "/market-movers?exchange=NYSE"],
      ["OTC", "/market-movers?exchange=OTC"],
      ["Penny Stocks", "/market-movers?type=penny"],
    ],
  },
  { label: "Tickers", href: "/tickers", icon: Tags },
  { label: "Catalysts / Events", href: "/analytics/catalysts", icon: FileSearch },
  { label: "Prices", href: "/prices", icon: CandlestickChart },
  { label: "Patterns", href: "/patterns", icon: FileSearch },
  {
    label: "Social Intelligence",
    href: "/social",
    icon: MessageSquare,
    children: [
      ["Search", "/social/search"],
      ["Unresolved", "/social/unresolved"],
      ["Reddit", "/social/reddit"],
      ["WallStreetBets", "/social/wallstreetbets"],
      ["Stocktwits", "/social/stocktwits"],
      ["Other Forums", "/social/forums"],
    ],
  },
  { label: "Promoters", href: "/promoters", icon: Users },
  { label: "Sentiment", href: "/sentiment", icon: BarChart3 },
  {
    label: "Research",
    href: "/research",
    icon: FileSearch,
    children: [
      ["Research Today", "/research"],
      ["Compare Setups", "/compare"],
      ["Research Workspaces", "/research-workspaces"],
      ["Saved Research Views", "/saved-research-views"],
      ["Patterns & Similarity", "/research/patterns"],
      ["Social Outcomes", "/research/social-outcomes"],
      ["Attention", "/research/attention"],
      ["Promotion Activity", "/research/promotion-activity"],
      ["Pre-Move Accounts", "/research/pre-move-accounts"],
      [
        "Account/Ticker Relationships",
        "/research/account-ticker-relationships",
      ],
    ],
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    children: [
      ["Repeat Movers", "/analytics/repeat-movers"],
      ["Gainers", "/analytics/gainers"],
      ["Decliners", "/analytics/decliners"],
      ["Most Active", "/analytics/most-active"],
      ["Categories", "/analytics/categories"],
      ["Extreme Moves", "/analytics/extreme-moves"],
      ["Catalysts", "/analytics/catalysts"],
      ["Social", "/analytics/social"],
      ["Pre-Move Social", "/analytics/social/pre-move"],
      ["Social & Catalysts", "/analytics/social-catalysts"],
      ["Cross-Source", "/analytics/cross-source"],
    ],
  },
  {
    label: "Watchlists",
    href: "/watchlists",
    icon: Eye,
    children: [["Monitoring Dashboard", "/watchlists/dashboard"]],
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: Gauge,
    children: [
      ["New Alert", "/alerts/new"],
      ["Notifications", "/notifications"],
    ],
  },
  {
    label: "AI Search",
    href: "/ai-search",
    icon: Brain,
    children: [
      ["Workspaces", "/research-workspaces"],
      ["Research History", "/research-history"],
    ],
  },
  { label: "Data Quality", href: "/data-quality", icon: ShieldCheck },
  { label: "Data Imports", href: "/imports", icon: Database },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    children: [
      ["System Status", "/settings/status"],
      ["Metadata Providers", "/settings/providers"],
      ["Ticker Enrichment", "/settings/ticker-enrichment"],
      ["Catalyst Research", "/settings/catalyst-research"],
      ["Social Sources", "/settings/social-sources"],
      ["Social Research", "/settings/social-research"],
      ["Scoring Methodology", "/settings/scoring-methodology"],
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[255px_1fr]">
      <aside className="border-b border-[#243044] bg-[#0c111b] lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center gap-3 border-b border-[#243044] px-5">
          <div className="rounded-lg bg-blue-500/15 p-2 text-blue-400">
            <Star size={18} />
          </div>
          <div>
            <div className="font-semibold">Market Intelligence</div>
            <div className="text-xs muted">Research Database</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <div key={item.label} className="shrink-0">
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? "bg-blue-500/15 text-blue-300" : "muted hover:bg-white/5 hover:text-white"}`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
                {item.children && (
                  <div className="ml-9 hidden space-y-0.5 py-1 lg:block">
                    {item.children.map(([label, href]) => (
                      <Link
                        key={label}
                        href={href}
                        className="block rounded px-2 py-1 text-xs muted hover:text-white"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 xl:p-8">{children}</main>
    </div>
  );
}
