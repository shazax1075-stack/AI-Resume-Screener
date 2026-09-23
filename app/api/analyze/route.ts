import { NextResponse } from "next/server";

import { AnalyzerError, analyzeResume } from "@/lib/analyzer";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const limit = checkRateLimit(`analyze:${clientKey(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `This demo allows 10 screenings per hour. Try again in about ${Math.ceil(
          limit.retryAfterSeconds / 60,
        )} minutes.`,
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

  try {
    const report = await analyzeResume(resumeText, jobDescription);
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof AnalyzerError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unexpected analysis failure", error);
    return NextResponse.json(
      { error: "Something went wrong while analyzing. Please try again." },
      { status: 500 },
    );
  }
}
