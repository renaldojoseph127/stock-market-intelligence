import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  MOVER_BRIEF_VERSION,
  TICKER_BRIEF_VERSION,
  type ResearchBrief,
  type ResearchBriefSection,
  type ResearchDataMode,
} from "./types";

const scalar = (value: unknown) =>
  value == null
    ? "Unavailable"
    : typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 4 })
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);

const unique = (values: Array<string | null | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))];

export async function assembleTickerResearchBrief(
  db: any,
  symbol: string,
  dataMode: ResearchDataMode = "raw",
): Promise<ResearchBrief | null> {
  const ticker = await db
    .from("ticker_research_profile")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();
  if (ticker.error) throw ticker.error;
  if (!ticker.data) return null;
  const t = ticker.data;
  const [appearances, events, socialCoverage, findings, notes] = await Promise.all([
    db
      .from("market_mover_intelligence")
      .select("id,report_id,report_date,category_name,category_type,raw_rank,raw_price,raw_change_percent,raw_volume,rank,price,change_percent,volume,quality_status,open_finding_count,repaired_field_count,catalyst_status")
      .eq("ticker_id", t.ticker_id)
      .order("raw_change_percent", { ascending: false })
      .limit(50),
    db
      .from("ticker_events")
      .select("id,event_date,event_type,event_subtype,headline,source_url,is_primary_source,event_status")
      .eq("ticker_id", t.ticker_id)
      .not("event_status", "in", "(duplicate,excluded,failed)")
      .order("event_date", { ascending: false })
      .limit(50),
    db
      .from("ticker_social_coverage")
      .select("coverage_status,date_from,date_to,posts_found,limitations")
      .eq("ticker_id", t.ticker_id)
      .order("last_researched_at", { ascending: false })
      .limit(20),
    db
      .from("market_data_quality_findings")
      .select("id,appearance_id,field_name,finding_type,severity,status,confidence_score")
      .eq("ticker_id", t.ticker_id)
      .order("detected_at", { ascending: false })
      .limit(100),
    db
      .from("research_notes")
      .select("note,updated_at")
      .eq("ticker_id", t.ticker_id)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  const rows = appearances.data ?? [];
  const target = [...rows]
    .filter((row: any) => row.raw_change_percent != null)
    .sort((a: any, b: any) => Math.abs(Number(b.raw_change_percent)) - Math.abs(Number(a.raw_change_percent)))[0];
  const similarities = target
    ? await db.rpc("find_similar_historical_movers", { p_appearance_id: target.id, p_limit: 10 })
    : { data: [], error: null };
  const catalystResearched = Number(t.catalyst_researched_count ?? 0);
  const socialResearched = Number(t.social_researched_count ?? 0);
  const qualityState = Number(t.unresolved_quality_findings ?? 0)
    ? "unresolved"
    : Number(t.repaired_appearances ?? 0)
      ? "repaired"
      : "clean";
  const socialState = socialResearched
    ? Number(t.social_complete_count ?? 0)
      ? "complete_for_provider_window"
      : "provider_limited"
    : "not_researched";
  const catalystState = catalystResearched
    ? Number(t.identified_catalyst_count ?? 0)
      ? "identified_within_researched_coverage"
      : "no_identified_catalyst_within_researched_coverage"
    : "not_researched";
  const executiveSummary = `${t.symbol} appeared ${scalar(t.total_appearances)} times across ${scalar(t.distinct_report_dates)} report dates in the imported Scanz history. Catalyst research covers ${scalar(t.catalyst_researched_count)} appearance(s), with ${scalar(t.identified_catalyst_count)} identified nearby catalyst(s). Social research covers ${scalar(t.social_researched_count)} recorded window(s); unresearched windows are not absence claims. Data mode: ${dataMode.toUpperCase()}.`;
  const appearanceRows = rows.slice(0, 20).map((row: any) => ({
    mover_id: row.id,
    date: row.report_date,
    category: row.category_name,
    price: dataMode === "effective" ? row.price : row.raw_price,
    change_percent: dataMode === "effective" ? row.change_percent : row.raw_change_percent,
    volume: dataMode === "effective" ? row.volume : row.raw_volume,
    quality: row.open_finding_count ? "flagged" : row.repaired_field_count ? "repaired" : "clean",
    catalyst_coverage: row.catalyst_status,
  }));
  const sections: ResearchBriefSection[] = [
    {
      heading: "Ticker Metadata",
      rows: [
        {
          symbol: t.symbol,
          company_name: t.company_name,
          exchange: t.exchange,
          sector: t.sector,
          industry: t.industry,
          security_type: t.security_type,
          market_cap: t.market_cap,
          metadata_provider: t.metadata_provider,
          metadata_status: t.metadata_status,
        },
      ],
    },
    {
      heading: "Historical Market-Mover Profile",
      rows: [
        {
          first_seen: t.first_seen,
          last_seen: t.last_seen,
          total_appearances: t.total_appearances,
          gainer_appearances: t.gainer_appearances,
          decliner_appearances: t.decliner_appearances,
          most_active_appearances: t.most_active_appearances,
          median_absolute_move: t.median_absolute_change,
          valid_change_denominator: t.valid_change_denominator,
        },
      ],
    },
    { heading: "Major Historical Appearances", rows: appearanceRows },
    {
      heading: "Repeat-Mover Analysis",
      rows: [
        {
          distinct_report_dates: t.distinct_report_dates,
          distinct_categories: t.distinct_categories,
          most_common_category: t.most_common_category,
          shortest_recurrence_gap_days: t.shortest_recurrence_gap,
          longest_recurrence_gap_days: t.longest_recurrence_gap,
          average_absolute_change: t.average_absolute_change,
          median_absolute_change: t.median_absolute_change,
          valid_numeric_denominator: t.valid_change_denominator,
        },
      ],
    },
    {
      heading: "Catalyst Research",
      paragraphs: [
        `${scalar(t.catalyst_researched_count)} appearance(s) researched; ${scalar(t.identified_catalyst_count)} with an identified nearby catalyst and ${scalar(t.no_identified_catalyst_count)} with no identified catalyst inside recorded coverage.`,
      ],
      rows: (events.data ?? []).slice(0, 20),
    },
    {
      heading: "Social Coverage",
      paragraphs: [
        socialResearched
          ? `${socialResearched} recorded research window(s). Coverage states and provider limitations are shown below.`
          : "Social history not researched. Provider approval is pending; no absence claim is made.",
      ],
      rows: socialCoverage.data ?? [],
    },
    {
      heading: "Data Quality",
      paragraphs: [
        `${scalar(t.unresolved_quality_findings)} unresolved finding(s); ${scalar(t.repaired_appearances)} appearance(s) have approved effective overlays. RAW remains authoritative and is the default.`,
      ],
      rows: findings.data ?? [],
    },
    { heading: "Similar Historical Setups", rows: similarities.data ?? [] },
    {
      heading: "Historical Outcomes",
      paragraphs: [
        "Outcomes shown for similar past appearances are descriptive observations after those past appearances. They were not inputs to similarity and are not forecasts.",
      ],
      rows: (similarities.data ?? []).map((row: any) => ({
        mover_id: row.reference_appearance_id,
        ticker: row.reference_symbol,
        date: row.reference_date,
        return_1_session: row.return_1d,
        return_3_sessions: row.return_3d,
        return_7_sessions: row.return_7d,
        return_30_sessions: row.return_30d,
      })),
    },
    { heading: "Saved Research Notes", rows: notes.data ?? [] },
  ];
  const generatedAt = new Date().toISOString();
  return {
    title: `${t.symbol} Ticker Research Brief`,
    briefType: "ticker",
    researchBriefVersion: TICKER_BRIEF_VERSION,
    generatedAt,
    dataMode,
    executiveSummary,
    sections,
    provenance: {
      tickerId: t.ticker_id,
      sourceReportIds: unique(rows.map((row: any) => row.report_id)),
      moverIds: unique(rows.map((row: any) => row.id)),
      eventIds: unique((events.data ?? []).map((row: any) => row.id)),
      qualityState,
      catalystCoverageState: catalystState,
      socialCoverageState: socialState,
      applicationReportVersion: TICKER_BRIEF_VERSION,
    },
    limitations: [
      "Historical Scanz observations are not investment recommendations or predictions.",
      "Catalyst proximity is temporal evidence and does not establish causation.",
      socialResearched
        ? "Social statements are limited to explicitly recorded provider windows."
        : "Social history has not been researched because provider approval remains pending.",
      "Invalid or unresolved numeric fields are excluded from aggregate profiles and similarity inputs.",
      dataMode === "effective"
        ? "Effective mode uses only approved repair overlays and retains RAW provenance."
        : "RAW mode shows imported observations without substituting approved overlays.",
    ],
  };
}

export async function assembleMoverResearchBrief(
  db: any,
  appearanceId: string,
  dataMode: ResearchDataMode = "raw",
): Promise<ResearchBrief | null> {
  const mover = await db
    .from("market_mover_intelligence")
    .select("*")
    .eq("id", appearanceId)
    .maybeSingle();
  if (mover.error) throw mover.error;
  if (!mover.data) return null;
  const m = mover.data;
  const [quality, relationships, social, outcome, similarities, notes, repairs] = await Promise.all([
    db.from("market_data_quality_findings").select("id,field_name,finding_type,severity,status,confidence_score").eq("appearance_id", appearanceId).limit(100),
    db.from("event_mover_relationships").select("event_id,relationship_type,event_at,mover_date,temporal_bucket,confidence,catalyst_relevance,reason,ticker_events(headline,event_type,event_subtype,source_url,is_primary_source)").eq("appearance_id", appearanceId).order("event_at").limit(50),
    db.from("ticker_social_coverage").select("coverage_status,date_from,date_to,posts_found,limitations").eq("ticker_id", m.ticker_id).lte("date_from", m.report_date).gte("date_to", m.report_date).order("last_researched_at", { ascending: false }).limit(20),
    db.from("market_mover_price_outcomes").select("*").eq("appearance_id", appearanceId).maybeSingle(),
    db.rpc("find_similar_historical_movers", { p_appearance_id: appearanceId, p_limit: 10 }),
    db.from("research_notes").select("note,updated_at").eq("appearance_id", appearanceId).order("updated_at", { ascending: false }).limit(50),
    db.from("market_data_effective_values").select("field_name,effective_value,approved_at,approved_by,market_data_correction_proposals(proposal_method,status,reason)").eq("appearance_id", appearanceId),
  ]);
  const socialState = social.data?.[0]?.coverage_status ?? "not_researched";
  const qualityState = m.open_finding_count
    ? m.quality_status === "review_recommended"
      ? "unresolved"
      : "flagged"
    : m.repaired_field_count
      ? "repaired"
      : "clean";
  const current = (field: string) =>
    dataMode === "effective" ? m[field] : m[`raw_${field}`];
  const executiveSummary = `${m.ticker_symbol} appeared in ${m.category_name} on ${m.report_date}. The recorded change was ${scalar(current("change_percent"))}% in ${dataMode.toUpperCase()} mode. Catalyst coverage is ${String(m.catalyst_status).replaceAll("_", " ")}. ${socialState === "not_researched" ? "Social history has not been researched; provider approval remains pending." : `Recorded social coverage is ${socialState.replaceAll("_", " ")}.`} This description does not establish causation or predict a future outcome.`;
  const sections: ResearchBriefSection[] = [
    {
      heading: "Mover Observation",
      rows: [
        {
          mover_id: m.id,
          ticker: m.ticker_symbol,
          report_id: m.report_id,
          date: m.report_date,
          category: m.category_name,
          rank: current("rank"),
          price: current("price"),
          change_percent: current("change_percent"),
          trades: current("trades"),
          volume: current("volume"),
          dollar_volume: current("dollar_volume"),
          data_mode: dataMode,
        },
      ],
    },
    {
      heading: "Data Quality",
      paragraphs: [
        `${scalar(m.open_finding_count)} unresolved finding(s); ${scalar(m.repaired_field_count)} approved repair overlay field(s).`,
      ],
      rows:
        dataMode === "effective"
          ? (repairs.data ?? []).map((row: any) => ({
              field: row.field_name,
              raw_value: m[`raw_${row.field_name}`],
              effective_value: row.effective_value,
              repair_method: row.market_data_correction_proposals?.proposal_method,
              repair_status: row.market_data_correction_proposals?.status,
              approved_at: row.approved_at,
            }))
          : quality.data ?? [],
    },
    { heading: "Catalyst Timeline", rows: relationships.data ?? [] },
    {
      heading: "Social Coverage",
      paragraphs: [
        socialState === "not_researched"
          ? "Social history not researched. Provider approval pending."
          : "Only the recorded provider windows below support social evidence statements.",
      ],
      rows: social.data ?? [],
    },
    { heading: "Similar Historical Movers", rows: similarities.data ?? [] },
    {
      heading: "Historical Outcome",
      paragraphs: ["Descriptive outcome after this past appearance; not an expected return or forecast."],
      rows: outcome.data ? [outcome.data] : [],
    },
    { heading: "Saved Research Notes", rows: notes.data ?? [] },
  ];
  return {
    title: `${m.ticker_symbol} ${m.report_date} Mover Research Brief`,
    briefType: "mover",
    researchBriefVersion: MOVER_BRIEF_VERSION,
    generatedAt: new Date().toISOString(),
    dataMode,
    executiveSummary,
    sections,
    provenance: {
      tickerId: m.ticker_id,
      sourceReportIds: [m.report_id],
      moverIds: [m.id],
      eventIds: unique((relationships.data ?? []).map((row: any) => row.event_id)),
      qualityState,
      catalystCoverageState: m.catalyst_status,
      socialCoverageState: socialState,
      applicationReportVersion: MOVER_BRIEF_VERSION,
    },
    limitations: [
      "The market observation is historical and is not a buy/sell recommendation.",
      "Nearby catalysts are temporally related evidence and do not establish causation.",
      "Similarity uses observation/context attributes only; displayed outcomes are joined after ranking.",
      socialState === "not_researched"
        ? "Social history has not been researched because provider approval remains pending."
        : "Social findings are limited to explicitly recorded provider coverage.",
      dataMode === "effective"
        ? "Effective values come only from approved, auditable repair overlays; RAW values remain preserved."
        : "RAW is the default and no effective value was silently substituted.",
    ],
  };
}

const escapeHtml = (value: unknown) =>
  scalar(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function htmlSection(section: ResearchBriefSection) {
  const paragraphs = (section.paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const rows = section.rows ?? [];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 10);
  const table = rows.length
    ? `<div class="table-wrap"><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(key.replaceAll("_", " "))}</th>`).join("")}</tr></thead><tbody>${rows
        .slice(0, 100)
        .map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row[key])}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`
    : "<p class=\"muted\">No qualifying records in current coverage.</p>";
  return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${table}</section>`;
}

export function researchBriefHTML(brief: ResearchBrief) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brief.title)}</title><style>
  @page{size:letter;margin:.65in}*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.report{max-width:1040px;margin:32px auto;background:white;padding:48px;box-shadow:0 8px 30px #17203318}h1{font-size:28px;margin:0}.eyebrow{color:#3452a3;font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}.meta{margin-top:8px;color:#5d6679}.summary{margin:28px 0;padding:20px;border-left:4px solid #3452a3;background:#f2f5ff;font-size:16px}section{margin-top:30px;break-inside:avoid}h2{font-size:18px;border-bottom:1px solid #dce2ec;padding-bottom:7px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #dce2ec;padding:7px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f2f5fa;text-transform:capitalize}.muted{color:#6b7280}.limitations{margin-top:34px;padding:20px;background:#fff9e8;border:1px solid #f1d48a}footer{margin-top:34px;color:#6b7280;font-size:11px}@media print{body{background:white}.report{margin:0;box-shadow:none;padding:0}.table-wrap{overflow:visible}}
  </style></head><body><main class="report"><div class="eyebrow">Market Intelligence · Historical Research Database</div><h1>${escapeHtml(brief.title)}</h1><div class="meta">Generated ${escapeHtml(brief.generatedAt)} · ${escapeHtml(brief.dataMode.toUpperCase())} mode · ${escapeHtml(brief.researchBriefVersion)}</div><div class="summary"><strong>Executive Summary</strong><br>${escapeHtml(brief.executiveSummary)}</div>${brief.sections.map(htmlSection).join("")}<div class="limitations"><h2>Coverage &amp; Limitations</h2><ul>${brief.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><footer>Provenance: ticker ${escapeHtml(brief.provenance.tickerId)} · ${brief.provenance.moverIds.length} mover reference(s) · ${brief.provenance.eventIds.length} event reference(s). Historical research only; no prediction or recommendation.</footer></main></body></html>`;
}

const safeCsv = (value: unknown) => {
  let text = scalar(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function researchBriefCSV(brief: ResearchBrief) {
  const lines = [
    ["research_brief_version", brief.researchBriefVersion],
    ["generated_at", brief.generatedAt],
    ["data_mode", brief.dataMode],
    ["executive_summary", brief.executiveSummary],
  ].map((row) => row.map(safeCsv).join(","));
  for (const section of brief.sections) {
    lines.push("", safeCsv(section.heading));
    for (const paragraph of section.paragraphs ?? []) lines.push(["note", paragraph].map(safeCsv).join(","));
    const rows = section.rows ?? [];
    const keys = [...new Set(rows.flatMap(Object.keys))].slice(0, 12);
    if (keys.length) lines.push(keys.map(safeCsv).join(","));
    for (const row of rows.slice(0, 100)) lines.push(keys.map((key) => safeCsv(row[key])).join(","));
  }
  lines.push("", safeCsv("Coverage & Limitations"), ...brief.limitations.map((item) => safeCsv(item)));
  return lines.join("\n");
}

export function researchBriefJSON(brief: ResearchBrief) {
  return JSON.stringify(
    {
      research_brief_version: brief.researchBriefVersion,
      generated_at: brief.generatedAt,
      data_mode: brief.dataMode,
      title: brief.title,
      executive_summary: brief.executiveSummary,
      sections: brief.sections,
      provenance: brief.provenance,
      limitations: brief.limitations,
    },
    null,
    2,
  );
}

const wrap = (value: string, width = 92) => {
  const normalized = value.replace(/[—–]/g, "-").replace(/•/g, "*").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const lines: string[] = [];
  let line = "";
  for (const word of normalized.replace(/\s+/g, " ").trim().split(" ")) {
    if (`${line} ${word}`.trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
};

export async function researchBriefPDF(brief: ResearchBrief) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]);
  let y = 748;
  let pageNumber = 1;
  const footer = () => {
    page.drawText(`${brief.researchBriefVersion} · ${brief.dataMode.toUpperCase()} · Page ${pageNumber}`, {
      x: 42,
      y: 24,
      size: 7,
      font: regular,
      color: rgb(0.38, 0.42, 0.5),
    });
  };
  const newPage = () => {
    footer();
    page = document.addPage([612, 792]);
    y = 748;
    pageNumber += 1;
  };
  const add = (text: string, size = 9, strong = false, color = rgb(0.08, 0.12, 0.2), indent = 0) => {
    for (const line of wrap(text, size >= 15 ? 66 : Math.max(55, 92 - indent / 3))) {
      if (y < 48) newPage();
      page.drawText(line, { x: 42 + indent, y, size, font: strong ? bold : regular, color });
      y -= size + 4;
    }
  };
  add("MARKET INTELLIGENCE · HISTORICAL RESEARCH DATABASE", 8, true, rgb(0.18, 0.31, 0.62));
  add(brief.title, 18, true);
  add(`Generated ${brief.generatedAt} · ${brief.dataMode.toUpperCase()} mode`, 8, false, rgb(0.38, 0.42, 0.5));
  y -= 8;
  add("Executive Summary", 12, true);
  add(brief.executiveSummary, 10);
  for (const section of brief.sections) {
    y -= 8;
    if (y < 100) newPage();
    add(section.heading, 12, true, rgb(0.18, 0.31, 0.62));
    for (const paragraph of section.paragraphs ?? []) add(paragraph, 8);
    for (const row of (section.rows ?? []).slice(0, 30)) {
      const display = Object.entries(row)
        .filter(([, value]) => typeof value !== "object")
        .slice(0, 8)
        .map(([key, value]) => `${key.replaceAll("_", " ")}: ${scalar(value)}`)
        .join(" | ");
      add(display, 7, false, rgb(0.15, 0.18, 0.24), 6);
    }
    if (!(section.rows ?? []).length) add("No qualifying records in current coverage.", 8, false, rgb(0.38, 0.42, 0.5));
  }
  y -= 8;
  add("Coverage & Limitations", 12, true);
  brief.limitations.forEach((item) => add(`• ${item}`, 8));
  y -= 6;
  add(`Provenance: ${brief.provenance.sourceReportIds.length} source report(s); ${brief.provenance.moverIds.length} mover reference(s); ${brief.provenance.eventIds.length} event reference(s).`, 7, false, rgb(0.38, 0.42, 0.5));
  footer();
  return document.save();
}

