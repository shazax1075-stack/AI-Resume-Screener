import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport, recommendationFor, scoreRequirements } from "@/lib/scoring";
import type { ModelReport, Requirement } from "@/lib/schema";

const req = (
  importance: Requirement["importance"],
  status: Requirement["status"],
): Requirement => ({
  requirement: "a requirement",
  importance,
  status,
  evidence: "evidence",
});

test("a fully met checklist scores 100", () => {
  assert.equal(scoreRequirements([req("required", "met"), req("preferred", "met")]), 100);
});

test("an unmet checklist scores 0", () => {
  assert.equal(
    scoreRequirements([req("required", "missing"), req("preferred", "missing")]),
    0,
  );
});

test("partial evidence earns half credit", () => {
  assert.equal(
    scoreRequirements([req("required", "partial"), req("preferred", "partial")]),
    50,
  );
});

test("an empty checklist scores 0 rather than dividing by zero", () => {
  assert.equal(scoreRequirements([]), 0);
});

test("three of four must-haves scores 75", () => {
  assert.equal(
    scoreRequirements([
      req("required", "met"),
      req("required", "met"),
      req("required", "met"),
      req("required", "missing"),
    ]),
    75,
  );
});

test("nice-to-haves cannot paper over a missing must-have", () => {
  // Four preferred at 0.35 each against one unmet required: 1.4 / 2.4.
  assert.equal(
    scoreRequirements([
      req("required", "missing"),
      req("preferred", "met"),
      req("preferred", "met"),
      req("preferred", "met"),
      req("preferred", "met"),
    ]),
    58,
  );
});

test("recommendations follow the score when must-haves are covered", () => {
  assert.equal(recommendationFor(100, 0), "Strong Pass");
  assert.equal(recommendationFor(70, 0), "Proceed to Interview");
  assert.equal(recommendationFor(50, 0), "Hold");
  assert.equal(recommendationFor(20, 0), "Reject");
});

test("a missing must-have keeps a high scorer out of Strong Pass", () => {
  assert.equal(recommendationFor(90, 1), "Proceed to Interview");
});

test("several missing must-haves cap the verdict regardless of score", () => {
  assert.equal(recommendationFor(70, 2), "Hold");
  assert.equal(recommendationFor(50, 2), "Reject");
  assert.equal(recommendationFor(95, 3), "Reject");
});

test("buildReport tallies, scores and passes the model's fields through", () => {
  const model: ModelReport = {
    requirements: [
      req("required", "met"),
      req("required", "partial"),
      req("required", "missing"),
      req("preferred", "met"),
    ],
    key_strengths: ["strength"],
    critical_gaps: ["gap"],
    target_interview_questions: ["question"],
  };

  const report = buildReport(model);

  assert.deepEqual(report.tally, {
    met: 2,
    partial: 1,
    missing: 1,
    total: 4,
    required_missing: 1,
  });
  // (1 + 0.5 + 0 + 0.35) / 3.35
  assert.equal(report.match_percentage, 55);
  assert.equal(report.hiring_recommendation, "Hold");
  assert.deepEqual(report.key_strengths, ["strength"]);
  assert.deepEqual(report.target_interview_questions, ["question"]);
});
