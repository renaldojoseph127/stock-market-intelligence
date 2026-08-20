import {BaseAdapter} from "./base";
import {devvitRedditConfiguration, socialResearchConfig} from "../config";
import {AdapterHttpError, retryAfterMs, withRetry} from "../retry";
import type {
  AdapterPage,
  ConfigurationResult,
  ImportRequest,
  ProviderRecord,
  ProviderRequestLifecycle,
  RateLimitState,
  SocialCoverageStatus,
} from "../types";

type Fetch = typeof fetch;

export const DEVVIT_BRIDGE_SCHEMA_VERSION = "2026-08-18";

type DevvitBridgeRecord = {
  kind: "post" | "comment";
  thingId: string;
  parentThingId?: string;
  postThingId?: string;
  subredditId?: string;
  subredditName?: string;
  authorName?: string;
  title?: string;
  body?: string;
  createdAt?: string;
  edited?: boolean;
  score?: number;
  numberOfComments?: number;
  permalink?: string;
  url?: string;
  removed?: boolean;
  raw?: Record<string, unknown>;
};

type DevvitBridgeResponse = {
  schemaVersion: string;
  provider: "reddit_devvit";
  operation: "search_posts" | "get_comments";
  records: DevvitBridgeRecord[];
  retrievedAt: string;
  pagination: {
    requestedCursor?: string;
    nextCursor?: string;
    resultCount: number;
    cursorState: "has_more" | "exhausted" | "provider_limited";
  };
  coverage: {
    status: SocialCoverageStatus;
    limitations: string[];
    exactDateFiltering: boolean;
    requestedTimeframe?: string;
  };
};

function isBridgeResponse(input:unknown):input is DevvitBridgeResponse{
  const value=input as Partial<DevvitBridgeResponse>|null;
  return Boolean(value&&value.schemaVersion===DEVVIT_BRIDGE_SCHEMA_VERSION&&value.provider==="reddit_devvit"&&Array.isArray(value.records)&&value.pagination&&typeof value.pagination.resultCount==="number"&&value.coverage&&Array.isArray(value.coverage.limitations));
}

function safeAuthor(value:unknown){
  return typeof value==="string"&&value!=="[deleted]"&&value.trim()?value:undefined;
}

function safeContent(value:unknown,removed:boolean){
  return !removed&&typeof value==="string"&&value!=="[deleted]"&&value!=="[removed]"?value:undefined;
}

export class DevvitRedditAdapter extends BaseAdapter{
  readonly key="reddit";
  readonly name="Reddit";
  private lifecycle?:ProviderRequestLifecycle;
  private rateLimit:RateLimitState={used:null,remaining:null,resetSeconds:null,observedAt:new Date(0).toISOString()};

  constructor(private fetchImpl:Fetch=fetch,private now:()=>number=Date.now){super()}

  setRequestLifecycle(lifecycle?:ProviderRequestLifecycle){this.lifecycle=lifecycle}

  async validateConfiguration():Promise<ConfigurationResult>{
    const value=devvitRedditConfiguration();
    return{status:value.status,message:value.message};
  }

  getRateLimitState(){return this.rateLimit}

  private observe(headers:Headers){
    const number=(name:string)=>{const value=Number(headers.get(name));return Number.isFinite(value)?value:null};
    this.rateLimit={used:number("x-ratelimit-used"),remaining:number("x-ratelimit-remaining"),resetSeconds:number("x-ratelimit-reset"),observedAt:new Date(this.now()).toISOString()};
  }

  private async call(body:Record<string,unknown>){
    const configuration=devvitRedditConfiguration();
    if(!configuration.ready)throw new AdapterHttpError(configuration.message,403,false);
    return withRetry(async()=>{
      await this.lifecycle?.beforeRequest();
      let response:Response;
      try{
        response=await this.fetchImpl(socialResearchConfig.devvitBridgeUrl,{
          method:"POST",
          headers:{authorization:`Bearer ${socialResearchConfig.devvitBridgeToken}`,"content-type":"application/json",accept:"application/json"},
          body:JSON.stringify(body),
          signal:AbortSignal.timeout(Math.min(socialResearchConfig.requestTimeoutMs,29_000)),
        });
      }catch(error){
        try{await this.lifecycle?.afterRequest("failed")}catch{}
        throw error;
      }
      this.observe(response.headers);
      try{await this.lifecycle?.afterRequest(response.status===429?"rate_limited":response.ok?"success":"failed")}catch{}
      if(!response.ok)throw new AdapterHttpError(`Devvit Reddit bridge returned HTTP ${response.status}`,response.status,response.status===429||response.status>=500,retryAfterMs(response,0));
      const payload=await response.json();
      if(!isBridgeResponse(payload))throw new AdapterHttpError("Devvit Reddit bridge returned a malformed or unsupported response",502,true);
      return payload;
    },{maxAttempts:socialResearchConfig.maxRetries,baseDelayMs:750,maxDelayMs:15_000});
  }

  normalizeRecord(input:unknown):ProviderRecord{
    const value=input as DevvitBridgeRecord;
    const removed=value.removed===true;
    return{
      externalId:String(value.thingId),
      externalParentId:value.parentThingId,
      rootExternalId:value.postThingId??(value.kind==="post"?value.thingId:undefined),
      type:value.kind,
      url:safeContent(value.url??value.permalink,removed),
      community:value.subredditName,
      username:safeAuthor(value.authorName),
      title:safeContent(value.title,removed),
      body:safeContent(value.body,removed),
      postedAt:value.createdAt,
      score:Number.isFinite(value.score)?value.score:undefined,
      comments:Number.isFinite(value.numberOfComments)?value.numberOfComments:undefined,
      rawPayload:{provider:"reddit_devvit",schemaVersion:DEVVIT_BRIDGE_SCHEMA_VERSION,availability:removed?"removed":safeAuthor(value.authorName)?"active":"deleted",...value},
    };
  }

  private page(payload:DevvitBridgeResponse):AdapterPage{
    return{
      records:payload.records.map(record=>this.normalizeRecord(record)),
      nextCursor:payload.pagination.nextCursor,
      rateLimit:this.rateLimit,
      requestUrl:socialResearchConfig.devvitBridgeUrl,
      providerCursorExhausted:payload.pagination.cursorState==="exhausted",
      coverageStatus:payload.coverage.status,
      limitations:payload.coverage.limitations,
      retrievedAt:payload.retrievedAt,
      paginationState:{...payload.pagination,exactDateFiltering:payload.coverage.exactDateFiltering,requestedTimeframe:payload.coverage.requestedTimeframe},
    };
  }

  async searchTicker(input:{community:string;query:string;after?:string;limit?:number;sort?:"new"|"relevance"}){
    const payload=await this.call({operation:"search_posts",community:input.community,query:input.query,cursor:input.after,limit:Math.max(1,Math.min(input.limit??100,100)),pageSize:Math.max(1,Math.min(input.limit??100,100)),sort:input.sort??"new",timeframe:"all"});
    if(payload.operation!=="search_posts")throw new AdapterHttpError("Devvit Reddit bridge returned the wrong operation",502,true);
    return this.page(payload);
  }

  async fetchComments(externalId:string,limit=100){
    const payload=await this.call({operation:"get_comments",postId:externalId,limit:Math.max(1,Math.min(limit,100)),pageSize:Math.max(1,Math.min(limit,100)),sort:"old",depth:10});
    if(payload.operation!=="get_comments")throw new AdapterHttpError("Devvit Reddit bridge returned the wrong operation",502,true);
    return this.page(payload);
  }

  async healthCheck(){
    const configuration=await this.validateConfiguration();
    return configuration.status==="available"?{status:"available"as const,message:"Read-only Devvit bridge configuration is ready; no provider request was performed."}:configuration;
  }

  async *historicalBackfill(request:ImportRequest):AsyncGenerator<AdapterPage>{
    const configuration=await this.validateConfiguration();
    if(configuration.status!=="available")throw new AdapterHttpError(configuration.message,403,false);
    if(!request.community||!request.ticker)throw new AdapterHttpError("A bounded community and ticker are required",400,false);
    let after=request.cursor,pages=0;
    do{
      const page=await this.searchTicker({community:request.community,query:`$${request.ticker} OR ${request.ticker}`,after,limit:Math.min(request.batchSize??100,100)});
      page.records=page.records.filter(record=>(!request.startAt||!record.postedAt||record.postedAt>=request.startAt)&&(!request.endAt||!record.postedAt||record.postedAt<=request.endAt));
      yield page;
      after=page.nextCursor;
      pages++;
    }while(after&&pages<socialResearchConfig.maxQueryPages);
  }
}
