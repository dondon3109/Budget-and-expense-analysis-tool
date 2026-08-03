import { describe, expect, it, vi } from "vitest";

import { createResendSender, ResendError } from "../src/resend";

describe("createResendSender", () => {
  it("posts the invitation to Resend with bearer auth and Resend's from/to shape", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ id: "mail-1" }), { status: 200 }));
    const sender = createResendSender("re_key", fetcher);

    await sender.send({
      to: "recipient@example.com",
      from: { email: "hello@zoption.site", name: "Zoption" },
      subject: "Invitation",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Content-Type"]).toBe("application/json");
    const payload = JSON.parse(init.body as string) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    expect(payload).toEqual({
      from: "Zoption <hello@zoption.site>",
      to: ["recipient@example.com"],
      subject: "Invitation",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    });
  });

  it("falls back to the bare address when no sender name is provided", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ id: "mail-2" }), { status: 200 }));
    const sender = createResendSender("re_key", fetcher);

    await sender.send({
      to: "recipient@example.com",
      from: { email: "hello@zoption.site" },
      subject: "Invitation",
      text: "body",
      html: "<p>body</p>",
    });

    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(init.body as string) as { from: string };
    expect(payload.from).toBe("hello@zoption.site");
  });

  it("throws when Resend returns a non-2xx response", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(new Response("domain not verified", { status: 403 }));
    const sender = createResendSender("re_key", fetcher);

    await expect(
      sender.send({
        to: "recipient@example.com",
        from: { email: "hello@zoption.site" },
        subject: "Invitation",
        text: "body",
        html: "<p>body</p>",
      }),
    ).rejects.toBeInstanceOf(ResendError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
