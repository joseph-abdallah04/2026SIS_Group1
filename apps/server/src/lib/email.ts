import { Resend } from 'resend';

import { env } from '../env.js';

// Cross-cutting, not auth-specific — the password-reset ticket reuses this
// exact module, per its own note that both tickets share one email-service
// dependency.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Without RESEND_API_KEY set, logs the email instead of sending it — nobody
 * needs a Resend account to run `npm run dev`. Real send path only exists
 * once a key is configured (matches how LiveKit/LLM env vars are already
 * optional-until-actually-needed in this codebase).
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — logging instead of sending.\nTo: ${to}\nSubject: ${subject}\n${html}`,
    );
    return;
  }

  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
  if (error) {
    console.error('[email] Resend rejected the send:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
