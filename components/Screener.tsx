"use client";

import { useRef, useState, type DragEvent } from "react";

import { ReportView } from "@/components/ReportView";
import { TailoringView } from "@/components/TailoringView";
import { SAMPLE_JOB_DESCRIPTION, SAMPLE_RESUME } from "@/lib/sample";
import type { ScreeningReport, TailoringResult } from "@/lib/schema";

type Mode = "recruiter" | "candidate";

/** Below this, tailoring is the obvious next step rather than a quiet option. */
const TAILOR_PROMINENT_BELOW = 75;

const ACCEPTED_EXTENSIONS = ["txt", "pdf", "docx"];
const ACCEPTED = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Shows where fetched text came from, e.g. "boards.greenhouse.io". */
function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return url;
  }
}

export function Screener() {
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobSource, setJobSource] = useState<string | null>(null);
  const [fetchingJob, setFetchingJob] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<{ label: string; message: string } | null>(null);
  const [report, setReport] = useState<ScreeningReport | null>(null);
  const [mode, setMode] = useState<Mode>("recruiter");
  const [tailoring, setTailoring] = useState<TailoringResult | null>(null);
  const [tailoringInProgress, setTailoringInProgress] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reportAnchor = useRef<HTMLDivElement>(null);
  /**
   * Bumped whenever the user resets or replaces the inputs. Responses that
   * come back against an older value are dropped, so clearing the form
   * mid-request can't be undone by a late reply landing on top of it.
   */
  const generation = useRef(0);
  const busy = analyzing || extracting || fetchingJob || tailoringInProgress;

  const ready = jobDescription.trim().length > 0 && resumeText.trim().length > 0;

  async function fetchJobUrl() {
    if (!jobUrl.trim() || busy) return;
    const ticket = generation.current;
    setError(null);
    setFetchingJob(true);
    try {
      const response = await fetch("/api/fetch-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (ticket !== generation.current) return;
      if (!response.ok || !data.text) {
        setJobSource(null);
        setError({ label: "Link not read", message: data.error ?? "Couldn't read that link." });
        return;
      }
      setJobDescription(data.text);
      setJobSource(hostOf(jobUrl));
      setReport(null);
      setTailoring(null);
    } catch {
      if (ticket !== generation.current) return;
      setJobSource(null);
      setError({
        label: "Link not read",
        message: "Couldn't reach that link. Check your connection, or paste the description.",
      });
    } finally {
      if (ticket === generation.current) setFetchingJob(false);
    }
  }

  async function handleFile(file: File) {
    if (busy) return;
    if (file.size > MAX_FILE_BYTES) {
      setError({
        label: "File not read",
        message: "That file is larger than 5 MB. Upload a smaller file, or paste the text.",
      });
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError({
        label: "File not read",
        message: `That file type isn't supported. Upload one of: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
      });
      return;
    }

    const ticket = generation.current;
    setError(null);
    setExtracting(true);
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body });
      const data = (await response.json()) as { text?: string; error?: string };
      if (ticket !== generation.current) return;
      if (!response.ok || !data.text) {
        setFileName(null);
        setError({ label: "File not read", message: data.error ?? "Could not read that file." });
        return;
      }
      setResumeText(data.text);
      setReport(null);
      setTailoring(null);
    } catch {
      if (ticket !== generation.current) return;
      setFileName(null);
      setError({
        label: "File not read",
        message: "Could not upload that file. Check your connection and try again.",
      });
    } finally {
      if (ticket === generation.current) setExtracting(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function loadExample() {
    generation.current += 1;
    setJobDescription(SAMPLE_JOB_DESCRIPTION);
    setResumeText(SAMPLE_RESUME);
    setFileName(null);
    setJobUrl("");
    setJobSource(null);
    setError(null);
    // The old report described a different candidate.
    setReport(null);
    setTailoring(null);
    setAnalyzing(false);
    setExtracting(false);
    setFetchingJob(false);
  }

  function reset() {
    generation.current += 1;
    setJobDescription("");
    setResumeText("");
    setFileName(null);
    setJobUrl("");
    setJobSource(null);
    setError(null);
    setReport(null);
    setTailoring(null);
    setAnalyzing(false);
    setExtracting(false);
    setFetchingJob(false);
    setTailoringInProgress(false);
  }

  async function analyze() {
    const ticket = generation.current;
    setError(null);
    setReport(null);
    setTailoring(null);
    setAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, resumeText }),
      });
      const data = (await response.json()) as {
        report?: ScreeningReport;
        error?: string;
      };
      if (ticket !== generation.current) return;
      if (!response.ok || !data.report) {
        setError({
          label: "Analysis failed",
          message: data.error ?? "The analysis failed. Please try again.",
        });
        return;
      }
      setReport(data.report);
      requestAnimationFrame(() => {
        reportAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        // Keyboard and screen-reader users get no cue from the scroll alone.
        reportAnchor.current?.focus({ preventScroll: true });
      });
    } catch {
      if (ticket !== generation.current) return;
      setError({
        label: "Analysis failed",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      if (ticket === generation.current) setAnalyzing(false);
    }
  }

  async function tailor() {
    if (!report || busy) return;
    const ticket = generation.current;
    setError(null);
    setTailoringInProgress(true);
    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The checklist from the screening, so this costs one model call.
        body: JSON.stringify({
          jobDescription,
          resumeText,
          requirements: report.requirements,
        }),
      });
      const data = (await response.json()) as {
        tailoring?: TailoringResult;
        error?: string;
      };
      if (ticket !== generation.current) return;
      if (!response.ok || !data.tailoring) {
        setError({
          label: "Rewrite failed",
          message: data.error ?? "The rewrite failed. Please try again.",
        });
        return;
      }
      setTailoring(data.tailoring);
    } catch {
      if (ticket !== generation.current) return;
      setError({
        label: "Rewrite failed",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      if (ticket === generation.current) setTailoringInProgress(false);
    }
  }

  return (
    <>
      {/* Same screening, two readings of it. */}
      <div className="mb-10 flex items-center gap-1 border-b border-rule pb-3">
        {(["recruiter", "candidate"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`cursor-pointer px-4 py-2 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors ${
              mode === option
                ? "bg-ink text-paper"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            {option === "recruiter" ? "I'm hiring" : "I'm applying"}
          </button>
        ))}
        <p className="ml-3 text-sm text-ink-faint">
          {mode === "recruiter"
            ? "Screen a candidate against a posting."
            : "See how your resume reads, and how to sharpen it."}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        {/* Job description */}
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <label htmlFor="job-description" className="label">
              01 / Job description
            </label>
            <span className="label tabular-nums">
              {jobSource && <span className="text-oxblood-soft">{jobSource} · </span>}
              {jobDescription.length ? `${jobDescription.length} chars` : ""}
            </span>
          </div>
          <div className="mb-3 flex items-center gap-2 border border-dashed border-rule px-3 py-2.5">
            <label htmlFor="job-url" className="sr-only">
              Job posting URL
            </label>
            <input
              id="job-url"
              type="url"
              inputMode="url"
              value={jobUrl}
              onChange={(event) => setJobUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void fetchJobUrl();
                }
              }}
              disabled={busy}
              placeholder="Paste a link to the posting…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => void fetchJobUrl()}
              disabled={!jobUrl.trim() || busy}
              className="shrink-0 cursor-pointer border border-ink/25 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint disabled:hover:bg-transparent"
            >
              {fetchingJob ? "Reading…" : "Fetch"}
            </button>
          </div>

          <textarea
            id="job-description"
            value={jobDescription}
            onChange={(event) => {
              setJobDescription(event.target.value);
              if (jobSource) setJobSource(null);
              if (error) setError(null);
            }}
            placeholder="…or paste the full job description here — responsibilities, requirements, nice-to-haves."
            className="field h-[15.5rem] w-full resize-y p-4 text-[0.9375rem] leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* Resume */}
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <label htmlFor="resume" className="label">
              02 / {mode === "recruiter" ? "Candidate resume" : "Your resume"}
            </label>
            <span className="label tabular-nums">
              {resumeText.length ? `${resumeText.length} chars` : ""}
            </span>
          </div>

          <div
            onDragOver={(event) => {
              if (busy) return;
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mb-3 flex items-center justify-between gap-4 border border-dashed px-4 py-3 transition-colors ${
              dragging ? "border-oxblood bg-oxblood/5" : "border-rule bg-transparent"
            }`}
          >
            <p className="text-sm text-ink-soft">
              {extracting ? (
                <span className="text-ink-faint">Reading {fileName}…</span>
              ) : fileName ? (
                <>
                  <span className="font-mono text-xs text-oxblood-soft">{fileName}</span>{" "}
                  <span className="text-ink-faint">— text extracted below</span>
                </>
              ) : (
                <>
                  Drop a <span className="font-mono text-xs">PDF</span>,{" "}
                  <span className="font-mono text-xs">DOCX</span> or{" "}
                  <span className="font-mono text-xs">TXT</span> here
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="shrink-0 cursor-pointer border border-ink/25 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint"
            >
              Browse
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
          </div>

          <textarea
            id="resume"
            value={resumeText}
            onChange={(event) => {
              setResumeText(event.target.value);
              if (error) setError(null);
            }}
            placeholder="…or paste the resume text here. Uploaded files land here first so you can check the extraction."
            className="field h-[15.5rem] w-full resize-y p-4 text-[0.9375rem] leading-relaxed"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Action bar */}
      <div className="rule-top mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 pt-6">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={!ready || busy}
          className="group relative cursor-pointer bg-ink px-8 py-3.5 font-display text-lg font-semibold tracking-tight text-paper transition-all hover:bg-oxblood disabled:cursor-not-allowed disabled:bg-ink/25"
        >
          {analyzing
            ? "Screening…"
            : mode === "recruiter"
              ? "Screen candidate"
              : "Score my resume"}
        </button>

        <button
          type="button"
          onClick={loadExample}
          className="cursor-pointer font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-soft underline decoration-rule underline-offset-4 transition-colors hover:text-oxblood hover:decoration-oxblood"
        >
          Load example
        </button>

        {(jobDescription || resumeText || report) && (
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-faint underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            Clear
          </button>
        )}

        {!ready && !analyzing && (
          <p className="label normal-case tracking-normal">
            Add a job description and a resume to begin.
          </p>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {tailoringInProgress
          ? "Rewriting your resume"
          : analyzing
          ? "Screening in progress"
          : extracting
            ? "Reading the uploaded file"
            : fetchingJob
              ? "Reading the job posting link"
              : ""}
      </p>

      {analyzing && (
        <div className="mt-8 flex items-center gap-3">
          <span
            aria-hidden
            className="h-px flex-1 bg-oxblood"
            style={{ animation: "pulse-rule 1.4s ease-in-out infinite" }}
          />
          <span className="label">Reading resume against requirements</span>
          <span
            aria-hidden
            className="h-px flex-1 bg-oxblood"
            style={{ animation: "pulse-rule 1.4s ease-in-out infinite" }}
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="animate-rise mt-8 border-l-2 border-oxblood bg-oxblood/5 px-5 py-4"
        >
          <span className="label text-oxblood">{error.label}</span>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{error.message}</p>
        </div>
      )}

      <div ref={reportAnchor} tabIndex={-1} className="scroll-mt-10 outline-none">
        {report && <ReportView report={report} mode={mode} />}

        {report && mode === "candidate" && !tailoring && (
          <div className="rule-top mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 pt-6">
            <button
              type="button"
              onClick={() => void tailor()}
              disabled={busy}
              className={`cursor-pointer px-7 py-3 font-display text-lg font-semibold tracking-tight transition-all disabled:cursor-not-allowed disabled:bg-ink/25 ${
                report.match_percentage < TAILOR_PROMINENT_BELOW
                  ? "bg-ink text-paper hover:bg-oxblood"
                  : "border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-paper"
              }`}
            >
              {tailoringInProgress ? "Rewriting…" : "Tailor my resume"}
            </button>
            <p className="max-w-md text-sm leading-relaxed text-ink-soft">
              {report.match_percentage < TAILOR_PROMINENT_BELOW
                ? "Your resume is under the line for this posting. This rewrites your own lines to surface what's already there — it never invents experience."
                : "Already a strong match. A rewrite can still sharpen how the evidence reads."}
            </p>
          </div>
        )}

        {tailoring && <TailoringView tailoring={tailoring} />}
      </div>
    </>
  );
}
