import { describe, expect, it } from "vitest";
import { classifySecFiling } from "../classification";

describe("deterministic catalyst-v1 SEC classification",()=>{
  it("records every filing as observed SEC evidence",()=>{expect(classifySecFiling({formType:"10-Q"})[0]).toMatchObject({candidateType:"sec_filing",confidence:1});expect(classifySecFiling({formType:"10-Q"})[0].reason).toMatch(/does not assert.*caused/i)});
  it("maps explicit 8-K items without inferring unavailable content",()=>{const rows=classifySecFiling({formType:"8-K",items:["2.02","5.02"]});expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({candidateSubtype:"financial_results"}),expect.objectContaining({candidateSubtype:"management_change"})]));expect(classifySecFiling({formType:"8-K",items:[]})).toHaveLength(1)});
  it("treats registration statements as potential offering evidence, not proven dilution",()=>{const row=classifySecFiling({formType:"S-3"}).find(x=>x.candidateSubtype==="shelf_registration");expect(row?.confidence).toBeLessThan(1);expect(row?.reason).toMatch(/does not prove issuance, dilution/i)});
  it("recognizes amendments and supported prospectus forms",()=>{for(const form of["S-1/A","S-3/A","F-1","F-3/A","424B3","424B5"])expect(classifySecFiling({formType:form}).some(x=>x.candidateType==="offering")).toBe(true)});
});
