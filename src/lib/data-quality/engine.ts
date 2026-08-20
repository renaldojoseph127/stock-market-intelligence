import type { QualityAppearanceInput, QualityAuditResult, QualityFindingDraft, QualityProposalDraft, QualitySeverity, SequenceObservation } from "./types";

export const QUALITY_RULE_VERSION = "2a2-v1";
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const finite = (value: unknown): number | null => { const number = Number(value); return Number.isFinite(number) ? number : null; };
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
export const medianAbsoluteDeviation = (values: number[]) => { if (!values.length) return null; const center = median(values); return median(values.map(value => Math.abs(value - center))); };
const relativeError = (value: number, expected: number) => expected === 0 ? Infinity : Math.abs(value - expected) / Math.abs(expected);
const textValue = (value: unknown) => value == null ? null : String(value);
const numericToken = (value: unknown) => String(value ?? "").replace(/[$,%\s]/g, "").replace(/,/g, "");
const countToken = (value: string) => Number(value.replace(/[.,]/g, ""));

export class HistoricalDataQualityEngine {
  readonly ruleVersion = QUALITY_RULE_VERSION;

  analyzeAppearance(input: QualityAppearanceInput): QualityAuditResult {
    const columnShift = this.detectColumnShift(input);
    const findings = [
      ...columnShift,
      ...this.detectPossibleDecimalLoss(input),
      ...this.detectPossibleExtraDecimal(input),
      ...this.detectImpossiblePrice(input),
      ...this.detectImpossiblePercentage(input),
      ...this.detectImpossibleCounts(input),
      ...(columnShift.length ? [] : this.analyzeCrossFieldConsistency(input)),
      ...this.analyzeTickerSequence(input, input.neighbors ?? []),
    ];
    const unique = new Map(findings.map(finding => [`${finding.fieldName}:${finding.ruleId}:${finding.ruleVersion}`, finding]));
    return { appearanceId: input.id, findings: [...unique.values()] };
  }

  rebuildFindings(inputs: QualityAppearanceInput[]) { return inputs.map(input => this.analyzeAppearance(input)); }

  scoreFinding(severity: QualitySeverity, signals: number[]) {
    const base = { info: .45, low: .55, medium: .65, high: .75, critical: .86 }[severity];
    return Number(clamp(base + signals.reduce((sum, value) => sum + clamp(value) * .04, 0), .01, .99).toFixed(4));
  }

  createProposal(proposal: QualityProposalDraft) { return proposal; }

  detectPossibleDecimalLoss(input: QualityAppearanceInput): QualityFindingDraft[] {
    if (input.price == null || input.price <= 0 || this.hasColumnShiftSignature(input)) return [];
    const baseline = this.localPriceBaseline(input.neighbors ?? []), raw = textValue(input.rawValues?.price ?? input.price) ?? "";
    if (baseline == null || input.price / baseline < 6 || /[.,]/.test(raw)) return [];
    const implied = input.volume && input.dollarVolume ? input.dollarVolume / input.volume : null;
    const candidates = [10, 100, 1000].map(scale => ({ scale, value: input.price! / scale }))
      .map(candidate => ({ ...candidate, localError: relativeError(candidate.value, baseline), impliedError: implied ? relativeError(candidate.value, implied) : null }))
      .sort((a, b) => (a.localError + (a.impliedError ?? a.localError)) - (b.localError + (b.impliedError ?? b.localError)));
    const best = candidates[0];
    if ((this.isPennyContext(input) || input.categoryType === "biggest_gainer") && implied == null) return [];
    if (best.localError > .45 || (best.impliedError != null && best.impliedError > .35)) return [];
    const localStrength = 1 - best.localError, impliedStrength = best.impliedError == null ? 0 : 1 - best.impliedError;
    const confidence = Math.min(.98, this.scoreFinding("high", [localStrength, impliedStrength, 1, input.price / baseline >= 50 ? 1 : .5]));
    const evidence = { localMedian: baseline, localObservationCount: this.priceNeighbors(input.neighbors ?? []).length, currentToMedianRatio: input.price / baseline, impliedPriceFromDollarVolume: implied, candidates, rawPriceToken: raw, sourceLine: input.rawValues?.line ?? null, ambiguity: "Decimal placement is inferred; source image/manual review remains required." };
    return [{ fieldName: "price", findingType: "possible_missing_decimal", severity: input.price / baseline >= 50 ? "critical" : "high", originalValue: textValue(input.price), numericOriginalValue: input.price, ruleId: "price_missing_decimal_v1", ruleVersion: this.ruleVersion, confidenceScore: confidence, evidence,
      proposal: this.createProposal({ proposedValue: String(best.value), proposedNumericValue: best.value, proposalMethod: "decimal_restoration", confidenceScore: confidence, reason: `Restoring ${Math.log10(best.scale)} decimal place(s) best matches the robust local median${implied == null ? "" : " and dollar-volume-implied price"}. Human approval is required.`, evidence: { selectedScale: best.scale, localError: best.localError, impliedError: best.impliedError } }) }];
  }

  detectPossibleExtraDecimal(input: QualityAppearanceInput): QualityFindingDraft[] {
    if (input.price == null || input.price <= 0 || this.hasColumnShiftSignature(input)) return [];
    const baseline = this.localPriceBaseline(input.neighbors ?? []), raw = textValue(input.rawValues?.price ?? input.price) ?? "";
    if (baseline == null || input.price / baseline > .15 || !raw.includes(".")) return [];
    const candidates = [10, 100, 1000].map(scale => ({ scale, value: input.price! * scale })).map(candidate => ({ ...candidate, error: relativeError(candidate.value, baseline) })).sort((a, b) => a.error - b.error);
    if (candidates[0].error > .35) return [];
    const implied = input.volume && input.dollarVolume ? input.dollarVolume / input.volume : null;
    if ((this.isPennyContext(input) || input.categoryType === "biggest_gainer") && (implied == null || relativeError(candidates[0].value, implied) > .35)) return [];
    const best = candidates[0], confidence = this.scoreFinding("medium", [1 - best.error, 1]);
    return [{ fieldName: "price", findingType: "possible_extra_decimal", severity: "medium", originalValue: textValue(input.price), numericOriginalValue: input.price, ruleId: "price_extra_decimal_v1", ruleVersion: this.ruleVersion, confidenceScore: confidence, evidence: { localMedian: baseline, rawPriceToken: raw, candidates }, proposal: this.createProposal({ proposedValue: String(best.value), proposedNumericValue: best.value, proposalMethod: "decimal_restoration", confidenceScore: confidence, reason: "Removing decimal precision best matches the robust local sequence; review is required.", evidence: { selectedScale: best.scale, localError: best.error } }) }];
  }

  detectColumnShift(input: QualityAppearanceInput): QualityFindingDraft[] {
    const line = String(input.rawValues?.line ?? ""), symbol = input.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = line.match(new RegExp(`^\\s*${symbol}\\s+([+-]?\\d+(?:\\.\\d+)?)%\\s+([\\d,.]+)\\s+([\\d,.]+)\\s+\\$([\\d,.]+)`, "i"));
    if (!match || input.price == null || input.changePercent == null || input.volume != null) return [];
    const change = finite(match[1]), trades = countToken(match[2]), volume = countToken(match[3]), dollar = countToken(match[4]);
    if (change == null || ![trades, volume, dollar].every(Number.isFinite)) return [];
    const common = { rawLine: line, parsedTokens: { changePercent: change, trades, volume, dollarVolume: dollar }, importedRow: { price: input.price, changePercent: input.changePercent, trades: input.trades, volume: input.volume, dollarVolume: input.dollarVolume }, tokenCount: match.length - 1 };
    const proposal = (field: "price" | "change_percent" | "trades" | "volume" | "dollar_volume", original: number | null, value: number | null, reason: string): QualityFindingDraft => ({ fieldName: field, findingType: field === "price" ? "possible_column_shift" : "ocr_alignment_error", severity: field === "price" ? "critical" : "high", originalValue: textValue(original), numericOriginalValue: original, ruleId: `column_shift_${field}_v1`, ruleVersion: this.ruleVersion, confidenceScore: .99, evidence: common, proposal: this.createProposal({ proposedValue: textValue(value), proposedNumericValue: value, proposalMethod: "column_realignment", confidenceScore: .99, reason, evidence: common }) });
    return [
      { fieldName: "row", findingType: "possible_column_shift", severity: "critical", originalValue: line, numericOriginalValue: null, ruleId: "column_shift_v1", ruleVersion: this.ruleVersion, confidenceScore: .99, evidence: common },
      proposal("price", input.price, null, "The first numeric OCR token includes a percent sign, proving it is not a price; the price remains unknown."),
      proposal("change_percent", input.changePercent, change, "Realign the percent-marked token to change_percent."),
      proposal("trades", input.trades, trades, "Realign the first whole-count token to trades."),
      proposal("volume", input.volume, volume, "Realign the second whole-count token to volume."),
      proposal("dollar_volume", input.dollarVolume, dollar, "Realign the currency token to dollar_volume."),
    ];
  }

  detectImpossiblePercentage(input: QualityAppearanceInput): QualityFindingDraft[] {
    const value = input.changePercent;if (value == null || this.hasColumnShiftSignature(input)) return [];
    const raw = String(input.rawValues?.changePercent ?? value), penny = this.isPennyContext(input), mostActive = input.categoryType === "most_active";
    const impossible = value < -100, suspiciousThreshold = penny ? 1500 : mostActive ? (Number(input.marketCap ?? 0) >= 10_000_000_000 ? 25 : 75) : input.categoryType === "biggest_gainer" ? 1000 : 300;
    if (!impossible && Math.abs(value) < suspiciousThreshold) return [];
    const candidate = value / 100, missingDecimalShape = !numericToken(raw).includes(".") && Math.abs(candidate) <= (penny ? 20 : 10);
    const severity: QualitySeverity = impossible ? "critical" : "high", confidence = this.scoreFinding(severity, [mostActive ? 1 : .2, missingDecimalShape ? 1 : 0, /^[-+]?0\d+%?$/.test(raw.replace(/\s/g, "")) ? 1 : 0]);
    const evidence = { categoryName: input.categoryName, categoryType: input.categoryType, pennyContext: penny, marketCap: input.marketCap ?? null, threshold: suspiciousThreshold, rawPercentToken: raw, candidateDividedBy100: candidate, negativeMoveBelowMinus100: impossible };
    return [{ fieldName: "change_percent", findingType: impossible ? "impossible_percentage" : "possible_missing_decimal", severity, originalValue: textValue(value), numericOriginalValue: value, ruleId: "percentage_decimal_loss_v1", ruleVersion: this.ruleVersion, confidenceScore: confidence, evidence,
      ...(missingDecimalShape ? { proposal: this.createProposal({ proposedValue: String(candidate), proposedNumericValue: candidate, proposalMethod: "decimal_restoration", confidenceScore: Math.min(.97, confidence), reason: "A two-place decimal restoration produces a category-plausible percentage, but the move remains human-reviewed.", evidence }) } : {}) }];
  }

  detectImpossibleCounts(input: QualityAppearanceInput): QualityFindingDraft[] {
    const findings: QualityFindingDraft[] = [], add = (fieldName: "trades" | "volume" | "dollar_volume", value: number, type: "impossible_trades" | "impossible_volume" | "impossible_dollar_volume", reason: string) => findings.push({ fieldName, findingType: type, severity: "critical", originalValue: String(value), numericOriginalValue: value, ruleId: `${fieldName}_domain_v1`, ruleVersion: this.ruleVersion, confidenceScore: .99, evidence: { reason } });
    if (input.trades != null && input.trades < 0) add("trades", input.trades, "impossible_trades", "Negative trade count");
    if (input.volume != null && input.volume < 0) add("volume", input.volume, "impossible_volume", "Negative share volume");
    if (input.dollarVolume != null && input.dollarVolume < 0) add("dollar_volume", input.dollarVolume, "impossible_dollar_volume", "Negative dollar volume");
    if (input.trades != null && input.volume != null && input.trades > input.volume) findings.push({ fieldName: "trades", findingType: "cross_field_inconsistency", severity: "high", originalValue: String(input.trades), numericOriginalValue: input.trades, ruleId: "trades_exceed_volume_v1", ruleVersion: this.ruleVersion, confidenceScore: .98, evidence: { trades: input.trades, volume: input.volume, ratio: input.trades / input.volume } });
    return findings;
  }

  detectImpossiblePrice(input: QualityAppearanceInput): QualityFindingDraft[] {
    if (input.price == null || input.price > 0 || this.hasColumnShiftSignature(input)) return [];
    return [{ fieldName: "price", findingType: "impossible_price", severity: "critical", originalValue: textValue(input.price), numericOriginalValue: input.price, ruleId: "price_domain_v1", ruleVersion: this.ruleVersion, confidenceScore: .99, evidence: { rule: "A traded security price must be greater than zero; no correction is inferred." } }];
  }

  analyzeCrossFieldConsistency(input: QualityAppearanceInput): QualityFindingDraft[] {
    if (input.price == null || input.price <= 0 || input.volume == null || input.volume <= 0 || input.dollarVolume == null || input.dollarVolume <= 0) return [];
    const expected = input.price * input.volume, ratio = input.dollarVolume / expected;
    if (ratio >= .5 && ratio <= 2) return [];
    const implied = input.dollarVolume / input.volume, magnitude = Math.max(ratio, 1 / ratio), confidence = this.scoreFinding(magnitude >= 8 ? "high" : "medium", [Math.min(1, Math.log10(magnitude)), 1]);
    return [{ fieldName: "dollar_volume", findingType: "cross_field_inconsistency", severity: magnitude >= 8 ? "high" : "medium", originalValue: textValue(input.dollarVolume), numericOriginalValue: input.dollarVolume, ruleId: "price_volume_dollar_consistency_v1", ruleVersion: this.ruleVersion, confidenceScore: confidence, evidence: { price: input.price, volume: input.volume, dollarVolume: input.dollarVolume, priceTimesVolume: expected, observedToExpectedRatio: ratio, impliedPrice: implied, tolerance: [.5, 2], note: "Last price and source dollar-volume calculation can differ; this is supporting evidence, not truth." } }];
  }

  analyzeTickerSequence(input: QualityAppearanceInput, neighbors: SequenceObservation[]): QualityFindingDraft[] {
    if (input.price == null || input.price <= 0) return [];
    const prices = this.priceNeighbors(neighbors);if (prices.length < 3) return [];
    const center = median(prices), mad = medianAbsoluteDeviation(prices) ?? 0, ratio = input.price / center, modifiedZ = mad > 0 ? .6745 * Math.abs(input.price - center) / mad : Infinity;
    if (ratio < 4 && ratio > .25) return [];
    if (Number.isFinite(modifiedZ) && modifiedZ < 8) return [];
    return [{ fieldName: "price", findingType: "ticker_sequence_outlier", severity: ratio >= 10 || ratio <= .1 ? "high" : "medium", originalValue: textValue(input.price), numericOriginalValue: input.price, ruleId: "ticker_price_sequence_outlier_v1", ruleVersion: this.ruleVersion, confidenceScore: this.scoreFinding("high", [Math.min(1, Math.abs(Math.log10(ratio))), modifiedZ === Infinity ? 1 : Math.min(1, modifiedZ / 20)]), evidence: { localMedian: center, medianAbsoluteDeviation: mad, modifiedZScore: Number.isFinite(modifiedZ) ? modifiedZ : null, priceToMedianRatio: ratio, neighborCount: prices.length, neighborIds: neighbors.map(x => x.id) } }];
  }

  private priceNeighbors(neighbors: SequenceObservation[]) { return neighbors.map(value => value.price).filter((value): value is number => value != null && value > 0); }
  private localPriceBaseline(neighbors: SequenceObservation[]) { const values = this.priceNeighbors(neighbors); return values.length >= 3 ? median(values) : null; }
  private isPennyContext(input: QualityAppearanceInput) { return /penny/i.test(input.categoryName) || input.categoryExchange === "OTC" || input.tickerExchange === "OTC" || (this.localPriceBaseline(input.neighbors ?? []) ?? input.price ?? Infinity) < 5; }
  private hasColumnShiftSignature(input: QualityAppearanceInput) { return /\b[+-]?\d+(?:\.\d+)?%\s+[\d,.]+\s+[\d,.]+\s+\$[\d,.]+/.test(String(input.rawValues?.line ?? "")) && input.volume == null; }
}
