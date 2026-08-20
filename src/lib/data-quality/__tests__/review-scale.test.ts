import { describe, expect, it } from "vitest";
import { RepairReviewClassifier, REPAIR_REVIEW_BATCH_MAX, type RepairReviewInput } from "../review-classifier";

describe("production-shaped repair review scale", () => {
  it("classifies 1,514 proposals over 6,458 findings and 3,906 affected observations in bounded pages", () => {
    const classifier=new RepairReviewClassifier(), findings=Array.from({length:6458},(_,index)=>({id:`finding-${index}`,appearanceId:`appearance-${index%3906}`}));
    const proposals:RepairReviewInput[]=Array.from({length:1514},(_,index)=>index<880?{proposalStatus:"pending",isCurrent:true,proposedValue:index%5===0?null:String(index),proposalMethod:"column_realignment",confidenceScore:.99,originalValue:String(index),rawValue:String(index),findingStatus:"proposed",findingType:index%5===0?"possible_column_shift":"ocr_alignment_error",ruleVersion:"2a2-v1",findingEvidence:{rawLine:"TEST +0.11% 1 2 $3"},sourceEvidenceAvailable:true,activeSameFieldValues:[String(index)]}:index<1192?{proposalStatus:"pending",isCurrent:true,proposedValue:String(index/10),proposalMethod:"decimal_restoration",confidenceScore:.91,originalValue:String(index),rawValue:String(index),findingStatus:"proposed",findingType:"possible_missing_decimal",ruleVersion:"2a2-v1",findingEvidence:{rawPriceToken:String(index)},sourceEvidenceAvailable:true,activeSameFieldValues:[String(index/10)]}:{proposalStatus:"pending",isCurrent:true,proposedValue:String(index/10),proposalMethod:"decimal_restoration",confidenceScore:.79,originalValue:String(index),rawValue:String(index),findingStatus:"proposed",findingType:"possible_extra_decimal",ruleVersion:"2a2-v1",findingEvidence:{rawPriceToken:String(index)},sourceEvidenceAvailable:true,activeSameFieldValues:[String(index/10)]});
    const classified=proposals.map(proposal=>classifier.classifyProposal(proposal));
    expect(findings).toHaveLength(6458);expect(new Set(findings.map(finding=>finding.appearanceId))).toHaveLength(3906);expect(classified).toHaveLength(1514);
    expect(classified.filter(value=>value.tier==="C")).toHaveLength(880);expect(classified.filter(value=>value.tier==="B")).toHaveLength(312);expect(classified.filter(value=>value.tier==="D")).toHaveLength(322);
    expect(Math.ceil(classified.length/50)).toBe(31);expect(REPAIR_REVIEW_BATCH_MAX).toBe(25);expect(classified.slice(0,100)).toHaveLength(100);
  });
});
