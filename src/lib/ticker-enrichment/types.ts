export type SecurityType="common_stock"|"preferred_stock"|"ETF"|"ETN"|"warrant"|"unit"|"ADR"|"closed_end_fund"|"other";
export type NormalizedExchange="NASDAQ"|"NYSE"|"NYSE American"|"OTC"|"Cboe"|"Other";
export type EnrichmentOutcome="found"|"partial"|"not_found"|"failed";

export interface TickerMetadata{
 company_name?:string|null;exchange?:NormalizedExchange|null;primary_exchange?:NormalizedExchange|null;sector?:string|null;industry?:string|null;market_cap?:number|null;float_shares?:number|null;shares_outstanding?:number|null;country?:string|null;website?:string|null;security_type?:SecurityType|null;cik?:string|null;isin?:string|null;cusip?:string|null;currency?:string|null;active?:boolean|null;delisted?:boolean|null;source_timestamp?:string;confidence?:number;
}
export interface ProviderResult{symbol:string;provider:string;status:EnrichmentOutcome;metadata:TickerMetadata;errorType?:string;errorMessage?:string;retryable?:boolean}
export interface ProviderReadiness{name:string;configured:boolean;role:"reference"|"market_data"|"fallback";message:string;rateLimit:string;coverage:string;missingFields:string[]}
export interface ProviderRequestOptions{signal?:AbortSignal;beforeExternalCall?:()=>Promise<boolean>}
export interface TickerMetadataProvider{
 readonly name:string;
 readonly supportedFields?:readonly (keyof TickerMetadata)[];
 readiness():ProviderReadiness;
 lookupTicker(symbol:string,options?:ProviderRequestOptions):Promise<ProviderResult>;
 batchLookup(symbols:string[],options?:ProviderRequestOptions):Promise<ProviderResult[]>;
 normalizeSecurity(raw:unknown,symbol:string):TickerMetadata;
 classifyExchange(value:unknown):NormalizedExchange|null;
 validateResponse(raw:unknown):boolean;
 handleRateLimit(response:Response,attempt:number):Promise<void>;
}
export interface EnrichmentWorkItem{id:string;enrichment_run_id:string;ticker_id:string;symbol:string;ordinal:number;attempt_count:number}
export interface EnrichmentProcessResult{run:Record<string,unknown>;claimed:number;processed:number;catalogDocumentsRefreshed:number;providers:string[]}

export type MetadataReason="ticker_search"|"ticker_page"|"ai_search"|"watchlist"|"alert"|"pattern_match"|"dashboard"|"recent_market_mover"|"popular_ticker"|"manual"|"stale_refresh"|"retry";
export type MetadataCacheState="complete"|"partial"|"stale"|"pending"|"refreshing"|"not_found"|"failed";
export type MetadataResolutionReason="queued"|"cache_hit"|"refresh_not_due"|"refresh_queued"|"refresh_completed"|"enriched"|"partial"|"budget_exhausted"|"provider_unavailable"|"not_found";
export interface MetadataSignals{recentSearches?:number;watchlisted?:boolean;recentMover?:boolean;activeAlert?:boolean;patternActivity?:boolean;popularityScore?:number;aiSearchCount?:number}
export interface MetadataResolution{ticker:Record<string,unknown>;state:MetadataCacheState;requiredFields:(keyof TickerMetadata)[];missingFields:(keyof TickerMetadata)[];cacheHit:boolean;queued:boolean;queueId?:string;providerCallsMade:number;reason:MetadataResolutionReason;nextRefreshAt:string|null;message:string}
