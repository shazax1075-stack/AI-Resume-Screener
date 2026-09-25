import { NextResponse } from "next/server";

import { MAX_INPUT_CHARS } from "@/lib/limits";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { buildResumeDocx, resumeFilename } from "@/lib/resumeDocx";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // No model call here, so this is only throttled against abuse of the
  // document builder itself.
  const limit = checkRateLimit(`docx:${clientKey(request)}`, 30);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many downloads from this address. Try again in an hour." },
      { status: 429 },
    );
  }

  let body: { resumeText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { resumeText } = body;
  if (typeof resumeText !== "string" || !resumeText.trim()) {
    return NextResponse.json({ error: "No resume text to write." }, { status: 400 });
  }
  if (resumeText.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: "That resume is too long to convert." },
      { status: 400 },
    );
  }

  try {
    const file = await buildResumeDocx(resumeText);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${resumeFilename(resumeText)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to build .docx", error);
    return NextResponse.json(
      { error: "Couldn't build the document. Copy the text instead." },
      { status: 500 },
    );
  }
}
