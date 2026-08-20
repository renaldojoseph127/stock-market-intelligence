export type AdapterStatus="available"|"unavailable"|"authentication_required"|"authorization_required"|"rate_limited"|"unsupported"|"blocked"|"unconfigured";
export type SocialCoverageStatus="complete_for_provider_window"|"partial"|"provider_limited"|"rate_limited"|"not_available"|"not_researched"|"failed";
export type ProviderRequestOutcome="success"|"failed"|"rate_limited";
export interface ProviderRequestLifecycle{beforeRequest:()=>Promise<void>;afterRequest:(outcome:ProviderRequestOutcome)=>Promise<void>}
export type SocialImportType="historical_backfill"|"incremental"|"retry"|"manual";
export interface ImportRequest{sourceKey:string;community?:string;startAt?:string;endAt?:string;ticker?:string;batchSize?:number;cursor?:string;importType:SocialImportType}
export interface ProviderRecord{externalId?:string;externalParentId?:string;rootExternalId?:string;type:"post"|"thread"|"topic"|"message"|"comment"|"reply";url?:string;community?:string;username?:string;displayName?:string;profileUrl?:string;title?:string;body?:string;postedAt?:string;editedAt?:string;upvotes?:number;downvotes?:number;score?:number;comments?:number;views?:number;upvoteRatio?:number;isSelfPost?:boolean;rawPayload:unknown}
export interface RateLimitState{used:number|null;remaining:number|null;resetSeconds:number|null;observedAt:string}
export interface AdapterPage{records:ProviderRecord[];nextCursor?:string;rateLimitDelayMs?:number;rateLimit?:RateLimitState;requestUrl?:string;providerCursorExhausted?:boolean;coverageStatus?:SocialCoverageStatus;limitations?:string[];retrievedAt?:string;paginationState?:Record<string,unknown>}
export interface ConfigurationResult{status:AdapterStatus;message:string}
export interface SocialSourceAdapter{
 readonly key:string;readonly name:string;
 validateConfiguration():Promise<ConfigurationResult>;
 historicalBackfill(request:ImportRequest):AsyncGenerator<AdapterPage>;
 incrementalSync(request:ImportRequest):AsyncGenerator<AdapterPage>;
 normalizeRecord(input:unknown):ProviderRecord;
 getNextCursor(page:AdapterPage):string|undefined;
 handleRateLimit(response:Response):number;
}
export interface TickerMention{symbol:string;mentionText:string;index:number;method:"cashtag"|"exchange_prefix"|"validated_plain"|"company_name";confidence:number;contextExcerpt?:string;reason?:string}
