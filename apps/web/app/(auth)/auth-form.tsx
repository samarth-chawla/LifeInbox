"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const forms = {
  signIn: { title: "Sign in", button: "Sign in", path: "/sign-in/email" },
  signUp: { title: "Create an account", button: "Create account", path: "/sign-up/email" },
  verify: { title: "Verify your email", button: "Verify code", path: "/email-otp/verify-email" },
  forgot: { title: "Reset your password", button: "Request reset link", path: "/request-password-reset" },
  reset: { title: "Choose a new password", button: "Save password", path: "/reset-password" },
} as const;

export function AuthForm({ mode, token }: { mode: keyof typeof forms; token?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const form = forms[mode];
  const hasPassword = mode === "signIn" || mode === "signUp" || mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFailed(false);
    const fields = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const otp = String(fields.get("otp") ?? "").trim();
    const resend = mode === "verify" && fields.get("action") === "resend";
    const verifyCode = mode === "verify" && !resend;
    if (verifyCode && !/^\d{6}$/.test(otp)) {
      setFailed(true);
      setMessage("Enter the six-digit code from your email.");
      return;
    }
    const payload =
      mode === "signUp" ? { name: String(fields.get("name") ?? "").trim(), email, password, callbackURL: "/sign-in" } :
      mode === "signIn" ? { email, password } :
      mode === "forgot" ? { email, redirectTo: "/reset-password" } :
      resend ? { email, callbackURL: "/sign-in" } :
      verifyCode ? { email, otp } :
      { token, newPassword: password };

    setPending(true);
    try {
      const response = await fetch(`/api/auth${resend ? "/send-verification-email" : form.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setFailed(true);
        if (response.status === 429) setMessage("Too many attempts. Try again in a minute.");
        else if (response.status >= 500) setMessage("LifeInbox could not complete the request. Try again.");
        else if (verifyCode) setMessage("This code could not be verified. Check the email address and code, or request a new email.");
        else if (mode === "signIn") setMessage("Sign-in failed. Check your credentials and verify your email.");
        else setMessage("The request could not be completed. Check your details and try again.");
        return;
      }

      if (mode === "signIn" || mode === "reset" || verifyCode) {
        router.replace(mode === "signIn" ? "/account" : "/sign-in");
        router.refresh();
      } else {
        setMessage(mode === "forgot"
          ? "If the account can be reset, check your inbox for a reset link."
          : "If verification is needed, check your inbox for a link and a six-digit code.");
      }
    } catch {
      setFailed(true);
      setMessage("LifeInbox could not be reached. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-4xl tracking-tight">{form.title}</h1>
      {mode === "verify" && <p className="mt-3 text-sm">Enter the six-digit code from your verification email.</p>}
      <form method="post" onSubmit={submit} className="mt-6 space-y-4">
        <fieldset disabled={pending} className="space-y-4">
          {mode === "signUp" && <Field name="name" label="Name" autoComplete="name" maxLength={100} />}
          {mode !== "reset" && <Field name="email" label="Email" type="email" autoComplete="email" maxLength={254} />}
          {mode === "verify" && (
            <Field name="otp" label="Verification code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} required={false} />
          )}
          {hasPassword && (
            <Field
              name="password"
              label={mode === "reset" ? "New password" : "Password"}
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              minLength={mode === "signIn" ? undefined : 12}
              maxLength={128}
            />
          )}
          <button type="submit" className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white disabled:opacity-60">
            {pending ? "Please wait…" : form.button}
          </button>
          {mode === "verify" && (
            <button type="submit" name="action" value="resend" className="text-sm text-accent underline disabled:opacity-60">
              Send a new verification email
            </button>
          )}
        </fieldset>
        {message && <p role={failed ? "alert" : "status"} className="text-sm text-ink">{message}</p>}
      </form>
      <nav aria-label="Account help" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-accent underline">
        {mode === "signIn" ? (
          <>
            <Link href="/sign-up">Create an account</Link>
            <Link href="/forgot-password">Forgot password?</Link>
            <Link href="/verify-email">Verify your email</Link>
          </>
        ) : <Link href="/sign-in">Back to sign in</Link>}
        {mode === "signUp" && <Link href="/verify-email">Enter verification code</Link>}
      </nav>
    </>
  );
}

function Field({ label, required = true, ...input }: { label: string } & React.ComponentPropsWithoutRef<"input">) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        {...input}
        required={required}
        className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-accent"
      />
    </label>
  );
}
