"use client";

import { useRef, useState, type DragEvent } from "react";

import { ReportView } from "@/components/ReportView";
import { SAMPLE_JOB_DESCRIPTION, SAMPLE_RESUME } from "@/lib/sample";
import type { ScreeningReport } from "@/lib/schema";

const ACCEPTED = ".txt,.pdf,.docx";

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
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const reportAnchor = useRef<HTMLDivElement>(null);

  const ready = jobDescription.trim().length > 0 && resumeText.trim().length > 0;

  async function fetchJobUrl() {
    if (!jobUrl.trim() || fetchingJob) return;
    setError(null);
    setFetchingJob(true);
    try {
      const response = await fetch("/api/fetch-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        setJobSource(null);
        setError({ label: "Link not read", message: data.error ?? "Couldn't read that link." });
        return;
      }
      setJobDescription(data.text);
      setJobSource(hostOf(jobUrl));
    } catch {
      setJobSource(null);
      setError({
        label: "Link not read",
        message: "Couldn't reach that link. Check your connection, or paste the description.",
      });
    } finally {
      setFetchingJob(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setExtracting(true);
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/extract", { method: "POST", body });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        setFileName(null);
        setError({ label: "File not read", message: data.error ?? "Could not read that file." });
        return;
      }
      setResumeText(data.text);
    } catch {
      setFileName(null);
      setError({
        label: "File not read",
        message: "Could not upload that file. Check your connection and try again.",
      });
    } finally {
      setExtracting(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function loadExample() {
    setJobDescription(SAMPLE_JOB_DESCRIPTION);
    setResumeText(SAMPLE_RESUME);
    setFileName(null);
    setJobUrl("");
    setJobSource(null);
    setError(null);
  }

  function reset() {
    setJobDescription("");
    setResumeText("");
    setFileName(null);
    setJobUrl("");
    setJobSource(null);
    setError(null);
    setReport(null);
  }

  async function analyze() {
    setError(null);
    setReport(null);
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
      if (!response.ok || !data.report) {
        setError({
          label: "Analysis failed",
          message: data.error ?? "The analysis failed. Please try again.",
        });
        return;
      }
      setReport(data.report);
      requestAnimationFrame(() =>
        reportAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch {
      setError({
        label: "Analysis failed",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
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
              placeholder="Paste a link to the posting…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => void fetchJobUrl()}
              disabled={!jobUrl.trim() || fetchingJob}
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
              02 / Candidate resume
            </label>
            <span className="label tabular-nums">
              {resumeText.length ? `${resumeText.length} chars` : ""}
            </span>
          </div>

          <div
            onDragOver={(event) => {
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
              className="shrink-0 cursor-pointer border border-ink/25 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:border-ink hover:bg-ink hover:text-paper"
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
            onChange={(event) => setResumeText(event.target.value)}
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
          disabled={!ready || analyzing || extracting || fetchingJob}
          className="group relative cursor-pointer bg-ink px-8 py-3.5 font-display text-lg font-semibold tracking-tight text-paper transition-all hover:bg-oxblood disabled:cursor-not-allowed disabled:bg-ink/25"
        >
          {analyzing ? "Screening…" : "Screen candidate"}
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

      <div ref={reportAnchor} className="scroll-mt-10">
        {report && <ReportView report={report} />}
      </div>
    </>
  );
}
