import{BaseAdapter}from"./base";
import{DevvitRedditAdapter}from"./devvit-reddit";
import{AdapterHttpError,retryAfterMs,withRetry}from"../retry";
import{legacyRedditConfiguration,redditConfiguration,socialResearchConfig}from"../config";
import type{AdapterPage,ConfigurationResult,ImportRequest,ProviderRecord,ProviderRequestLifecycle,ProviderRequestOutcome,RateLimitState}from"../types";

type Fetch=typeof fetch;type Listing={data?:{children?:Array<{kind:string;data:Record<string,any>}>;after?:string|null}};
let lastRequestAt=0;
const deleted=(value:unknown)=>value==="[deleted]"||value==="[removed]";
const numberOrNull=(value:string|null)=>{const n=Number(value);return Number.isFinite(n)?n:null};

export class LegacyRedditOAuthAdapter extends BaseAdapter{
 readonly key="reddit";readonly name="Reddit";private token?:{value:string;expiresAt:number};private rateLimit:RateLimitState={used:null,remaining:null,resetSeconds:null,observedAt:new Date(0).toISOString()};
 constructor(private fetchImpl:Fetch=fetch,private now:()=>number=Date.now,private sleep:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms)),private lifecycle?:ProviderRequestLifecycle){super()}
 setRequestLifecycle(lifecycle?:ProviderRequestLifecycle){this.lifecycle=lifecycle}
 private async beforeRequest(){await this.lifecycle?.beforeRequest()}
 private async afterRequest(outcome:ProviderRequestOutcome){try{await this.lifecycle?.afterRequest(outcome)}catch{/* Provider evidence must survive a best-effort usage-counter write failure. */}}
 async validateConfiguration():Promise<ConfigurationResult>{const value=legacyRedditConfiguration();return{status:value.status,message:value.message}}
 getRateLimitState(){return this.rateLimit}
 private observe(headers:Headers){this.rateLimit={used:numberOrNull(headers.get("x-ratelimit-used")),remaining:numberOrNull(headers.get("x-ratelimit-remaining")),resetSeconds:numberOrNull(headers.get("x-ratelimit-reset")),observedAt:new Date(this.now()).toISOString()}}
 private async paced(){const minimum=60_000/socialResearchConfig.requestsPerMinute,wait=lastRequestAt?Math.max(0,lastRequestAt+minimum-this.now()):0;if(wait)await this.sleep(wait);lastRequestAt=this.now()}
 async authenticate(force=false){if(!force&&this.token&&this.token.expiresAt>this.now()+30_000)return this.token.value;const c=legacyRedditConfiguration();if(!c.ready)throw new AdapterHttpError(c.message,403,false);const response=await withRetry(async()=>{await this.paced();await this.beforeRequest();let value:Response;try{value=await this.fetchImpl("https://www.reddit.com/api/v1/access_token",{method:"POST",headers:{authorization:`Basic ${Buffer.from(`${socialResearchConfig.redditClientId}:${socialResearchConfig.redditClientSecret}`).toString("base64")}`,"content-type":"application/x-www-form-urlencoded","user-agent":socialResearchConfig.redditUserAgent},body:"grant_type=client_credentials",signal:AbortSignal.timeout(socialResearchConfig.requestTimeoutMs)})}catch(error){await this.afterRequest("failed");throw error}await this.afterRequest(value.status===429?"rate_limited":value.ok?"success":"failed");if(!value.ok)throw new AdapterHttpError(`Reddit OAuth returned HTTP ${value.status}`,value.status,value.status===429||value.status>=500,retryAfterMs(value,0));return value},{maxAttempts:socialResearchConfig.maxRetries,baseDelayMs:750,maxDelayMs:15_000});const body=await response.json()as any;if(!body.access_token)throw new AdapterHttpError("Reddit OAuth response did not contain an access token",502,false);this.token={value:String(body.access_token),expiresAt:this.now()+Math.max(60,Number(body.expires_in)||3600)*1000};return this.token.value}
 private async api(path:string,query:URLSearchParams){let refreshed=false;return withRetry(async()=>{const token=await this.authenticate(refreshed);await this.paced();await this.beforeRequest();const url=`https://oauth.reddit.com${path}?${query}`;let response:Response;try{response=await this.fetchImpl(url,{headers:{authorization:`bearer ${token}`,"user-agent":socialResearchConfig.redditUserAgent},signal:AbortSignal.timeout(socialResearchConfig.requestTimeoutMs)})}catch(error){await this.afterRequest("failed");throw error}this.observe(response.headers);await this.afterRequest(response.status===429?"rate_limited":response.ok?"success":"failed");if(response.status===401&&!refreshed){refreshed=true;this.token=undefined;throw new AdapterHttpError("Reddit OAuth token expired",401,true)}if(!response.ok)throw new AdapterHttpError(`Reddit API returned HTTP ${response.status}`,response.status,response.status===401||response.status===429||response.status>=500,retryAfterMs(response,0));return{payload:await response.json(),url}},{maxAttempts:socialResearchConfig.maxRetries,baseDelayMs:750,maxDelayMs:15_000})}
 normalizeRecord(input:unknown):ProviderRecord{const x=input as Record<string,any>,author=deleted(x.author)?undefined:x.author,body=deleted(x.selftext??x.body)?undefined:(x.selftext??x.body),title=deleted(x.title)?undefined:x.title;return{externalId:String(x.name??x.id),externalParentId:x.parent_id,rootExternalId:x.link_id??(x.kind==="t3"?x.name:undefined),type:x.kind==="t1"?"comment":"post",url:x.permalink?`https://www.reddit.com${x.permalink}`:undefined,community:x.subreddit,username:author,title,body,postedAt:x.created_utc?new Date(x.created_utc*1000).toISOString():undefined,editedAt:typeof x.edited==="number"?new Date(x.edited*1000).toISOString():undefined,upvotes:Number.isFinite(x.ups)?x.ups:undefined,downvotes:Number.isFinite(x.downs)?x.downs:undefined,score:Number.isFinite(x.score)?x.score:undefined,comments:Number.isFinite(x.num_comments)?x.num_comments:undefined,upvoteRatio:Number.isFinite(x.upvote_ratio)?x.upvote_ratio:undefined,isSelfPost:typeof x.is_self==="boolean"?x.is_self:undefined,rawPayload:input}}
 async searchTicker(input:{community:string;query:string;after?:string;limit?:number;sort?:"new"|"relevance"}){const q=new URLSearchParams({q:input.query,restrict_sr:"1",sort:input.sort??"new",t:"all",limit:String(Math.max(1,Math.min(input.limit??100,100))),raw_json:"1"});if(input.after)q.set("after",input.after);const r=await this.api(`/r/${encodeURIComponent(input.community)}/search`,q),listing=r.payload as Listing;if(!listing?.data||!Array.isArray(listing.data.children))throw new AdapterHttpError("Reddit search returned a malformed listing",502,true);const children=listing.data.children;return{records:children.map(x=>this.normalizeRecord({...x.data,kind:x.kind})),nextCursor:listing.data.after??undefined,rateLimit:this.rateLimit,requestUrl:r.url,providerCursorExhausted:!listing.data.after}as AdapterPage}
 async fetchSubmission(externalId:string){const id=externalId.replace(/^t3_/,"");const r=await this.api(`/comments/${encodeURIComponent(id)}`,new URLSearchParams({limit:"1",depth:"0",raw_json:"1"})),payload=r.payload as Listing[];return payload?.[0]?.data?.children?.[0]?this.normalizeRecord({...payload[0].data!.children![0].data,kind:"t3"}):null}
 async fetchComments(externalId:string,limit=100){const id=externalId.replace(/^t3_/,"");const r=await this.api(`/comments/${encodeURIComponent(id)}`,new URLSearchParams({limit:String(Math.min(limit,100)),depth:"10",sort:"old",raw_json:"1"})),payload=r.payload as Listing[];const out:ProviderRecord[]=[];const visit=(nodes:any[])=>{for(const n of nodes??[]){if(n.kind!=="t1")continue;out.push(this.normalizeRecord({...n.data,kind:"t1"}));visit(n.data?.replies?.data?.children)}};visit(payload?.[1]?.data?.children??[]);return{records:out,rateLimit:this.rateLimit,requestUrl:r.url}}
 async fetchAccount(username:string){const r=await this.api(`/user/${encodeURIComponent(username)}/about`,new URLSearchParams({raw_json:"1"}));return(r.payload as any)?.data??null}
 async healthCheck(){const configuration=await this.validateConfiguration();if(configuration.status!=="available")return configuration;try{await this.authenticate();return{status:"available" as const,message:"Official Reddit OAuth authentication succeeded."}}catch(error){return{status:"unavailable" as const,message:error instanceof Error?error.message:String(error)}}}
 async *historicalBackfill(request:ImportRequest):AsyncGenerator<AdapterPage>{const c=await this.validateConfiguration();if(c.status!=="available")throw new AdapterHttpError(c.message,403,false);if(!request.community||!request.ticker)throw new AdapterHttpError("A bounded community and ticker are required",400,false);let after=request.cursor,pages=0;do{const page=await this.searchTicker({community:request.community,query:`$${request.ticker} OR ${request.ticker}`,after,limit:Math.min(request.batchSize??100,100)});page.records=page.records.filter(x=>(!request.startAt||!x.postedAt||x.postedAt>=request.startAt)&&(!request.endAt||!x.postedAt||x.postedAt<=request.endAt));yield page;after=page.nextCursor;pages++}while(after&&pages<socialResearchConfig.maxQueryPages)}
}

export interface RedditResearchTransport{
 validateConfiguration():Promise<ConfigurationResult>;
 setRequestLifecycle(lifecycle?:ProviderRequestLifecycle):void;
 getRateLimitState():RateLimitState;
 normalizeRecord(input:unknown):ProviderRecord;
 searchTicker(input:{community:string;query:string;after?:string;limit?:number;sort?:"new"|"relevance"}):Promise<AdapterPage>;
 fetchComments(externalId:string,limit?:number):Promise<AdapterPage>;
 historicalBackfill(request:ImportRequest):AsyncGenerator<AdapterPage>;
}

export class RedditSocialProvider extends BaseAdapter{
 readonly key="reddit";readonly name="Reddit";
 private transport:RedditResearchTransport;
 constructor(transport?:RedditResearchTransport){
  super();
  this.transport=transport??(socialResearchConfig.redditProviderMode==="legacy_oauth"?new LegacyRedditOAuthAdapter():new DevvitRedditAdapter());
 }
 validateConfiguration(){const value=redditConfiguration();return Promise.resolve({status:value.status,message:value.message})}
 setRequestLifecycle(lifecycle?:ProviderRequestLifecycle){this.transport.setRequestLifecycle(lifecycle)}
 getRateLimitState(){return this.transport.getRateLimitState()}
 normalizeRecord(input:unknown){return this.transport.normalizeRecord(input)}
 searchTicker(input:{community:string;query:string;after?:string;limit?:number;sort?:"new"|"relevance"}){return this.transport.searchTicker(input)}
 fetchComments(externalId:string,limit=100){return this.transport.fetchComments(externalId,limit)}
 async healthCheck(){const configuration=await this.validateConfiguration();if(configuration.status!=="available")return configuration;const transport=this.transport as RedditResearchTransport&{healthCheck?:()=>Promise<ConfigurationResult>};return transport.healthCheck?transport.healthCheck():{status:"available"as const,message:"Approved read-only Reddit transport is configured; no provider request was required for this status."}}
 historicalBackfill(request:ImportRequest){return this.transport.historicalBackfill(request)}
}

/** Backwards-compatible project alias. New code should use RedditSocialProvider. */
export{RedditSocialProvider as RedditAdapter};
