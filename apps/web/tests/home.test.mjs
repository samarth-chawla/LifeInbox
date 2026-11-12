import assert from "node:assert/strict";
import test from "node:test";

test("the LifeInbox home page serves the shell with baseline security headers", async () => {
  const response = await fetch("http://127.0.0.1:3000", {
    signal: AbortSignal.timeout(30_000),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-powered-by"), null);

  const html = await response.text();

  assert.match(html, /<title>LifeInbox<\/title>/);
  assert.match(html, /<main\b/);
  assert.match(html, /<h1[^>]*>Save anything\./);
  assert.match(html, /Planned capture types/);
});
