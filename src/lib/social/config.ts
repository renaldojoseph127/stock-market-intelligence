const integer=(value:string|undefined,fallback:number,min:number,max:number)=>{
 const parsed=Number(value);return Number.isInteger(parsed)?Math.max(min,Math.min(max,parsed)):fallback;
};

export const socialResearchConfig={
 redditProviderMode:(process.env.REDDIT_PROVIDER_MODE?.trim().toLowerCase()??"disabled")as"disabled"|"devvit_bridge"|"legacy_oauth",
 devvitBridgeUrl:process.env.DEVVIT_REDDIT_BRIDGE_URL?.trim()??"",
 devvitBridgeToken:(process.env.DEVVIT_REDDIT_MANAGED_TOKEN??process.env.DEVVIT_REDDIT_BRIDGE_TOKEN)?.trim()??"",
 devvitAccessApproved:process.env.DEVVIT_REDDIT_ACCESS_APPROVED?.toLowerCase()==="true",
 redditClientId:process.env.REDDIT_CLIENT_ID?.trim()??"",
 redditClientSecret:process.env.REDDIT_CLIENT_SECRET?.trim()??"",
 redditUserAgent:process.env.REDDIT_USER_AGENT?.trim()??"",
 redditAuthorized:process.env.REDDIT_DATA_API_AUTHORIZED?.toLowerCase()==="true",
 requestsPerMinute:integer(process.env.REDDIT_REQUESTS_PER_MINUTE,60,1,90),
 maxRetries:integer(process.env.REDDIT_MAX_RETRIES,3,1,5),
 cacheTtlHours:integer(process.env.REDDIT_CACHE_TTL_HOURS,6,1,168),
 requestTimeoutMs:integer(process.env.REDDIT_SYNC_TIMEOUT_MS,20_000,2_000,60_000),
 dailyRequestBudget:integer(process.env.SOCIAL_RESEARCH_DAILY_REQUEST_BUDGET,100,1,10_000),
 batchSize:integer(process.env.SOCIAL_RESEARCH_BATCH_SIZE,1,1,5),
 maxQueryPages:integer(process.env.SOCIAL_RESEARCH_MAX_QUERY_PAGES,3,1,10),
 retentionHours:integer(process.env.SOCIAL_RESEARCH_RETENTION_HOURS,48,1,720),
};

export function legacyRedditConfiguration(){
 const missing=[!socialResearchConfig.redditClientId&&"REDDIT_CLIENT_ID",!socialResearchConfig.redditClientSecret&&"REDDIT_CLIENT_SECRET",!socialResearchConfig.redditUserAgent&&"REDDIT_USER_AGENT"].filter(Boolean);
 if(missing.length)return{ready:false,status:"authentication_required" as const,message:`Missing server-only configuration: ${missing.join(", ")}.`};
 if(!/^[^:]+:[^:]+:[^\s]+ \(by \/u\/[A-Za-z0-9_-]+\)$/.test(socialResearchConfig.redditUserAgent))return{ready:false,status:"unconfigured" as const,message:"REDDIT_USER_AGENT must use <platform>:<app ID>:<version> (by /u/username)."};
 if(!socialResearchConfig.redditAuthorized)return{ready:false,status:"authorization_required" as const,message:"Reddit Data API authorization has not been acknowledged. Set REDDIT_DATA_API_AUTHORIZED=true only after Reddit has authorized this research use."};
 return{ready:true,status:"available" as const,message:"Optional legacy Reddit OAuth is configured and explicit Data API authorization is acknowledged.",mode:"legacy_oauth"as const};
}

export function devvitRedditConfiguration(){
 const missing=[!socialResearchConfig.devvitBridgeUrl&&"DEVVIT_REDDIT_BRIDGE_URL",!socialResearchConfig.devvitBridgeToken&&"DEVVIT_REDDIT_MANAGED_TOKEN"].filter(Boolean);
 if(missing.length)return{ready:false,status:"authentication_required"as const,message:`Missing server-only Devvit bridge configuration: ${missing.join(", ")}.`};
 let url:URL;try{url=new URL(socialResearchConfig.devvitBridgeUrl)}catch{return{ready:false,status:"unconfigured"as const,message:"DEVVIT_REDDIT_BRIDGE_URL must be a valid URL."}}
 if(url.protocol!=="https:"&&!(["localhost","127.0.0.1","::1"].includes(url.hostname)&&url.protocol==="http:"))return{ready:false,status:"unconfigured"as const,message:"DEVVIT_REDDIT_BRIDGE_URL must use HTTPS outside local development."};
 if(!url.pathname.startsWith("/external/"))return{ready:false,status:"unconfigured"as const,message:"DEVVIT_REDDIT_BRIDGE_URL must target a declared /external/ Devvit endpoint."};
 if(!socialResearchConfig.devvitBridgeToken.startsWith("devvit_at_"))return{ready:false,status:"authentication_required"as const,message:"DEVVIT_REDDIT_MANAGED_TOKEN must be a server-only Devvit managed token."};
 if(!socialResearchConfig.devvitAccessApproved)return{ready:false,status:"authorization_required"as const,message:"Devvit external-endpoint and Reddit research/data-handling approval has not been acknowledged. Set DEVVIT_REDDIT_ACCESS_APPROVED=true only after Reddit approves this use."};
 return{ready:true,status:"available"as const,message:"The read-only Reddit Devvit bridge is configured with a managed token.",mode:"devvit_bridge"as const};
}

export function redditConfiguration(){
 if(!["disabled","devvit_bridge","legacy_oauth"].includes(socialResearchConfig.redditProviderMode))return{ready:false,status:"unconfigured"as const,message:"REDDIT_PROVIDER_MODE must be disabled, devvit_bridge, or legacy_oauth."};
 if(socialResearchConfig.redditProviderMode==="devvit_bridge")return devvitRedditConfiguration();
 if(socialResearchConfig.redditProviderMode==="legacy_oauth")return legacyRedditConfiguration();
 return{ready:false,status:"unconfigured"as const,message:"Reddit collection is disabled. Set REDDIT_PROVIDER_MODE only after the selected access path is approved and deployed.",mode:"disabled"as const};
}
