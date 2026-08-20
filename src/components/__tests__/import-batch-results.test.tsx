import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchReportResults, ReportDetailTables } from "../import-batch-results";

describe("batch result details", () => {
  it("renders only a lazy report-summary placeholder before client fetch", () => {
    const html = renderToStaticMarkup(
      <BatchReportResults
        batchId="10000000-0000-4000-8000-000000000001"
        totalReports={224}
      />,
    );
    expect(html).toContain("Loading 20 report summaries");
    expect(html).not.toContain("Ticker records");
  });

  it("does not load report rows or issues until requested", () => {
    const html = renderToStaticMarkup(
      <ReportDetailTables
        batchId="10000000-0000-4000-8000-000000000001"
        reportId="20000000-0000-4000-8000-000000000001"
        recordCount={26_218}
        warningCount={3_955}
      />,
    );
    expect(html).toContain("Load report details");
    expect(html).not.toContain("26,218");
  });
});

