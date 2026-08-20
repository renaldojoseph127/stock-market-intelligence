export type GapBucket="same_next_day"|"2_5_days"|"6_10_days"|"11_30_days"|"31_90_days"|"90_plus_days";
const day=(s:string)=>Date.parse(`${s}T00:00:00Z`)/86400000;
export function appearanceGaps(dates:string[]){const unique=[...new Set(dates)].sort();return unique.slice(1).map((d,i)=>day(d)-day(unique[i]));}
export function gapSummary(dates:string[]){const gaps=appearanceGaps(dates);if(!gaps.length)return{average:null,median:null,minimum:null,maximum:null,gaps};const sorted=[...gaps].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;return{average:gaps.reduce((a,b)=>a+b,0)/gaps.length,median,minimum:sorted[0],maximum:sorted.at(-1)!,gaps};}
export function gapBucket(days:number):GapBucket{return days<=1?"same_next_day":days<=5?"2_5_days":days<=10?"6_10_days":days<=30?"11_30_days":days<=90?"31_90_days":"90_plus_days";}
