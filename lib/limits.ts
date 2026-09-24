/** Shared input ceilings, so producers and validators can't disagree. */

/** Maximum characters accepted for the job description or the resume. */
export const MAX_INPUT_CHARS = 20_000;

/** Truncates to fit MAX_INPUT_CHARS *including* the ellipsis it appends. */
export function clampToInputLimit(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;
  return `${text.slice(0, MAX_INPUT_CHARS - 1).trimEnd()}…`;
}
