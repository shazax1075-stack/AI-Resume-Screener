import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";

import { JobFetchError, fetchJobDescription, htmlToText } from "@/lib/jobFetcher";

/**
 * The guards these cover are the reason this endpoint is safe to expose:
 * it makes the server fetch a URL an anonymous visitor supplies. Each case
 * asserts the request is refused *before* any connection is opened, which a
 * local server standing in for the target verifies by counting its hits.
 */

let requestsSeen = 0;
const server = createServer((_req, res) => {
  requestsSeen += 1;
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<html><body><p>should never be reached</p></body></html>");
});

const listening = new Promise<number>((resolve) => {
  server.listen(0, "127.0.0.1", () => {
    resolve((server.address() as { port: number }).port);
  });
});

after(() => server.close());

async function assertRefused(url: string) {
  await assert.rejects(
    () => fetchJobDescription(url),
    (error: unknown) => error instanceof JobFetchError,
    `expected ${url} to be refused`,
  );
}

test("refuses loopback addresses", async () => {
  const port = await listening;
  await assertRefused(`http://127.0.0.1:${port}/job`);
  await assertRefused(`http://[::1]:${port}/job`);
});

test("refuses the cloud metadata endpoint", async () => {
  // The address that turns an SSRF into leaked cloud credentials.
  await assertRefused("http://169.254.169.254/latest/meta-data/");
});

test("refuses private and carrier-grade NAT ranges", async () => {
  await assertRefused("http://10.0.0.5/jobs");
  await assertRefused("http://172.16.0.1/jobs");
  await assertRefused("http://192.168.1.1/jobs");
  await assertRefused("http://100.64.0.1/jobs");
  await assertRefused("http://0.0.0.0/jobs");
});

test("refuses IPv4-mapped IPv6 forms of blocked addresses", async () => {
  await assertRefused("http://[::ffff:169.254.169.254]/latest/meta-data/");
  await assertRefused("http://[::ffff:127.0.0.1]/jobs");
});

test("refuses schemes other than http and https", async () => {
  await assertRefused("file:///etc/passwd");
  await assertRefused("ftp://example.com/jobs");
  await assertRefused("gopher://example.com/jobs");
});

test("refuses input that is not a URL at all", async () => {
  await assertRefused("not a url at all !!");
});

test("re-checks the address after a redirect", async () => {
  // A public hostname is free to redirect into the private network, so the
  // hop matters as much as the original URL.
  const redirector = createServer((_req, res) => {
    res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
  });
  const port = await new Promise<number>((resolve) => {
    redirector.listen(0, "127.0.0.1", () =>
      resolve((redirector.address() as { port: number }).port),
    );
  });

  try {
    await assertRefused(`http://127.0.0.1:${port}/redirect`);
  } finally {
    redirector.close();
  }
});

test("no refused URL ever opened a connection", async () => {
  assert.equal(requestsSeen, 0);
});

test("htmlToText strips scripts, styles and markup", () => {
  const text = htmlToText(
    `<html><head><style>.a{color:red}</style><script>var x=1;</script></head>
     <body><main><h1>Senior Engineer</h1><p>We&#39;re hiring at Acme &amp; Co.</p>
     <ul><li>5+ years Python</li><li>PostgreSQL &lt;3</li></ul></main></body></html>`,
  );

  assert.ok(!text.includes("color:red"), "dropped style contents");
  assert.ok(!text.includes("var x"), "dropped script contents");
  assert.ok(!/<[a-z/]/i.test(text), "dropped tags");
  assert.ok(text.includes("We're hiring at Acme & Co."), "decoded entities");
  assert.ok(text.includes("- 5+ years Python"), "kept list items as bullets");
  assert.ok(text.includes("PostgreSQL <3"), "decoded escaped angle brackets");
});

test("htmlToText survives out-of-range character references", () => {
  // Valid HTML that browsers render as U+FFFD; String.fromCodePoint throws.
  const text = htmlToText("<html><body><p>Pay&#x1FFFFFF; range&#99999999;</p></body></html>");
  assert.ok(text.includes("Pay"), "kept surrounding text");
  assert.ok(text.includes("range"), "kept surrounding text");
});

test("htmlToText prefers the main region over surrounding chrome", () => {
  const posting = "Job posting body. ".repeat(40);
  const text = htmlToText(
    `<html><body><nav>Home Careers Login</nav><main><p>${posting}</p></main>
     <footer>Cookie settings</footer></body></html>`,
  );

  assert.ok(text.includes("Job posting body."), "kept the posting");
  assert.ok(!text.includes("Home Careers Login"), "dropped the navigation");
  assert.ok(!text.includes("Cookie settings"), "dropped the footer");
});
