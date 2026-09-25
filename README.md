# Screening Desk — AI Resume Screener

**[Live demo →](https://resume-ai-screener.vercel.app/)**

![A screening report: a 66% match score, the verdict "Proceed to Interview", a
requirement checklist grading each requirement met, partial or missing with the
resume evidence behind it, then strengths, gaps and suggested interview
questions.](docs/report.png)

Link a job posting or paste the description, add a resume, and get back a
structured screening report: a match score derived from a requirement
checklist, the evidence for and against, and interview questions aimed at the
gaps.

It reads two ways. **Hiring** gives you the recruiter's verdict. **Applying**
gives the candidate the same checklist plus a tailored rewrite of their own
resume — one that reframes what the resume already says and refuses to invent
what it doesn't.

Built with Next.js (App Router), TypeScript and Tailwind, deployed on Vercel.
The model runs behind an OpenAI-compatible gateway, called only from the server
so the API key never reaches the browser.

## How it works

1. **Link the job posting (or paste it).** `POST /api/fetch-job` fetches the
   page server-side and reduces it to readable text, preferring the `<main>`
   or `<article>` region and stripping navigation. The text lands in an
   editable box, so a page that pulls in extra boilerplate can be trimmed
   before screening.
2. **Upload or paste a resume.** `POST /api/extract` turns a PDF, DOCX or TXT
   file into plain text ([unpdf](https://github.com/unjs/unpdf) and
   [mammoth](https://github.com/mwilliamson/mammoth.js)). The text lands in an
   editable box so the extraction can be checked before it's sent.
3. **Screen the candidate.** `POST /api/analyze` builds an injection-resistant
   prompt — resume and job description are delimited and explicitly marked as
   data, not instructions — and asks the model to work as a checklist: list
   every requirement the posting states, mark each required or preferred, and
   grade it met / partial / missing with the resume detail that justifies it.
4. **Compute the score in code.** The model is explicitly told *not* to output
   a score. [`lib/scoring.ts`](lib/scoring.ts) derives it from the gradings:
   required requirements weigh 1, preferred 0.35, and met / partial / missing
   earn full / half / no credit. The verdict follows the score, with a floor
   for missing must-haves — two unmet requirements cap a candidate at Hold
   however many nice-to-haves they have.
5. **Tailor it, honestly.** In candidate mode, `POST /api/tailor` takes the
   checklist from the screening — so it costs one model call, not two — and
   returns line-by-line rewrites with the requirement each one serves, plus
   the gaps no rewrite can cover.
6. **Validate before rendering.** The response is parsed against a
   [zod](https://zod.dev) schema. The same schema is embedded in the prompt as
   JSON Schema, so what the model is asked for and what the UI accepts can't
   drift apart. A failed response is reported, never half-rendered.

### Refusing to lie for the user

A resume rewriter has an obvious failure mode: the quickest way to raise a
match score is to claim the missing skill. That gets the candidate caught in
the first technical screen, so the rule is that a rewrite may reframe what the
resume says and never add to it.

The prompt says so at length, but a prompt is advice.
[`lib/fabrication.ts`](lib/fabrication.ts) enforces it: every rewrite is
checked against the original resume, and anything introducing a term from a
requirement the screening graded `missing` is dropped before the candidate
ever sees it. The report says how many were withheld and why.

Numbers are handled separately. A resume dated "2018–present" supports "7
years" without stating it, so an unsourced figure is kept but flagged — "your
resume doesn't state this anywhere; keep it only if it's accurate" — because
the candidate is the one who knows. Both behaviours have tests.

### Why the score isn't generated

Asking a model for "a match percentage" gets a different number every run —
the same resume scored 62% to 72% across four runs of the first version. It
is also unfalsifiable: there is nothing behind the number to check.

Grading one requirement at a time is a smaller, better-defined judgement, and
the arithmetic on top is deterministic. Run-to-run spread on the sample pair
dropped from about 10 points to about 6, and what remains comes from the model
finding 11 or 12 requirements in the same posting rather than from the score
itself. More importantly the report now shows its working: every point is
traceable to a requirement and the resume line behind it. Extracting the
requirements in a separate cached pass would close most of the remaining gap,
at the cost of a second model call per screening.

### Fetching URLs safely

An endpoint that makes the server fetch a visitor-supplied URL is a
server-side request forgery risk by construction, so
[`lib/jobFetcher.ts`](lib/jobFetcher.ts):

- accepts only `http`/`https`, rejecting `file:`, `ftp:` and the rest;
- resolves the hostname and refuses private, loopback, link-local and
  carrier-grade NAT ranges — including `169.254.169.254`, the cloud metadata
  endpoint;
- follows redirects manually, re-checking the address at every hop, since a
  public hostname can redirect to an internal one;
- caps the response at 2 MB with a 12-second timeout, and accepts only HTML
  or plain text.

Job boards that render postings with JavaScript, or that block unfamiliar
clients (LinkedIn and Indeed among them), can't be read this way. The app
says so and asks for pasted text instead.

### Why this model

The first version ran on a larger model that took 60-80 seconds on this
prompt. Vercel stops a serverless function at 60 seconds, so a perfectly good
screening reached the user as the platform's raw timeout page. The checklist
work made it worse, since the model now writes an evidence line per
requirement.

Three things fixed it: the prompt caps what gets written (ten requirements,
20-word evidence, five questions), generation is capped by `max_tokens`, and
the default model is now `deepseek-v4.1-flash` — about 9 seconds for gradings
comparable to the slow model's. The analyzer also keeps its own 45-second
deadline and skips the fallback attempt when too little time is left, so a
slow gateway produces a written explanation rather than a platform error page.

### Notes from building it

- **The gateway rejects `response_format` and `seed`.** Strict schema mode
  returns `unsupported_capability`, so the schema goes in the prompt instead.
  Without it the model invents its own field names. The code tries JSON mode
  first, remembers a rejection, and falls back to a plain request.
- **The gateway isn't deterministic** even at `temperature: 0`, and `seed` is
  rejected outright, which is why the score is computed from gradings rather
  than generated.
- **The demo is rate limited** to 10 screenings per hour per visitor, plus a
  global daily budget (`DAILY_SCREENING_LIMIT`, default 100) so a link that
  gets passed around can't run up the bill. Inputs are capped too. Both
  limiters are in-memory and per-instance, which makes them a backstop rather
  than an accounting guarantee; a shared store (Vercel KV, Upstash) would make
  them exact.

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your API key
npm run dev                  # http://localhost:3000
npm test                     # unit tests (scoring, SSRF guards), no API key needed
```

| Variable                | Required | Default                              | Purpose                          |
| ----------------------- | -------- | ------------------------------------ | -------------------------------- |
| `OPENAI_API_KEY`        | Yes      | —                                    | Key for the gateway              |
| `OPENAI_BASE_URL`       | No       | `https://api.experientiallabs.ai/v1` | Any OpenAI-compatible endpoint   |
| `OPENAI_MODEL`          | No       | `deepseek-v4.1-flash`                | Model slug to request            |
| `DAILY_SCREENING_LIMIT` | No       | `100`                                | Screenings per day, all visitors |

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — the defaults are correct.
3. Add `OPENAI_API_KEY` under **Settings → Environment Variables**.
4. Deploy. Every push to `main` redeploys.

## Project layout

```
app/
  layout.tsx              Fonts, metadata and the link preview card
  page.tsx                Landing page and masthead
  globals.css             Design tokens: paper, ink, oxblood, type scale
  api/analyze/route.ts    Screening endpoint (server-only, holds the key)
  api/extract/route.ts    File → text endpoint
  api/fetch-job/route.ts  Job posting URL → text endpoint
  api/tailor/route.ts     Checklist → honest resume rewrites
components/
  Screener.tsx            Input form, upload, loading and error states
  ReportView.tsx          The rendered report and requirement checklist
  TailoringView.tsx       Rewrites, what to verify, and what can't be fixed
lib/
  gateway.ts              Shared model client: JSON mode, retries, budgets
  analyzer.ts             Screening prompt and validation
  tailor.ts               Rewriting prompt and validation
  fabrication.ts          Drops rewrites that invent experience
  scoring.ts              Gradings → score and recommendation
  schema.ts               Report contract (zod → JSON Schema)
  resumeParser.ts         PDF / DOCX / TXT extraction
  jobFetcher.ts           Job posting URL → text, with SSRF guards
  rateLimit.ts            Per-visitor limits and the global daily budget
  limits.ts               Shared input ceilings
  sample.ts               The one-click example
  *.test.ts               Unit tests (scoring, SSRF guards, limits)
streamlit-app/            The original Python + Streamlit version
```

## The Streamlit original

This started as a Python/Streamlit app, kept in [`streamlit-app/`](streamlit-app/)
for reference. Streamlit needs a long-running server holding a websocket per
visitor, which Vercel's serverless model can't host — hence the rewrite.

It is also the before picture for the scoring change above:
[`streamlit-app/backend/schema.py`](streamlit-app/backend/schema.py) asks the
model for `match_percentage` and `hiring_recommendation` directly. Watching the
same resume come back as 62% and then 72% is what motivated deriving both from
a checklist instead.

```bash
cd streamlit-app
python3 -m venv .venv && source .venv/bin/activate   # needs Python 3.10+
pip install -r requirements.txt
streamlit run app.py
```

## Limitations

- Screening assistance only. Every hiring decision stays with a person.
- The model can misread unusual resume formats; the extracted text is editable
  for that reason.
- Scanned, image-only PDFs have no text layer and can't be read.
- Job posting links work for server-rendered pages. Postings behind a login,
  or rendered entirely in the browser, need to be pasted.
