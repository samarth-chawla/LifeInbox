import Link from "next/link";
import { AuthForm } from "../auth-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const { token, error } = await searchParams;
  if (error || typeof token !== "string" || !token) {
    return (
      <>
        <h1 className="font-serif text-4xl tracking-tight">Reset link unavailable</h1>
        <Link href="/forgot-password" className="mt-4 inline-block text-accent underline">
          Request a new reset link
        </Link>
      </>
    );
  }
  return <AuthForm mode="reset" token={token} />;
}
