import type { CrossSourceSequence } from "./types";

export interface SequenceEvidence {
  moveDate: string;
  catalystAt?: string | null;
  socialAt?: string | null;
  catalystIdentified: boolean;
  socialCoverageComplete: boolean;
}

const day = (value: string) => value.slice(0, 10);

export function classifyCrossSourceSequence(
  evidence: SequenceEvidence,
): CrossSourceSequence {
  if (!evidence.socialCoverageComplete) return "coverage_insufficient";
  const move = Date.parse(`${day(evidence.moveDate)}T23:59:59.999Z`);
  const social = evidence.socialAt ? Date.parse(evidence.socialAt) : NaN;
  const catalyst = evidence.catalystAt ? Date.parse(evidence.catalystAt) : NaN;
  const socialBeforeMove = Number.isFinite(social) && social <= move;
  const catalystBeforeMove = Number.isFinite(catalyst) && catalyst <= move;

  if (socialBeforeMove && !evidence.catalystIdentified)
    return "social_before_move_no_identified_catalyst";
  if (!socialBeforeMove && catalystBeforeMove)
    return "catalyst_before_move_no_social_evidence";
  if (socialBeforeMove && catalystBeforeMove) {
    if (day(evidence.socialAt!) === day(evidence.catalystAt!))
      return "social_and_catalyst_same_day_before_move";
    return social < catalyst
      ? "social_before_catalyst_before_move"
      : "catalyst_before_social_before_move";
  }
  return "other";
}
