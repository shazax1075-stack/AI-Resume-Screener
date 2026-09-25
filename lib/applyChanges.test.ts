import assert from "node:assert/strict";
import { test } from "node:test";

import { applyChanges } from "@/lib/applyChanges";
import { bestCaseScore } from "@/lib/scoring";
import type { Requirement, ResumeChange } from "@/lib/schema";

const RESUME = `Maya Chen
Backend Engineer, Loopline (2021–present)
Built Python/FastAPI services handling 40M requests/day on AWS (ECS, RDS, SQS).
Cut p95 latency 38% by redesigning Postgres indexes and adding Redis caching.`;

const change = (before: string, after: string): ResumeChange => ({
  section: "Experience",
  before,
  after,
  reason: "surfaces the requirement",
  requirement: "PostgreSQL",
});

test("an exact match is replaced in place", () => {
  const result = applyChanges(RESUME, [
    change(
      "Cut p95 latency 38% by redesigning Postgres indexes and adding Redis caching.",
      "PostgreSQL performance: redesigned indexes, cut p95 latency 38%.",
    ),
  ]);

  assert.ok(result.text.includes("PostgreSQL performance"));
  assert.ok(!result.text.includes("Cut p95 latency 38% by redesigning"));
  assert.equal(result.applied.length, 1);
  assert.equal(result.unmatched.length, 0);
});

test("a reflowed or re-punctuated quote still matches", () => {
  // The model reflowed the line and straightened the en dash.
  const result = applyChanges(RESUME, [
    change(
      "Backend Engineer, Loopline   (2021-present)",
      "Senior Backend Engineer, Loopline (2021–present)",
    ),
  ]);

  assert.ok(result.text.includes("Senior Backend Engineer, Loopline"));
  assert.equal(result.applied.length, 1);
});

test("a rewrite that cannot be located is reported, not dropped", () => {
  const result = applyChanges(RESUME, [
    change("A line that appears nowhere in the resume", "Something else"),
  ]);

  assert.equal(result.applied.length, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.text, RESUME);
});

test("the rest of the resume is left untouched", () => {
  const result = applyChanges(RESUME, [change("Maya Chen", "Maya Chen — Backend Engineer")]);
  assert.ok(result.text.includes("40M requests/day"));
  assert.ok(result.text.includes("Redis caching"));
});

const requirement = (
  name: string,
  status: Requirement["status"],
  importance: Requirement["importance"] = "required",
): Requirement => ({ requirement: name, importance, status, evidence: "evidence" });

test("the ceiling upgrades only the partials a rewrite addresses", () => {
  const requirements = [
    requirement("Deep PostgreSQL experience", "partial"),
    requirement("Distributed systems", "partial"),
    requirement("Kubernetes in production", "missing"),
    requirement("Python backend services", "met"),
  ];

  const projection = bestCaseScore(requirements, ["Deep PostgreSQL experience"]);

  assert.deepEqual(projection.upgraded, ["Deep PostgreSQL experience"]);
  // 1 met + 1 upgraded + 1 partial (0.5) + 1 missing, out of 4 required.
  assert.equal(projection.score, 63);
});

test("no rewrite can close a missing requirement, even at best case", () => {
  const requirements = [
    requirement("Python", "met"),
    requirement("Kubernetes in production", "missing"),
  ];
  // Even if a change claims to serve it, a missing requirement stays missing.
  const projection = bestCaseScore(requirements, ["Kubernetes in production"]);
  assert.deepEqual(projection.upgraded, []);
  assert.equal(projection.score, 50);
});

test("loosely worded requirement labels still match", () => {
  const requirements = [requirement("Deep experience with PostgreSQL", "partial")];
  const projection = bestCaseScore(requirements, ["PostgreSQL experience"]);
  assert.equal(projection.upgraded.length, 1);
  assert.equal(projection.score, 100);
});
