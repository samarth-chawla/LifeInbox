import { notFound } from "next/navigation";
import { AuthForm } from "../auth-form";

const screens = [
  { screen: "sign-in", mode: "signIn" },
  { screen: "sign-up", mode: "signUp" },
  { screen: "forgot-password", mode: "forgot" },
  { screen: "verify-email", mode: "verify" },
] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return screens.map(({ screen }) => ({ screen }));
}

export default async function AuthScreen({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const match = screens.find((entry) => entry.screen === screen);
  if (!match) notFound();

  return <AuthForm mode={match.mode} />;
}
