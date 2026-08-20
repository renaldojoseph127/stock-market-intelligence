export const REPAIR_REVIEW_CLASSIFIER_VERSION = "repair-review-v1";
export const REPAIR_REVIEW_BATCH_MAX = 25;
export type RepairReviewTier = "A" | "B" | "C" | "D";

export interface RepairReviewInput {
  proposalStatus: string;
  isCurrent: boolean;
  proposedValue: string | null;
  proposalMethod: string;
  confidenceScore: number;
  originalValue: string | null;
  rawValue: string | null;
  findingStatus: string;
  findingType: string;
  ruleVersion: string;
  proposalEvidence?: Record<string, unknown> | null;
  findingEvidence?: Record<string, unknown> | null;
  sourceEvidenceAvailable: boolean;
  activeSameFieldValues?: Array<string | null>;
  effectiveValueExists?: boolean;
}

export interface RepairReviewClassification {
  tier: RepairReviewTier;
  explanation: string;
  batchApprovalEligible: boolean;
  conflict: boolean;
  conflictReasons: string[];
  classifierVersion: string;
}

const unresolved = new Set(["open", "proposed"]);
const recognizedRules = new Set(["2a2-v1"]);
const deterministicTypes = new Set(["thousands_separator_error", "currency_format_error", "percentage_format_error"]);
const columnTypes = new Set(["possible_column_shift", "ocr_alignment_error"]);

export class RepairReviewClassifier {
  readonly version = REPAIR_REVIEW_CLASSIFIER_VERSION;

  hasStrongSourceEvidence(input: RepairReviewInput) {
    const evidenceSets = [input.findingEvidence ?? {}, input.proposalEvidence ?? {}];
    return input.sourceEvidenceAvailable && evidenceSets.some(evidence =>
      ["rawPriceToken", "rawPercentToken", "rawLine"].some(key => {
        const value = evidence[key];
        return typeof value === "string" && value.trim().length > 0;
      }),
    );
  }

  hasConflict(input: RepairReviewInput) {
    const reasons: string[] = [];
    const active = input.activeSameFieldValues ?? [];
    if (active.length > 1) reasons.push("multiple_active_proposals");
    if (input.effectiveValueExists) reasons.push("effective_value_exists");
    if (input.rawValue !== input.originalValue) reasons.push("original_value_mismatch");
    if (!input.isCurrent || input.proposalStatus === "superseded") reasons.push("superseded_proposal");
    return { conflict: reasons.length > 0, reasons };
  }

  classifyProposal(input: RepairReviewInput): RepairReviewClassification {
    const conflict = this.hasConflict(input), strongSource = this.hasStrongSourceEvidence(input);
    let tier: RepairReviewTier, explanation: string;
    if (conflict.conflict) {
      tier = "D";explanation = `Conflict requires individual review: ${conflict.reasons.join(", ")}.`;
    } else if (input.proposalMethod === "column_realignment" || columnTypes.has(input.findingType)) {
      tier = "C";explanation = "Coordinated OCR column realignment requires grouped row review.";
    } else if (deterministicTypes.has(input.findingType) && input.proposalMethod === "source_line_reparse" && input.confidenceScore >= .99 && strongSource && input.proposedValue != null) {
      tier = "A";explanation = "Source punctuation and a deterministic normalization directly support the proposed value.";
    } else if (input.proposalMethod === "decimal_restoration" && input.confidenceScore >= .9 && strongSource && input.proposedValue != null) {
      tier = "B";explanation = "High-confidence decimal inference has source-token and continuity evidence but remains non-conclusive.";
    } else {
      tier = "D";explanation = "Evidence is insufficient for efficient batch approval or the proposal requires individual validation.";
    }
    return { tier, explanation, batchApprovalEligible: this.isBatchApprovalEligible(input, tier, conflict.conflict), conflict: conflict.conflict, conflictReasons: conflict.reasons, classifierVersion: this.version };
  }

  explainTier(input: RepairReviewInput) { return this.classifyProposal(input).explanation; }

  isBatchApprovalEligible(input: RepairReviewInput, classifiedTier?: RepairReviewTier, conflict?: boolean) {
    const tier = classifiedTier ?? this.classifyProposal(input).tier;
    const hasConflict = conflict ?? this.hasConflict(input).conflict;
    return (tier === "A" || tier === "B") && input.proposalStatus === "pending" && input.isCurrent && input.proposedValue != null
      && unresolved.has(input.findingStatus) && recognizedRules.has(input.ruleVersion) && input.rawValue === input.originalValue && !input.effectiveValueExists && !hasConflict;
  }
}
