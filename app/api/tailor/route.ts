import { NextResponse } from "next/server";

import { ModelError } from "@/lib/gateway";
import { MAX_INPUT_CHARS } from "@/lib/limits";
import { checkRateLimit, clientKey, consumeDailyBudget } from "@/lib/rateLimit";
import { requirementSchema } from "@/lib/schema";
import { tailorResume } from "@/lib/tailor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const limit = checkRateLimit(`tailor:${clientKey(request)}`);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return NextResponse.json(
      {
        error: `This demo allows 10 rewrites per hour. Try again in about ${
          minutes === 1 ? "a minute" : `${minutes} minutes`
        }.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { jobDescription?: unknown; resumeText?: unknown; requirements?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { jobDescription, resumeText } = body;
  if (typeof jobDescription !== "string" || typeof resumeText !== "string") {
    return NextResponse.json(
      { error: "Provide both a job description and a resume." },
      { status: 400 },
    );
  }
  if (
    jobDescription.length > MAX_INPUT_CHARS ||
    resumeText.length > MAX_INPUT_CHARS
  ) {
    return NextResponse.json(
      {
        error: `Inputs are limited to ${MAX_INPUT_CHARS.toLocaleString()} characters each. Trim the text and try again.`,
      },
      { status: 400 },
    );
  }

  // The checklist comes from the screening the client already ran, so
  // tailoring costs one model call rather than two.
  const requirements = requirementSchema.array().min(1).max(30).safeParse(body.requirements);
  if (!requirements.success) {
    return NextResponse.json(
      { error: "Screen the resume first, then tailor it." },
      { status: 400 },
    );
  }

  const budget = consumeDailyBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: `This demo has used its ${budget.limit} runs for today — it runs on a personal API key. It resets at midnight UTC, or clone the repo and run it with your own key.`,
      },
      { status: 429 },
    );
  }

  try {
    const tailoring = await tailorResume(resumeText, jobDescription, requirements.data);
    return NextResponse.json({ tailoring });
  } catch (error) {
    if (error instanceof ModelError) {
      if (error.detail) console.error("Tailoring failed:", error.detail);
      return NextResponse.json(
        { error: error.message },
        { status: error.upstream ? 502 : 400 },
      );
    }
    console.error("Unexpected tailoring failure", error);
    return NextResponse.json(
      { error: "Something went wrong while rewriting. Please try again." },
      { status: 500 },
    );
  }
}
