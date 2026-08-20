import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const response=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json",...headers}});
const devvitPayload=(overrides:Record<string,unknown>={})=>({
  schemaVersion:"2026-08-18",
  provider:"reddit_devvit",
  operation:"search_posts",
  records:[{kind:"post",thingId:"t3_1",postThingId:"t3_1",subredditName:"wallstreetbets",authorName:"analyst",title:"$NVDA earnings",body:"NVIDIA bullish",createdAt:"2026-08-03T15:00:00.000Z",score:7,numberOfComments:2,permalink:"https://www.reddit.com/r/wallstreetbets/comments/1",removed:false,raw:{subredditId:"t5_2th52"}}],
  retrievedAt:"2026-08-18T12:00:00.000Z",
  pagination:{requestedCursor:undefined,nextCursor:"t3_1",resultCount:1,cursorState:"provider_limited"},
  coverage:{status:"provider_limited",limitations:["Historical completeness is not documented."],exactDateFiltering:false,requestedTimeframe:"all"},
  ...overrides,
});

beforeEach(()=>{
  vi.resetModules();
  process.env.REDDIT_PROVIDER_MODE="devvit_bridge";
  process.env.DEVVIT_REDDIT_BRIDGE_URL="https://market-research-ro-t5_test-external.devvit.net/external/research";
  process.env.DEVVIT_REDDIT_BRIDGE_TOKEN="devvit_at_test-secret";
  process.env.DEVVIT_REDDIT_ACCESS_APPROVED="true";
  process.env.REDDIT_MAX_RETRIES="2";
  delete process.env.REDDIT_CLIENT_ID;
  delete process.env.REDDIT_CLIENT_SECRET;
  delete process.env.REDDIT_USER_AGENT;
  delete process.env.REDDIT_DATA_API_AUTHORIZED;
});

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()});

describe("current RedditSocialProvider Devvit transport",()=>{
  it("prepares the exact bounded NVDA / WallStreetBets smoke-test queries without calling Reddit",async()=>{
    const {SocialResearchPlanner}=await import("../research-planner");
    const plan=new SocialResearchPlanner().plan({symbol:"NVDA",companyName:"NVIDIA Corporation",community:"wallstreetbets",dateFrom:"2026-07-07T00:00:00.000Z",dateTo:"2026-08-08T00:00:00.000Z"});
    expect(plan.map(item=>item.query)).toEqual(["NVDA","$NVDA","NVIDIA"]);
    expect(new Set(plan.map(item=>item.cacheKey)).size).toBe(3);
  });

  it("uses the managed-token bridge without traditional client credentials",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(response(devvitPayload()));
    const {DevvitRedditAdapter}=await import("../adapters/devvit-reddit");
    const adapter=new DevvitRedditAdapter(fetchMock as typeof fetch,()=>10_000);
    expect(await adapter.validateConfiguration()).toMatchObject({status:"available"});
    const page=await adapter.searchTicker({community:"wallstreetbets",query:"$NVDA",limit:100});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url,init]=fetchMock.mock.calls[0];
    expect(url).toContain("/external/research");
    expect(init.headers.authorization).toBe("Bearer devvit_at_test-secret");
    expect(JSON.parse(init.body)).toMatchObject({operation:"search_posts",community:"wallstreetbets",query:"$NVDA",timeframe:"all"});
    expect(page.records[0]).toMatchObject({externalId:"t3_1",rootExternalId:"t3_1",username:"analyst",community:"wallstreetbets",type:"post",comments:2});
    expect(page).toMatchObject({nextCursor:"t3_1",coverageStatus:"provider_limited",providerCursorExhausted:false});
    expect(page.limitations).toContain("Historical completeness is not documented.");
  });

  it("normalizes an honest provider-limited empty result",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(response(devvitPayload({records:[],pagination:{resultCount:0,cursorState:"exhausted"}})));
    const {DevvitRedditAdapter}=await import("../adapters/devvit-reddit");
    const page=await new DevvitRedditAdapter(fetchMock as typeof fetch).searchTicker({community:"investing",query:"$NONE"});
    expect(page.records).toEqual([]);
    expect(page.providerCursorExhausted).toBe(true);
    expect(page.coverageStatus).toBe("provider_limited");
  });

  it("retrieves only comments associated with a known submission",async()=>{
    const payload=devvitPayload({operation:"get_comments",records:[{kind:"comment",thingId:"t1_c",parentThingId:"t3_1",postThingId:"t3_1",subredditName:"wallstreetbets",authorName:"commenter",body:"NVDA",createdAt:"2026-08-03T16:00:00.000Z",score:2,removed:false}],pagination:{resultCount:1,cursorState:"exhausted"}});
    const fetchMock=vi.fn().mockResolvedValue(response(payload));
    const {DevvitRedditAdapter}=await import("../adapters/devvit-reddit");
    const page=await new DevvitRedditAdapter(fetchMock as typeof fetch).fetchComments("t3_1",25);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({operation:"get_comments",postId:"t3_1",limit:25});
    expect(page.records[0]).toMatchObject({externalId:"t1_c",externalParentId:"t3_1",rootExternalId:"t3_1",type:"comment"});
  });

  it("does not retain deleted author identity or removed text",async()=>{
    const {DevvitRedditAdapter}=await import("../adapters/devvit-reddit");
    const record=new DevvitRedditAdapter(vi.fn() as unknown as typeof fetch).normalizeRecord({kind:"comment",thingId:"t1_x",postThingId:"t3_1",authorName:"[deleted]",body:"[removed]",removed:true});
    expect(record).toMatchObject({username:undefined,body:undefined,type:"comment"});
    expect(record.rawPayload).toMatchObject({availability:"removed"});
  });

  it("fails closed until limited-access and data-handling approval is acknowledged",async()=>{
    process.env.DEVVIT_REDDIT_ACCESS_APPROVED="false";
    vi.resetModules();
    const {RedditSocialProvider}=await import("../adapters/reddit");
    const status=await new RedditSocialProvider().validateConfiguration();
    expect(status.status).toBe("authorization_required");
    expect(status.message).toMatch(/approval/i);
  });

  it("rejects malformed bridge JSON rather than treating it as empty",async()=>{
    const fetchMock=vi.fn().mockImplementation(async()=>response({unexpected:true}));
    const {DevvitRedditAdapter}=await import("../adapters/devvit-reddit");
    await expect(new DevvitRedditAdapter(fetchMock as typeof fetch).searchTicker({community:"stocks",query:"$NVDA"})).rejects.toMatchObject({status:502,retryable:true});
  });

  it("retries a bounded 429 and budgets every bridge attempt",async()=>{
    vi.useFakeTimers();
    const fetchMock=vi.fn().mockResolvedValueOnce(response({},429,{"retry-after":"0"})).mockResolvedValueOnce(response(devvitPayload({records:[],pagination:{resultCount:0,cursorState:"exhausted"}})));
    const {DevvitRedditAdapter}=await import("../adapters/devvit-reddit");
    const reserved:string[]=[],outcomes:string[]=[],adapter=new DevvitRedditAdapter(fetchMock as typeof fetch,()=>10_000);
    adapter.setRequestLifecycle({beforeRequest:async()=>{reserved.push("reserved")},afterRequest:async outcome=>{outcomes.push(outcome)}});
    const pending=adapter.searchTicker({community:"stocks",query:"$NVDA"});
    await vi.runAllTimersAsync();
    expect((await pending).records).toEqual([]);
    expect(reserved).toHaveLength(2);
    expect(outcomes).toEqual(["rate_limited","success"]);
  });
});

describe("optional legacy OAuth compatibility",()=>{
  beforeEach(()=>{
    process.env.REDDIT_PROVIDER_MODE="legacy_oauth";
    process.env.REDDIT_CLIENT_ID="client";
    process.env.REDDIT_CLIENT_SECRET="secret";
    process.env.REDDIT_USER_AGENT="web:test-app:v1.0.0 (by /u/tester)";
    process.env.REDDIT_DATA_API_AUTHORIZED="true";
    vi.resetModules();
  });

  it("remains available only when explicitly selected and authorized",async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(response({access_token:"token",expires_in:3600})).mockResolvedValueOnce(response({data:{after:null,children:[{kind:"t3",data:{name:"t3_legacy",subreddit:"stocks",author:"analyst",title:"$NVDA",created_utc:1}}]}}));
    const {LegacyRedditOAuthAdapter}=await import("../adapters/reddit");
    const page=await new LegacyRedditOAuthAdapter(fetchMock as typeof fetch,()=>10_000,async()=>{}).searchTicker({community:"stocks",query:"$NVDA"});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("oauth.reddit.com/r/stocks/search");
    expect(page.records[0]).toMatchObject({externalId:"t3_legacy",type:"post"});
  });

  it("still requires legacy Data API authorization",async()=>{
    process.env.REDDIT_DATA_API_AUTHORIZED="false";
    vi.resetModules();
    const {LegacyRedditOAuthAdapter}=await import("../adapters/reddit");
    expect(await new LegacyRedditOAuthAdapter(vi.fn() as unknown as typeof fetch).validateConfiguration()).toMatchObject({status:"authorization_required"});
  });
});

describe("retry helper",()=>{
  it("honors Retry-After without exceeding the bounded delay cap",async()=>{
    vi.useFakeTimers();
    const {AdapterHttpError,withRetry}=await import("../retry"),delays:number[]=[],operation=vi.fn().mockRejectedValueOnce(new AdapterHttpError("limited",429,true,2_500)).mockResolvedValue("ok"),pending=withRetry(operation,{maxAttempts:2,baseDelayMs:100,maxDelayMs:5_000,onRetry:(_attempt,_error,delay)=>delays.push(delay)});
    await vi.runAllTimersAsync();
    expect(await pending).toBe("ok");
    expect(delays).toEqual([2_500]);
  });
});
