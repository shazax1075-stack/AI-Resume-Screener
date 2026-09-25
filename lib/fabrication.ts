import type { Requirement, ResumeChange } from "@/lib/schema";

/**
 * Enforces the one rule tailoring must not break: a rewrite may reframe what
 * the resume says, never add to it.
 *
 * The prompt says so too, but a prompt is advice. A candidate who sends out a
 * resume claiming Kubernetes because a model thought it would help fails the
 * first technical screen, and the tool that did it to them is worse than
 * useless. So every rewrite is checked against the original text, and
 * anything that introduces a skill the resume never mentioned is dropped
 * rather than shown.
 *
 * The check is deliberately narrow: it looks for the specific terms of
 * requirements the screening graded `missing`, and for numbers that appear
 * from nowhere. Broad novel-word detection would fire on ordinary rewording
 * ("led" for "managed") and bury the real cases.
 */

/** Words too common to identify anything on their own. */
const STOPWORDS = new Set([
  "a", "an", "and", "the", "or", "of", "in", "on", "at", "to", "for", "with",
  "years", "year", "experience", "experienced", "strong", "deep", "proven",
  "track", "record", "plus", "least", "using", "use", "used", "work",
  "working", "knowledge", "familiarity", "understanding", "ability", "able",
  "production", "environments", "environment", "systems", "system", "tools",
  "tooling", "skills", "background", "hands", "solid", "excellent", "good",
  "senior", "junior", "level", "team", "teams", "engineer", "engineering",
  "developer", "development", "software", "including", "such", "as", "is",
  "are", "be", "been", "must", "should", "have", "has", "will", "you", "your",
]);

/** Splits text into comparable lowercase tokens, keeping things like "c++" and "3.11". */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

/** Terms from a requirement that would identify it if they appeared in a rewrite. */
export function identifyingTerms(requirement: string): string[] {
  return Array.from(
    new Set(
      tokenize(requirement).filter(
        (token) => token.length > 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token),
      ),
    ),
  );
}

/** True when the resume mentions the term anywhere, however it is cased. */
function resumeMentions(resumeTokens: Set<string>, term: string): boolean {
  if (resumeTokens.has(term)) return true;
  // "postgresql" should count as evidence for "postgres", and vice versa.
  for (const token of resumeTokens) {
    if (token.length > 3 && (token.startsWith(term) || term.startsWith(token))) {
      return true;
    }
  }
  return false;
}

export type Inventions = {
  /** Skills or tools the resume never mentions. Not shown to the user at all. */
  terms: string[];
  /**
   * Numbers with no source in the resume. Often legitimate arithmetic -- a
   * resume dated "2018-present" supports "7 years" without saying it -- so
   * these are surfaced for the candidate to confirm rather than discarded.
   */
  numbers: string[];
};

/** Returns whatever a rewrite introduces that the resume never said. */
export function findInventions(
  change: ResumeChange,
  resumeText: string,
  missingRequirements: Requirement[],
): Inventions {
  const resumeTokens = new Set(tokenize(resumeText));
  const afterTokens = new Set(tokenize(change.after));
  const terms = new Set<string>();
  const numbers = new Set<string>();

  for (const requirement of missingRequirements) {
    for (const term of identifyingTerms(requirement.requirement)) {
      if (afterTokens.has(term) && !resumeMentions(resumeTokens, term)) {
        terms.add(term);
      }
    }
  }

  for (const token of afterTokens) {
    if (/^\d+(\.\d+)?$/.test(token) && !resumeTokens.has(token)) {
      numbers.add(token);
    }
  }

  return { terms: Array.from(terms), numbers: Array.from(numbers) };
}

/** A rewrite the resume supports, with anything the candidate should confirm. */
export type ReviewedChange = ResumeChange & { verify?: string[] };

export type ScreenedChanges = {
  changes: ReviewedChange[];
  rejected: { after: string; invented: string[] }[];
};

/**
 * Splits rewrites three ways: safe, safe-but-worth-confirming, and dropped.
 *
 * A rewrite claiming a skill the resume never showed is removed outright --
 * that is the failure mode that gets a candidate caught. A rewrite using a
 * number the resume doesn't state is kept but marked, because the candidate
 * is the one who knows whether it's true.
 */
export function rejectFabrications(
  changes: ResumeChange[],
  resumeText: string,
  requirements: Requirement[],
): ScreenedChanges {
  const missing = requirements.filter((item) => item.status === "missing");
  const kept: ReviewedChange[] = [];
  const rejected: { after: string; invented: string[] }[] = [];

  for (const change of changes) {
    const { terms, numbers } = findInventions(change, resumeText, missing);
    if (terms.length > 0) {
      rejected.push({ after: change.after, invented: terms });
      continue;
    }
    kept.push(numbers.length > 0 ? { ...change, verify: numbers } : change);
  }

  return { changes: kept, rejected };
}
