import type{SocialSourceAdapter}from"../types";import{RedditSocialProvider}from"./reddit";import{InvestorsHubAdapter,MotleyFoolCommunityAdapter,SeekingAlphaCommunityAdapter,StocktwitsAdapter,YahooFinanceCommunityAdapter}from"./providers";
const adapters:SocialSourceAdapter[]=[new RedditSocialProvider(),new StocktwitsAdapter(),new YahooFinanceCommunityAdapter(),new InvestorsHubAdapter(),new SeekingAlphaCommunityAdapter(),new MotleyFoolCommunityAdapter()];
export const socialAdapters=new Map(adapters.map(a=>[a.key,a]));export function getSocialAdapter(key:string){return socialAdapters.get(key)}
