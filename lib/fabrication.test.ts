import assert from "node:assert/strict";
import { test } from "node:test";

import { findInventions, identifyingTerms, rejectFabrications } from "@/lib/fabrication";
import type { Requirement, ResumeChange } from "@/lib/schema";

const RESUME = `Maya Chen — Backend Engineer
Built Python/FastAPI services handling 40M requests/day on AWS (ECS, RDS, SQS).
Cut p95 latency 38% by redesigning Postgres indexes and adding Redis caching.
Mentored 3 junior engineers. Django REST APIs for checkout. Docker, GitHub Actions.`;

const missing = (requirement: string): Requirement => ({
  requirement,
  importance: "required",
  status: "missing",
  evidence: "The resume does not address this.",
});

const change = (after: string): ResumeChange => ({
  section: "Experience",
  before: "Built Python/FastAPI services",
  after,
  reason: "surfaces the requirement",
  requirement: "Backend Python",
});

test("identifying terms drop filler and keep the distinctive words", () => {
  const terms = identifyingTerms("5+ years of production Kubernetes experience");
  assert.ok(terms.includes("kubernetes"));
  assert.ok(!terms.includes("years"));
  assert.ok(!terms.includes("experience"));
  assert.ok(!terms.includes("production"));
});

test("a rewrite that invents a missing skill is caught", () => {
  const { terms } = findInventions(
    change("Ran Python services on Kubernetes at 40M requests/day"),
    RESUME,
    [missing("Kubernetes in production")],
  );
  assert.deepEqual(terms, ["kubernetes"]);
});

test("reframing what the resume already says is allowed", () => {
  const { terms, numbers } = findInventions(
    change("PostgreSQL performance: redesigned indexes, cut p95 latency 38%"),
    RESUME,
    [missing("Kubernetes in production")],
  );
  assert.deepEqual(terms, []);
  assert.deepEqual(numbers, []);
});

test("a rewrite may use a spelling variant of something the resume shows", () => {
  // The resume says "Postgres"; "PostgreSQL" is the same fact, not a new one.
  const { terms } = findInventions(
    change("Deep PostgreSQL work: index redesign and Redis caching"),
    RESUME,
    [missing("PostgreSQL at scale")],
  );
  assert.deepEqual(terms, []);
});

test("a number the resume never states is flagged, not dropped", () => {
  const { terms, numbers } = findInventions(
    change("Cut p95 latency 65% by redesigning Postgres indexes"),
    RESUME,
    [],
  );
  assert.deepEqual(terms, []);
  assert.deepEqual(numbers, ["65"]);
});

test("a flagged number reaches the candidate marked for confirmation", () => {
  // "7 years" is arithmetic on dates the resume gives, so the candidate
  // should decide, not the checker.
  const result = rejectFabrications(
    [change("7 years building Python services on AWS")],
    RESUME,
    [],
  );
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.changes[0].verify, ["7"]);
  assert.equal(result.rejected.length, 0);
});

test("numbers the resume already claims are left alone", () => {
  const { numbers } = findInventions(
    change("Handled 40M requests/day; cut p95 latency 38%; mentored 3 engineers"),
    RESUME,
    [],
  );
  assert.deepEqual(numbers, []);
});

test("only fabricated rewrites are dropped, and they are reported", () => {
  const requirements = [missing("Kubernetes in production")];
  const result = rejectFabrications(
    [
      change("PostgreSQL: redesigned indexes, cut p95 latency 38%"),
      change("Deployed services to Kubernetes clusters"),
    ],
    RESUME,
    requirements,
  );

  assert.equal(result.changes.length, 1);
  assert.ok(result.changes[0].after.startsWith("PostgreSQL"));
  assert.equal(result.rejected.length, 1);
  assert.deepEqual(result.rejected[0].invented, ["kubernetes"]);
});

test("requirements the resume already meets don't constrain the rewrite", () => {
  // "Python" is only forbidden if the screening said the resume lacks it.
  const met: Requirement = {
    requirement: "Python backend services",
    importance: "required",
    status: "met",
    evidence: "Python/FastAPI services.",
  };
  const result = rejectFabrications(
    [change("Python backend services at 40M requests/day")],
    RESUME,
    [met],
  );
  assert.equal(result.changes.length, 1);
  assert.equal(result.rejected.length, 0);
});
