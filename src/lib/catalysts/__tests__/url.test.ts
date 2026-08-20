import { describe, expect, it } from "vitest";
import { safeExternalUrl, securityTypeCatalystLimitation } from "../url";

describe("catalyst display safety", () => {
  it("renders only absolute HTTPS evidence links", () => {
    expect(safeExternalUrl("https://www.sec.gov/Archives/example")).toBe(
      "https://www.sec.gov/Archives/example",
    );
    expect(safeExternalUrl("http://example.com")).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("/relative")).toBeNull();
  });

  it("states limited coverage for non-operating securities", () => {
    expect(securityTypeCatalystLimitation("ETF")).toMatch(
      /limited issuer-level coverage/i,
    );
    expect(securityTypeCatalystLimitation("common_stock")).toBeNull();
  });
});
