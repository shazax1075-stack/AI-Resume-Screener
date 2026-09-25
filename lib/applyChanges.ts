import type { ResumeChange } from "@/lib/schema";

/**
 * Rebuilds the resume with the accepted rewrites in place.
 *
 * The model is told to copy `before` verbatim, and mostly does, but a
 * reflowed bullet or a smart quote is enough to break an exact match. So
 * matching falls back to a whitespace- and punctuation-insensitive search
 * before giving up, and a rewrite that still can't be located is reported
 * rather than dropped silently -- the candidate needs to know which lines
 * they have to change by hand.
 */

export type AppliedChanges = {
  text: string;
  applied: ResumeChange[];
  unmatched: ResumeChange[];
};

/** Collapses whitespace and normalises quotes and dashes for comparison. */
function normalize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Finds `needle` in `haystack` ignoring whitespace and punctuation
 * differences, returning the span in the original string.
 */
function findLoosely(haystack: string, needle: string): [number, number] | null {
  const target = normalize(needle);
  if (!target) return null;

  // Map each normalized character back to its index in the original text.
  const indices: number[] = [];
  let normalized = "";
  let lastWasSpace = true;
  for (let i = 0; i < haystack.length; i += 1) {
    const raw = haystack[i]
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-");
    if (/\s/.test(raw)) {
      if (lastWasSpace) continue;
      normalized += " ";
      indices.push(i);
      lastWasSpace = true;
      continue;
    }
    normalized += raw.toLowerCase();
    indices.push(i);
    lastWasSpace = false;
  }

  const at = normalized.indexOf(target);
  if (at === -1) return null;

  const start = indices[at];
  const endIndex = indices[Math.min(at + target.length - 1, indices.length - 1)];
  return [start, endIndex + 1];
}

export function applyChanges(
  resumeText: string,
  changes: ResumeChange[],
): AppliedChanges {
  let text = resumeText;
  const applied: ResumeChange[] = [];
  const unmatched: ResumeChange[] = [];

  for (const change of changes) {
    if (!change.before.trim()) {
      unmatched.push(change);
      continue;
    }

    const exact = text.indexOf(change.before);
    if (exact !== -1) {
      text = text.slice(0, exact) + change.after + text.slice(exact + change.before.length);
      applied.push(change);
      continue;
    }

    const span = findLoosely(text, change.before);
    if (span) {
      text = text.slice(0, span[0]) + change.after + text.slice(span[1]);
      applied.push(change);
      continue;
    }

    unmatched.push(change);
  }

  return { text, applied, unmatched };
}
