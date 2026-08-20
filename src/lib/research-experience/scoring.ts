import {
  RESEARCH_PRIORITY_VERSION,
  SIMILARITY_ALGORITHM_VERSION,
  type PriorityInput,
  type PriorityResult,
  type SimilarityObservation,
  type SimilarityResult,
} from "./types";

const round = (value: number) => Math.round(value * 100) / 100;

export function calculateResearchPriority(input: PriorityInput): PriorityResult {
  const magnitude = Math.min(25, Math.abs(input.changePercent ?? 0) / 4);
  const repeat = Math.min(20, Math.max(input.repeatCount - 1, 0) * 2);
  const catalyst =
    input.catalystStatus === "no_identified_catalyst"
      ? 15
      : input.catalystStatus === "not_researched"
        ? 10
        : input.catalystStatus === "research_partial"
          ? 5
          : 0;
  const social = input.socialCoverageStatus === "not_researched" ? 10 : 0;
  const quality = ["clean", "repaired"].includes(input.qualityStatus) ? 10 : 0;
  const interest = input.savedResearch ? 10 : 0;
  const importRecency = input.importedWithin30Days ? 10 : 0;
  const components = {
    magnitude: round(magnitude),
    repeat: round(repeat),
    catalyst,
    social,
    quality,
    interest,
    importRecency,
  };
  const reasons = [
    magnitude >= 10 ? `Large historical move +${round(magnitude)}` : null,
    repeat > 0 ? `Repeated mover +${round(repeat)}` : null,
    input.catalystStatus === "no_identified_catalyst"
      ? "No identified catalyst +15"
      : input.catalystStatus === "not_researched"
        ? "Catalyst not researched +10"
        : input.catalystStatus === "research_partial"
          ? "Catalyst research partial +5"
          : null,
    social ? "Social coverage not researched +10" : null,
    input.qualityStatus === "clean"
      ? "Clean observation +10"
      : input.qualityStatus === "repaired"
        ? "Approved repair overlay available +10"
        : "Data-quality review recommended +0",
    interest ? "Saved research interest +10" : null,
    importRecency ? "Recently imported source +10" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    score: round(Math.min(100, Object.values(components).reduce((sum, value) => sum + value, 0))),
    version: RESEARCH_PRIORITY_VERSION,
    reasons,
    components,
  };
}

const priceBand = (price: number) =>
  price < 1 ? 0 : price < 5 ? 1 : price < 20 ? 2 : price < 100 ? 3 : 4;

export function scoreHistoricalMoverSimilarity(
  target: SimilarityObservation,
  candidate: SimilarityObservation,
): SimilarityResult {
  let numerator = 0;
  let denominator = 0;
  const reasons: string[] = [];
  denominator += 25;
  if (target.categoryId === candidate.categoryId) {
    numerator += 25;
    reasons.push("Same mover category");
  }
  if (target.exchange && candidate.exchange) {
    denominator += 15;
    if (target.exchange === candidate.exchange) {
      numerator += 15;
      reasons.push("Same exchange");
    }
  }
  if (
    target.validChange &&
    candidate.validChange &&
    target.changePercent != null &&
    candidate.changePercent != null
  ) {
    denominator += 20;
    const distance = Math.abs(Math.abs(candidate.changePercent) - Math.abs(target.changePercent));
    numerator += Math.max(0, 1 - distance / Math.max(Math.abs(target.changePercent), 10)) * 20;
    if (distance <= Math.max(Math.abs(target.changePercent) * 0.1, 5))
      reasons.push("Change magnitude within 10% band");
  }
  if (
    target.validPrice &&
    candidate.validPrice &&
    (target.price ?? 0) > 0 &&
    (candidate.price ?? 0) > 0
  ) {
    denominator += 15;
    if (priceBand(target.price!) === priceBand(candidate.price!)) {
      numerator += 15;
      reasons.push("Similar price band");
    }
  }
  if (
    target.validVolume &&
    candidate.validVolume &&
    (target.volume ?? 0) > 0 &&
    (candidate.volume ?? 0) > 0
  ) {
    denominator += 15;
    const ratioDistance = Math.abs(Math.log(candidate.volume! / target.volume!));
    numerator += Math.max(0, 1 - ratioDistance / Math.log(10)) * 15;
    if (ratioDistance <= Math.log(3)) reasons.push("Similar volume band");
  }
  denominator += 5;
  if (target.repeatMover === candidate.repeatMover) {
    numerator += 5;
    reasons.push("Matching repeat-mover status");
  }
  denominator += 3;
  if (target.catalystStatus === candidate.catalystStatus) {
    numerator += 3;
    reasons.push("Matching catalyst coverage state");
  }
  denominator += 2;
  if (target.qualityStatus === candidate.qualityStatus) {
    numerator += 2;
    reasons.push("Matching quality state");
  }
  return {
    score: round((numerator / denominator) * 100),
    reasons,
    version: SIMILARITY_ALGORITHM_VERSION,
    availableWeight: denominator,
  };
}

