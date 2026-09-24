import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_INPUT_CHARS, clampToInputLimit } from "@/lib/limits";

test("text within the limit is returned untouched", () => {
  assert.equal(clampToInputLimit("short"), "short");
  const exact = "x".repeat(MAX_INPUT_CHARS);
  assert.equal(clampToInputLimit(exact), exact);
});

test("truncated text fits the limit including its ellipsis", () => {
  // The bug this guards: slicing to the limit and *then* appending an
  // ellipsis produced MAX_INPUT_CHARS + 1 characters, which the analyzer
  // then rejected as too long -- on text this app had produced itself.
  const clamped = clampToInputLimit("x".repeat(MAX_INPUT_CHARS + 5_000));
  assert.ok(clamped.length <= MAX_INPUT_CHARS, `got ${clamped.length}`);
  assert.ok(clamped.endsWith("…"));
});
