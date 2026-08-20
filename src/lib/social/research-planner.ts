import{createHash}from"node:crypto";
export const DEFAULT_REDDIT_COMMUNITIES=["wallstreetbets","stocks","investing"]as const;
export const INITIAL_REDDIT_COMMUNITIES=[...DEFAULT_REDDIT_COMMUNITIES,"personalfinance","cryptocurrency"]as const;
export interface SocialResearchPlanInput{symbol:string;companyName?:string|null;community?:string|null;dateFrom:string;dateTo:string;appearanceId?:string|null;reason?:string;maxQueries?:number}
export interface SocialResearchQuery{community:string;query:string;dateFrom:string;dateTo:string;cacheKey:string}
const companyQuery=(value:string)=>{const cleaned=value.trim().replace(/["\\]/g,"").replace(/\s+(corporation|incorporated|inc\.?|corp\.?|company|co\.?|limited|ltd\.?)$/i,"").trim();return cleaned.includes(" ")?`"${cleaned}"`:cleaned};
export class SocialResearchPlanner{
  plan(input:SocialResearchPlanInput){const symbol=input.symbol.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))throw new Error("A valid ticker symbol is required");const communities=input.community?[input.community.toLowerCase()]:[...DEFAULT_REDDIT_COMMUNITIES],terms=[symbol,`$${symbol}`];if(input.companyName?.trim()){const term=companyQuery(input.companyName);if(term)terms.push(term)}const queries:SocialResearchQuery[]=[];for(const community of communities){if(!/^[a-z0-9_]{2,32}$/i.test(community))throw new Error(`Invalid bounded Reddit community: ${community}`);for(const query of terms){const canonical=JSON.stringify(["reddit",community,query,input.dateFrom,input.dateTo]);queries.push({community,query,dateFrom:input.dateFrom,dateTo:input.dateTo,cacheKey:createHash("sha256").update(canonical).digest("hex")})}}
  return queries.slice(0,Math.max(1,Math.min(input.maxQueries??9,15)));
 }
}
