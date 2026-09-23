import { z } from "zod";

/**
 * The canonical output contract for a single resume screening.
 *
 * This schema is both the runtime validator for model output and the
 * source of the JSON schema embedded in the prompt, so the shape the
 * model is asked for and the shape we accept can never drift apart.
 */
export const HIRING_RECOMMENDATIONS = [
  "Strong Pass",
  "Proceed to Interview",
  "Hold",
  "Reject",
] as const;

export const screeningReportSchema = z
  .object({
    match_percentage: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(
        "Overall percentage fit of the candidate's resume against the job description, from 0 (no fit) to 100 (perfect fit).",
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
    hiring_recommendation: z
      .enum(HIRING_RECOMMENDATIONS)
      .describe(
        "The overall hiring recommendation, chosen from a fixed set of outcomes.",
      ),
  })
  .strict();

export type ScreeningReport = z.infer<typeof screeningReportSchema>;
export type HiringRecommendation = ScreeningReport["hiring_recommendation"];

/** JSON schema handed to the model inside the prompt. */
export const screeningReportJsonSchema = z.toJSONSchema(screeningReportSchema);
