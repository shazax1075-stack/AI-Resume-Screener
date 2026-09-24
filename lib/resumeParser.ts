import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import { clampToInputLimit } from "@/lib/limits";

/**
 * Converts an uploaded resume file (.txt, .pdf, .docx) into plain text.
 * Runs server-side only: both parsers are Node libraries.
 */

export const SUPPORTED_EXTENSIONS = ["txt", "pdf", "docx"] as const;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class ResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeParseError";
  }
}

async function extractPdf(data: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (error) {
    console.error("PDF parse failed:", error);
    throw new ResumeParseError(
      "That PDF couldn't be read. It may be corrupt or password-protected — try another file, or paste the text.",
    );
  }
}

async function extractDocx(data: Uint8Array): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return value;
  } catch (error) {
    console.error("Word parse failed:", error);
    throw new ResumeParseError(
      "That Word document couldn't be read. Try re-saving it as .docx, or paste the text.",
    );
  }
}

export async function extractResumeText(
  filename: string,
  data: Uint8Array,
): Promise<string> {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new ResumeParseError("That file is larger than 5 MB. Upload a smaller file.");
  }

  const extension = filename.includes(".")
    ? filename.split(".").pop()!.toLowerCase()
    : "";

  let text: string;
  if (extension === "txt") {
    text = new TextDecoder().decode(data);
  } else if (extension === "pdf") {
    text = await extractPdf(data);
  } else if (extension === "docx") {
    text = await extractDocx(data);
  } else {
    throw new ResumeParseError(
      `Unsupported file type '${filename}'. Upload one of: ${SUPPORTED_EXTENSIONS.join(", ")}.`,
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new ResumeParseError(
      "No text could be extracted from this file. If it's a scanned PDF, paste the resume text instead.",
    );
  }
  // A 30-page PDF can exceed what /api/analyze accepts; clamp here rather
  // than let the user hit a length error on text this app extracted.
  return clampToInputLimit(trimmed);
}
