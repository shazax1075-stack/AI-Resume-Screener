import OpenAI from "openai";
import type { ZodType } from "zod";

/**
 * Everything both model-backed features share: the client, the JSON-mode
 * fallback this gateway needs, the time budget, and the rule that a visitor
 * never reads an upstream error message.
 *
 * Talks to an OpenAI-compatible gateway (Experiential Labs by default)
 * rather than a vendor SDK, so the same code can be pointed at any router or
 * self-hosted proxy via OPENAI_BASE_URL.
 */

const DEFAULT_BASE_URL = "https://api.experientiallabs.ai/v1";

/**
 * Chosen for latency as much as quality: the gateway's larger models took
 * 60-80s on these prompts, which exceeds the serverless function's own
 * lifetime, so a correct answer still reached the user as a platform timeout
 * page. This one answers in about 9s with comparable judgements.
 */
const DEFAULT_MODEL = "deepseek-v4.1-flash";

/** Below the route's `maxDuration`, so a slow generation is our error, not the platform's. */
const REQUEST_TIMEOUT_MS = 45_000;

/** Whole-request budget, covering the fallback attempt as well. */
const TOTAL_BUDGET_MS = 50_000;

/**
 * A failure with a message written for the person using the app. `detail`
 * carries the internals (gateway text, schema issues) for the server log
 * only, and `upstream` marks failures that are not the caller's fault so a
 * route can answer 502 rather than 400.
 */
export class ModelError extends Error {
  readonly detail?: string;
  readonly upstream: boolean;

  constructor(message: string, options: { detail?: string; upstream?: boolean } = {}) {
    super(message);
    this.name = "ModelError";
    this.detail = options.detail;
    this.upstream = options.upstream ?? false;
  }
}

export function resolveModel(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
}

function buildClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ModelError("This demo isn't configured to reach the model right now.", {
      detail:
        "OPENAI_API_KEY is not set. Add it to .env.local locally, or to the project's environment variables in Vercel.",
      upstream: true,
    });
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
  });
}

/**
 * Optional request parameters this gateway has rejected, remembered per
 * process so a rejection costs one wasted call rather than one per request.
 * Gateways vary in what they accept -- this one rejects `seed` outright and
 * `response_format` on some models -- so each is dropped on demand instead
 * of being assumed.
 */
const unsupported = {
  jsonMode: new Set<string>(),
  reasoningEffort: new Set<string>(),
};

function rejectsParameter(error: unknown, parameter: RegExp): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    parameter.test(message) &&
    /unsupported|not supported|invalid|unrecognized|unknown/i.test(message)
  );
}

function describe(error: unknown): string {
  if (error instanceof ModelError) return error.detail ?? error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Models don't reliably honor "raw JSON only"; tolerate a wrapping fence. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

type Attempt = { jsonMode: boolean; reasoningEffort: boolean };

async function requestCompletion(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
  attempt: Attempt,
  timeoutMs: number,
  maxTokens: number,
): Promise<string> {
  let completion;
  try {
    completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Reduces (but does not eliminate) run-to-run variation.
        temperature: 0,
        max_tokens: maxTokens,
        ...(attempt.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        // Reasoning models spend max_tokens on thinking before they write
        // anything; left unchecked this one burned the whole budget and
        // returned an empty message. Low effort keeps the answer and halves
        // the wait.
        ...(attempt.reasoningEffort ? { reasoning_effort: "low" as const } : {}),
      },
      { timeout: timeoutMs, maxRetries: 0 },
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "APIConnectionTimeoutError" || name === "AbortError") {
      throw new ModelError(
        "The model took too long to answer. It's under load — try again in a moment.",
        { detail: `timed out after ${timeoutMs}ms`, upstream: true },
      );
    }
    throw error;
  }

  const choice = completion.choices?.[0];
  const content = choice?.message?.content;
  if (!content?.trim()) {
    const reason = choice?.finish_reason;
    throw new ModelError("The model returned an empty response. Please try again.", {
      detail:
        reason === "length"
          ? `empty response: the model used all ${maxTokens} tokens before writing an answer`
          : `empty response (finish_reason: ${reason ?? "unknown"})`,
      upstream: true,
    });
  }
  return content;
}

function parseAgainst<T>(content: string, schema: ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(content));
  } catch {
    throw new ModelError("The model's reply wasn't valid JSON. Please try again.", {
      detail: "response was not parseable JSON",
      upstream: true,
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ModelError("The model's reply wasn't in the expected shape. Please try again.", {
      detail: `schema mismatch: ${issues}`,
      upstream: true,
    });
  }
  return result.data;
}

/**
 * Asks the model for JSON and returns it validated against `schema`.
 *
 * Tries JSON mode first and falls back to a plain request, because this
 * gateway rejects `response_format` on some models; the rejection is
 * remembered only when the gateway said that specifically, so a transient
 * failure can't permanently downgrade later requests.
 */
export async function requestJson<T>(
  system: string,
  user: string,
  schema: ZodType<T>,
  { maxTokens }: { maxTokens: number },
): Promise<T> {
  const client = buildClient();
  const model = resolveModel();
  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);
  const failures: string[] = [];

  // Two tries at most: the first with everything this gateway is believed to
  // support, the second with whatever the first one proved it doesn't.
  for (let round = 0; round < 2; round += 1) {
    const attempt: Attempt = {
      jsonMode: !unsupported.jsonMode.has(model),
      reasoningEffort: !unsupported.reasoningEffort.has(model),
    };

    try {
      return parseAgainst(
        await requestCompletion(
          client,
          model,
          system,
          user,
          attempt,
          Math.min(REQUEST_TIMEOUT_MS, remaining()),
          maxTokens,
        ),
        schema,
      );
    } catch (error) {
      failures.push(describe(error));

      let learned = false;
      if (attempt.jsonMode && rejectsParameter(error, /response_format|json_object/i)) {
        unsupported.jsonMode.add(model);
        learned = true;
      }
      if (attempt.reasoningEffort && rejectsParameter(error, /reasoning_effort/i)) {
        unsupported.reasoningEffort.add(model);
        learned = true;
      }
      // Retrying identically is just paying twice for the same failure,
      // unless the first attempt taught us which parameter to drop.
      if (!learned && round === 0) {
        unsupported.jsonMode.add(model);
      }

      // A retry is only worth starting if it can plausibly finish inside the
      // function's own lifetime; otherwise the platform kills us mid-flight.
      if (remaining() < 12_000) break;
    }
  }

  throw new ModelError(
    "The model couldn't produce a usable result. Please try again in a moment.",
    { detail: failures.join(" | "), upstream: true },
  );
}
