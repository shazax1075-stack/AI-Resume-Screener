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

/**
 * Resume tailoring: the second half of the app, for the candidate rather
 * than the recruiter.
 *
 * The model may only reframe what the resume already says. Anything it
 * cannot honestly say is a gap, not a rewrite -- see `lib/fabrication.ts`,
 * which enforces that in code rather than trusting the instruction.
 */

export const resumeChangeSchema = z
  .object({
    section: z
      .string()
      .describe(
        "Where in the resume this change applies, e.g. 'Summary', 'Skills', or 'Loopline, second bullet'.",
      ),
    before: z
      .string()
      .describe(
        "The original text, copied verbatim from the resume. Never paraphrased.",
      ),
    after: z
      .string()
      .describe(
        "The rewritten text. Uses only facts, tools, employers, titles, dates and numbers that already appear in the resume.",
      ),
    reason: z
      .string()
      .describe(
        "One sentence, under 25 words, on why this helps for this posting.",
      ),
    requirement: z
      .string()
      .describe("The job requirement this change serves, copied from the checklist."),
  })
  .strip();

export const resumeGapSchema = z
  .object({
    requirement: z
      .string()
      .describe("The requirement the resume cannot evidence, from the checklist."),
    why_it_matters: z
      .string()
      .describe("One short sentence on how much weight the posting puts on it."),
    how_to_close: z
      .string()
      .describe(
        "One concrete sentence on what would evidence it — a project, a certification, or experience to surface if the candidate has it elsewhere.",
      ),
  })
  .strip();

export const tailoringSchema = z
  .object({
    changes: z
      .array(resumeChangeSchema)
      .min(1)
      .max(12)
      .describe(
        "The rewrites worth making, most valuable first. At most 8; quality over volume.",
      ),
    gaps: z
      .array(resumeGapSchema)
      .max(8)
      .describe(
        "Requirements no rewrite can honestly cover, because the resume shows no evidence of them.",
      ),
    summary: z
      .string()
      .describe(
        "Two sentences at most: what this resume is getting wrong for this posting, and what the rewrite fixes.",
      ),
  })
  .strip();

export type ResumeChange = z.infer<typeof resumeChangeSchema>;
export type ResumeGap = z.infer<typeof resumeGapSchema>;
export type Tailoring = z.infer<typeof tailoringSchema>;

/** What the API returns: the model's rewrites after the fabrication check. */
export type TailoringResult = Omit<Tailoring, "changes"> & {
  /** Kept rewrites; `verify` lists numbers the candidate should confirm. */
  changes: (ResumeChange & { verify?: string[] })[];
  /** Rewrites dropped for claiming a skill the resume never showed. */
  rejected: { after: string; invented: string[] }[];
};

export const tailoringJsonSchema = z.toJSONSchema(tailoringSchema);
