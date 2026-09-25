"use client";

import { useState } from "react";

import type { ScreeningReport, TailoringResult } from "@/lib/schema";

/**
 * The candidate-facing half of the report: what to rewrite, and what no
 * rewrite can cover. Gaps are given equal weight on purpose -- the honest
 * answer to "this posting needs Kubernetes and you have none" is not a
 * cleverer sentence.
 */
function toneFor(delta: number): string {
  if (delta > 0) return "text-sage";
  if (delta < 0) return "text-oxblood";
  return "text-ink-soft";
}

export function TailoringView({
  tailoring,
  currentScore,
  verified,
  verifying,
  onVerify,
}: {
  tailoring: TailoringResult;
  currentScore: number;
  verified: ScreeningReport | null;
  verifying: boolean;
  onVerify: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const projected = verified?.match_percentage ?? tailoring.projection.score;
  const delta = projected - currentScore;
  const measured = verified !== null;

  async function copyResume() {
    try {
      await navigator.clipboard.writeText(tailoring.tailored_resume);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setDownloadError("Your browser blocked copying. Download the file instead.");
    }
  }

  async function downloadDocx() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch("/api/resume-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: tailoring.tailored_resume }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setDownloadError(data.error ?? "Couldn't build the document.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "resume-tailored.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Couldn't reach the server. Copy the text instead.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-16 sm:mt-20">
      <div className="animate-rise flex items-baseline justify-between gap-6 border-b border-ink/25 pb-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Tailored Resume
        </h2>
        <span className="label">Your words, better placed</span>
      </div>

      <p className="animate-rise mt-6 max-w-3xl text-[1.0625rem] leading-relaxed text-ink-soft text-pretty">
        {tailoring.summary}
      </p>

      {/* What the rewrite is worth, and the finished document. */}
      <div
        className="animate-rise mt-8 grid gap-8 border border-rule bg-[#fffdf8]/60 p-6 sm:grid-cols-[auto_1fr] sm:gap-12 sm:p-7"
        style={{ animationDelay: "40ms" }}
      >
        <div>
          <span className="label block">
            {measured ? "Re-screened score" : "Best case"}
          </span>
          <div className="mt-2 flex items-baseline gap-4">
            <span className="font-display text-3xl font-semibold tabular-nums text-ink-faint line-through decoration-ink-faint/40">
              {currentScore}%
            </span>
            <span
              className={`font-display text-[3.5rem] leading-none font-semibold tracking-tighter tabular-nums ${toneFor(delta)}`}
            >
              {projected}%
            </span>
            <span className={`font-mono text-sm ${toneFor(delta)}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
            {measured ? (
              <>
                Measured by screening the rewritten resume from scratch. Scores move
                several points between runs, so treat a small change as noise.
              </>
            ) : (
              <>
                The ceiling, not a forecast:{" "}
                {tailoring.projection.upgraded.length > 0 ? (
                  <>
                    what you&rsquo;d score if every one of the{" "}
                    {tailoring.projection.upgraded.length} requirement
                    {tailoring.projection.upgraded.length === 1 ? "" : "s"} you partly
                    evidence were read as fully met.
                  </>
                ) : (
                  <>what you&rsquo;d score if every rewrite landed perfectly.</>
                )}{" "}
                Screening grades what a resume says more than how it says it, so a
                re-screen usually lands lower.
              </>
            )}
          </p>
          {!measured && (
            <button
              type="button"
              onClick={onVerify}
              disabled={verifying}
              className="mt-4 cursor-pointer border border-ink/25 px-4 py-2 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint"
            >
              {verifying ? "Re-screening…" : "Verify by re-screening"}
            </button>
          )}
        </div>

        <div className="border-t border-rule pt-6 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-12">
          <span className="label block">Your tailored resume</span>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
            Every rewrite below, already applied to your resume. Formatting is plain,
            so restyle it in Word before sending.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void downloadDocx()}
              disabled={downloading}
              className="cursor-pointer bg-ink px-5 py-2.5 font-display text-base font-semibold tracking-tight text-paper transition-colors hover:bg-oxblood disabled:cursor-not-allowed disabled:bg-ink/25"
            >
              {downloading ? "Building…" : "Download .docx"}
            </button>
            <button
              type="button"
              onClick={() => void copyResume()}
              className="cursor-pointer border border-ink/25 px-4 py-2.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:border-ink hover:bg-ink hover:text-paper"
            >
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
          {tailoring.unapplied > 0 && (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {tailoring.unapplied} rewrite{tailoring.unapplied === 1 ? "" : "s"} below
              couldn&rsquo;t be matched to a line in your text, so {tailoring.unapplied === 1 ? "it isn't" : "they aren't"} in
              the file — apply {tailoring.unapplied === 1 ? "it" : "them"} by hand.
            </p>
          )}
          {downloadError && (
            <p className="mt-3 text-sm leading-relaxed text-oxblood">{downloadError}</p>
          )}
        </div>
      </div>

      <section
        className="animate-rise mt-6 border border-rule bg-[#fffdf8]/60 p-6 sm:p-7"
        style={{ animationDelay: "80ms" }}
      >
        <header className="mb-2 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
          <h3 className="font-display text-xl font-semibold tracking-tight">
            Suggested Rewrites
          </h3>
          <span className="label">
            {tailoring.changes.length} change{tailoring.changes.length === 1 ? "" : "s"}
          </span>
        </header>

        {tailoring.changes.length === 0 ? (
          <p className="pt-3 text-sm text-ink-faint italic">
            Nothing worth rewriting — the resume already says these things clearly.
          </p>
        ) : (
          <ul className="divide-y divide-rule/70">
            {tailoring.changes.map((change, i) => (
              <li key={i} className="py-6 first:pt-4 last:pb-2">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h4 className="font-mono text-xs tracking-[0.08em] text-ink">
                    {change.section}
                  </h4>
                  <span className="label">{change.requirement}</span>
                </div>

                <div className="space-y-2.5">
                  <p className="border-l-2 border-rule pl-4 text-[0.9375rem] leading-relaxed text-ink-faint line-through decoration-ink-faint/40">
                    {change.before}
                  </p>
                  <p className="border-l-2 border-sage pl-4 text-[0.9375rem] leading-relaxed text-ink">
                    {change.after}
                  </p>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  <span className="label mr-2">Why</span>
                  {change.reason}
                </p>

                {change.verify && change.verify.length > 0 && (
                  <p className="mt-3 border-l-2 border-amber bg-amber/5 py-2 pl-4 text-sm leading-relaxed text-ink-soft">
                    <span className="label mr-2 text-amber">Check first</span>
                    Your resume doesn&rsquo;t state {change.verify.join(", ")} anywhere. Keep
                    this line only if the figure is accurate.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {tailoring.gaps.length > 0 && (
        <section
          className="animate-rise mt-6 border border-rule bg-[#fffdf8]/60 p-6 sm:p-7"
          style={{ animationDelay: "160ms" }}
        >
          <header className="mb-5 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
            <h3 className="font-display text-xl font-semibold tracking-tight">
              What Rewriting Can&rsquo;t Fix
            </h3>
            <span className="label">Needs real experience</span>
          </header>
          <ul className="space-y-5">
            {tailoring.gaps.map((gap, i) => (
              <li key={i}>
                <h4 className="text-[0.9375rem] font-medium text-ink">{gap.requirement}</h4>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {gap.why_it_matters} {gap.how_to_close}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tailoring.rejected.length > 0 && (
        <p className="animate-rise mt-6 border-l-2 border-oxblood bg-oxblood/5 px-5 py-4 text-sm leading-relaxed text-ink-soft">
          <span className="label mr-2 text-oxblood">Withheld</span>
          {tailoring.rejected.length} suggested line
          {tailoring.rejected.length === 1 ? " was" : "s were"} dropped for claiming
          experience your resume doesn&rsquo;t show ({tailoring.rejected
            .flatMap((item) => item.invented)
            .join(", ")}
          ). A resume that claims what you can&rsquo;t defend costs you the interview, not
          just the job.
        </p>
      )}
    </div>
  );
}
