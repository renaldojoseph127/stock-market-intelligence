import { describe, expect, it } from "vitest";
import { priorSequence } from "../audit";
import { calculateResolutionImpact, DataQualityResolutionEngine, resolutionConfidenceBand, resolutionPriorityScore } from "../resolution-engine";
import type { QualityAppearanceInput, QualityFindingDraft, SequenceObservation } from "../types";

const input = (overrides:Partial<QualityAppearanceInput> = {}):QualityAppearanceInput => ({
  id:"appearance",tickerId:"ticker",symbol:"TEST",reportDate:"2026-01-10",categoryName:"NASDAQ Most Active",categoryType:"most_active",
  rank:1,price:100,changeAmount:null,changePercent:1,trades:100,volume:1_000,dollarVolume:100_000,
  rawValues:{ line:"TEST 100 +1% 100 1,000 $100,000",price:"100",changePercent:"+1%" },
  neighbors:[1,2,3,4].map((day,index) => ({ id:`prior-${day}`,reportDate:`2026-01-0${day}`,price:10+index,changePercent:1 })),...overrides,
});
const finding = (overrides:Partial<QualityFindingDraft> = {}):QualityFindingDraft => ({ fieldName:"dollar_volume",findingType:"cross_field_inconsistency",severity:"high",originalValue:"1000000",numericOriginalValue:1_000_000,ruleId:"fixture",ruleVersion:"2a2-v1",confidenceScore:.96,evidence:{},...overrides });

describe("Phase 2D confidence and deterministic candidate engine", () => {
  it("uses the documented confidence bands and stable priority factors", () => {
    expect([resolutionConfidenceBand(.9),resolutionConfidenceBand(.7),resolutionConfidenceBand(.699)]).toEqual(["HIGH","MEDIUM","LOW"]);
    expect(resolutionPriorityScore({ fieldName:"price",findingType:"possible_missing_decimal",confidence:.95,totalTickerAppearances:12,deterministicCandidate:true,lookAheadSafe:true })).toBe(87);
    expect(resolutionPriorityScore({ fieldName:"row",findingType:"other",confidence:.5,totalTickerAppearances:1,deterministicCandidate:false,lookAheadSafe:false })).toBe(20);
  });

  it("generates a deterministic cross-field candidate but caps it below bulk-safe confidence", () => {
    const engine = new DataQualityResolutionEngine(), row = input({ dollarVolume:1_000_000 }), f = finding();
    const proposal = engine.generateProposal(row,f,[f]);
    expect(proposal).toMatchObject({ proposalMethod:"cross_field_validation",proposedNumericValue:100_000,confidenceScore:.89 });
    expect(proposal?.evidence).toMatchObject({ lookAheadPolicy:"same_day_source_only",laterPricesUsed:false });
    expect(proposal?.evidence.resolutionWarnings).toHaveLength(2);
  });

  it("does not fabricate cross-field repairs when source fields are themselves flagged", () => {
    const engine = new DataQualityResolutionEngine(), row = input({ dollarVolume:1_000_000 }), f = finding(), priceFinding = finding({ fieldName:"price",findingType:"ticker_sequence_outlier" });
    expect(engine.generateProposal(row,f,[f,priceFinding])).toBeUndefined();
  });

  it("excludes later prices even when they would make a sequence repair appear plausible", () => {
    const future:SequenceObservation = { id:"future",reportDate:"2026-01-11",price:10,changePercent:1 };
    const row = input({ price:1000,dollarVolume:10_000,rawValues:{price:"1000"},neighbors:[future,{id:"p1",reportDate:"2026-01-09",price:900,changePercent:1},{id:"p2",reportDate:"2026-01-08",price:950,changePercent:1}] });
    const f = finding({ fieldName:"price",findingType:"ticker_sequence_outlier",originalValue:"1000",numericOriginalValue:1000 });
    expect(new DataQualityResolutionEngine().generateProposal(row,f,[f])).toBeUndefined();
    expect(priorSequence(row.neighbors ?? [], { id:row.id,report_date:row.reportDate }).map(value => value.id)).toEqual(["p1","p2"]);
  });

  it("decorates deterministic decimal proposals with explicit prior-only audit evidence", () => {
    const f = finding({ fieldName:"price",findingType:"possible_missing_decimal",originalValue:"1000",numericOriginalValue:1000,proposal:{ proposedValue:"10",proposedNumericValue:10,proposalMethod:"decimal_restoration",confidenceScore:.95,reason:"fixture",evidence:{selectedScale:100} } });
    const proposal = new DataQualityResolutionEngine().generateProposal(input({ price:1000 }),f,[f]);
    expect(proposal?.evidence).toMatchObject({ resolutionEngineVersion:"data-quality-resolution-v1",lookAheadPolicy:"prior_observations_only",asOfDate:"2026-01-10",laterOutcomesUsed:false });
  });

  it("calculates before/after impact without changing RAW semantics", () => {
    const impact = calculateResolutionImpact({ fieldName:"change_percent",rawValue:621,proposedValue:6.21,rawPrice:10,rawChangePercent:621,rawVolume:1000,rawDollarVolume:10000 });
    expect(impact).toMatchObject({ rawValueUnchanged:true,effectiveOverlayOnly:true,noLookAhead:true,magnitude:{before:621,after:6.21},historicalResearchPriority:{version:"historical-research-priority-v1",rawScoreUnchanged:true,magnitudePointsBefore:25,magnitudePointsAfter:1.55} });
  });
});
