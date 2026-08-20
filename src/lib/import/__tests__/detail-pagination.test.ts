import { describe, expect, it } from "vitest";
import { parseDetailPagination } from "../detail-pagination";

describe("batch detail pagination", () => {
  it("defaults report pages to 20 and accepts page, pageSize, and cursor", () => {
    expect(parseDetailPagination(new URLSearchParams(), 20, 100)).toEqual({
      page: 1,
      pageSize: 20,
      cursor: null,
    });
    expect(
      parseDetailPagination(
        new URLSearchParams({
          page: "4",
          pageSize: "40",
          cursor: "10000000-0000-4000-8000-000000000001",
        }),
        20,
        100,
      ),
    ).toEqual({
      page: 4,
      pageSize: 40,
      cursor: "10000000-0000-4000-8000-000000000001",
    });
  });

  it("defaults row pages to 100 and bounds invalid or oversized inputs", () => {
    expect(parseDetailPagination(new URLSearchParams(), 100, 100)).toEqual({
      page: 1,
      pageSize: 100,
      cursor: null,
    });
    expect(
      parseDetailPagination(
        new URLSearchParams({ page: "-2", pageSize: "26218", cursor: "bad" }),
        100,
        100,
      ),
    ).toEqual({ page: 1, pageSize: 100, cursor: null });
  });
});

