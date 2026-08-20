import{describe,expect,it}from"vitest";import{QueryPlanner}from"../query-planner";import{ResearchPlanner}from"../research-planner";import{SQLBuilder}from"../sql-builder";
const plan=(question:string)=>new QueryPlanner().createPlan(new ResearchPlanner().analyze(question));
describe("Phase 2C fixed social research intents",()=>{it.each([
 ["Which Reddit posts mentioned NVDA before its mover days?","reddit_before_move"],
 ["Which WallStreetBets mentions appeared before TSLA became a gainer?","wallstreetbets_before_move"],
 ["Show social discussion before AAPL catalyst events","social_before_catalyst"],
 ["Show Reddit discussion after AAPL catalyst events","social_after_catalyst"],
 ["Which accounts mentioned NVDA before mover dates?","accounts_before_move"],
 ["What sentiment appeared before NVDA mover dates?","sentiment_before_move"],
 ["Show attention before NVDA mover days","attention_before_move"],
 ["Compare Reddit and WallStreetBets communities","community_comparison"],
 ["Which accounts repeatedly discussed the same ticker?","repeat_account_ticker"],
 ["Which movers had social attention without an identified catalyst?","social_without_identified_catalyst"],
 ])("routes %s through the parameterized social RPC",(question,intent)=>{const value=plan(question);expect(value.intent).toBe(intent);expect(new SQLBuilder().build(value).rpc).toBe("execute_social_research_query");expect(value.assumptions.join(" ")).toMatch(/explicitly researched|timing does not establish/i)})});
