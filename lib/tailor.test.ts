import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanRequirementLabel } from "@/lib/tailor";

test("a plain requirement is left alone", () => {
  assert.equal(cleanRequirementLabel("Kubernetes in production"), "Kubernetes in production");
});

test("checklist decoration is stripped from a label", () => {
  // What the model echoed back verbatim from the checklist it was given.
  assert.equal(
    cleanRequirementLabel("[missing] (required) Kubernetes — No Kubernetes mentioned in resume."),
    "Kubernetes",
  );
  assert.equal(
    cleanRequirementLabel("- [partial] (preferred) Kafka, event-driven — Uses SQS and Celery"),
    "Kafka, event-driven",
  );
});

test("a label with no decoration but an em dash keeps its first clause", () => {
  assert.equal(cleanRequirementLabel("AWS infrastructure — including ECS"), "AWS infrastructure");
});
