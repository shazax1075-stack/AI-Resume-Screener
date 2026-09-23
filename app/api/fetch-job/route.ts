import { NextResponse } from "next/server";

import { JobFetchError, fetchJobDescription } from "@/lib/jobFetcher";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  // Tighter than analysis: this endpoint makes the server fetch arbitrary
  // URLs, so it shouldn't be usable as a general-purpose proxy.
  const limit = checkRateLimit(`fetch-job:${clientKey(request)}`, 20);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many link fetches. Wait a few minutes, or paste the description." },
      { status: 429 },
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Provide a job posting URL." }, { status: 400 });
  }

  try {
    const text = await fetchJobDescription(body.url);
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof JobFetchError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unexpected job fetch failure", error);
    return NextResponse.json(
      { error: "Couldn't read that link. Paste the job description instead." },
      { status: 500 },
    );
  }
}
