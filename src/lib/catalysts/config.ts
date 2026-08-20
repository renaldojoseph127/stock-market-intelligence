const integer = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : fallback;
};

export const catalystConfig = {
  secUserAgent: process.env.SEC_USER_AGENT?.trim() ?? "",
  secRequestsPerSecond: integer(process.env.SEC_REQUESTS_PER_SECOND, 5, 1, 9),
  secCacheTtlHours: integer(process.env.SEC_CACHE_TTL_HOURS, 24, 1, 720),
  secMaxRetries: integer(process.env.SEC_MAX_RETRIES, 3, 1, 5),
  queueBatchSize: integer(process.env.CATALYST_QUEUE_BATCH_SIZE, 1, 1, 5),
  queueMaxAttempts: integer(process.env.CATALYST_QUEUE_MAX_ATTEMPTS, 3, 1, 10),
  defaultDaysBefore: integer(
    process.env.CATALYST_DEFAULT_DAYS_BEFORE,
    7,
    1,
    90,
  ),
  defaultDaysAfter: integer(process.env.CATALYST_DEFAULT_DAYS_AFTER, 2, 0, 30),
  maxFilingDownloadBytes: integer(
    process.env.CATALYST_MAX_FILING_DOWNLOAD_BYTES,
    5_242_880,
    65_536,
    10_485_760,
  ),
  maxExtractedTextCharacters: integer(
    process.env.CATALYST_MAX_EXTRACTED_TEXT_CHARACTERS,
    100_000,
    1_000,
    250_000,
  ),
  maxStoredEvidenceCharacters: integer(
    process.env.CATALYST_MAX_STORED_EVIDENCE_CHARACTERS,
    4_000,
    100,
    4_000,
  ),
};

export function validSecUserAgent(value: string) {
  return value.length >= 8 && /@|https?:\/\//i.test(value);
}
