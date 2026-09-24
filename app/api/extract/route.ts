import { NextResponse } from "next/server";

import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { ResumeParseError, extractResumeText } from "@/lib/resumeParser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Parsing is cheap, but it still consumes CPU on every upload.
  const limit = checkRateLimit(`extract:${clientKey(request)}`, 30);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads from this address. Try again in an hour, or paste the resume text." },
      { status: 429 },
    );
  }

  let file: FormDataEntryValue | null;
  try {
    const formData = await request.formData();
    file = formData.get("file");
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const text = await extractResumeText(file.name, data);
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof ResumeParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unexpected extraction failure", error);
    return NextResponse.json(
      { error: "Could not read that file. Try pasting the resume text instead." },
      { status: 500 },
    );
  }
}
