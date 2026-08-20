import { MoverScoringOverlay } from "@/components/mover-scoring-overlay";
import { MoverPriceOutcome } from "@/components/mover-price-outcome";
import { getMoverAppearance } from "@/lib/account-intelligence/queries";
export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){const{id}=await params,{data}=await getMoverAppearance(id);return <>{children}{data&&<MoverScoringOverlay tickerId={data.ticker_id} reportDate={data.report_date}/>}<MoverPriceOutcome appearanceId={id}/></>}
