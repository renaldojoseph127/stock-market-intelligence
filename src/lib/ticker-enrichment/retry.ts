export class ProviderHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}
export class ProviderQuotaError extends Error {
  constructor() {
    super("Daily metadata API budget exhausted");
  }
}
export async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
function retryAfterMs(response: Response) {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds))
    return Math.min(30_000, Math.max(0, seconds * 1000));
  const at = Date.parse(raw);
  return Number.isFinite(at)
    ? Math.min(30_000, Math.max(0, at - Date.now()))
    : null;
}
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: {
    fetcher?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    attempts?: number;
    timeoutMs?: number;
    beforeAttempt?: () => Promise<boolean>;
    random?: () => number;
  } = {},
) {
  const fetcher = options.fetcher ?? fetch,
    sleep = options.sleep ?? wait,
    attempts = Math.max(1, Math.min(options.attempts ?? 3, 5)),
    timeoutMs = options.timeoutMs ?? 15_000,
    random = options.random ?? Math.random,
    backoff = (attempt: number) =>
      Math.min(4_000, 250 * 2 ** attempt) + Math.floor(random() * 100);
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (init.signal?.aborted)
      throw init.signal.reason instanceof Error
        ? init.signal.reason
        : new DOMException("Request aborted", "AbortError");
    if (options.beforeAttempt && !(await options.beforeAttempt()))
      throw new ProviderQuotaError();
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
      if (response.status === 304) return response;
      if (
        response.status === 429 ||
        [500, 502, 503, 504].includes(response.status)
      ) {
        if (attempt + 1 >= attempts)
          throw new ProviderHttpError(
            `Provider returned HTTP ${response.status}`,
            response.status,
            true,
          );
        await sleep(retryAfterMs(response) ?? backoff(attempt));
        continue;
      }
      if (!response.ok)
        throw new ProviderHttpError(
          `Provider returned HTTP ${response.status}`,
          response.status,
          false,
        );
      return response;
    } catch (error) {
      last = error;
      if (init.signal?.aborted) throw error;
      if (error instanceof ProviderHttpError && !error.retryable) throw error;
      if (attempt + 1 >= attempts) throw error;
      await sleep(backoff(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last instanceof Error ? last : new Error("Provider request failed");
}
