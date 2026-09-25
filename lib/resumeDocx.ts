import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

/**
 * Renders the rebuilt resume as a .docx.
 *
 * The app only ever holds the plain text extracted from the uploaded file,
 * so the original layout is gone by this point. Rather than fake it, this
 * produces a plain, ATS-legible document the candidate can restyle: their
 * name as the title, section headings, bullets, and nothing else.
 */

/** A short line in caps, or a known section name, reads as a heading. */
function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  if (/[.!?]$/.test(trimmed)) return false;

  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  const isShouted = letters.length > 1 && letters === letters.toUpperCase();

  return (
    isShouted ||
    /^(experience|employment|work history|education|skills|projects|certifications|summary|profile|about|awards|publications|languages|interests)\b/i.test(
      trimmed,
    )
  );
}

function isBullet(line: string): boolean {
  return /^\s*[-•*·–—]\s+/.test(line);
}

export function buildResumeDocx(resumeText: string): Promise<Buffer> {
  const lines = resumeText.replace(/\r\n/g, "\n").split("\n");
  const children: Paragraph[] = [];
  let titleUsed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      children.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      continue;
    }

    if (!titleUsed) {
      titleUsed = true;
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.LEFT,
          spacing: { after: 120 },
          children: [new TextRun({ text: trimmed, bold: true, size: 32 })],
        }),
      );
      continue;
    }

    if (isSectionHeading(trimmed)) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 100 },
          children: [
            new TextRun({ text: trimmed.toUpperCase(), bold: true, size: 22 }),
          ],
        }),
      );
      continue;
    }

    if (isBullet(trimmed)) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: trimmed.replace(/^\s*[-•*·–—]\s+/, ""), size: 22 }),
          ],
        }),
      );
      continue;
    }

    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: trimmed, size: 22 })],
      }),
    );
  }

  const document = new Document({
    creator: "Screening Desk",
    description: "Resume tailored for a specific job posting",
    title: "Tailored resume",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

/** A filename a candidate can send without renaming it. */
export function resumeFilename(resumeText: string): string {
  const firstLine = resumeText.split("\n").find((line) => line.trim())?.trim() ?? "";
  const name = firstLine
    .split(/[·|,–—]/)[0]
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("-");

  return `${name || "resume"}-tailored.docx`;
}
