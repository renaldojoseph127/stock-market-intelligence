import { describe, expect, it } from "vitest";
import { RepairReviewClassifier, type RepairReviewInput } from "../review-classifier";

const base = (overrides:Partial<RepairReviewInput> = {}):RepairReviewInput => ({ proposalStatus:"pending",isCurrent:true,proposedValue:"212.1",proposalMethod:"decimal_restoration",confidenceScore:.95,originalValue:"2121",rawValue:"2121",findingStatus:"proposed",findingType:"possible_missing_decimal",ruleVersion:"2a2-v1",findingEvidence:{rawPriceToken:"2121",localMedian:205},proposalEvidence:{selectedScale:10},sourceEvidenceAvailable:true,activeSameFieldValues:["212.1"],effectiveValueExists:false,...overrides });

describe("RepairReviewClassifier repair-review-v1", () => {
  const classifier = new RepairReviewClassifier();
  it("assigns Tier A only to deterministic source normalization", () => { const result=classifier.classifyProposal(base({findingType:"thousands_separator_error",proposalMethod:"source_line_reparse",confidenceScore:.99,findingEvidence:{rawLine:"TEST 7.133"},proposedValue:"7133"}));expect(result).toMatchObject({tier:"A",batchApprovalEligible:true,conflict:false,classifierVersion:"repair-review-v1"}); });
  it("assigns high-confidence inferred decimal repair to Tier B", () => { expect(classifier.classifyProposal(base())).toMatchObject({tier:"B",batchApprovalEligible:true}); });
  it("assigns coordinated column realignment to Tier C and blocks ordinary batch approval", () => { expect(classifier.classifyProposal(base({proposalMethod:"column_realignment",findingType:"ocr_alignment_error",confidenceScore:.99,findingEvidence:{rawLine:"AAPL +0.11% 474,317 22,736,610 $6,221,002,094"}}))).toMatchObject({tier:"C",batchApprovalEligible:false}); });
  it("assigns weak or replacement-free proposals to Tier D", () => { expect(classifier.classifyProposal(base({confidenceScore:.75,proposedValue:null}))).toMatchObject({tier:"D",batchApprovalEligible:false}); });
  it("does not treat an empty source-evidence key as strong evidence", () => { expect(classifier.classifyProposal(base({findingEvidence:{rawPriceToken:"   "},proposalEvidence:{rawLine:null}}))).toMatchObject({tier:"D",batchApprovalEligible:false}); });
  it("detects conflicting proposals and effective overlays", () => { const result=classifier.classifyProposal(base({activeSameFieldValues:["212.1","21.21"],effectiveValueExists:true}));expect(result.tier).toBe("D");expect(result.conflictReasons).toEqual(["multiple_active_proposals","effective_value_exists"]); });
  it("treats superseded and original-mismatch proposals as conflicts", () => { const result=classifier.classifyProposal(base({proposalStatus:"superseded",isCurrent:false,rawValue:"2120"}));expect(result.tier).toBe("D");expect(result.conflictReasons).toContain("superseded_proposal");expect(result.conflictReasons).toContain("original_value_mismatch"); });
});
