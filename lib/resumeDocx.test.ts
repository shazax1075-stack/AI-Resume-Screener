import assert from "node:assert/strict";
import { test } from "node:test";

import { buildResumeDocx, resumeFilename } from "@/lib/resumeDocx";

const RESUME = `Maya Chen
Senior Backend Engineer · Austin, TX · maya.chen@example.com

EXPERIENCE
Backend Engineer, Loopline (2021–present)
- Built Python/FastAPI services handling 40M requests/day on AWS.
- Cut p95 latency 38% by redesigning Postgres indexes.

SKILLS
Python, FastAPI, PostgreSQL, AWS`;

test("produces a real .docx file", async () => {
  const file = await buildResumeDocx(RESUME);
  assert.ok(file.length > 1000, "has content");
  // .docx is a zip; every one starts with the PK signature.
  assert.equal(file.subarray(0, 2).toString("binary"), "PK");
});

test("the document carries the resume's text", async () => {
  const file = await buildResumeDocx(RESUME);
  // The text lives in compressed XML, so check it survives a round trip
  // through the zip by looking for a distinctive fragment in the raw bytes
  // of the stored document part.
  const { readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const path = join(tmpdir(), `resume-test-${Date.now()}.docx`);
  await (await import("node:fs/promises")).writeFile(path, file);
  const { stdout } = await promisify(execFile)("unzip", ["-p", path, "word/document.xml"]);
  assert.ok(stdout.includes("Maya Chen"));
  assert.ok(stdout.includes("40M requests/day"));
  assert.ok(stdout.includes("EXPERIENCE"));
  await (await import("node:fs/promises")).rm(path);
  void readFile;
});

test("the filename is built from the candidate's name", () => {
  assert.equal(resumeFilename(RESUME), "Maya-Chen-tailored.docx");
  assert.equal(resumeFilename("   \n\n"), "resume-tailored.docx");
});
