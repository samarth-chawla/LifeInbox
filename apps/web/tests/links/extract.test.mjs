import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { extractHtml, fetchPublicHtml, isPublicAddress } from "../../server/links/extract.ts";
import { parsePublicWebUrl } from "../../server/links/url.ts";

const publicAnswer = { address: "93.184.216.34", family: 4 };
const source = "https://example.org/article";

function response(body, headers = { "content-type": "text/html" }, statusCode = 200) {
  return Object.assign(Readable.from([Buffer.from(body)]), { headers, statusCode });
}

test("accepts web URLs and rejects unsupported address syntax", () => {
  assert.equal(parsePublicWebUrl(source)?.hostname, "example.org");
  assert.equal(parsePublicWebUrl("file:///document.html"), null);
  assert.equal(parsePublicWebUrl("https://example.org:8443/article"), null);
  for (const address of ["192.168.0.10", "127.0.0.1", "169.254.1.2", "2001:db8::1", "fc00::1"]) {
    assert.equal(isPublicAddress(address), false);
  }
  assert.equal(isPublicAddress("2606:4700::1111"), true);
});

test("uses the approved address and validates a redirect before opening it", async () => {
  const calls = [];
  await assert.rejects(fetchPublicHtml(source, {
    async resolve(hostname) {
      return hostname === "example.org" ? [publicAnswer] : [publicAnswer, { address: "192.168.0.10", family: 4 }];
    },
    async open(url, address) {
      calls.push([url.href, address]);
      return response("", { location: "https://example.net/next" }, 302);
    },
  }), { code: "SOURCE_BLOCKED" });
  assert.deepEqual(calls, [[source, publicAnswer]]);
});

test("rejects non-HTML, compressed and oversized bodies", async () => {
  for (const [body, headers, code] of [
    ["binary", { "content-type": "application/pdf" }, "UNSUPPORTED_RESPONSE"],
    ["compressed", { "content-type": "text/html", "content-encoding": "gzip" }, "UNSUPPORTED_RESPONSE"],
    ["x".repeat(512 * 1024 + 1), { "content-type": "text/html" }, "RESPONSE_TOO_LARGE"],
  ]) {
    await assert.rejects(fetchPublicHtml(source, {
      resolve: async () => [publicAnswer],
      open: async () => response(body, headers),
    }), { code });
  }
});

test("normalizes readable text and metadata without retaining page markup or scripts", async () => {
  const html = await fetchPublicHtml(source, {
    resolve: async () => [publicAnswer],
    open: async () => response(`<title> Notes &amp; links </title>
      <meta name="description" content=" Page description ">
      <body><nav>Menu</nav><main><h1> Readable page </h1><p>A paragraph.</p>
      <script>script source</script><p hidden>hidden text</p></main>`),
  });
  assert.deepEqual(extractHtml(html), {
    title: "Notes & links", description: "Page description", text: "Readable page A paragraph.",
  });
});
