import type { EventMoverLink, MarketSession, TemporalBucket } from "./types";

const dayMs=86_400_000;
const isoDay=(value:string)=>value.slice(0,10);
const dayDifference=(later:string,earlier:string)=>Math.round((Date.parse(`${later}T00:00:00Z`)-Date.parse(`${earlier}T00:00:00Z`))/dayMs);

function nyParts(date:Date) {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  return Object.fromEntries(parts.map(part=>[part.type,part.value])) as Record<string,string>;
}

function easternOffsetHours(date:Date) {
  const name=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",timeZoneName:"shortOffset"}).formatToParts(date).find(x=>x.type==="timeZoneName")?.value??"GMT-5";
  const match=name.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);return match?Number(match[1])+Number(match[2]??0)/60*Math.sign(Number(match[1])):-5;
}

function marketOpenUtc(day:string) { const noon=new Date(`${day}T12:00:00Z`),offset=easternOffsetHours(noon);return new Date(Date.parse(`${day}T09:30:00Z`)-offset*3_600_000); }

export function marketSessionFor(timestamp:string|null):MarketSession {
  if (!timestamp) return "unknown";const date=new Date(timestamp);if(!Number.isFinite(date.getTime()))return"unknown";const parts=nyParts(date),minutes=Number(parts.hour)*60+Number(parts.minute);
  if(minutes<570)return"pre_market";if(minutes<960)return"regular_session";return"after_hours";
}

function relevance(input:{bucket:TemporalBucket;primary:boolean;specific:boolean;formType?:string|null;predates:boolean;corroboratingSources?:number}) {
  const temporal:Record<TemporalBucket,number>={same_session:25,pre_market_same_day:25,after_hours_previous_day:25,within_24h_before:24,"1_to_3_days_before":21,"4_to_7_days_before":15,"8_to_30_days_before":7,after_move:4,unknown:0};
  const authority=input.primary?20:8,specificity=input.specific?15:5,tickerMatch=20,filing=["8-K","8-K/A","424B3","424B5"].includes(input.formType??"")?10:5,predates=input.predates?5:0,corroboration=(input.corroboratingSources??1)>1?5:0;
  return {score:Math.min(100,temporal[input.bucket]+authority+specificity+tickerMatch+filing+predates+corroboration),components:{temporal:temporal[input.bucket],authority,specificity,tickerMatch,filing,predates,corroboration}};
}

export function linkEventToMover(input:{eventAt:string|null;eventDate:string;moverDate:string;isPrimarySource:boolean;specificClassification:boolean;formType?:string|null;corroboratingSources?:number}):EventMoverLink {
  const eventDay=input.eventAt?isoDay(new Date(input.eventAt).toISOString()):isoDay(input.eventDate),calendarDays=dayDifference(input.moverDate,eventDay),session=marketSessionFor(input.eventAt);
  let bucket:TemporalBucket="unknown",relationship:EventMoverLink["relationshipType"]="near_move",minutes:number|null=null,hours:number|null=null,days:number|null=calendarDays;
  if(input.eventAt){const event=new Date(input.eventAt),open=marketOpenUtc(input.moverDate),delta=open.getTime()-event.getTime();minutes=Math.round(delta/60_000);hours=Math.round(delta/36_000)/100;days=Math.round(delta/864_000)/100;
    if(eventDay===input.moverDate){if(session==="pre_market")bucket="pre_market_same_day";else if(session==="regular_session")bucket="same_session";else bucket="after_move";relationship="same_day";}
    else if(calendarDays===1&&session==="after_hours"){bucket="after_hours_previous_day";relationship="preceded_move";}
    else if(delta>0&&delta<=24*3_600_000){bucket="within_24h_before";relationship="preceded_move";}
    else if(delta>0&&delta<=72*3_600_000){bucket="1_to_3_days_before";relationship="preceded_move";}
    else if(delta>0&&delta<=168*3_600_000){bucket="4_to_7_days_before";relationship="preceded_move";}
    else if(delta>0&&delta<=720*3_600_000){bucket="8_to_30_days_before";relationship="preceded_move";}
    else if(delta<0){bucket="after_move";relationship="followed_move";}else relationship="historical_context";
  }else if(calendarDays===0){bucket="unknown";relationship="same_day";}else if(calendarDays>0&&calendarDays<=3){bucket="1_to_3_days_before";relationship="preceded_move";}else if(calendarDays<=7&&calendarDays>0){bucket="4_to_7_days_before";relationship="preceded_move";}else if(calendarDays<=30&&calendarDays>0){bucket="8_to_30_days_before";relationship="preceded_move";}else if(calendarDays<0){bucket="after_move";relationship="followed_move";}else relationship="historical_context";
  const scored=relevance({bucket,primary:input.isPrimarySource,specific:input.specificClassification,formType:input.formType,predates:relationship==="preceded_move",corroboratingSources:input.corroboratingSources});
  return {relationshipType:relationship,eventAt:input.eventAt,moverDate:input.moverDate,minutesBeforeMove:minutes,hoursBeforeMove:hours,daysBeforeMove:days,temporalBucket:bucket,confidence:input.eventAt?.trim()?0.95:0.75,catalystRelevance:scored.score,reason:`The public event ${relationship.replaceAll("_"," ")} and is classified in the ${bucket.replaceAll("_"," ")} temporal bucket. This is temporal association, not causation.`,scoreEvidence:{...scored.components,formulaVersion:"catalyst-relevance-v1",scoreIsCausationProbability:false}};
}
