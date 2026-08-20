import { CATEGORY_MAP } from "./category-map";

function normalizeHeading(input: string) {
  return input
    .toUpperCase()
    .replace(/\bNASDA[O0]\b/g, "NASDAQ")
    .replace(/\b0TC\b/g, "OTC")
    .replace(/\bGA[IL1][NM]ERS\b/g, "GAINERS")
    .replace(/\bDECL[IL1][NM]ERS\b/g, "DECLINERS")
    .replace(/\bPE[A-Z]NY\b/g, "PENNY")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string) {
  const prior = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        prior[rightIndex] + 1,
        prior[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    prior.splice(0, prior.length, ...current);
  }
  return prior[right.length];
}

export function parseCategory(input: string) {
  const key = normalizeHeading(input);
  const exact = CATEGORY_MAP[key as keyof typeof CATEGORY_MAP];
  if (exact) return exact;

  // OCR sometimes retains a breadcrumb, bullet, or page-title suffix on the
  // heading line. Only accept an exact canonical phrase inside a reasonably
  // short line; this remains deliberately stricter than fuzzy classification.
  if (!key || key.length > 100) return null;
  for (const [candidate, category] of Object.entries(CATEGORY_MAP)) {
    if (key.includes(candidate)) return category;
  }

  // A heading is a small, known vocabulary, so a tightly bounded edit-distance
  // fallback safely repairs isolated OCR glyph errors (for example PEANY or
  // NASSAD). Numeric table rows and prose are excluded before comparison.
  if (/\d/.test(key) || key.split(" ").length < 2) return null;
  const compact = key.replace(/ /g, "");
  const matches = Object.entries(CATEGORY_MAP)
    .map(([candidate, category]) => {
      const expected = candidate.replace(/ /g, "");
      return {
        category,
        distance: editDistance(compact, expected),
        maximum: Math.max(2, Math.floor(expected.length * 0.14)),
      };
    })
    .filter((match) => match.distance <= match.maximum)
    .sort((left, right) => left.distance - right.distance);
  if (
    matches.length &&
    (matches.length === 1 || matches[1].distance - matches[0].distance >= 2)
  ) {
    return matches[0].category;
  }
  return null;
}
