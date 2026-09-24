import type {
  HiringRecommendation,
  Requirement,
  RequirementStatus,
  ScreeningReport,
} from "@/lib/schema";

const RECOMMENDATION_STYLE: Record<
  HiringRecommendation,
  { text: string; border: string; dot: string }
> = {
  "Strong Pass": {
    text: "text-sage",
    border: "border-sage/40",
    dot: "bg-sage",
  },
  "Proceed to Interview": {
    text: "text-sage",
    border: "border-sage/35",
    dot: "bg-sage",
  },
  Hold: {
    text: "text-amber",
    border: "border-amber/40",
    dot: "bg-amber",
  },
  Reject: {
    text: "text-oxblood",
    border: "border-oxblood/40",
    dot: "bg-oxblood",
  },
};

function scoreTone(score: number): string {
  if (score >= 75) return "text-sage";
  if (score >= 50) return "text-amber";
  return "text-oxblood";
}

function meterTone(score: number): string {
  if (score >= 75) return "bg-sage";
  if (score >= 50) return "bg-amber";
  return "bg-oxblood";
}

/** Typographic score meter: a printed rule that fills to the score. */
function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="w-full">
      <div className="relative h-[3px] w-full bg-rule/70">
        <div
          className={`h-full origin-left ${meterTone(clamped)} animate-sweep`}
          style={{ ["--sweep-to" as string]: clamped / 100, transform: `scaleX(${clamped / 100})` }}
        />
        {[25, 50, 75].map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="absolute top-[-4px] h-[11px] w-px bg-rule"
            style={{ left: `${tick}%` }}
          />
        ))}
      </div>
      <div className="label mt-2 flex justify-between">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function BulletPanel({
  title,
  index,
  items,
  accent,
  delay,
}: {
  title: string;
  index: string;
  items: string[];
  accent: string;
  delay: number;
}) {
  return (
    <section
      className="animate-rise border border-rule bg-[#fffdf8]/60 p-6 sm:p-7"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="mb-5 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
        <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
        <span className="label">{index}</span>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint italic">None identified.</p>
      ) : (
        <ul className="space-y-3.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              <span aria-hidden className={`mt-2 h-1.5 w-1.5 shrink-0 ${accent}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STATUS_STYLE: Record<
  RequirementStatus,
  { mark: string; label: string; text: string; border: string }
> = {
  met: { mark: "✓", label: "Met", text: "text-sage", border: "border-sage/50" },
  partial: {
    mark: "~",
    label: "Partial",
    text: "text-amber",
    border: "border-amber/50",
  },
  missing: {
    mark: "✕",
    label: "Missing",
    text: "text-oxblood",
    border: "border-oxblood/50",
  },
};

/** The checklist the score is computed from — the report's evidence base. */
function RequirementsTable({
  requirements,
  delay,
}: {
  requirements: Requirement[];
  delay: number;
}) {
  return (
    <section
      className="animate-rise mt-6 border border-rule bg-[#fffdf8]/60 p-6 sm:p-7"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="mb-1 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
        <h3 className="font-display text-xl font-semibold tracking-tight">
          Requirement Checklist
        </h3>
        <span className="label">00 / What the score is built from</span>
      </header>

      <ul className="divide-y divide-rule/70">
        {requirements.map((item, i) => {
          const style = STATUS_STYLE[item.status];
          return (
            <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-x-3 py-4 sm:gap-x-4">
              <span
                aria-hidden
                className={`mt-0.5 font-mono text-sm leading-6 ${style.text}`}
              >
                {style.mark}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4 className="font-medium text-[0.9375rem] leading-6 text-ink">
                    {item.requirement}
                  </h4>
                  <span className={`label ${style.text}`}>
                    <span className="sr-only">Status: </span>
                    {style.label}
                  </span>
                  {item.importance === "required" ? (
                    <span className="label">Required</span>
                  ) : (
                    <span className="label opacity-70">Preferred</span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {item.evidence}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ReportView({ report }: { report: ScreeningReport }) {
  const recommendation = RECOMMENDATION_STYLE[report.hiring_recommendation];

  return (
    <div className="mt-16 sm:mt-20">
      <div className="animate-rise flex items-baseline justify-between gap-6 border-b border-ink/25 pb-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Screening Report
        </h2>
        <span className="label">Generated assessment</span>
      </div>

      {/* Verdict block: oversized numeral as the anchor, badge beside it. */}
      <div className="animate-rise mt-10 grid gap-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:gap-14">
        <div>
          <span className="label block">Match score</span>
          <div className="mt-2 flex items-start">
            <span
              className={`font-display text-[5.5rem] leading-[0.82] font-semibold tracking-tighter tabular-nums sm:text-[7rem] ${scoreTone(
                report.match_percentage,
              )}`}
            >
              {report.match_percentage}
            </span>
            <span className="mt-2 ml-1 font-display text-2xl text-ink-faint">%</span>
          </div>
          <p className="mt-3 font-mono text-xs leading-relaxed text-ink-soft">
            {report.tally.met} met · {report.tally.partial} partial ·{" "}
            {report.tally.missing} missing
            <span className="block text-ink-faint">
              of {report.tally.total} requirements
            </span>
          </p>
        </div>

        <div className="flex flex-col justify-end gap-6">
          <div>
            <span className="label block">Recommendation</span>
            <div
              className={`mt-3 inline-flex items-center gap-2.5 border px-4 py-2 ${recommendation.border} ${recommendation.text}`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${recommendation.dot}`} />
              <span className="font-display text-lg font-semibold tracking-tight">
                {report.hiring_recommendation}
              </span>
            </div>
          </div>
          <ScoreMeter score={report.match_percentage} />
        </div>
      </div>

      <RequirementsTable requirements={report.requirements} delay={80} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BulletPanel
          title="Key Strengths"
          index="01 / Evidence for"
          items={report.key_strengths}
          accent="bg-sage"
          delay={160}
        />
        <BulletPanel
          title="Critical Gaps"
          index="02 / Evidence against"
          items={report.critical_gaps}
          accent="bg-oxblood"
          delay={240}
        />
      </div>

      <section
        className="animate-rise mt-6 border border-rule bg-[#fffdf8]/60 p-6 sm:p-7"
        style={{ animationDelay: "320ms" }}
      >
        <header className="mb-5 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
          <h3 className="font-display text-xl font-semibold tracking-tight">
            Suggested Interview Questions
          </h3>
          <span className="label">03 / Probe the gaps</span>
        </header>
        <ol className="space-y-5">
          {report.target_interview_questions.map((question, i) => (
            <li key={i} className="flex gap-4">
              <span className="font-mono text-xs text-oxblood-soft tabular-nums pt-1">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{question}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
