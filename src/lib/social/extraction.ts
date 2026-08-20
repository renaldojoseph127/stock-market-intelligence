import type{TickerMention}from"./types";

const AMBIGUOUS=new Set(["A","ALL","AM","AN","AND","ARE","AS","AT","BE","CAN","CEO","CFO","DD","ETF","FOR","FYI","GDP","HAS","HE","I","IMO","IPO","IS","IT","LOVE","NOT","NOW","OF","ON","OR","SEC","THE","THIS","TO","USA","USD","WSB","YOU","AI"]);
const FINANCIAL=/\b(stock|share|shares|ticker|buy|bought|sell|sold|price|market|earnings|calls?|puts?|options?|bullish|bearish|long|short|volume|float|nasdaq|nyse|otc|portfolio|position|invest(?:ing|ment)?|company|equity)\b/i;
const excerpt=(text:string,index:number,length:number)=>text.slice(Math.max(0,index-100),Math.min(text.length,index+length+120)).replace(/\s+/g," ").trim();

export interface ResolverTicker{symbol:string;companyName?:string|null;aliases?:string[]}
export class TickerMentionResolver{
 private bySymbol=new Map<string,ResolverTicker>();
 constructor(tickers:Iterable<string|ResolverTicker>){for(const item of tickers){const value=typeof item==="string"?{symbol:item}:item;this.bySymbol.set(value.symbol.toUpperCase(),value)}}
 resolve(text:string){const found=new Map<string,TickerMention>(),unresolved=new Map<string,TickerMention>();const remember=(bucket:Map<string,TickerMention>,hit:TickerMention)=>{const prior=bucket.get(hit.symbol);if(!prior||hit.confidence>prior.confidence)bucket.set(hit.symbol,hit)};
  for(const match of text.matchAll(/\$([A-Z][A-Z0-9.-]{0,14})\b/g)){const symbol=match[1].toUpperCase(),hit={symbol,mentionText:match[0],index:match.index??0,method:"cashtag" as const,confidence:.99,contextExcerpt:excerpt(text,match.index??0,match[0].length),reason:"Explicit cashtag"};remember(this.bySymbol.has(symbol)?found:unresolved,hit)}
  for(const match of text.matchAll(/\b(?:NASDAQ|NYSE|AMEX|OTC)\s*:\s*([A-Z][A-Z0-9.-]{0,14})\b/g)){const symbol=match[1].toUpperCase(),hit={symbol,mentionText:match[0],index:match.index??0,method:"exchange_prefix" as const,confidence:.99,contextExcerpt:excerpt(text,match.index??0,match[0].length),reason:"Explicit exchange-prefixed symbol"};remember(this.bySymbol.has(symbol)?found:unresolved,hit)}
  for(const match of text.matchAll(/\b([A-Z][A-Z0-9.-]{0,9})\b/g)){const symbol=match[1].toUpperCase(),index=match.index??0;if(found.has(symbol)||!this.bySymbol.has(symbol))continue;const context=excerpt(text,index,match[0].length),ambiguous=AMBIGUOUS.has(symbol);if(ambiguous&&!FINANCIAL.test(context))continue;if(!ambiguous&&symbol.length===1&&!FINANCIAL.test(context))continue;remember(found,{symbol,mentionText:match[0],index,method:"validated_plain",confidence:ambiguous?.72:.84,contextExcerpt:context,reason:ambiguous?"Known symbol with nearby financial context":"Known ticker-universe symbol"})}
  const lower=text.toLowerCase();for(const ticker of this.bySymbol.values()){if(found.has(ticker.symbol.toUpperCase()))continue;for(const name of [ticker.companyName,...(ticker.aliases??[])]){const clean=name?.trim();if(!clean||clean.length<4)continue;const index=lower.indexOf(clean.toLowerCase());if(index>=0){remember(found,{symbol:ticker.symbol.toUpperCase(),mentionText:text.slice(index,index+clean.length),index,method:"company_name",confidence:.9,contextExcerpt:excerpt(text,index,clean.length),reason:"Known company-name match"});break}}}
  return{resolved:[...found.values()].sort((a,b)=>a.index-b.index),unresolved:[...unresolved.values()].sort((a,b)=>a.index-b.index)};
 }
}
export function extractTickerMentions(text:string,universe:Iterable<string>){return new TickerMentionResolver(universe).resolve(text)}
