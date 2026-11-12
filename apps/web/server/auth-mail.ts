import "server-only";
import nodemailer from "nodemailer";
import { getEnv } from "./env";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

export async function sendAuthMail(to: string, subject: string, body: string) {
  const { smtp, requireSmtpTls, emailFrom } = getEnv();
  const secure = smtp.protocol === "smtps:";

  try {
    transport ??= nodemailer.createTransport({
      host: smtp.hostname.replace(/^\[|\]$/g, ""),
      port: Number(smtp.port || (secure ? 465 : 587)),
      secure,
      requireTLS: !secure && requireSmtpTls,
      auth: smtp.username
        ? { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) }
        : undefined,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });

    await transport.sendMail({
      from: emailFrom,
      to,
      subject,
      text: `${subject}\n\n${body}\n\nIf you did not request this, you can ignore this message.`,
      textEncoding: "base64",
    });
  } catch {
    console.error("LifeInbox authentication email delivery failed");
  }
}
