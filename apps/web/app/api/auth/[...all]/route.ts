import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../server/auth";
import { getEnv, ServerConfigError } from "../../../../server/env";

const verifyCodePath = "/email-otp/verify-email";

const postPaths = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/send-verification-email",
  verifyCodePath,
  "/request-password-reset",
  "/reset-password",
]);

async function handle(request: Request) {
  const path = new URL(request.url).pathname.slice("/api/auth".length);
  const allowed = request.method === "POST"
    ? postPaths.has(path)
    : path === "/get-session" || path === "/verify-email" || /^\/reset-password\/[^/]+$/.test(path);
  if (!allowed) return Response.json({ code: "NOT_FOUND" }, { status: 404 });

  try {
    if (path === verifyCodePath && request.headers.get("origin") !== getEnv().authOrigin) {
      return Response.json({ code: "AUTH_REQUEST_FAILED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const handlers = toNextJsHandler(getAuth());
    const response = await (request.method === "POST" ? handlers.POST(request) : handlers.GET(request));
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");

    if (response.status >= 300 && response.status < 400) {
      return new Response(response.body, { status: response.status, headers });
    }

    // Preserve session cookies while keeping Better Auth's internal payloads server-side.
    headers.delete("content-length");
    headers.delete("content-encoding");
    const payload = response.ok
      ? path === "/get-session"
        ? { authenticated: Boolean(await response.json()) }
        : { ok: true }
      : { code: response.status === 429 ? "TRY_AGAIN_LATER" : "AUTH_REQUEST_FAILED" };

    return Response.json(payload, { status: response.status, headers });
  } catch (error) {
    console.error(error instanceof ServerConfigError ? error.message : "LifeInbox authentication request failed");
    return Response.json(
      { code: "AUTH_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export { handle as GET, handle as POST };
