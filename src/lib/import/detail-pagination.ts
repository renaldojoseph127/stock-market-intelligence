export type DetailPagination = {
  page: number;
  pageSize: number;
  cursor: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validUuid(value: string) {
  return UUID.test(value);
}

export function parseDetailPagination(
  searchParams: URLSearchParams,
  defaultPageSize: number,
  maximumPageSize: number,
): DetailPagination {
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const requestedSize = Number(searchParams.get("pageSize") ?? defaultPageSize);
  const cursorValue = searchParams.get("cursor");
  return {
    page:
      Number.isFinite(requestedPage) && requestedPage >= 1
        ? Math.floor(requestedPage)
        : 1,
    pageSize:
      Number.isFinite(requestedSize) && requestedSize >= 1
        ? Math.min(maximumPageSize, Math.floor(requestedSize))
        : defaultPageSize,
    cursor: cursorValue && validUuid(cursorValue) ? cursorValue : null,
  };
}

