import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { SMTPServer } from "smtp-server";

const host = "127.0.0.1";
const databaseUrl = process.env.LIFEINBOX_TEST_DATABASE_URL;

async function waitFor(check, message, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(message);
}

async function availablePort() {
  const socket = createServer().listen(0, host);
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

function mailBody(mail) {
  const [, ...body] = mail.split(/\r?\n\r?\n/);
  return Buffer.from(body.join("").replace(/\s/g, ""), "base64")
    .toString("utf8");
}

function sessionCookie(response) {
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie, "Expected a session cookie");
  assert.ok(/;\s*HttpOnly\b/i.test(cookie), "Session cookie must be HttpOnly");
  assert.ok(/;\s*SameSite=Lax\b/i.test(cookie), "Session cookie must use SameSite=Lax");
  return cookie.split(";", 1)[0];
}

test("Phase 1 authentication against PostgreSQL", { timeout: 120_000 }, async (t) => {
  assert.ok(databaseUrl, "Set LIFEINBOX_TEST_DATABASE_URL to a dedicated migrated database");
  const db = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  t.after(() => db.end());
  const database = (await db.query("SELECT current_database() AS name")).rows[0].name;
  assert.ok(database.endsWith("_test"), "Use a disposable database whose name ends in _test");
  await db.query('SELECT 1 FROM auth."user" LIMIT 1');

  const mailbox = [];
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["AUTH", "STARTTLS"],
    onData(stream, session, done) {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.once("error", done);
      stream.once("end", () => {
        mailbox.push({
          recipients: session.envelope.rcptTo.map((recipient) => recipient.address),
          raw: Buffer.concat(chunks).toString("utf8"),
        });
        done();
      });
    },
  });
  await new Promise((resolve, reject) => {
    smtp.once("error", reject);
    smtp.listen(0, host, resolve);
  });
  t.after(() => new Promise((resolve) => smtp.close(resolve)));

  const port = await availablePort();
  const base = `http://${host}:${port}`;
  const serverFile = fileURLToPath(new URL("serve.mjs", import.meta.url));
  const app = spawn(process.execPath, [serverFile, String(port)], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: base,
      BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
      AUTH_SMTP_URL: `smtp://${host}:${smtp.server.address().port}`,
      AUTH_EMAIL_FROM: "lifeinbox@example.test",
      TRIAL_STORAGE_ALLOWANCE_BYTES: "100",
      AUTH_TRUSTED_CLIENT_IP_HEADER: "x-lifeinbox-test-ip",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  const exited = once(app, "exit");
  t.after(async () => {
    if (app.exitCode !== null || app.signalCode !== null) return;
    app.kill("SIGTERM");
    await exited;
  });
  await waitFor(async () => {
    if (app.exitCode !== null) throw new Error("Next.js exited before the integration server was ready");
    try { return (await fetch(base, { signal: AbortSignal.timeout(3_000) })).ok; } catch { return false; }
  }, "Integration server did not start");

  const octets = randomBytes(3);
  const testIp = `10.${octets[0]}.${octets[1]}.${octets[2]}`;
  const password = randomBytes(24).toString("hex");
  const first = `first-${randomUUID()}@example.test`;
  const second = `second-${randomUUID()}@example.test`;

  function request(path, { payload, cookie, headers = {} } = {}) {
    return fetch(new URL(path, base), {
      method: payload === undefined ? "GET" : "POST",
      redirect: "manual",
      headers: {
        Origin: base,
        "x-lifeinbox-test-ip": testIp,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  }

  function auth(path, options) {
    return request(`/api/auth${path}`, options);
  }

  async function emailMessage(email, subject, offset = 0) {
    const mail = await waitFor(
      () => mailbox.slice(offset).find((entry) => entry.recipients.includes(email) && entry.raw.includes(`Subject: ${subject}`)),
      "The test SMTP inbox did not receive the expected email",
    );
    const body = mailBody(mail.raw);
    const link = body.split(/\r?\n/).find((line) => /^https?:\/\//.test(line));
    assert.ok(link, "Expected a URL in the test email");
    assert.equal(new URL(link).origin, base);
    return { link, code: body.match(/verification page: (\d{6})\b/)?.[1] };
  }

  async function register(email) {
    const response = await auth("/sign-up/email", { payload: { name: "LifeInbox Test", email, password, callbackURL: "/sign-in" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.ok(!response.headers.getSetCookie().some((value) => value.includes("session_token=")));
    const row = await db.query(
      `SELECT u.id AS subject, i.owner_id,
              a.password IS NOT NULL AND a.password <> $2 AS password_hashed
         FROM auth."user" u
         JOIN lifeinbox.owner_identities i ON i.provider = 'better-auth' AND i.subject = u.id
         JOIN auth.account a ON a."userId" = u.id
        WHERE u.email = $1`,
      [email, password],
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].password_hashed, true);
    assert.match(row.rows[0].owner_id, /^[0-9a-f-]{36}$/);
    assert.notEqual(row.rows[0].owner_id, row.rows[0].subject);
    return row.rows[0];
  }

  async function signIn(email, secret = password) {
    const response = await auth("/sign-in/email", { payload: { email, password: secret } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    return sessionCookie(response);
  }

  await t.test("signed-out and invalid sessions are rejected", async () => {
    assert.equal((await request("/api/v1/me")).status, 401);
    assert.equal((await request("/api/v1/me", { cookie: "better-auth.session_token=invalid" })).status, 401);
    const response = await auth("/sign-up/email", {
      payload: { name: "Untrusted Origin", email: `untrusted-${randomUUID()}@example.test`, password },
      headers: { Origin: "https://untrusted.example", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors" },
    });
    assert.equal(response.status, 403);
  });

  await t.test("auth pages render and the protected account page redirects", async () => {
    const signInPage = await request("/sign-in");
    assert.equal(signInPage.status, 200);
    assert.match(await signInPage.text(), /<form[^>]*method="post"/i);
    for (const [path, heading] of [
      ["/sign-up", "Create an account"],
      ["/forgot-password", "Reset your password"],
      ["/verify-email", "Verify your email"],
    ]) {
      const page = await request(path);
      assert.equal(page.status, 200, path);
      const html = await page.text();
      assert.ok(html.includes(heading), path);
      if (path === "/verify-email") {
        assert.match(html, /autocomplete="one-time-code"/i);
        assert.match(html, /Send a new verification email/);
      }
    }
    assert.equal((await request("/unknown-auth-screen")).status, 404);
    const reset = await request("/reset-password");
    assert.equal(reset.headers.get("referrer-policy"), "no-referrer");
    assert.equal(reset.headers.get("cache-control"), "no-store");
    const account = await request("/account");
    assert.equal(account.status, 307);
    assert.equal(new URL(account.headers.get("location"), base).pathname, "/sign-in");
  });

  const firstOwner = await register(first);
  const secondOwner = await register(second);
  await t.test("verification mail includes both a link and a code", async () => {
    assert.notEqual(firstOwner.owner_id, secondOwner.owner_id);
    assert.equal((await auth("/sign-in/email", { payload: { email: first, password } })).status, 403);
    const linkMail = await emailMessage(second, "Verify your LifeInbox email");
    assert.ok(linkMail.code, "Expected a six-digit code alongside the link");
    const verified = await request(linkMail.link);
    assert.equal(verified.status, 302);
    assert.equal(new URL(verified.headers.get("location"), base).pathname, "/sign-in");
  });

  await t.test("a new verification code replaces an expired code and can be used once", async () => {
    const path = "/email-otp/verify-email";
    const original = await emailMessage(first, "Verify your LifeInbox email");
    assert.ok(original.code, "Expected a code in the signup email");
    const identifier = `email-verification-otp-${first}`;
    const storedCode = await db.query(
      'UPDATE auth.verification SET "expiresAt" = now() - interval \'1 minute\' WHERE identifier = $1 RETURNING value',
      [identifier],
    );
    assert.equal(storedCode.rowCount, 1);
    assert.ok(!storedCode.rows[0].value.startsWith(`${original.code}:`), "The code must not be stored in plaintext");
    assert.equal((await auth(path, { payload: { email: first, otp: original.code } })).status, 400);

    const offset = mailbox.length;
    const resend = await auth("/send-verification-email", { payload: { email: first, callbackURL: "/sign-in" } });
    assert.equal(resend.status, 200);
    const { code } = await emailMessage(first, "Verify your LifeInbox email", offset);
    assert.ok(code, "Expected a code in the replacement email");
    const payload = { email: first, otp: code };
    assert.equal((await auth(path, { payload, headers: { Origin: "https://untrusted.example" } })).status, 403);
    const wrongCode = (code[0] === "1" ? "2" : "1") + code.slice(1);
    assert.equal((await auth(path, { payload: { ...payload, otp: wrongCode } })).status, 400);
    const verified = await auth(path, { payload });
    assert.equal(verified.status, 200);
    assert.deepEqual(await verified.json(), { ok: true });
    assert.equal(verified.headers.getSetCookie().length, 0);
    assert.equal((await auth(path, { payload })).status, 400);
    assert.equal((await auth("/sign-in/email-otp", { payload })).status, 404);
  });

  const beforeSignIn = await db.query("SELECT owner_id FROM lifeinbox.owner_trials WHERE owner_id = $1", [firstOwner.owner_id]);
  assert.equal(beforeSignIn.rowCount, 0, "Email verification alone must not start the trial");
  let firstSession = await signIn(first);
  const secondSession = await signIn(second);
  const afterSignIn = await db.query("SELECT started_at FROM lifeinbox.owner_trials WHERE owner_id = $1", [firstOwner.owner_id]);
  assert.equal(afterSignIn.rowCount, 1, "Successful sign-in must start the trial before the first account request");
  await db.query("DELETE FROM lifeinbox.owner_trials WHERE owner_id = $1", [secondOwner.owner_id]);

  await t.test("protected requests use the authenticated owner and ignore spoofed IDs", async () => {
    const response = await request(`/api/v1/me?ownerId=${secondOwner.owner_id}`, {
      cookie: firstSession,
      headers: { "x-owner-id": secondOwner.owner_id },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const account = await response.json();
    assert.deepEqual(Object.keys(account).sort(), ["createdAt", "ownerId", "trial"]);
    assert.equal(account.ownerId, firstOwner.owner_id);
    assert.equal(account.trial.startedAt, afterSignIn.rows[0].started_at.toISOString());
    assert.equal(account.trial.allowanceBytes, 100);
    assert.equal(account.trial.status, "active");
    const other = await request("/api/v1/me", { cookie: secondSession });
    const otherAccount = await other.json();
    assert.equal(otherAccount.ownerId, secondOwner.owner_id);
    assert.equal(otherAccount.trial.status, "active", "Existing sessions start their trial on the first account request");
    const accountPage = await request("/account", { cookie: firstSession });
    assert.match(await accountPage.text(), /Free trial active/);

    const status = await auth("/get-session", { cookie: firstSession });
    assert.deepEqual(await status.json(), { authenticated: true });
    const stored = await db.query('SELECT count(*)::int AS count FROM auth.session WHERE "userId" = $1', [firstOwner.subject]);
    assert.equal(stored.rows[0].count, 1);
  });

  await t.test("expired sessions fail and logout revokes the stored session", async () => {
    await db.query('UPDATE auth.session SET "expiresAt" = now() - interval \'1 minute\' WHERE "userId" = $1', [firstOwner.subject]);
    assert.equal((await request("/api/v1/me", { cookie: firstSession })).status, 401);
    firstSession = await signIn(first);
    const signedOut = await auth("/sign-out", { payload: {}, cookie: firstSession });
    assert.equal(signedOut.status, 200);
    assert.equal((await request("/api/v1/me", { cookie: firstSession })).status, 401);
  });

  await t.test("password recovery uses an emailed link and revokes prior sessions", async () => {
    firstSession = await signIn(first);
    const queued = await auth("/request-password-reset", { payload: { email: first, redirectTo: "/reset-password" } });
    assert.equal(queued.status, 200);
    const callback = await request((await emailMessage(first, "Reset your LifeInbox password")).link);
    assert.equal(callback.status, 302);
    const location = new URL(callback.headers.get("location"), base);
    assert.equal(location.pathname, "/reset-password");
    const token = location.searchParams.get("token");
    assert.ok(token, "Expected a one-time reset token in the callback");
    const newPassword = randomBytes(24).toString("hex");
    assert.equal((await auth("/reset-password", { payload: { token, newPassword } })).status, 200);
    assert.equal((await request("/api/v1/me", { cookie: firstSession })).status, 401);
    assert.equal((await auth("/sign-in/email", { payload: { email: first, password } })).status, 401);
    firstSession = await signIn(first, newPassword);
    const current = await request("/api/v1/me", { cookie: firstSession });
    assert.equal((await current.json()).ownerId, firstOwner.owner_id);
  });

  await t.test("an expired trial keeps the account available and reports why it ended", async () => {
    await db.query(
      `UPDATE lifeinbox.owner_trials SET started_at = now() - interval '168 hours', deadline = now()
       WHERE owner_id = $1`,
      [firstOwner.owner_id],
    );
    const response = await request("/api/v1/me", { cookie: firstSession });
    assert.equal(response.status, 200);
    const { trial } = await response.json();
    assert.equal(trial.status, "ended");
    assert.equal(trial.endReason, "time");
    assert.equal(trial.endedAt, trial.deadline);
    const page = await request("/account", { cookie: firstSession });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Free trial ended/);
  });

  await t.test("missing and inactive owners fail closed", async () => {
    await db.query("DELETE FROM lifeinbox.owner_identities WHERE provider = $1 AND subject = $2", ["better-auth", secondOwner.subject]);
    assert.equal((await request("/api/v1/me", { cookie: secondSession })).status, 403);
    const signInWithoutOwner = await auth("/sign-in/email", { payload: { email: second, password } });
    assert.ok(!signInWithoutOwner.ok, "A missing owner must prevent a new session");
    assert.equal(signInWithoutOwner.headers.getSetCookie().length, 0);
    await db.query("UPDATE lifeinbox.owners SET active = false WHERE id = $1", [firstOwner.owner_id]);
    assert.equal((await request("/api/v1/me", { cookie: firstSession })).status, 403);
  });

  await t.test("the owner trigger rolls back with an uncommitted auth insert", async () => {
    const subject = randomUUID();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, 'Rollback test', $2, false, now(), now())`,
        [subject, `rollback-${subject}@example.test`],
      );
      const mapping = await client.query("SELECT owner_id FROM lifeinbox.owner_identities WHERE subject = $1", [subject]);
      assert.equal(mapping.rowCount, 1);
      await client.query("ROLLBACK");
      assert.equal((await db.query('SELECT id FROM auth."user" WHERE id = $1', [subject])).rowCount, 0);
      assert.equal((await db.query("SELECT owner_id FROM lifeinbox.owner_identities WHERE subject = $1", [subject])).rowCount, 0);
      assert.equal((await db.query("SELECT id FROM lifeinbox.owners WHERE id = $1", [mapping.rows[0].owner_id])).rowCount, 0);
    } finally {
      client.release(true);
    }
  });

  await t.test("recovery requests use the PostgreSQL-backed rate limit", async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await auth("/request-password-reset", {
        payload: { email: `unknown-${randomUUID()}@example.test`, redirectTo: "/reset-password" },
      });
      assert.equal(response.status, 200);
    }
    const limited = await auth("/request-password-reset", {
      payload: { email: `limited-${randomUUID()}@example.test`, redirectTo: "/reset-password" },
    });
    assert.equal(limited.status, 429);
  });
});
