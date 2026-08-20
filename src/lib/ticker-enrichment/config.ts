const integer=(value:string|undefined,fallback:number,min:number,max:number)=>{const n=Number(value);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback};
export const metadataConfig={
 dailyBudget:integer(process.env.METADATA_DAILY_BUDGET,20,0,10_000),
 syncTimeoutMs:integer(process.env.METADATA_SYNC_TIMEOUT_MS,3500,250,15_000),
 staleDays:integer(process.env.METADATA_STALE_DAYS,180,1,3650),
 maxRetries:integer(process.env.METADATA_MAX_RETRIES,3,1,10),
 notFoundCooldownDays:integer(process.env.METADATA_NOT_FOUND_COOLDOWN_DAYS,30,1,365),
 batchSize:integer(process.env.METADATA_QUEUE_BATCH_SIZE,5,1,10),
 providerPriority:(process.env.METADATA_PROVIDER_PRIORITY??"alpha_vantage,sec_company_tickers,finnhub").split(",").map(x=>x.trim()).filter(Boolean),
};

