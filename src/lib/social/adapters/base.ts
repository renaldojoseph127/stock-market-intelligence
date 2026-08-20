import{AdapterHttpError,retryAfterMs,withRetry}from"../retry";import type{AdapterPage,ConfigurationResult,ImportRequest,ProviderRecord,SocialSourceAdapter}from"../types";
export abstract class BaseAdapter implements SocialSourceAdapter{
 abstract readonly key:string;abstract readonly name:string;abstract validateConfiguration():Promise<ConfigurationResult>;abstract normalizeRecord(input:unknown):ProviderRecord;
 async *historicalBackfill(request:ImportRequest):AsyncGenerator<AdapterPage>{void request;throw new AdapterHttpError(`${this.name} historical collection is unavailable`,501,false);yield {records:[]}}
 async *incrementalSync(request:ImportRequest){yield* this.historicalBackfill(request)}getNextCursor(page:AdapterPage){return page.nextCursor}
 handleRateLimit(response:Response){return retryAfterMs(response)}
 protected async fetchJson(url:string,init?:RequestInit){return withRetry(async()=>{const response=await fetch(url,init);if(!response.ok)throw new AdapterHttpError(`${this.name} returned HTTP ${response.status}`,response.status,response.status===429||response.status>=500);return response.json()},{maxAttempts:4})}
}
