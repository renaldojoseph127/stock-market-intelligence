import { ANALYTICS_CONFIG } from "./config";
export function classifyMover(uniqueDays:number,lastGap:number|null){if(uniqueDays>=ANALYTICS_CONFIG.frequentMoverUniqueDays)return"frequent_mover";if(uniqueDays<=1)return"new_mover";if(lastGap!=null&&lastGap<=ANALYTICS_CONFIG.recentRepeatMaxDays)return"recent_repeat";return"returning_mover";}
