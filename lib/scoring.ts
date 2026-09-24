import {
  type HiringRecommendation,
  type ModelReport,
  type Requirement,
  type ScreeningReport,
} from "@/lib/schema";

/**
 * Turns graded requirements into a score and a recommendation.
 *
 * Deterministic on purpose: the same gradings always produce the same
 * number, and the number can be explained to a candidate ("7 of 10
 * requirements met") rather than asserted.
 */

/** A must-have counts for nearly three times a nice-to-have. */
const IMPORTANCE_WEIGHT: Record<Requirement["importance"], number> = {
  required: 1,
  preferred: 0.35,
};

/** Partial credit for related-but-weaker evidence. */
const STATUS_CREDIT: Record<Requirement["status"], number> = {
  met: 1,
  partial: 0.5,
  missing: 0,
};

export function scoreRequirements(requirements: Requirement[]): number {
  const total = requirements.reduce(
    (sum, item) => sum + IMPORTANCE_WEIGHT[item.importance],
    0,
  );
  if (total === 0) return 0;

  const earned = requirements.reduce(
    (sum, item) =>
      sum + IMPORTANCE_WEIGHT[item.importance] * STATUS_CREDIT[item.status],
    0,
  );
  return Math.round((earned / total) * 100);
}

/**
 * Maps a score to a verdict, with a floor for missing must-haves: a
 * candidate can score well on volume of nice-to-haves while lacking two
 * things the job calls essential, and that is not an interview.
 */
export function recommendationFor(
  score: number,
  requiredMissing: number,
): HiringRecommendation {
  if (requiredMissing >= 3) return "Reject";
  if (requiredMissing >= 2) return score >= 55 ? "Hold" : "Reject";

  if (score >= 85 && requiredMissing === 0) return "Strong Pass";
  if (score >= 65) return "Proceed to Interview";
  if (score >= 45) return "Hold";
  return "Reject";
}

export function buildReport(model: ModelReport): ScreeningReport {
  const { requirements } = model;
  const tally = {
    met: requirements.filter((item) => item.status === "met").length,
    partial: requirements.filter((item) => item.status === "partial").length,
    missing: requirements.filter((item) => item.status === "missing").length,
    total: requirements.length,
    required_missing: requirements.filter(
      (item) => item.importance === "required" && item.status === "missing",
    ).length,
  };

  const match_percentage = scoreRequirements(requirements);

  return {
    ...model,
    match_percentage,
    hiring_recommendation: recommendationFor(
      match_percentage,
      tally.required_missing,
    ),
    tally,
  };
}
