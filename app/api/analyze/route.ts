import { NextResponse } from "next/server";

import { AnalyzerError, analyzeResume } from "@/lib/analyzer";
import { MAX_INPUT_CHARS } from "@/lib/limits";
import { checkRateLimit, clientKey, consumeDailyBudget } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const limit = checkRateLimit(`analyze:${clientKey(request)}`);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return NextResponse.json(
      {
        error: `This demo allows 10 screenings per hour. Try again in about ${
          minutes === 1 ? "a minute" : `${minutes} minutes`
        }.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { jobDescription?: unknown; resumeText?: unknown };
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
  if (!jobDescription.trim() || !resumeText.trim()) {
    return NextResponse.json(
      { error: "Both the job description and the resume need text in them." },
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

  // Charged only once the request is known to be worth a model call, so
  // malformed or oversized input can't spend the demo's daily budget.
  const budget = consumeDailyBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: `This demo has used its ${budget.limit} screening${
          budget.limit === 1 ? "" : "s"
        } for today — it runs on a personal API key. It resets at midnight UTC, or clone the repo and run it with your own key.`,
      },
      { status: 429 },
    );
  }

  try {
    const report = await analyzeResume(resumeText, jobDescription);
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof AnalyzerError) {
      // The detail is for the server log; the visitor sees error.message.
      if (error.detail) console.error("Analysis failed:", error.detail);
      // An upstream fault isn't the caller's bad request.
      return NextResponse.json(
        { error: error.message },
        { status: error.upstream ? 502 : 400 },
      );
    }
    console.error("Unexpected analysis failure", error);
    return NextResponse.json(
      { error: "Something went wrong while analyzing. Please try again." },
      { status: 500 },
    );
  }
}
