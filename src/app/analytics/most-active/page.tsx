import { AnalyticsFilters,ExportLink,Pagination,SpecializedTable } from "@/components/analytics-components";
import { DatabaseNotice } from "@/components/database-notice";
import { PageHeader } from "@/components/ui";
import { analyticsRows,getAnalyticsCategories } from "@/lib/analytics/queries";

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const raw=await searchParams,p={...raw,mode:"most_active"};
 const [frequent,toGainer,toDecliner,repeat,volume,dollars,categories]=await Promise.all([
  analyticsRows("research_priority_detail",{...p,sort:"most_active_appearances"}),
  analyticsRows("research_priority_detail",{...p,subset:"active_gainer",sort:"most_active_to_gainer_count"}),
  analyticsRows("research_priority_detail",{...p,subset:"active_decliner",sort:"most_active_to_decliner_count"}),
  analyticsRows("research_priority_detail",{...p,subset:"repeat_active",sort:"most_active_appearances"}),
  analyticsRows("research_priority_detail",{...p,sort:"avg_volume"}),
  analyticsRows("research_priority_detail",{...p,sort:"avg_dollar_volume"}),getAnalyticsCategories()
 ]);
 const sections=[["Most Frequent Most-Active Tickers",frequent,"most_active_appearances","Most Active Appearances"],["Most Active → Gainer Transitions",toGainer,"most_active_to_gainer_count","Transitions"],["Most Active → Decliner Transitions",toDecliner,"most_active_to_decliner_count","Transitions"],["Repeated Most Active Appearances",repeat,"most_active_appearances","Most Active Appearances"],["Highest Average Volume",volume,"avg_volume","Average Volume"],["Highest Average Dollar Volume",dollars,"avg_dollar_volume","Average Dollar Volume"]] as const;
 return <><PageHeader title="Most Active Analytics" description="Repeated activity, liquidity, and subsequent category transitions." action={<ExportLink kind="most-active" p={p}/>}/><DatabaseNotice configured={frequent.configured} error={frequent.error||toGainer.error}/><AnalyticsFilters p={p} categories={categories}/>{sections.map(([title,result,metric,label])=><section className="mb-8" key={title}><h2 className="mb-3 font-semibold">{title}</h2><SpecializedTable rows={result.data} metric={metric} label={label}/></section>)}<Pagination path="/analytics/most-active" p={raw} page={frequent.page} hasNext={frequent.data.length===frequent.pageSize}/></>;
}
