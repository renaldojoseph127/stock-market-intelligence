import type { ProviderResponseCache } from "./types";

export class SupabaseEventSourceCache implements ProviderResponseCache {
  constructor(
    private db: any,
    private sourceId: string,
  ) {}
  async get(cacheKey: string) {
    const { data, error } = await this.db
      .from("event_source_cache")
      .select(
        "response_payload,expires_at,status,etag,last_modified,http_status,error_message",
      )
      .eq("source_id", this.sourceId)
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data
      ? {
          payload: data.response_payload,
          expiresAt: data.expires_at,
          status: data.status,
          etag: data.etag,
          lastModified: data.last_modified,
          httpStatus: data.http_status,
          errorMessage: data.error_message,
        }
      : null;
  }
  async set(
    cacheKey: string,
    requestUrl: string,
    payload: unknown,
    ttlHours: number,
    headers: { etag?: string | null; lastModified?: string | null } = {},
  ) {
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
      { error } = await this.db
        .from("event_source_cache")
        .upsert(
          {
            source_id: this.sourceId,
            cache_key: cacheKey,
            request_url: requestUrl,
            response_payload: payload,
            etag: headers.etag ?? null,
            last_modified: headers.lastModified ?? null,
            retrieved_at: new Date().toISOString(),
            expires_at: expiresAt,
            status: "success",
            http_status: 200,
            error_type: null,
            error_message: null,
            retryable: false,
          },
          { onConflict: "source_id,cache_key" },
        );
    if (error) throw new Error(error.message);
  }
  async touch(cacheKey: string, ttlHours: number) {
    const { error } = await this.db
      .from("event_source_cache")
      .update({
        retrieved_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
        status: "success",
        http_status: 304,
        error_type: null,
        error_message: null,
        retryable: false,
      })
      .eq("source_id", this.sourceId)
      .eq("cache_key", cacheKey);
    if (error) throw new Error(error.message);
  }
  async recordFailure(
    cacheKey: string,
    requestUrl: string,
    failure: {
      status: "not_found" | "temporary_failure" | "failure";
      httpStatus?: number | null;
      errorType: string;
      errorMessage: string;
      retryable: boolean;
      ttlMinutes: number;
    },
  ) {
    const current = await this.db
      .from("event_source_cache")
      .select("response_payload,etag,last_modified")
      .eq("source_id", this.sourceId)
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const { error } = await this.db
      .from("event_source_cache")
      .upsert(
        {
          source_id: this.sourceId,
          cache_key: cacheKey,
          request_url: requestUrl,
          response_payload: current.data?.response_payload ?? null,
          etag: current.data?.etag ?? null,
          last_modified: current.data?.last_modified ?? null,
          retrieved_at: new Date().toISOString(),
          expires_at: new Date(
            Date.now() + failure.ttlMinutes * 60_000,
          ).toISOString(),
          status: failure.status,
          http_status: failure.httpStatus ?? null,
          error_type: failure.errorType,
          error_message: failure.errorMessage,
          retryable: failure.retryable,
        },
        { onConflict: "source_id,cache_key" },
      );
    if (error) throw new Error(error.message);
  }
}
