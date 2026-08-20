import { AccountScoringIntelligence } from "@/components/account-scoring-intelligence";
import { AccountMarketHistory } from "@/components/account-market-history";
export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){const{id}=await params;return <>{children}<AccountScoringIntelligence accountId={id}/><AccountMarketHistory accountId={id}/></>}
