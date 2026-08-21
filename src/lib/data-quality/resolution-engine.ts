import type { QualityAppearanceInput, QualityFindingDraft, QualityProposalDraft, SequenceObservation } from "./types";

export const DATA_QUALITY_RESOLUTION_VERSION = "data-quality-resolution-v1";
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const relativeError = (value: number, expected: number) => expected === 0 ? Infinity : Math.abs(value - expected) / Math.abs(expected);
const finite = (value: unknown): number | null => Number.isFinite(Number(value)) ? Number(value) : null;
const rawToken = (input: QualityAppearanceInput, field: string) => String(input.rawValues?.[field] ?? "");

export function resolutionConfidenceBand(value: number): ConfidenceBand {
  return value >= .9 ? "HIGH" : value >= .7 ? "MEDIUM" : "LOW";
}

export function resolutionPriorityScore(input: {
  fieldName: string;
  findingType: string;
  confidence: number;
  totalTickerAppearances: number;
  deterministicCandidate: boolean;
  lookAheadSafe: boolean;
}) {
  const field = ({ change_percent: 25, price: 25, dollar_volume: 20, volume: 15, trades: 10 } as Record<string, number>)[input.fieldName] ?? 5;
  const finding = ({ possible_column_shift: 20, ocr_alignment_error: 20, possible_missing_decimal: 18, cross_field_inconsistency: 15, ticker_sequence_outlier: 10 } as Record<string, number>)[input.findingType] ?? 5;
  return Math.min(100, field + Math.round(input.confidence * 20) + finding + (input.totalTickerAppearances > 1 ? 10 : 0) + (input.deterministicCandidate && input.lookAheadSafe ? 15 : 0));
}

function resolutionEvidence(evidence: Record<string, unknown>, input: QualityAppearanceInput, warnings: string[], policy: "prior_observations_only" | "same_day_source_only") {
  return { ...evidence, resolutionEngineVersion: DATA_QUALITY_RESOLUTION_VERSION, lookAheadPolicy: policy, asOfDate: input.reportDate, futureReturnsUsed: false, laterPricesUsed: false, laterDiscussionUsed: false, laterOutcomesUsed: false, resolutionWarnings: warnings };
}

function priorPrices(input: QualityAppearanceInput) {
  const asOf = Date.parse(input.reportDate);
  return (input.neighbors ?? [])
    .filter((row: SequenceObservation) => Date.parse(row.reportDate) < asOf && row.price != null && row.price > 0)
    .sort((a, b) => Date.parse(b.reportDate) - Date.parse(a.reportDate))
    .slice(0, 8)
    .map(row => row.price as number);
}

export class DataQualityResolutionEngine {
  readonly version = DATA_QUALITY_RESOLUTION_VERSION;

  generateCandidates(input: QualityAppearanceInput, findings: QualityFindingDraft[]) {
    return findings.map(finding => ({ ...finding, proposal: this.generateProposal(input, finding, findings) ?? finding.proposal }));
  }

  generateProposal(input: QualityAppearanceInput, finding: QualityFindingDraft, findings: QualityFindingDraft[]): QualityProposalDraft | undefined {
    if (finding.proposal) {
      const policy = finding.fieldName === "change_percent" ? "same_day_source_only" : finding.proposal.proposalMethod === "column_realignment" ? "same_day_source_only" : "prior_observations_only";
      const warnings = finding.proposal.proposalMethod === "column_realignment"
        ? ["Coordinated row approval is required; an unknown price must remain unknown."]
        : (Array.isArray(finding.proposal.evidence.resolutionWarnings) ? finding.proposal.evidence.resolutionWarnings as string[] : []);
      return { ...finding.proposal, evidence: resolutionEvidence(finding.proposal.evidence, input, warnings, policy) };
    }
    if (finding.findingType === "cross_field_inconsistency" && finding.fieldName === "dollar_volume") return this.crossFieldCandidate(input, finding, findings);
    if (finding.findingType === "ticker_sequence_outlier" && finding.fieldName === "price") return this.sequenceCandidate(input, finding, findings);
    return undefined;
  }

  private crossFieldCandidate(input: QualityAppearanceInput, finding: QualityFindingDraft, findings: QualityFindingDraft[]): QualityProposalDraft | undefined {
    if (findings.some(value => ["price", "volume"].includes(value.fieldName))) return undefined;
    const price = finite(input.price), volume = finite(input.volume), observed = finite(input.dollarVolume);
    if (price == null || price <= 0 || volume == null || volume <= 0 || observed == null || observed <= 0) return undefined;
    const proposed = price * volume, ratio = observed / proposed, magnitude = Math.max(ratio, 1 / ratio);
    if (magnitude < 8) return undefined;
    const confidence = Math.min(.89, finding.confidenceScore);
    const warnings = ["Reported dollar volume can use a methodology different from last price multiplied by volume.", "Manual review is required; this candidate is never bulk eligible."];
    return {
      proposedValue: String(proposed), proposedNumericValue: proposed, proposalMethod: "cross_field_validation", confidenceScore: confidence,
      reason: "Same-row RAW price multiplied by RAW volume provides a deterministic consistency candidate; it is assistance, not asserted truth.",
      evidence: resolutionEvidence({ price, volume, observedDollarVolume: observed, proposedPriceTimesVolume: proposed, observedToProposedRatio: ratio }, input, warnings, "same_day_source_only"),
    };
  }

  private sequenceCandidate(input: QualityAppearanceInput, finding: QualityFindingDraft, findings: QualityFindingDraft[]): QualityProposalDraft | undefined {
    if (findings.some(value => value.fieldName === "price" && value.findingType === "possible_missing_decimal")) return undefined;
    const price = finite(input.price), prices = priorPrices(input), token = rawToken(input, "price");
    if (price == null || price <= 0 || prices.length < 3 || /[.,]/.test(token)) return undefined;
    const center = median(prices), implied = input.volume && input.dollarVolume ? input.dollarVolume / input.volume : null;
    const candidates = [10, 100, 1000].flatMap(scale => [{ scale, value: price / scale }, { scale: 1 / scale, value: price * scale }])
      .map(candidate => ({ ...candidate, priorError: relativeError(candidate.value, center), impliedError: implied == null ? null : relativeError(candidate.value, implied) }))
      .sort((a, b) => (a.priorError + (a.impliedError ?? 1)) - (b.priorError + (b.impliedError ?? 1)));
    const best = candidates[0];
    if (!best || best.priorError > .2 || best.impliedError == null || best.impliedError > .35) return undefined;
    const confidence = Math.min(.89, finding.confidenceScore);
    const warnings = ["Splits and other corporate actions can create legitimate price-sequence changes.", "Manual review is required; this candidate is never bulk eligible."];
    return {
      proposedValue: String(best.value), proposedNumericValue: best.value, proposalMethod: "cross_day_continuity", confidenceScore: confidence,
      reason: "A power-of-ten adjustment matches prior-only prices and the same-row dollar-volume-implied price; later observations were excluded.",
      evidence: resolutionEvidence({ priorMedian: center, priorObservationCount: prices.length, selectedScale: best.scale, priorError: best.priorError, impliedPrice: implied, impliedError: best.impliedError }, input, warnings, "prior_observations_only"),
    };
  }
}

export function calculateResolutionImpact(input: {
  fieldName: string;
  rawValue: number | null;
  proposedValue: number | null;
  rawPrice: number | null;
  rawChangePercent: number | null;
  rawVolume: number | null;
  rawDollarVolume: number | null;
}) {
  const price = input.fieldName === "price" ? input.proposedValue : input.rawPrice;
  const change = input.fieldName === "change_percent" ? input.proposedValue : input.rawChangePercent;
  const volume = input.fieldName === "volume" ? input.proposedValue : input.rawVolume;
  const dollarVolume = input.fieldName === "dollar_volume" ? input.proposedValue : input.rawDollarVolume;
  const points = (value: number | null) => value == null ? 0 : Math.min(25, Math.round(Math.abs(value) / 4 * 100) / 100);
  return {
    rawValueUnchanged: true,
    effectiveOverlayOnly: true,
    magnitude: { before: input.rawChangePercent == null ? null : Math.abs(input.rawChangePercent), after: change == null ? null : Math.abs(change) },
    historicalResearchPriority: { version: "historical-research-priority-v1", rawScoreUnchanged: true, magnitudePointsBefore: points(input.rawChangePercent), magnitudePointsAfter: points(change) },
    historicalMoverSimilarity: { version: "historical-mover-similarity-v1", rawSimilarityUnchanged: true, affectedDimensions: input.fieldName === "price" ? ["price_band"] : input.fieldName === "change_percent" ? ["magnitude"] : ["volume", "dollar_volume"].includes(input.fieldName) ? ["liquidity"] : [] },
    priceVolume: { priceBefore: input.rawPrice, priceAfter: price, volumeBefore: input.rawVolume, volumeAfter: volume, dollarVolumeBefore: input.rawDollarVolume, dollarVolumeAfter: dollarVolume, calculatedBefore: input.rawPrice != null && input.rawVolume != null ? input.rawPrice * input.rawVolume : null, calculatedAfter: price != null && volume != null ? price * volume : null },
    noLookAhead: true,
  };
}
