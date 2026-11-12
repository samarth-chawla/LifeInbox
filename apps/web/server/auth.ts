import "server-only";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { after } from "next/server";
import { sendAuthMail } from "./auth-mail";
import { authPersistence } from "./auth-schema";
import { findActiveOwnerId } from "./db/owners";
import { getPool } from "./db/pool";
import { getEnv } from "./env";
import { readAccountTrial } from "./services/trials";

const verificationCodeMinutes = 5;

async function sendVerificationEmail({ user, url }: { user: { email: string }; url: string }): Promise<void> {
  let codeInstructions = "";
  try {
    const otp = await getAuth().api.createVerificationOTP({
      body: { email: user.email, type: "email-verification" },
    });
    codeInstructions = `\n\nOr enter this code on the LifeInbox verification page: ${otp}\nThe code expires in ${verificationCodeMinutes} minutes.`;
  } catch {
    console.error("LifeInbox verification code creation failed");
  }
  await sendAuthMail(user.email, "Verify your LifeInbox email", `Open this link to verify your email:\n\n${url}${codeInstructions}`);
}

function createAuth() {
  const env = getEnv();
  const persistence = authPersistence(getPool());

  return betterAuth({
    appName: "LifeInbox",
    baseURL: env.authOrigin,
    secret: env.authSecret,
    trustedOrigins: [env.authOrigin],
    database: persistence.database,
    plugins: [emailOTP({
      // The standard verification email callback sends the link and code together.
      sendVerificationOTP: async () => {},
      disableSignUp: true,
      otpLength: 6,
      expiresIn: verificationCodeMinutes * 60,
      allowedAttempts: 3,
      storeOTP: "encrypted",
    })],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      sendResetPassword: ({ user, url }) => sendAuthMail(user.email, "Reset your LifeInbox password", url),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail,
    },
    session: { cookieCache: { enabled: false } },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (!(await findActiveOwnerId(session.userId))) return false;
          },
          after: async (session, context) => {
            if (context?.path !== "/sign-in/email") return;
            try {
              const ownerId = await findActiveOwnerId(session.userId);
              if (ownerId) await readAccountTrial(getPool(), ownerId);
            } catch {
              console.error("LifeInbox trial initialization failed");
            }
          },
        },
      },
    },
    rateLimit: {
      ...persistence.rateLimit,
      customRules: {
        "/sign-up/email": { window: 60, max: 8 },
        "/sign-in/email": { window: 60, max: 20 },
        "/send-verification-email": { window: 60, max: 5 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: env.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      // An absent trusted header uses Better Auth's shared per-route bucket.
      ipAddress: { ipAddressHeaders: env.trustedClientIpHeader ? [env.trustedClientIpHeader] : [] },
      backgroundTasks: { handler: (task) => after(async () => { await task; }) },
    },
    logger: { disabled: true },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (auth ??= createAuth());
}
