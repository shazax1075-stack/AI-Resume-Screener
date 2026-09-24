import { Screener } from "@/components/Screener";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      {/* Masthead */}
      <header className="animate-rise mb-14 sm:mb-20">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oxblood" aria-hidden />
          <span className="label">Screening desk</span>
        </div>

        <h1 className="mt-5 font-display text-[2.75rem] leading-[0.95] font-semibold tracking-tight text-balance sm:text-6xl">
          Read a resume the way a{" "}
          <em className="text-oxblood not-italic">hiring manager</em> would.
        </h1>

        <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft text-pretty">
          Link to a job posting or paste the description, then upload the
          candidate&rsquo;s resume. Get back a structured screening report — match
          score, the evidence for and against, and the questions worth asking in
          the first interview.
        </p>

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3">
          {[
            ["Job", "Posting link or pasted text"],
            ["Resume", "PDF · DOCX · plain text"],
            ["Output", "Structured, schema-checked"],
            ["Time", "About 10 seconds"],
          ].map(([term, detail]) => (
            <div key={term} className="flex items-baseline gap-2.5">
              <dt className="label">{term}</dt>
              <dd className="font-mono text-xs text-ink-soft">{detail}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Screener />

      <footer className="rule-top mt-24 flex flex-wrap items-center justify-between gap-4 pt-6">
        <p className="label normal-case tracking-normal">
          Screening assistance only — every hiring decision stays with a person.
        </p>
        <p className="label">Demo · 10 per hour · capped daily</p>
      </footer>
    </main>
  );
}
