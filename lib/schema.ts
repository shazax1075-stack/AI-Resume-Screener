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
        "One specific requirement from the job description, in under 12 words (e.g. '5+ years backend Python' or 'Kubernetes in production').",
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
        "One short sentence citing the specific resume detail that justifies the status, or stating that the resume shows nothing on this point.",
      ),
  })
  .strict();

/** Exactly what the model is asked to return. */
export const modelReportSchema = z
  .object({
    requirements: z
      .array(requirementSchema)
      .min(3)
      .max(14)
      .describe(
        "Every distinct requirement the job description states, each graded against the resume. Cover the whole job description; do not invent requirements it does not mention.",
      ),
    key_strengths: z
      .array(z.string())
      .describe(
        "Concise bullet points highlighting the candidate's strongest qualifications that directly align with the job description.",
      ),
    critical_gaps: z
      .array(z.string())
      .describe(
        "Concise bullet points identifying missing skills, experience, or qualifications the job description requires but the resume does not demonstrate.",
      ),
    target_interview_questions: z
      .array(z.string())
      .describe(
        "Tailored interview questions a recruiter should ask to probe the candidate's critical gaps and validate their claimed strengths.",
      ),
  })
  .strict();

export type Requirement = z.infer<typeof requirementSchema>;
export type RequirementStatus = Requirement["status"];
export type RequirementImportance = Requirement["importance"];
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
