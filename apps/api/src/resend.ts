import type { EmailSender } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export class ResendError extends Error {
  constructor(
    readonly providerStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

function formatFrom(from: { email: string; name?: string }): string {
  const name = from.name?.trim();
  return name ? `${name} <${from.email}>` : from.email;
}

export function createResendSender(apiKey: string, fetcher: typeof fetch = fetch): EmailSender {
  const key = apiKey.trim();
  return {
    async send({ to, from, subject, html, text }): Promise<void> {
      const response = await fetcher(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: formatFrom(from),
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new ResendError(
          response.status,
          `Email delivery failed (${response.status}): ${body}`,
        );
      }
    },
  };
}
