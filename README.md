# Screening Desk — AI Resume Screener

**[Live demo →](https://resume-ai-screener.vercel.app/)**

Link a job posting or paste the description, add a candidate resume, and get
back a structured screening report: a match score, the evidence for and against
the candidate, and interview questions aimed at the gaps.

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
   data, not instructions — and asks the model for a JSON report.
4. **Validate before rendering.** The response is parsed against a
   [zod](https://zod.dev) schema. The same schema is embedded in the prompt as
   JSON Schema, so what the model is asked for and what the UI accepts can't
   drift apart. A failed response is reported, never half-rendered.

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

### Notes from building it

- **The gateway rejects `response_format` and `seed`.** Strict schema mode
  returns `unsupported_capability`, so the schema goes in the prompt instead.
  Without it the model invents its own field names. The code tries JSON mode
  first, remembers a rejection, and falls back to a plain request.
- **Scores vary by a few points between runs** even at `temperature: 0`, since
  the gateway doesn't guarantee determinism and `seed` isn't supported. A
  rubric-based score (grade each requirement, compute the percentage in code)
  would be the fix.
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
```

| Variable          | Required | Default                                | Purpose                       |
| ----------------- | -------- | -------------------------------------- | ----------------------------- |
| `OPENAI_API_KEY`  | Yes      | —                                      | Key for the gateway           |
| `OPENAI_BASE_URL` | No       | `https://api.experientiallabs.ai/v1`   | Any OpenAI-compatible endpoint |
| `OPENAI_MODEL`    | No       | `qwen3.8-27b`                          | Model slug to request         |
| `DAILY_SCREENING_LIMIT` | No | `100`                                | Screenings per day, all visitors |

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — the defaults are correct.
3. Add `OPENAI_API_KEY` under **Settings → Environment Variables**.
4. Deploy. Every push to `main` redeploys.

## Project layout

```
app/
  page.tsx                Landing page and masthead
  api/analyze/route.ts    Screening endpoint (server-only, holds the key)
  api/extract/route.ts    File → text endpoint
  api/fetch-job/route.ts  Job posting URL → text endpoint
components/
  Screener.tsx          Input form, upload, loading and error states
  ReportView.tsx        The rendered report
lib/
  analyzer.ts           Prompt, model call, fallback, validation
  schema.ts             Report contract (zod → JSON Schema)
  resumeParser.ts       PDF / DOCX / TXT extraction
  jobFetcher.ts         Job posting URL → text, with SSRF guards
streamlit-app/          The original Python + Streamlit version
```

## The Streamlit original

This started as a Python/Streamlit app, kept in [`streamlit-app/`](streamlit-app/)
for reference. Streamlit needs a long-running server holding a websocket per
visitor, which Vercel's serverless model can't host — hence the rewrite.

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
