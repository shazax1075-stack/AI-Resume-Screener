import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { clampToInputLimit } from "@/lib/limits";

/**
 * Fetches a job posting URL and reduces the page to readable text.
 *
 * This endpoint takes a URL from an anonymous visitor and makes the server
 * request it, so it is a server-side request forgery risk by construction:
 * without checks, a visitor could point it at cloud metadata endpoints or
 * anything else reachable from inside the network. Hence the scheme,
 * address and redirect restrictions below.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export class JobFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFetchError";
  }
}

/** Private, loopback, link-local and other non-public ranges. */
function isBlockedAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const ip = address.toLowerCase();
    if (ip === "::1" || ip === "::") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique local
    if (ip.startsWith("fe80")) return true; // link-local
    // IPv4-mapped IPv6, e.g. ::ffff:169.254.169.254
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const literal = isIP(hostname);
  if (literal) {
    if (isBlockedAddress(hostname)) {
      throw new JobFetchError("That address isn't allowed. Use a public job posting URL.");
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new JobFetchError(`Couldn't find that site (${hostname}). Check the URL.`);
  }

  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new JobFetchError("That address isn't allowed. Use a public job posting URL.");
  }
}

function parseUrl(raw: string): URL {
  const trimmed = raw.trim();
  // Requires the "//" so "acme.com:8080/jobs" reads as a host and port,
  // the way a browser address bar treats it, not as a scheme named acme.com.
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    throw new JobFetchError("Only http and https links are supported.");
  }
  // Accept "acme.com/jobs/123" the way a browser address bar would.
  const candidate = scheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new JobFetchError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new JobFetchError("Only http and https links are supported.");
  }
  return url;
}

function codePointOrReplacement(code: number, original: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "\ufffd";
  try {
    return String.fromCodePoint(code);
  } catch {
    return original;
  }
}

/** Strips markup, scripts and boilerplate down to readable text. */
export function htmlToText(html: string): string {
  let working = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas|iframe|template|select)[\s\S]*?<\/\1>/gi, " ");

  // Prefer the main content region when the page marks one; job boards wrap
  // the posting in <main>, <article> or role="main", surrounded by chrome.
  const main =
    working.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    working.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ??
    working.match(/<div\b[^>]*\brole=["']main["'][^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>)?/i);
  if (main && main[1].length > 400) working = main[1];

  // Strip surrounding navigation that survives the region pick.
  working = working.replace(
    /<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );

  return working
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&copy;/gi, "©")
    .replace(/&(mdash|ndash);/gi, (_, dash: string) => (dash.toLowerCase() === "mdash" ? "—" : "–"))
    .replace(/&(lsquo|rsquo);/gi, "'")
    .replace(/&(ldquo|rdquo);/gi, '"')
    .replace(/&hellip;/gi, "…")
    // A page may contain a code point outside Unicode's range; browsers
    // render those as U+FFFD, and String.fromCodePoint would throw.
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) =>
      codePointOrReplacement(parseInt(hex, 16), match),
    )
    .replace(/&#(\d+);/g, (match, code: string) =>
      codePointOrReplacement(Number(code), match),
    )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isReadableType(contentType: string | null): boolean {
  return /text\/html|text\/plain|application\/xhtml/i.test(contentType ?? "");
}

async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    throw new JobFetchError("That page is too large to read. Paste the description instead.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new JobFetchError("That page is too large to read. Paste the description instead.");
  }
  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Resolves a job posting URL to plain text.
 *
 * Redirects are followed manually so every hop is re-checked: a public
 * hostname can redirect to an internal address otherwise.
 */
export async function fetchJobDescription(rawUrl: string): Promise<string> {
  let url = parseUrl(rawUrl);
  let response: Response | null = null;
  // One budget for the whole chain: a per-hop timeout lets four slow hops
  // outlast the serverless function itself, which replaces this module's
  // friendly message with a platform timeout page.
  const deadline = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url.hostname);

    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: deadline,
        headers: {
          // Some job boards return an error page to an unidentified client.
          "User-Agent":
            "Mozilla/5.0 (compatible; ScreeningDesk/1.0; +https://github.com/)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new JobFetchError("That page took too long to respond. Paste the description instead.");
      }
      throw new JobFetchError("Couldn't reach that page. Check the link, or paste the description instead.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      // Redirect bodies are never read; release the socket rather than
      // leaving it for the garbage collector.
      await response.body?.cancel().catch(() => {});
      if (!location) break;
      try {
        url = new URL(location, url);
      } catch {
        throw new JobFetchError("That page redirected somewhere invalid.");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new JobFetchError("That page redirected to an unsupported address.");
      }
      response = null;
      continue;
    }
    break;
  }

  if (!response) {
    throw new JobFetchError("That page redirected too many times.");
  }

  if (!response.ok || !isReadableType(response.headers.get("content-type"))) {
    await response.body?.cancel().catch(() => {});
  }

  if (response.status === 401 || response.status === 403) {
    throw new JobFetchError(
      "That site blocked the request — many job boards do. Open the posting and paste the text instead.",
    );
  }
  if (!response.ok) {
    throw new JobFetchError(
      `That page returned an error (${response.status}). Paste the description instead.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!isReadableType(contentType)) {
    throw new JobFetchError(
      "That link isn't a web page. Paste the job description text instead.",
    );
  }

  const body = await readCapped(response);
  const text = contentType.includes("text/plain") ? body.trim() : htmlToText(body);

  if (text.length < 120) {
    throw new JobFetchError(
      "Couldn't find readable text on that page — it may need JavaScript or a login. Paste the description instead.",
    );
  }

  // Clamped to what /api/analyze accepts: text this endpoint produced must
  // never be rejected downstream for being too long.
  return clampToInputLimit(text);
}
