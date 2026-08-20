import{FinnhubMetadataProvider}from"./finnhub";import{SecCompanyTickersProvider}from"./sec";import{AlphaVantageMetadataProvider}from"./alpha-vantage";import{metadataConfig}from"../config";import type{TickerMetadataProvider}from"../types";
export function allTickerMetadataProviders():TickerMetadataProvider[]{const providers:TickerMetadataProvider[]=[new AlphaVantageMetadataProvider(),new SecCompanyTickersProvider(),new FinnhubMetadataProvider()],rank=new Map(metadataConfig.providerPriority.map((name,index)=>[name,index]));return providers.sort((a,b)=>(rank.get(a.name)??999)-(rank.get(b.name)??999))}
export function configuredTickerMetadataProviders(){return allTickerMetadataProviders().filter(provider=>provider.readiness().configured)}
export function providerReadiness(){return allTickerMetadataProviders().map(provider=>provider.readiness())}
export{AlphaVantageMetadataProvider,FinnhubMetadataProvider,SecCompanyTickersProvider};
