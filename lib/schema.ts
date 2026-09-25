import { z } from "zod";

/**
 * The screening contract, in two halves.
 *
 * The model is asked only for judgements it can make well: which
 * requirements the job lists, how important each is, and whether the resume
 * evidences it. The score and the recommendation are computed from those
 * judgements in `lib/scoring.ts`, never generated -- a model asked for "a
 * percentage" returns a different number run to run, while grading one
 * requirement at a time is stable and can be shown to the user as evidence.
 */

export const HIRING_RECOMMENDATIONS = [
  "Strong Pass",
  "Proceed to Interview",
  "Hold",
  "Reject",
] as const;

export const REQUIREMENT_STATUSES = ["met", "partial", "missing"] as const;
export const REQUIREMENT_IMPORTANCES = ["required", "preferred"] as const;

export const requirementSchema = z
  .object({
    requirement: z
      .string()
      .describe(
        "One specific requirement from the job description, in under 10 words (e.g. '5+ years backend Python' or 'Kubernetes in production').",
      ),
    importance: z
      .enum(REQUIREMENT_IMPORTANCES)
      .describe(
        "'required' if the job description lists it as a requirement or must-have; 'preferred' if it is a nice-to-have, bonus or plus.",
      ),
    status: z
      .enum(REQUIREMENT_STATUSES)
      .describe(
        "'met' if the resume clearly evidences it, 'partial' if it is related but weaker or unclear, 'missing' if the resume shows no evidence.",
      ),
    evidence: z
      .string()
      .describe(
        "At most 20 words citing the resume detail that justifies the status, or stating that the resume does not address it.",
      ),
  })
  // Unknown keys are dropped rather than rejected: a stray field the model
  // volunteers shouldn't throw away an otherwise usable report.
  .strip();

/** Exactly what the model is asked to return. */
export const modelReportSchema = z
  .object({
    requirements: z
      .array(requirementSchema)
      // Wide on purpose: a two-line posting genuinely has one or two
      // requirements, and a corporate posting can list twenty-five.
      .min(1)
      .max(30)
      .describe(
        "The requirements the job description states, each graded against the resume, most important first. Group near-duplicates and stop at 10; do not invent requirements the posting does not mention.",
      ),
    key_strengths: z
      .array(z.string())
      .describe(
        "At most 4 short bullet points on the candidate's strongest qualifications for this job.",
      ),
    critical_gaps: z
      .array(z.string())
      .describe(
        "At most 4 short bullet points on what the job requires and the resume does not evidence.",
      ),
    target_interview_questions: z
      .array(z.string())
      .describe(
        "At most 5 interview questions probing the gaps and testing the claimed strengths. One sentence each.",
      ),
  })
  .strip();

export type Requirement = z.infer<typeof requirementSchema>;
export type RequirementStatus = Requirement["status"];
export type ModelReport = z.infer<typeof modelReportSchema>;

export type HiringRecommendation = (typeof HIRING_RECOMMENDATIONS)[number];

/** What the API returns: the model's judgements plus the computed verdict. */
export type ScreeningReport = ModelReport & {
  match_percentage: number;
  hiring_recommendation: HiringRecommendation;
  /** Counts behind the score, so the UI can show its working. */
  tally: {
    met: number;
    partial: number;
    missing: number;
    total: number;
    required_missing: number;
  };
};

/** JSON schema handed to the model inside the prompt. */
export const modelReportJsonSchema = z.toJSONSchema(modelReportSchema);
