import type { TailoringResult } from "@/lib/schema";

/**
 * The candidate-facing half of the report: what to rewrite, and what no
 * rewrite can cover. Gaps are given equal weight on purpose -- the honest
 * answer to "this posting needs Kubernetes and you have none" is not a
 * cleverer sentence.
 */
export function TailoringView({ tailoring }: { tailoring: TailoringResult }) {
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

      <section
        className="animate-rise mt-8 border border-rule bg-[#fffdf8]/60 p-6 sm:p-7"
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
