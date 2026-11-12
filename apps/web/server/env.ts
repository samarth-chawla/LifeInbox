import "server-only";

export class ServerConfigError extends Error {}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new ServerConfigError(`Missing server configuration: ${name}`);
  return value;
}

function parsedUrl(name: string) {
  try {
    return new URL(required(name));
  } catch {
    throw new ServerConfigError(`Missing or invalid server URL: ${name}`);
  }
}

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function readEnv() {
  const database = parsedUrl("DATABASE_URL");
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length < 2) {
    throw new ServerConfigError("DATABASE_URL must name a PostgreSQL database");
  }

  const authUrl = parsedUrl("BETTER_AUTH_URL");
  const production = process.env.NODE_ENV === "production";
  if (
    authUrl.href !== authUrl.origin + "/" ||
    (authUrl.protocol !== "https:" && (production || authUrl.protocol !== "http:" || !isLoopback(authUrl.hostname)))
  ) {
    throw new ServerConfigError("BETTER_AUTH_URL must be an HTTPS origin or a development loopback HTTP origin");
  }

  const authSecret = required("BETTER_AUTH_SECRET");
  if (authSecret.length < 32) throw new ServerConfigError("BETTER_AUTH_SECRET must contain at least 32 characters");

  const smtp = parsedUrl("AUTH_SMTP_URL");
  if (
    !["smtp:", "smtps:"].includes(smtp.protocol) ||
    !smtp.hostname ||
    !["", "/"].includes(smtp.pathname) ||
    smtp.search ||
    smtp.hash ||
    Boolean(smtp.username) !== Boolean(smtp.password) ||
    smtp.port === "0"
  ) {
    throw new ServerConfigError("AUTH_SMTP_URL must be an SMTP or SMTPS server URL");
  }

  const emailFrom = required("AUTH_EMAIL_FROM");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(emailFrom)) {
    throw new ServerConfigError("AUTH_EMAIL_FROM must be a single sender email address");
  }
  const trustedClientIpHeader = process.env.AUTH_TRUSTED_CLIENT_IP_HEADER?.trim();
  if (trustedClientIpHeader && !/^[A-Za-z0-9-]+$/.test(trustedClientIpHeader)) {
    throw new ServerConfigError("AUTH_TRUSTED_CLIENT_IP_HEADER must be a valid header name");
  }

  return {
    databaseUrl: database.href,
    authOrigin: authUrl.origin,
    secureCookies: authUrl.protocol === "https:",
    authSecret,
    smtp,
    requireSmtpTls: production || !isLoopback(smtp.hostname),
    emailFrom,
    trustedClientIpHeader: trustedClientIpHeader || undefined,
  };
}

let env: ReturnType<typeof readEnv> | undefined;

export function getEnv() {
  return (env ??= readEnv());
}

export function getTrialAllowanceBytes(): number {
  const configured = process.env.TRIAL_STORAGE_ALLOWANCE_BYTES?.trim();
  if (!configured && process.env.NODE_ENV !== "production") return 100 * 1024 * 1024;
  const bytes = Number(configured);
  if (!configured || !/^\d+$/.test(configured) || !Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new ServerConfigError("TRIAL_STORAGE_ALLOWANCE_BYTES must be a positive integer in bytes");
  }
  return bytes;
}
