export type PriceImportStatus="pending"|"running"|"completed"|"partial"|"failed";
export interface RawPriceRecord{[key:string]:unknown}
export interface NormalizedPriceRecord{date:string;openPrice:number|null;highPrice:number|null;lowPrice:number|null;closePrice:number;adjustedClose:number|null;volume:number;trades:number|null;vwap:number|null}
export interface PriceValidationResult{valid:boolean;errors:string[]}
export interface HistoricalDownloadRequest{symbol:string;startDate?:string;endDate?:string;payload?:string}
export interface PriceDataProvider{
 readonly key:string;readonly name:string;
 historicalDownload(request:HistoricalDownloadRequest):Promise<RawPriceRecord[]>;
 incrementalUpdate(request:HistoricalDownloadRequest):Promise<RawPriceRecord[]>;
 normalizePriceRecord(record:RawPriceRecord):NormalizedPriceRecord;
 validateRecord(record:NormalizedPriceRecord):PriceValidationResult;
}
